import type { App, Component } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import Sortable from 'sortablejs';
import type { KiboTask, ColumnConfig, KiboTasksSettings, SubTask } from './types';
import type { TaskStore } from './task-store';
import type { DragHandler } from './drag-handler';
import { PRIORITY_COLORS, PRIORITY_LABELS } from './constants';
import { isOverdue, isToday, formatDateShort } from './utils/date-utils';

export class BoardRenderer {
  private app: App;
  private containerEl: HTMLElement;
  private store: TaskStore;
  private dragHandler: DragHandler;
  private settings: KiboTasksSettings;
  private component: Component;
  private sortables: Sortable[] = [];
  private collapsedState: Map<string, boolean> = new Map();

  constructor(
    app: App,
    containerEl: HTMLElement,
    store: TaskStore,
    dragHandler: DragHandler,
    settings: KiboTasksSettings,
    component: Component
  ) {
    this.app = app;
    this.containerEl = containerEl;
    this.store = store;
    this.dragHandler = dragHandler;
    this.settings = settings;
    this.component = component;

    for (const col of settings.columns) {
      this.collapsedState.set(col.id, col.collapsed);
    }
  }

  updateSettings(settings: KiboTasksSettings): void {
    this.settings = settings;
  }

  render(): void {
    this.destroySortables();
    this.containerEl.empty();

    const tasksByColumn = this.store.getTasksByColumn();
    const board = this.containerEl.createDiv({ cls: 'kibo-board' });
    const columnsContainer = board.createDiv({ cls: 'kibo-columns' });

    for (const col of this.settings.columns) {
      const tasks = tasksByColumn.get(col.id) || [];
      const isCollapsed = this.collapsedState.get(col.id) ?? false;

      if (isCollapsed) {
        this.renderCollapsedColumn(columnsContainer, col, tasks);
      } else {
        this.renderColumn(columnsContainer, col, tasks);
      }
    }
  }

  destroy(): void {
    this.destroySortables();
  }

  // --- Private ---

  private renderCollapsedColumn(
    parent: HTMLElement,
    col: ColumnConfig,
    tasks: KiboTask[]
  ): void {
    const column = parent.createDiv({
      cls: 'kibo-column kibo-column--collapsed',
      attr: { 'data-column-id': col.id },
    });

    column.addEventListener('click', () => {
      this.collapsedState.set(col.id, false);
      this.render();
    });

    const dot = column.createDiv({ cls: 'kibo-status-dot' });
    dot.style.backgroundColor = col.color;

    const label = column.createDiv({ cls: 'kibo-collapsed-label' });
    label.setText(col.label);

    const count = column.createDiv({ cls: 'kibo-collapsed-count' });
    count.setText(String(tasks.length));
  }

