import type { App } from 'obsidian';
import Sortable from 'sortablejs';
import type { KiboTask, ColumnConfig, KiboTasksSettings } from './types';
import type { TaskStore } from './task-store';
import type { DragHandler } from './drag-handler';
import { PRIORITY_COLORS } from './constants';
import { isOverdue, isToday, formatDateShort } from './utils/date-utils';

export class BoardRenderer {
  private app: App;
  private containerEl: HTMLElement;
  private store: TaskStore;
  private dragHandler: DragHandler;
  private settings: KiboTasksSettings;
  private sortables: Sortable[] = [];
  private collapsedState: Map<string, boolean> = new Map();

  constructor(
    app: App,
    containerEl: HTMLElement,
    store: TaskStore,
    dragHandler: DragHandler,
    settings: KiboTasksSettings
  ) {
    this.app = app;
    this.containerEl = containerEl;
    this.store = store;
    this.dragHandler = dragHandler;
    this.settings = settings;

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

    // Status dot
    const dot = column.createDiv({ cls: 'kibo-status-dot' });
    dot.style.backgroundColor = col.color;

    // Vertical label
    const label = column.createDiv({ cls: 'kibo-collapsed-label' });
    label.setText(col.label);

    // Count
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

    // Column header (Kibo style: dot + italic title)
    const colHeader = column.createDiv({ cls: 'kibo-column-header' });
    const colHeaderLeft = colHeader.createDiv({ cls: 'kibo-column-header-left' });

    // Colored status dot
    const dot = colHeaderLeft.createDiv({ cls: 'kibo-status-dot' });
    dot.style.backgroundColor = col.color;

    // Column title (italic, like Kibo)
    colHeaderLeft.createEl('span', { text: col.label, cls: 'kibo-column-title' });

    // Collapse button (subtle)
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

    // Priority accent (subtle left border)
    if (task.priority !== 'none') {
      card.style.setProperty('--kibo-priority-color', PRIORITY_COLORS[task.priority]);
      card.classList.add('kibo-card--has-priority');
    }

    // Card body
    const body = card.createDiv({ cls: 'kibo-card-body' });

    // Description (main text)
    const desc = body.createDiv({ cls: 'kibo-card-description' });
    desc.setText(task.description);

    // Date line (muted, below description -- Kibo style)
    const dateLine = body.createDiv({ cls: 'kibo-card-date' });
    const dateParts: string[] = [];

    if (task.dueDate) {
      const formatted = formatDateShort(task.dueDate);
      if (isOverdue(task.dueDate)) {
        const span = dateLine.createEl('span', { cls: 'kibo-date--overdue', text: formatted });
      } else if (isToday(task.dueDate)) {
        const span = dateLine.createEl('span', { cls: 'kibo-date--today', text: formatted });
      } else {
        dateLine.createEl('span', { text: formatted });
      }
    }

    if (task.doneDate && col.type === 'done') {
      dateLine.createEl('span', { text: formatDateShort(task.doneDate), cls: 'kibo-date--done' });
    }

    // Source file (right-aligned, subtle)
    if (task.sourceFileName) {
      dateLine.createEl('span', {
        cls: 'kibo-card-source',
        text: task.sourceFileName,
      });
    }

    // Tags row (only if there are non-column tags)
    if (task.tags.length > 0) {
      const tagRow = body.createDiv({ cls: 'kibo-card-tags' });
      for (const tag of task.tags) {
        tagRow.createEl('span', { cls: 'kibo-tag', text: tag });
      }
    }

    // Click → open source file
    card.addEventListener('click', async (e) => {
      if (card.classList.contains('kibo-drag')) return;
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

  private destroySortables(): void {
    for (const s of this.sortables) {
      s.destroy();
    }
    this.sortables = [];
  }
}
