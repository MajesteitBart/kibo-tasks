import { Plugin, WorkspaceLeaf } from 'obsidian';
import type { KiboTasksSettings } from './types';
import { VIEW_TYPE_KIBO, DEFAULT_SETTINGS } from './constants';
import { KiboTasksView } from './view';
import { TaskStore } from './task-store';
import { TaskWriter } from './task-writer';
import { KiboTasksSettingTab } from './settings';

export default class KiboTasksPlugin extends Plugin {
  settings: KiboTasksSettings = DEFAULT_SETTINGS;
  private store: TaskStore | null = null;
  private writer: TaskWriter | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.writer = new TaskWriter(this.app);
    this.store = new TaskStore(this.app, this.settings);

    // Register the view
    this.registerView(VIEW_TYPE_KIBO, (leaf) =>
      new KiboTasksView(leaf, this.store!, this.writer!, this.settings)
    );

    // Ribbon icon
    this.addRibbonIcon('kanban', 'Open Kibo Tasks', () => {
      this.activateView();
    });

    // Command palette
    this.addCommand({
      id: 'open-kibo-tasks',
      name: 'Open Kibo Tasks board',
      callback: () => {
        this.activateView();
      },
    });

    // Settings tab
    this.addSettingTab(new KiboTasksSettingTab(this.app, this));

    // Start the task store after workspace is ready
    this.app.workspace.onLayoutReady(async () => {
      await this.store!.fullScan();
      this.store!.startListening();
    });
  }

  onunload(): void {
    this.store?.stopListening();
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // Ensure columns array is valid
    if (!this.settings.columns || this.settings.columns.length === 0) {
      this.settings.columns = [...DEFAULT_SETTINGS.columns];
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.store?.updateSettings(this.settings);

    // Update any open views
    this.app.workspace.getLeavesOfType(VIEW_TYPE_KIBO).forEach((leaf) => {
      if (leaf.view instanceof KiboTasksView) {
        leaf.view.updateSettings(this.settings);
      }
    });
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KIBO);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({
      type: VIEW_TYPE_KIBO,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
  }
}
