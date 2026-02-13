import type { ColumnConfig, KiboTask } from './types';
import type { TaskWriter } from './task-writer';
import type { TaskStore } from './task-store';

export interface DragEndEvent {
  taskId: string;
  sourceColumnId: string;
  targetColumnId: string;
}

export class DragHandler {
  private writer: TaskWriter;
  private store: TaskStore;
  private columns: ColumnConfig[];

  constructor(writer: TaskWriter, store: TaskStore, columns: ColumnConfig[]) {
    this.writer = writer;
    this.store = store;
    this.columns = columns;
  }

  updateColumns(columns: ColumnConfig[]): void {
    this.columns = columns;
  }

  /**
   * Handle a drag-end event: determine what mutation to apply.
   */
  async handleDragEnd(event: DragEndEvent): Promise<void> {
    const { taskId, sourceColumnId, targetColumnId } = event;

    // Same column → no-op
    if (sourceColumnId === targetColumnId) return;

    const task = this.store.getTask(taskId);
    if (!task) return;

    const sourceCol = this.columns.find((c) => c.id === sourceColumnId);
    const targetCol = this.columns.find((c) => c.id === targetColumnId);
    if (!sourceCol || !targetCol) return;

    // Collect all column tags for cleanup
    const allColumnTags = this.columns
      .filter((c) => c.tag !== null)
      .map((c) => c.tag as string);

    await this.writer.moveToColumn(
      task,
      sourceCol.tag,
      targetCol.tag,
      targetCol.type,
      allColumnTags
    );
  }
}
