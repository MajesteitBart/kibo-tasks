import type { App, Component } from 'obsidian';
import { MarkdownRenderer, TFile, setIcon } from 'obsidian';
import Sortable from 'sortablejs';
import type {
  KiboTask,
  ColumnConfig,
  KiboTasksSettings,
  SavedFilterView,
  TaskFilters,
  Priority,
  TaskStatus,
} from './types';
import type { TaskStore } from './task-store';
import type { DragHandler } from './drag-handler';
import { PRIORITY_COLORS, PRIORITY_LABELS } from './constants';
import { isOverdue, isToday, formatDateShort, todayStr, shiftDate, formatNavDate } from './utils/date-utils';

const DEFAULT_FILTERS: TaskFilters = {
  tag: '',
  path: '',
  priorities: [],
  statuses: [],
};

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 'highest', label: 'Highest' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: ' ', label: 'Open [ ]' },
  { value: '/', label: 'In progress [/]' },
  { value: '!', label: 'Important [!]' },
  { value: 'x', label: 'Done [x]' },
  { value: '-', label: 'Cancelled [-]' },
];

export class BoardRenderer {
  private app: App;
  private containerEl: HTMLElement;
  private store: TaskStore;
  private dragHandler: DragHandler;
  private settings: KiboTasksSettings;
  private component: Component;
  private onSavedViewsChange: (views: SavedFilterView[]) => void;
  private sortables: Sortable[] = [];
  private collapsedState: Map<string, boolean> = new Map();
  private dateOffset = 0;
  private filters: TaskFilters = { ...DEFAULT_FILTERS };
  private savedViews: SavedFilterView[] = [];
  private activeViewId: string | null = null;
  private viewNameDraft = '';
  private viewEditorMode: 'new' | 'rename' | null = null;

  constructor(
    app: App,
    containerEl: HTMLElement,
    store: TaskStore,
    dragHandler: DragHandler,
    settings: KiboTasksSettings,
    component: Component,
    onSavedViewsChange: (views: SavedFilterView[]) => void
  ) {
    this.app = app;
    this.containerEl = containerEl;
    this.store = store;
    this.dragHandler = dragHandler;
    this.settings = settings;
    this.component = component;
    this.onSavedViewsChange = onSavedViewsChange;
    this.savedViews = settings.savedViews.map((view) => ({
      ...view,
      filters: this.normalizeFilters(view.filters),
    }));

    for (const col of settings.columns) {
      this.collapsedState.set(col.id, col.collapsed);
    }
  }

  updateSettings(settings: KiboTasksSettings): void {
    this.settings = settings;
    this.savedViews = settings.savedViews.map((view) => ({
      ...view,
      filters: this.normalizeFilters(view.filters),
    }));

    if (this.activeViewId) {
      const active = this.savedViews.find((view) => view.id === this.activeViewId);
      if (active) {
        this.filters = this.normalizeFilters(active.filters);
      } else {
        this.activeViewId = null;
      }
    }
  }

