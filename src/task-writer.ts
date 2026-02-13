import type { App, TFile } from 'obsidian';
import type { KiboTask } from './types';
import { EMOJI } from './constants';
import { todayStr } from './utils/date-utils';

/**
 * Modify a task line in its source file using Vault.process() for atomic operations.
 */
export class TaskWriter {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Add a tag to a task line.
   * Inserts tag before emoji metadata section.
   */
  async addTag(task: KiboTask, tag: string): Promise<void> {
    await this.modifyLine(task.filePath, task.lineNumber, (line) => {
      if (line.includes(tag)) return line; // Already has tag
      return this.insertTag(line, tag);
    });
  }

  /**
   * Remove a tag from a task line.
   */
  async removeTag(task: KiboTask, tag: string): Promise<void> {
    await this.modifyLine(task.filePath, task.lineNumber, (line) => {
      // Remove the tag and clean up extra spaces
      return line.replace(new RegExp(`\\s*${escapeRegex(tag)}`, 'g'), '').replace(/\s+/g, ' ').replace(/ $/, '');
    });
  }

  /**
   * Mark a task as complete: change [ ] to [x], add ✅ date, remove column tags.
   */
  async completeTask(task: KiboTask, columnTags: string[]): Promise<void> {
    const doneDate = todayStr();
    await this.modifyLine(task.filePath, task.lineNumber, (line) => {
      // Change checkbox to [x]
      let result = line.replace(/- \[[ \/!]\]/, '- [x]');

      // Remove column tags
      for (const tag of columnTags) {
        result = result.replace(new RegExp(`\\s*${escapeRegex(tag)}`, 'g'), '');
      }

      // Add done date if not already present
      if (!result.includes(EMOJI.DONE)) {
        result = result.trimEnd() + ` ${EMOJI.DONE} ${doneDate}`;
      }

      return result.replace(/\s+/g, ' ').replace(/^(\s*- \[x\]) /, '$1 ');
    });
  }

  /**
   * Mark a task as incomplete: change [x] to [ ], remove ✅ date.
   */
  async uncompleteTask(task: KiboTask): Promise<void> {
    await this.modifyLine(task.filePath, task.lineNumber, (line) => {
      // Change checkbox to [ ]
      let result = line.replace('- [x]', '- [ ]');

      // Remove done date
      result = result.replace(new RegExp(`\\s*${EMOJI.DONE}\\s+\\d{4}-\\d{2}-\\d{2}`, 'gu'), '');

      return result.replace(/\s+/g, ' ').replace(/ $/, '');
    });
  }

  /**
   * Perform a column transition: handles tag changes and status changes.
   */
  async moveToColumn(
    task: KiboTask,
    sourceColumnTag: string | null,
    targetColumnTag: string | null,
    targetColumnType: 'todo' | 'backlog' | 'tag' | 'done',
    allColumnTags: string[]
  ): Promise<void> {
    if (targetColumnType === 'done') {
      await this.completeTask(task, allColumnTags.filter((t) => t !== null) as string[]);
      return;
    }

    await this.modifyLine(task.filePath, task.lineNumber, (line) => {
      let result = line;

      // If coming from done, uncomplete
      if (task.status === 'x') {
        result = result.replace('- [x]', '- [ ]');
        result = result.replace(new RegExp(`\\s*${EMOJI.DONE}\\s+\\d{4}-\\d{2}-\\d{2}`, 'gu'), '');
      }

      // Remove all column tags
      for (const tag of allColumnTags) {
        if (tag) {
          result = result.replace(new RegExp(`\\s*${escapeRegex(tag)}`, 'g'), '');
        }
      }

      // Add target column tag (if tag-based column)
      if (targetColumnType === 'tag' && targetColumnTag) {
        result = this.insertTag(result, targetColumnTag);
      }

      return result.replace(/\s{2,}/g, ' ').replace(/ $/, '');
    });
  }

  // --- Private helpers ---

  /**
   * Insert a tag into a line, placing it before emoji metadata.
   */
  private insertTag(line: string, tag: string): string {
    // Find the position of the first emoji metadata
    const emojiChars = [
      EMOJI.DUE, EMOJI.DONE, EMOJI.CREATED, EMOJI.SCHEDULED,
      EMOJI.START, EMOJI.CANCELLED, EMOJI.RECURRENCE,
      '\u{1F53A}', '\u{23EB}', '\u{1F53C}', '\u{1F53D}', // priority emojis
    ];

    let insertPos = line.length;
    for (const emoji of emojiChars) {
      const idx = line.indexOf(emoji);
      if (idx !== -1 && idx < insertPos) {
        insertPos = idx;
      }
    }

    // Insert tag before emoji metadata, or at end
    if (insertPos < line.length) {
      // Trim space before insert position
      const before = line.slice(0, insertPos).trimEnd();
      const after = line.slice(insertPos);
      return `${before} ${tag} ${after}`;
    } else {
      return `${line.trimEnd()} ${tag}`;
    }
  }

  /**
   * Atomically modify a specific line in a file.
   */
  private async modifyLine(
    filePath: string,
    lineNumber: number,
    transform: (line: string) => string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) return;

    await this.app.vault.process(file as TFile, (content) => {
      const lines = content.split('\n');
      if (lineNumber >= 0 && lineNumber < lines.length) {
        lines[lineNumber] = transform(lines[lineNumber]);
      }
      return lines.join('\n');
    });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
