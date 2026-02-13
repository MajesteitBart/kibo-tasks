import type { KiboTask, ColumnConfig, TaskStatus } from './types';
import { parseEmojiMetadata, cleanDescription } from './utils/emoji-parser';

const TASK_LINE_REGEX = /^(\s*)- \[([ x\/\-!])\]\s+(.+)$/;

/**
 * Parse tasks from a single file's content.
 */
export function parseTasksFromContent(
  content: string,
  filePath: string,
  globalFilter: string,
  columns: ColumnConfig[]
): KiboTask[] {
  const tasks: KiboTask[] = [];
  const lines = content.split('\n');
  const columnTagSet = new Set(
    columns
      .filter((c) => c.tag !== null)
      .map((c) => c.tag as string)
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(TASK_LINE_REGEX);
    if (!match) continue;

    const indent = match[1];
    const statusChar = match[2] as TaskStatus;
    const rawText = match[3];

    // Skip indented sub-tasks
    if (indent.length > 0) continue;

    // Must contain the global filter tag
    if (!line.includes(globalFilter)) continue;

    // Parse emoji metadata
    const emojis = parseEmojiMetadata(rawText);

    // Extract tags (everything starting with # except the global filter)
    const tagRegex = /#[\w-]+/g;
    const allTags: string[] = [];
    const matchedColumnTags: string[] = [];
    let tagMatch;

    while ((tagMatch = tagRegex.exec(rawText)) !== null) {
      const tag = tagMatch[0];
      if (tag === globalFilter) continue;
      if (columnTagSet.has(tag)) {
        matchedColumnTags.push(tag);
      } else {
        allTags.push(tag);
      }
    }

    // Build clean description
    const allColumnTagsArr = Array.from(columnTagSet);
    const description = cleanDescription(rawText, globalFilter, allColumnTagsArr);

    const sourceFileName = filePath.split('/').pop() || filePath;

    tasks.push({
      id: `${filePath}::${i}`,
      filePath,
      lineNumber: i,
      rawLine: line,
      description,
      status: statusChar,
      dueDate: emojis.dueDate,
      doneDate: emojis.doneDate,
      priority: emojis.priority,
      tags: allTags,
      columnTags: matchedColumnTags,
      sourceFileName: sourceFileName.replace(/\.md$/, ''),
    });
  }

  return tasks;
}

/**
 * Assign a task to a column based on its status, tags, and due date.
 */
export function assignColumn(
  task: KiboTask,
  columns: ColumnConfig[]
): string {
  // Done tasks go to done column
  if (task.status === 'x') {
    const doneCol = columns.find((c) => c.type === 'done');
    return doneCol ? doneCol.id : 'done';
  }

  // Cancelled tasks go to done column too
  if (task.status === '-') {
    const doneCol = columns.find((c) => c.type === 'done');
    return doneCol ? doneCol.id : 'done';
  }

  // Check tag-based columns (in order)
  for (const col of columns) {
    if (col.type === 'tag' && col.tag && task.columnTags.includes(col.tag)) {
      return col.id;
    }
  }

  // Undated tasks go to backlog (if backlog column exists)
  if (!task.dueDate) {
    const backlogCol = columns.find((c) => c.type === 'backlog');
    if (backlogCol) return backlogCol.id;
  }

  // Dated tasks go to todo column
  const todoCol = columns.find((c) => c.type === 'todo');
  return todoCol ? todoCol.id : 'todo';
}