  render(): void {
    this.destroySortables();
    this.containerEl.empty();

    const selectedDate = shiftDate(todayStr(), this.dateOffset);
    const board = this.containerEl.createDiv({ cls: 'kibo-board' });
    const topBar = board.createDiv({ cls: 'kibo-top-bar' });

    this.renderDateNav(topBar, selectedDate);
    this.renderFilters(topBar);

    const tasksByColumn = this.applyFilters(this.store.getTasksByColumn(selectedDate));
    const columnsContainer = board.createDiv({ cls: 'kibo-columns' });

    for (const col of this.getDisplayColumns()) {
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

  private renderDateNav(parent: HTMLElement, selectedDate: string): void {
    const nav = parent.createDiv({ cls: 'kibo-date-nav' });

    const prevBtn = nav.createEl('button', {
      cls: 'kibo-date-nav-btn',
      attr: { 'aria-label': 'Previous day' },
    });
    prevBtn.setText('\u2039'); // ‹
    prevBtn.addEventListener('click', () => {
      this.dateOffset--;
      this.render();
    });

    const label = nav.createEl('button', {
      cls: 'kibo-date-nav-label',
      attr: { 'aria-label': 'Go to today' },
    });
    label.setText(formatNavDate(selectedDate));
    if (this.dateOffset !== 0) {
      label.classList.add('kibo-date-nav-label--away');
    }
    label.addEventListener('click', () => {
      this.dateOffset = 0;
      this.render();
    });

    const nextBtn = nav.createEl('button', {
      cls: 'kibo-date-nav-btn',
      attr: { 'aria-label': 'Next day' },
    });
    nextBtn.setText('\u203A'); // ›
    nextBtn.addEventListener('click', () => {
      this.dateOffset++;
      this.render();
    });
  }

  private getDisplayColumns(): ColumnConfig[] {
    const backlogCols = this.settings.columns.filter((col) => col.type === 'backlog');
    if (backlogCols.length === 0) return this.settings.columns;
    const firstBacklog = backlogCols[0];
    const rest = this.settings.columns.filter((col) => col !== firstBacklog);
    return [firstBacklog, ...rest];
  }

  private renderFilters(parent: HTMLElement): void {
    const panel = parent.createDiv({ cls: 'kibo-filters' });

    const viewsRow = panel.createDiv({ cls: 'kibo-filters-row' });

    const viewsSelect = viewsRow.createEl('select', {
      cls: 'kibo-filter-input kibo-filter-select',
      attr: { 'aria-label': 'Saved views' },
    });
    viewsSelect.createEl('option', { value: '', text: 'All tasks' });
    for (const view of this.savedViews) {
      viewsSelect.createEl('option', { value: view.id, text: view.name });
    }
    viewsSelect.value = this.activeViewId ?? '';
    viewsSelect.addEventListener('change', () => {
      const selectedId = viewsSelect.value || null;
      this.activeViewId = selectedId;
      this.viewEditorMode = null;
      this.viewNameDraft = '';

      if (!selectedId) {
        this.filters = { ...DEFAULT_FILTERS };
        this.render();
        return;
      }

      const selectedView = this.savedViews.find((view) => view.id === selectedId);
      if (selectedView) {
        this.filters = this.normalizeFilters(selectedView.filters);
      }
      this.render();
    });

    const saveViewBtn = viewsRow.createEl('button', {
      cls: 'kibo-filter-btn kibo-filter-icon-btn',
      attr: { 'aria-label': 'Save as new view', title: 'Save as new view' },
    });
    setIcon(saveViewBtn, 'save');
    saveViewBtn.addEventListener('click', () => {
      this.openViewEditor('new');
    });

    const editViewBtn = viewsRow.createEl('button', {
      cls: 'kibo-filter-btn kibo-filter-icon-btn',
      attr: { 'aria-label': 'Rename selected view', title: 'Rename selected view' },
    });
    setIcon(editViewBtn, 'pencil');
    editViewBtn.disabled = !this.activeViewId;
    editViewBtn.addEventListener('click', () => {
      this.openViewEditor('rename');
    });

    const deleteViewBtn = viewsRow.createEl('button', {
      cls: 'kibo-filter-btn kibo-filter-icon-btn',
      attr: { 'aria-label': 'Delete selected view', title: 'Delete selected view' },
    });
    setIcon(deleteViewBtn, 'trash-2');
    deleteViewBtn.disabled = !this.activeViewId;
    deleteViewBtn.addEventListener('click', () => {
      this.deleteActiveView();
    });

    if (this.viewEditorMode) {
      const editorRow = panel.createDiv({ cls: 'kibo-filters-row' });

      const viewNameInput = editorRow.createEl('input', {
        cls: 'kibo-filter-input',
        attr: {
          type: 'text',
          placeholder: this.viewEditorMode === 'new' ? 'Saved view' : 'View name',
          'aria-label': 'Saved view name',
        },
      });
      viewNameInput.value = this.viewNameDraft;
      viewNameInput.addEventListener('input', () => {
        this.viewNameDraft = viewNameInput.value;
      });
      viewNameInput.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          this.commitViewEditor();
        } else if (evt.key === 'Escape') {
          evt.preventDefault();
          this.cancelViewEditor();
        }
      });
      window.setTimeout(() => viewNameInput.focus(), 0);

      const commitBtn = editorRow.createEl('button', {
        cls: 'kibo-filter-btn kibo-filter-icon-btn',
        attr: { 'aria-label': 'Save view name', title: 'Save view name' },
      });
      setIcon(commitBtn, 'check');
      commitBtn.addEventListener('click', () => {
        this.commitViewEditor();
      });

      const cancelBtn = editorRow.createEl('button', {
        cls: 'kibo-filter-btn kibo-filter-icon-btn',
        attr: { 'aria-label': 'Cancel view naming', title: 'Cancel' },
      });
      setIcon(cancelBtn, 'x');
      cancelBtn.addEventListener('click', () => {
        this.cancelViewEditor();
      });
    }

