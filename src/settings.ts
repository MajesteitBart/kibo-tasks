import { App, PluginSettingTab, Setting } from 'obsidian';
import type KiboTasksPlugin from './main';
import type { ColumnConfig } from './types';

export class KiboTasksSettingTab extends PluginSettingTab {
  plugin: KiboTasksPlugin;

  constructor(app: App, plugin: KiboTasksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Kibo Tasks Settings' });

    // --- General ---
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Global filter tag')
      .setDesc('Only tasks containing this tag are shown. Must match your Tasks plugin config.')
      .addText((text) =>
        text
          .setPlaceholder('#task')
          .setValue(this.plugin.settings.globalFilter)
          .onChange(async (value) => {
            this.plugin.settings.globalFilter = value.trim() || '#task';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('To Do filter mode')
      .setDesc('What tasks appear in the To Do column. Undated tasks always go to Backlog.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('due-today', 'Due today + overdue only')
          .addOption('all-undone', 'All dated not-done tasks')
          .setValue(this.plugin.settings.todoFilter)
          .onChange(async (value) => {
            this.plugin.settings.todoFilter = value as 'due-today' | 'all-undone';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Done column limit')
      .setDesc('Maximum number of completed tasks shown.')
      .addSlider((slider) =>
        slider
          .setLimits(5, 50, 5)
          .setValue(this.plugin.settings.doneLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.doneLimit = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('Folders to skip when scanning for tasks (one per line).')
      .addTextArea((text) =>
        text
          .setPlaceholder('.trash\n.obsidian\nTemplates')
          .setValue(this.plugin.settings.excludedFolders.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    // --- Columns ---
    containerEl.createEl('h3', { text: 'Columns' });
    containerEl.createEl('p', {
      text: 'Configure the board columns. "To Do" and "Done" columns cannot be deleted.',
      cls: 'setting-item-description',
    });

    const columnsContainer = containerEl.createDiv({ cls: 'kibo-settings-columns' });
    this.renderColumns(columnsContainer);

    // Add column button
    new Setting(containerEl)
      .setName('Add column')
      .setDesc('Add a new tag-based column to the board.')
      .addButton((btn) =>
        btn.setButtonText('+ Add Column').onClick(async () => {
          const id = `custom-${Date.now()}`;
          // Insert before Done and Backlog (last two)
          const insertIdx = Math.max(0, this.plugin.settings.columns.length - 2);
          this.plugin.settings.columns.splice(insertIdx, 0, {
            id,
            label: 'New Column',
            tag: '#new-column',
            type: 'tag',
            color: '#8b5cf6',
            collapsed: false,
          });
          await this.plugin.saveSettings();
          this.display();
        })
      );
  }

  private renderColumns(container: HTMLElement): void {
    for (let i = 0; i < this.plugin.settings.columns.length; i++) {
      const col = this.plugin.settings.columns[i];
      this.renderColumnSetting(container, col, i);
    }
  }

  private renderColumnSetting(
    container: HTMLElement,
    col: ColumnConfig,
    index: number
  ): void {
    const isFixed = col.type === 'todo' || col.type === 'done' || col.type === 'backlog';

    const setting = new Setting(container);

    setting.setName(col.label);

    if (col.tag) {
      setting.setDesc(`Tag: ${col.tag}`);
    } else if (col.type === 'todo') {
      setting.setDesc('Tasks with due date today or overdue');
    } else if (col.type === 'backlog') {
      setting.setDesc('Tasks without a due date');
    } else if (col.type === 'done') {
      setting.setDesc('Completed tasks');
    }

    // Edit name
    setting.addText((text) =>
      text
        .setValue(col.label)
        .setPlaceholder('Column name')
        .onChange(async (value) => {
          this.plugin.settings.columns[index].label = value;
          await this.plugin.saveSettings();
        })
    );

    // Edit tag (only for custom tag columns)
    if (col.type === 'tag') {
      setting.addText((text) =>
        text
          .setValue(col.tag || '')
          .setPlaceholder('#tag-name')
          .onChange(async (value) => {
            const tag = value.startsWith('#') ? value : `#${value}`;
            this.plugin.settings.columns[index].tag = tag;
            await this.plugin.saveSettings();
          })
      );
    }

    // Move up/down (not for first/last fixed columns)
    if (!isFixed && index > 1) {
      setting.addExtraButton((btn) =>
        btn.setIcon('arrow-up').setTooltip('Move up').onClick(async () => {
          const cols = this.plugin.settings.columns;
          [cols[index - 1], cols[index]] = [cols[index], cols[index - 1]];
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    if (!isFixed && index < this.plugin.settings.columns.length - 2) {
      setting.addExtraButton((btn) =>
        btn.setIcon('arrow-down').setTooltip('Move down').onClick(async () => {
          const cols = this.plugin.settings.columns;
          [cols[index], cols[index + 1]] = [cols[index + 1], cols[index]];
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }

    // Delete (only custom columns)
    if (!isFixed) {
      setting.addExtraButton((btn) =>
        btn.setIcon('trash').setTooltip('Delete column').onClick(async () => {
          this.plugin.settings.columns.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
  }
}
