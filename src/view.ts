import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KIBO } from './constants';
import type { TaskStore } from './task-store';
import type { TaskWriter } from './task-writer';
import { DragHandler } from './drag-handler';
import { BoardRenderer } from './board-renderer';
import type { KiboTasksSettings } from './types';

export class KiboTasksView extends ItemView {
  private store: TaskStore;
  private writer: TaskWriter;
  private settings: KiboTasksSettings;
  private renderer: BoardRenderer | null = null;
  private dragHandler: DragHandler | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    store: TaskStore,
    writer: TaskWriter,
    settings: KiboTasksSettings
  ) {
    super(leaf);
    this.store = store;
    this.writer = writer;
    this.settings = settings;
  }

  getViewType(): string {
    return VIEW_TYPE_KIBO;
  }

  getDisplayText(): string {
    return 'Kibo tasks';
  }

  getIcon(): string {
    return 'kanban';
  }

  onOpen(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('kibo-tasks-container');

    // Initialize drag handler
    this.dragHandler = new DragHandler(
      this.writer,
      this.store,
      this.settings.columns
    );

    // Initialize board renderer — pass `this` as the Component for MarkdownRenderer
    this.renderer = new BoardRenderer(
      this.app,
      container,
      this.store,
      this.dragHandler,
      this.settings,
      this // Component reference for Obsidian's MarkdownRenderer
    );

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe(() => {
      this.renderer?.render();
    });

    // Initial render
    this.renderer.render();
  }

  onClose(): void {
    this.unsubscribe?.();
    this.renderer?.destroy();
    this.renderer = null;
    this.dragHandler = null;
  }

  /**
   * Called when settings change.
   */
  updateSettings(settings: KiboTasksSettings): void {
    this.settings = settings;
    this.dragHandler?.updateColumns(settings.columns);
    this.renderer?.updateSettings(settings);
    this.renderer?.render();
  }
}
