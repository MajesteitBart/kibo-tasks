import { EMOJI, PRIORITY_EMOJI_MAP } from '../constants';
import type { Priority } from '../types';

export interface ParsedEmojis {
  dueDate: string | null;
  doneDate: string | null;
  createdDate: string | null;
  scheduledDate: string | null;
  startDate: string | null;
  cancelledDate: string | null;
  priority: Priority;
  recurrence: string | null;
}

/**
 * Parse all emoji metadata from a task line.
 */
export function parseEmojiMetadata(line: string): ParsedEmojis {
  const result: ParsedEmojis = {
    dueDate: null,
    doneDate: null,
    createdDate: null,
    scheduledDate: null,
    startDate: null,
    cancelledDate: null,
    priority: 'none',
    recurrence: null,
  };

  // Due date: 📅 YYYY-MM-DD
  const dueMatch = line.match(new RegExp(`${EMOJI.DUE}\\s+(\\d{4}-\\d{2}-\\d{2})`));
  if (dueMatch) result.dueDate = dueMatch[1];

  // Done date: ✅ YYYY-MM-DD
  const doneMatch = line.match(new RegExp(`${EMOJI.DONE}\\s+(\\d{4}-\\d{2}-\\d{2})`));
  if (doneMatch) result.doneDate = doneMatch[1];

  // Created date: ➕ YYYY-MM-DD
  const createdMatch = line.match(new RegExp(`${EMOJI.CREATED}\\s+(\\d{4}-\\d{2}-\\d{2})`));
  if (createdMatch) result.createdDate = createdMatch[1];

  // Scheduled date: ⏳ YYYY-MM-DD
  const schedMatch = line.match(new RegExp(`${EMOJI.SCHEDULED}\\s+(\\d{4}-\\d{2}-\\d{2})`));
  if (schedMatch) result.scheduledDate = schedMatch[1];

  // Start date: 🛫 YYYY-MM-DD
  const startMatch = line.match(new RegExp(`${EMOJI.START}\\s+(\\d{4}-\\d{2}-\\d{2})`));
  if (startMatch) result.startDate = startMatch[1];

  // Cancelled date: ❌ YYYY-MM-DD
  const cancelMatch = line.match(new RegExp(`${EMOJI.CANCELLED}\\s+(\\d{4}-\\d{2}-\\d{2})`));
  if (cancelMatch) result.cancelledDate = cancelMatch[1];

  // Priority: 🔺 ⏫ 🔼 🔽
  for (const [emoji, priority] of Object.entries(PRIORITY_EMOJI_MAP)) {
    if (line.includes(emoji)) {
      result.priority = priority;
      break;
    }
  }

  // Recurrence: 🔁 <pattern>
  const recurMatch = line.match(new RegExp(`${EMOJI.RECURRENCE}\\s+([^\\u{1F4C5}\\u{2705}\\u{2795}\\u{23F3}\\u{1F6EB}\\u{274C}]+?)(?:\\s*$|\\s+[\\u{1F4C5}\\u{2705}\\u{2795}\\u{23F3}\\u{1F6EB}\\u{274C}])`, 'u'));
  if (recurMatch) result.recurrence = recurMatch[1].trim();

  return result;
}

/**
 * Build the cleaned description by removing emoji metadata, priority, #task tag, and column tags.
 */
export function cleanDescription(
  rawText: string,
  globalFilter: string,
  columnTags: string[]
): string {
  let text = rawText;

  // Remove global filter tag (e.g., #task)
  text = text.replace(new RegExp(`\\s*${escapeRegex(globalFilter)}\\s*`, 'g'), ' ');

  // Remove column tags
  for (const tag of columnTags) {
    text = text.replace(new RegExp(`\\s*${escapeRegex(tag)}\\s*`, 'g'), ' ');
  }

  // Remove emoji metadata (📅 date, ✅ date, ➕ date, etc.)
  const emojiChars = [
    EMOJI.DUE, EMOJI.DONE, EMOJI.CREATED, EMOJI.SCHEDULED,
    EMOJI.START, EMOJI.CANCELLED,
  ];
  for (const e of emojiChars) {
    text = text.replace(new RegExp(`\\s*${e}\\s+\\d{4}-\\d{2}-\\d{2}`, 'gu'), '');
  }

  // Remove recurrence
  text = text.replace(new RegExp(`\\s*${EMOJI.RECURRENCE}\\s+[^\\s]+`, 'gu'), '');

  // Remove priority emojis
  text = text.replace(/[\u{1F53A}\u{23EB}\u{1F53C}\u{1F53D}]/gu, '');

  // Clean up extra spaces
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