  private renderColumn(
    parent: HTMLElement,
    col: ColumnConfig,
    tasks: KiboTask[]
  ): void {
    const column = parent.createDiv({
      cls: 'kibo-column',
      attr: { 'data-column-id': col.id },
    });

    // Column header
    const colHeader = column.createDiv({ cls: 'kibo-column-header' });
    const colHeaderLeft = colHeader.createDiv({ cls: 'kibo-column-header-left' });

    const dot = colHeaderLeft.createDiv({ cls: 'kibo-status-dot' });
    dot.style.backgroundColor = col.color;

    colHeaderLeft.createEl('span', { text: col.label, cls: 'kibo-column-title' });

    const collapseBtn = colHeader.createEl('button', {
      cls: 'kibo-collapse-btn',
      attr: { 'aria-label': 'Collapse column' },
    });
    collapseBtn.innerHTML = '&minus;';
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapsedState.set(col.id, true);
      this.render();
    });

    // Card container
    const cardContainer = column.createDiv({
      cls: 'kibo-card-container',
      attr: { 'data-column-id': col.id },
    });

    if (tasks.length === 0) {
      cardContainer.createDiv({
        cls: 'kibo-empty-state',
        text: col.type === 'todo' ? 'All caught up!' : 'No tasks',
      });
    }

    for (const task of tasks) {
      this.renderCard(cardContainer, task, col);
    }

    // SortableJS
    const sortable = Sortable.create(cardContainer, {
      group: 'kibo-tasks',
      animation: 150,
      ghostClass: 'kibo-ghost',
      chosenClass: 'kibo-chosen',
      dragClass: 'kibo-drag',
      handle: '.kibo-card',
      draggable: '.kibo-card',
      onEnd: (evt) => {
        const taskId = evt.item.getAttribute('data-task-id');
        const sourceColId = evt.from.getAttribute('data-column-id');
        const targetColId = evt.to.getAttribute('data-column-id');

        if (taskId && sourceColId && targetColId) {
          this.dragHandler.handleDragEnd({
            taskId,
            sourceColumnId: sourceColId,
            targetColumnId: targetColId,
          });
        }
      },
    });

    this.sortables.push(sortable);
  }

  private renderCard(
    parent: HTMLElement,
    task: KiboTask,
    col: ColumnConfig
  ): void {
    const card = parent.createDiv({
      cls: 'kibo-card',
      attr: { 'data-task-id': task.id },
    });

    // Description — rendered as Obsidian markdown (supports [[links]], **bold**, tags, etc.)
    const desc = card.createDiv({ cls: 'kibo-card-description' });
    MarkdownRenderer.render(
      this.app,
      task.description,
      desc,
      task.filePath,
      this.component
    );

    // Priority badge
    if (task.priority !== 'none') {
      const badge = card.createEl('span', {
        cls: `kibo-priority-badge kibo-priority-badge--${task.priority}`,
        text: PRIORITY_LABELS[task.priority],
      });
      badge.style.setProperty('--kibo-priority-color', PRIORITY_COLORS[task.priority]);
    }

    // Date line
    if (task.dueDate || (task.doneDate && col.type === 'done')) {
      const dateLine = card.createDiv({ cls: 'kibo-card-date' });

      if (task.dueDate) {
        const formatted = formatDateShort(task.dueDate);
        if (isOverdue(task.dueDate)) {
          dateLine.createEl('span', { cls: 'kibo-date--overdue', text: formatted });
        } else if (isToday(task.dueDate)) {
          dateLine.createEl('span', { cls: 'kibo-date--today', text: formatted });
        } else {
          dateLine.createEl('span', { text: formatted });
        }
      }

      if (task.doneDate && col.type === 'done') {
        dateLine.createEl('span', { text: formatDateShort(task.doneDate), cls: 'kibo-date--done' });
      }
    }

    // Subtasks — collapsible
    if (task.subtasks.length > 0) {
      this.renderSubtasks(card, task);
    }

    // Footer: page tags
    if (task.pageTags.length > 0) {
      const footer = card.createDiv({ cls: 'kibo-card-footer' });
      for (const tag of task.pageTags) {
        footer.createEl('span', { cls: 'kibo-page-tag', text: tag });
      }
    }

    // Click → open source file
    card.addEventListener('click', async (e) => {
      if (card.classList.contains('kibo-drag')) return;
      // Don't navigate when clicking links inside the card, subtask toggles, etc.
      const target = e.target as HTMLElement;
      if (target.closest('a') || target.closest('.kibo-subtasks-toggle') || target.closest('.kibo-subtask-checkbox')) return;
      e.preventDefault();

      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (file) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as any, {
          eState: { line: task.lineNumber },
        });
      }
    });
  }

  private renderSubtasks(card: HTMLElement, task: KiboTask): void {
    const subtasksWrapper = card.createDiv({ cls: 'kibo-subtasks' });

    // Progress summary + toggle
    const doneCount = task.subtasks.filter((s) => s.status === 'x').length;
    const totalCount = task.subtasks.length;

    const toggle = subtasksWrapper.createDiv({ cls: 'kibo-subtasks-toggle' });
    toggle.createEl('span', {
      cls: 'kibo-subtasks-chevron',
      text: '\u25B8', // ▸
    });
    toggle.createEl('span', {
      cls: 'kibo-subtasks-summary',
      text: `${doneCount}/${totalCount}`,
    });

    // Progress bar
    const progressBar = toggle.createDiv({ cls: 'kibo-subtasks-progress' });
    const progressFill = progressBar.createDiv({ cls: 'kibo-subtasks-progress-fill' });
    progressFill.style.width = `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`;

    // Subtask list (collapsed by default)
    const list = subtasksWrapper.createDiv({ cls: 'kibo-subtasks-list kibo-subtasks-list--collapsed' });

    for (const sub of task.subtasks) {
      const item = list.createDiv({ cls: 'kibo-subtask-item' });
      const checkbox = item.createEl('span', {
        cls: `kibo-subtask-checkbox ${sub.status === 'x' ? 'kibo-subtask-checkbox--done' : ''}`,
        text: sub.status === 'x' ? '\u2611' : '\u2610', // ☑ or ☐
      });

      const subDesc = item.createDiv({ cls: 'kibo-subtask-description' });
      MarkdownRenderer.render(
        this.app,
        sub.description,
        subDesc,
        task.filePath,
        this.component
      );
    }

    // Toggle expand/collapse
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const chevron = toggle.querySelector('.kibo-subtasks-chevron');
      if (list.classList.contains('kibo-subtasks-list--collapsed')) {
        list.classList.remove('kibo-subtasks-list--collapsed');
        if (chevron) chevron.textContent = '\u25BE'; // ▾
      } else {
        list.classList.add('kibo-subtasks-list--collapsed');
        if (chevron) chevron.textContent = '\u25B8'; // ▸
      }
    });
  }

  private destroySortables(): void {
    for (const s of this.sortables) {
      s.destroy();
    }
    this.sortables = [];
  }
}
