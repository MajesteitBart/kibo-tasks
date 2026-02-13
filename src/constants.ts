import type { ColumnConfig, KiboTasksSettings, Priority } from './types';

export const VIEW_TYPE_KIBO = 'kibo-tasks-view';

export const PRIORITY_EMOJI_MAP: Record<string, Priority> = {
  '\u{1F53A}': 'highest',  // 🔺
  '\u{23EB}': 'high',      // ⏫
  '\u{1F53C}': 'medium',   // 🔼
  '\u{1F53D}': 'low',      // 🔽
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  highest: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: '',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  highest: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#06b6d4',
  none: 'transparent',
};

// Emoji identifiers used in Obsidian Tasks plugin (emoji format)
export const EMOJI = {
  DUE: '\u{1F4C5}',        // 📅
  DONE: '\u{2705}',        // ✅
  CREATED: '\u{2795}',     // ➕
  SCHEDULED: '\u{23F3}',   // ⏳
  START: '\u{1F6EB}',      // 🛫
  CANCELLED: '\u{274C}',   // ❌
  RECURRENCE: '\u{1F501}', // 🔁
} as const;

// Regex to match any known emoji metadata at the end of a task line
export const EMOJI_METADATA_PATTERN =
  /(?:\s+(?:[\u{1F4C5}\u{2705}\u{2795}\u{23F3}\u{1F6EB}\u{274C}\u{1F501}]\s+\d{4}-\d{2}-\d{2}|\u{1F501}\s+[^\u{1F4C5}\u{2705}\u{2795}\u{23F3}\u{1F6EB}\u{274C}]+?))+\s*$/u;

// Priority emoji pattern (these appear standalone, no date after them)
export const PRIORITY_PATTERN = /[\u{1F53A}\u{23EB}\u{1F53C}\u{1F53D}]/u;

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  {
    id: 'backlog',
    label: 'Backlog',
    tag: null,
    type: 'backlog',
    color: '#6B7280',
    collapsed: true,
  },
  {
    id: 'todo',
    label: 'To Do',
    tag: null,
    type: 'todo',
    color: '#6B7280',
    collapsed: false,
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    tag: '#in-progress',
    type: 'tag',
    color: '#F59E0B',
    collapsed: false,
  },
  {
    id: 'done',
    label: 'Done',
    tag: null,
    type: 'done',
    color: '#10B981',
    collapsed: false,
    limit: 10,
  },
];

export const DEFAULT_SETTINGS: KiboTasksSettings = {
  columns: DEFAULT_COLUMNS,
  excludedFolders: ['.trash', '.stversions', '.claude', '.roo', 'Templates'],
  todoFilter: 'due-today',
  globalFilter: '#task',
  doneLimit: 10,
};
