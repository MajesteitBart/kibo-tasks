# Kibo Tasks

A clean, minimal Kanban board for [Obsidian](https://obsidian.md) that works with the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin.

Drag tasks between columns to update their status directly in your markdown files.

![Kibo Tasks](https://img.shields.io/badge/Obsidian-Plugin-blueviolet)

## Features

- **Tag-based columns** — Dragging a card between columns adds/removes tags in the source file
- **Obsidian Tasks compatible** — Respects `#task` global filter, emoji metadata (`📅`, `✅`, `⏫`), and checkbox statuses
- **Live updates** — Edits in your files reflect on the board within ~300ms
- **Drag & drop** — Powered by SortableJS for smooth cross-column dragging
- **Collapsible columns** — Collapsed columns become thin vertical strips to save space
- **Kibo UI design** — Clean, spacious aesthetic with colored status dots and italic headers
- **Theme-aware** — Works with light and dark Obsidian themes

## Default Columns

| Column | Behavior |
|--------|----------|
| **To Do** | Tasks with due date today or overdue |
| **In Progress** | Tasks tagged `#in-progress` |
| **Done** | Completed tasks (`- [x]`) |
| **Backlog** | Tasks without a due date (collapsed by default) |

You can add custom tag-based columns (e.g., "Waiting" → `#waiting`, "Review" → `#review`) in settings.

## How It Works

- **To Do → In Progress**: Adds `#in-progress` to the task line
- **In Progress → Done**: Marks `[x]`, adds `✅ YYYY-MM-DD`, removes `#in-progress`
- **Done → To Do**: Marks `[ ]`, removes `✅` date
- **Any → Custom column**: Removes previous column tag, adds new column tag

All file mutations use Obsidian's `Vault.process()` for atomic read-modify-write operations.

## Task Format

Works with standard Obsidian Tasks emoji format:

```markdown
- [ ] Buy groceries #task 📅 2026-02-13
- [ ] Review PR #task @work ⏫ 📅 2026-02-14
- [x] Ship feature #task ✅ 2026-02-12
```

Supports all priority emojis: `🔺` highest, `⏫` high, `🔼` medium, `🔽` low.

## Installation

### From BRAT (recommended for now)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Add `MajesteitBart/kibo-tasks` as a beta plugin
3. Enable "Kibo Tasks" in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/MajesteitBart/kibo-tasks/releases)
2. Create `.obsidian/plugins/kibo-tasks/` in your vault
3. Place the three files there
4. Enable "Kibo Tasks" in Community Plugins

## Settings

- **Global filter tag** — Must match your Tasks plugin config (default: `#task`)
- **To Do filter mode** — "Due today + overdue" or "All dated tasks"
- **Done limit** — Max completed tasks shown (default: 10)
- **Excluded folders** — Folders to skip when scanning
- **Custom columns** — Add/remove/reorder tag-based columns

## Development

```bash
npm install
npm run dev    # development build with sourcemaps
npm run build  # production build
```

## License

MIT