    const controlsRow = panel.createDiv({ cls: 'kibo-filters-row' });

    const tagInput = controlsRow.createEl('input', {
      cls: 'kibo-filter-input',
      attr: {
        type: 'text',
        placeholder: 'Tag (#work)',
        'aria-label': 'Filter by tag',
      },
    });
    tagInput.value = this.filters.tag;
    tagInput.addEventListener('change', () => {
      this.filters.tag = tagInput.value.trim();
      this.activeViewId = null;
      this.viewEditorMode = null;
      this.viewNameDraft = '';
      this.render();
    });

    const pathInput = controlsRow.createEl('input', {
      cls: 'kibo-filter-input',
      attr: {
        type: 'text',
        placeholder: 'Path (Projects/)',
        'aria-label': 'Filter by task path',
      },
    });
    pathInput.value = this.filters.path;
    pathInput.addEventListener('change', () => {
      this.filters.path = pathInput.value.trim();
      this.activeViewId = null;
      this.viewEditorMode = null;
      this.viewNameDraft = '';
      this.render();
    });

    const priorityDetails = controlsRow.createEl('details', { cls: 'kibo-multi-select' });
    const prioritySummary = priorityDetails.createEl('summary', {
      cls: 'kibo-filter-btn kibo-multi-select-trigger',
      text: this.getPriorityFilterSummary(),
      attr: { 'aria-label': 'Filter by priority (multi-select)' },
    });
    prioritySummary.addEventListener('click', (evt) => evt.stopPropagation());
    const priorityMenu = priorityDetails.createDiv({ cls: 'kibo-multi-select-menu' });
    for (const option of PRIORITY_OPTIONS) {
      const optionLabel = priorityMenu.createEl('label', { cls: 'kibo-multi-select-option' });
      const checkbox = optionLabel.createEl('input', {
        attr: { type: 'checkbox' },
      });
      checkbox.checked = this.filters.priorities.includes(option.value);
      checkbox.addEventListener('change', () => {
        this.filters.priorities = this.toggleSelection(this.filters.priorities, option.value);
        this.activeViewId = null;
        this.viewEditorMode = null;
        this.viewNameDraft = '';
        this.render();
      });
      optionLabel.createSpan({ text: option.label });
    }
    priorityMenu.createDiv({
      cls: 'kibo-multi-select-hint',
      text: 'No selection = all priorities',
    });

    const statusDetails = controlsRow.createEl('details', { cls: 'kibo-multi-select' });
    const statusSummary = statusDetails.createEl('summary', {
      cls: 'kibo-filter-btn kibo-multi-select-trigger',
      text: this.getStatusFilterSummary(),
      attr: { 'aria-label': 'Filter by status (multi-select)' },
    });
    statusSummary.addEventListener('click', (evt) => evt.stopPropagation());
    const statusMenu = statusDetails.createDiv({ cls: 'kibo-multi-select-menu' });
    for (const option of STATUS_OPTIONS) {
      const optionLabel = statusMenu.createEl('label', { cls: 'kibo-multi-select-option' });
      const checkbox = optionLabel.createEl('input', {
        attr: { type: 'checkbox' },
      });
      checkbox.checked = this.filters.statuses.includes(option.value);
      checkbox.addEventListener('change', () => {
        this.filters.statuses = this.toggleSelection(this.filters.statuses, option.value);
        this.activeViewId = null;
        this.viewEditorMode = null;
        this.viewNameDraft = '';
        this.render();
      });
      optionLabel.createSpan({ text: option.label });
    }
    statusMenu.createDiv({
      cls: 'kibo-multi-select-hint',
      text: 'No selection = all statuses',
    });

