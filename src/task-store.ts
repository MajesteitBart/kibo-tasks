import type { App, TFile, TAbstractFile } from 'obsidian';
import type { KiboTask, KiboTasksSettings, ColumnConfig } from './types';
import { parseTasksFromContent, assignColumn } from './task-parser';
import { isDueOrOverdue } from './utils/date-utils';

type Subscriber = () => void;

export class TaskStore {
  private app: App;
  private settings: KiboTasksSettings;
  private tasks: KiboTask[] = [];
  private columnAssignments: Map<string, string> = new Map(); // taskId -> columnId
  private subscribers: Subscriber[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private eventRefs: ReturnType<typeof this.app.vault.on>[] = [];

  constructor(app: App, settings: KiboTasksSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Full vault scan. Call on initial load.
   */
  async fullScan(): Promise<void> {
    const allTasks: KiboTask[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      if (this.isExcluded(file.path)) continue;
      try {
        const content = await this.app.vault.cachedRead(file);
        const fileTasks = parseTasksFromContent(
          content,
          file.path,
          this.settings.globalFilter,
          this.settings.columns
        );

        // Populate page tags from frontmatter
        const pageTags = this.getPageTags(file);
        for (const task of fileTasks) {
          task.pageTags = pageTags;
        }

        allTasks.push(...fileTasks);
      } catch {
        // Skip unreadable files
      }
    }

    this.tasks = allTasks;
    this.rebuildAssignments();
    this.notify();
  }

  /**
   * Re-parse a single file (on vault modify event).
   */
  async reparseFile(filePath: string): Promise<void> {
    // Remove old tasks from this file
    this.tasks = this.tasks.filter((t) => t.filePath !== filePath);

    if (!this.isExcluded(filePath)) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file && 'extension' in file && (file as TFile).extension === 'md') {
        try {
          const content = await this.app.vault.cachedRead(file as TFile);
          const fileTasks = parseTasksFromContent(
            content,
            filePath,
            this.settings.globalFilter,
            this.settings.columns
          );

          // Populate page tags from frontmatter
          const pageTags = this.getPageTags(file as TFile);
          for (const task of fileTasks) {
            task.pageTags = pageTags;
          }

          this.tasks.push(...fileTasks);
        } catch {
          // Skip
        }
      }
    }

    this.rebuildAssignments();
    this.notify();
  }

  /**
   * Start listening to vault events.
   */
  startListening(): void {
    const modifyRef = this.app.vault.on('modify', (file: TAbstractFile) => {
      if (file.path.endsWith('.md')) {
        this.debouncedReparse(file.path);
      }
    });

    const deleteRef = this.app.vault.on('delete', (file: TAbstractFile) => {
      if (file.path.endsWith('.md')) {
        this.tasks = this.tasks.filter((t) => t.filePath !== file.path);
        this.rebuildAssignments();
        this.notify();
      }
    });

    const renameRef = this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
      if (oldPath.endsWith('.md')) {
        // Update file paths in tasks
        for (const task of this.tasks) {
          if (task.filePath === oldPath) {
            task.filePath = file.path;
            task.id = `${file.path}::${task.lineNumber}`;
            task.sourceFileName = file.path.split('/').pop()?.replace(/\.md$/, '') || file.path;
          }
        }
        this.rebuildAssignments();
        this.notify();
      }
    });

    this.eventRefs.push(modifyRef, deleteRef, renameRef);
  }

  /**
   * Stop listening to vault events.
   */
  stopListening(): void {
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Subscribe to store changes. Returns unsubscribe function.
   */
  subscribe(fn: Subscriber): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  /**
   * Get tasks grouped by column, applying filters.
   */
  getTasksByColumn(): Map<string, KiboTask[]> {
    const result = new Map<string, KiboTask[]>();

    // Initialize all columns
    for (const col of this.settings.columns) {
      result.set(col.id, []);
    }

    for (const task of this.tasks) {
      const colId = this.columnAssignments.get(task.id);
      if (!colId) continue;

      const col = this.settings.columns.find((c) => c.id === colId);
      if (!col) continue;

      // Apply "To Do" filter: only overdue + due today (undated goes to backlog)
      if (col.type === 'todo' && this.settings.todoFilter === 'due-today') {
        if (!task.dueDate || !isDueOrOverdue(task.dueDate)) continue;
      }

      const list = result.get(colId) || [];
      list.push(task);
      result.set(colId, list);
    }

    // Sort each column
    for (const [colId, colTasks] of result) {
      const col = this.settings.columns.find((c) => c.id === colId);
      if (col?.type === 'todo') {
        // Sort: overdue first, then today; within group by priority
        colTasks.sort((a, b) => this.todoSort(a, b));
      } else if (col?.type === 'backlog') {
        // Sort by priority
        colTasks.sort((a, b) => this.prioritySort(a, b));
      } else if (col?.type === 'done') {
        // Most recently done first
        colTasks.sort((a, b) => {
          if (a.doneDate && b.doneDate) return b.doneDate.localeCompare(a.doneDate);
          if (a.doneDate) return -1;
          if (b.doneDate) return 1;
          return 0;
        });
        // Apply done limit
        const limit = col.limit ?? this.settings.doneLimit;
        if (colTasks.length > limit) {
          result.set(colId, colTasks.slice(0, limit));
        }
      } else {
        // Tag columns: sort by priority
        colTasks.sort((a, b) => this.prioritySort(a, b));
      }
    }

    return result;
  }

  /**
   * Get all tasks (unfiltered).
   */
  getAllTasks(): KiboTask[] {
    return [...this.tasks];
  }

  /**
   * Get a task by ID.
   */
  getTask(id: string): KiboTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /**
   * Update settings and re-assign columns.
   */
  updateSettings(settings: KiboTasksSettings): void {
    this.settings = settings;
    this.rebuildAssignments();
    this.notify();
  }

  // --- Private ---

  private getPageTags(file: TFile): string[] {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter?.tags) return [];
    const tags = cache.frontmatter.tags;
    if (Array.isArray(tags)) {
      return tags.map((t: string) => (t.startsWith('#') ? t : `#${t}`));
    }
    if (typeof tags === 'string') {
      return [tags.startsWith('#') ? tags : `#${tags}`];
    }
    return [];
  }

  private isExcluded(path: string): boolean {
    return this.settings.excludedFolders.some(
      (folder) => path.startsWith(folder + '/') || path === folder
    );
  }

  private rebuildAssignments(): void {
    this.columnAssignments.clear();
    for (const task of this.tasks) {
      const colId = assignColumn(task, this.settings.columns);
      this.columnAssignments.set(task.id, colId);
    }
  }

  private debouncedReparse(filePath: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.reparseFile(filePath);
    }, 300);
  }

  private notify(): void {
    for (const fn of this.subscribers) {
      fn();
    }
  }

  private todoSort(a: KiboTask, b: KiboTask): number {
    const aGroup = this.todoGroup(a);
    const bGroup = this.todoGroup(b);
    if (aGroup !== bGroup) return aGroup - bGroup;
    return this.prioritySort(a, b);
  }

  private todoGroup(task: KiboTask): number {
    if (!task.dueDate) return 2; // undated last
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const m = task.dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return 2;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getTime() < today.getTime()) return 0; // overdue
    if (d.getTime() === today.getTime()) return 1; // today
    return 2; // future (shouldn't appear with due-today filter, but just in case)
  }

  private prioritySort(a: KiboTask, b: KiboTask): number {
    const order = { highest: 0, high: 1, medium: 2, low: 3, none: 4 };
    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
  }
}
