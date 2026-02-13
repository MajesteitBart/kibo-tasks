export type TaskStatus = ' ' | 'x' | '/' | '-' | '!';
export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'none';
export type ColumnType = 'todo' | 'backlog' | 'tag' | 'done';
export type TodoFilterMode = 'due-today' | 'all-undone';

export interface ColumnConfig {
  id: string;
  label: string;
  tag: string | null;
  type: ColumnType;
  color: string;          // CSS color for status dot
  collapsed: boolean;
  limit?: number;
}

export interface SubTask {
  rawLine: string;
  description: string;
  status: TaskStatus;
  lineNumber: number;
}

export interface KiboTask {
  id: string;               // `${filePath}::${lineNumber}`
  filePath: string;
  lineNumber: number;
  rawLine: string;
  description: string;       // Clean text for card display (markdown)
  status: TaskStatus;
  dueDate: string | null;    // YYYY-MM-DD
  doneDate: string | null;
  priority: Priority;
  tags: string[];            // Tags except #task and column tags
  columnTags: string[];      // Tags matching configured columns
  sourceFileName: string;
  subtasks: SubTask[];       // Indented sub-tasks below this task
  pageTags: string[];        // Tags from the page frontmatter
}

export interface KiboTasksSettings {
  columns: ColumnConfig[];
  excludedFolders: string[];
  todoFilter: TodoFilterMode;
  globalFilter: string;
  doneLimit: number;
}