    const clearBtn = controlsRow.createEl('button', {
      cls: 'kibo-filter-btn',
      text: 'Clear',
      attr: { 'aria-label': 'Clear all filters' },
    });
    clearBtn.addEventListener('click', () => {
      this.filters = { ...DEFAULT_FILTERS };
      this.activeViewId = null;
      this.viewEditorMode = null;
      this.viewNameDraft = '';
      this.render();
    });
  }

  private applyFilters(tasksByColumn: Map<string, KiboTask[]>): Map<string, KiboTask[]> {
    const filtered = new Map<string, KiboTask[]>();
    for (const [colId, tasks] of tasksByColumn) {
      filtered.set(
        colId,
        tasks.filter((task) => this.matchesFilters(task))
      );
    }
    return filtered;
  }

  private matchesFilters(task: KiboTask): boolean {
    if (this.filters.priorities.length > 0 && !this.filters.priorities.includes(task.priority)) {
      return false;
    }

    if (this.filters.statuses.length > 0 && !this.filters.statuses.includes(task.status)) {
      return false;
    }

    if (this.filters.path.length > 0) {
      const pathNeedle = this.filters.path.toLowerCase();
      if (!task.filePath.toLowerCase().includes(pathNeedle)) {
        return false;
      }
    }

    if (this.filters.tag.length > 0) {
      const requiredTags = this.parseTagFilter(this.filters.tag);
      if (requiredTags.length > 0) {
        const taskTags = new Set(
          [...task.tags, ...task.columnTags, ...task.pageTags].map((tag) => tag.toLowerCase())
        );
        for (const requiredTag of requiredTags) {
          if (!taskTags.has(requiredTag)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private parseTagFilter(raw: string): string[] {
    return raw
      .split(/[,\s]+/)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0)
      .map((token) => (token.startsWith('#') ? token : `#${token}`));
  }

  private toggleSelection<T extends string>(current: T[], value: T): T[] {
    if (current.includes(value)) {
      return current.filter((v) => v !== value);
    }
    return [...current, value];
  }

  private getPriorityFilterSummary(): string {
    if (this.filters.priorities.length === 0) return 'Priority: all';
    if (this.filters.priorities.length === 1) {
      const label = PRIORITY_OPTIONS.find((opt) => opt.value === this.filters.priorities[0])?.label;
      return `Priority: ${label ?? this.filters.priorities[0]}`;
    }
    return `Priority (${this.filters.priorities.length})`;
  }

  private getStatusFilterSummary(): string {
    if (this.filters.statuses.length === 0) return 'Status: all';
    if (this.filters.statuses.length === 1) {
      const label = STATUS_OPTIONS.find((opt) => opt.value === this.filters.statuses[0])?.label;
      return `Status: ${label ?? this.filters.statuses[0]}`;
    }
    return `Status (${this.filters.statuses.length})`;
  }

  private normalizeFilters(input: unknown): TaskFilters {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const tag = typeof raw.tag === 'string' ? raw.tag : '';
    const path = typeof raw.path === 'string' ? raw.path : '';

    const priorities = this.normalizePriorityList(
      raw.priorities !== undefined ? raw.priorities : raw.priority
    );
    const statuses = this.normalizeStatusList(
      raw.statuses !== undefined ? raw.statuses : raw.status
    );

    return { tag, path, priorities, statuses };
  }

  private normalizePriorityList(input: unknown): Priority[] {
    const valid = new Set(PRIORITY_OPTIONS.map((opt) => opt.value));
    const values = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
    const normalized = values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is Priority => valid.has(value as Priority));
    return [...new Set(normalized)];
  }

  private normalizeStatusList(input: unknown): TaskStatus[] {
    const valid = new Set(STATUS_OPTIONS.map((opt) => opt.value));
    const values = Array.isArray(input) ? input : typeof input === 'string' ? [input] : [];
    const normalized = values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => (value.length > 0 ? value[0] : value))
      .filter((value): value is TaskStatus => valid.has(value as TaskStatus));
    return [...new Set(normalized)];
  }

  private openViewEditor(mode: 'new' | 'rename'): void {
    if (mode === 'rename' && !this.activeViewId) return;

    this.viewEditorMode = mode;
    if (mode === 'rename') {
      const active = this.savedViews.find((view) => view.id === this.activeViewId);
      this.viewNameDraft = active?.name ?? '';
    } else {
      this.viewNameDraft = this.makeUniqueViewName('Saved view');
    }
    this.render();
  }

  private commitViewEditor(): void {
    if (!this.viewEditorMode) return;

    const baseName = this.viewNameDraft.trim() || 'Saved view';

    if (this.viewEditorMode === 'rename') {
      const active = this.savedViews.find((view) => view.id === this.activeViewId);
      if (!active) {
        this.cancelViewEditor();
        return;
      }
      const name = this.makeUniqueViewName(baseName, active.id);
      this.savedViews = this.savedViews.map((view) =>
        view.id === active.id ? { ...view, name } : view
      );
      this.activeViewId = active.id;
    } else {
      const viewId = `view-${Date.now()}`;
      const name = this.makeUniqueViewName(baseName);
      this.savedViews.push({
        id: viewId,
        name,
        filters: this.normalizeFilters(this.filters),
      });
      this.activeViewId = viewId;
    }

    this.viewEditorMode = null;
    this.viewNameDraft = '';
    this.persistSavedViews();
    this.render();
  }

  private cancelViewEditor(): void {
    this.viewEditorMode = null;
    this.viewNameDraft = '';
    this.render();
  }

  private makeUniqueViewName(baseName: string, excludeId?: string): string {
    const normalizedBase = baseName.trim() || 'Saved view';
    let candidate = normalizedBase;
    let suffix = 2;

    while (
      this.savedViews.some(
        (view) =>
          view.id !== excludeId &&
          view.name.toLowerCase() === candidate.toLowerCase()
      )
    ) {
      candidate = `${normalizedBase} ${suffix}`;
      suffix++;
    }

    return candidate;
  }

  private deleteActiveView(): void {
    if (!this.activeViewId) return;

    const active = this.savedViews.find((view) => view.id === this.activeViewId);
    if (!active) {
      this.activeViewId = null;
      this.render();
      return;
    }

    const confirmed = window.confirm(`Delete saved view "${active.name}"?`);
    if (!confirmed) return;

    this.savedViews = this.savedViews.filter((view) => view.id !== this.activeViewId);
    this.activeViewId = null;
    this.viewEditorMode = null;
    this.viewNameDraft = '';
    this.persistSavedViews();
    this.render();
  }

  private persistSavedViews(): void {
    const nextViews = this.savedViews.map((view) => ({
      ...view,
      filters: this.normalizeFilters(view.filters),
    }));
    this.onSavedViewsChange(nextViews);
  }

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
    collapseBtn.setText('\u2212');
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
          void this.dragHandler.handleDragEnd({
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
    void MarkdownRenderer.render(
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
        if (col.type === 'done') {
          // Don't show overdue styling for completed tasks
          dateLine.createEl('span', { text: formatted });
        } else if (isOverdue(task.dueDate)) {
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
    card.addEventListener('click', (e) => {
      if (card.classList.contains('kibo-drag')) return;
      // Don't navigate when clicking links inside the card, subtask toggles, etc.
      const target = e.target as HTMLElement;
      if (target.closest('a') || target.closest('.kibo-subtasks-toggle') || target.closest('.kibo-subtask-checkbox')) return;
      e.preventDefault();

      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        void leaf.openFile(file, {
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
      item.createEl('span', {
        cls: `kibo-subtask-checkbox ${sub.status === 'x' ? 'kibo-subtask-checkbox--done' : ''}`,
        text: sub.status === 'x' ? '\u2611' : '\u2610', // ☑ or ☐
      });

      const subDesc = item.createDiv({ cls: 'kibo-subtask-description' });
      void MarkdownRenderer.render(
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
