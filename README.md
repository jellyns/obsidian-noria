# Noria for Obsidian

**Language**: English | [简体中文](README.zh-CN.md)

![version](https://img.shields.io/badge/version-0.4.1-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.5%2B-7c3aed)
![license](https://img.shields.io/badge/license-MIT-green)

<p align="center">
  <img src="docs/assets/brand/noria-app-icon.svg" width="112" alt="Noria app icon">
</p>

**Turn knowledge into action, and action into lasting knowledge.**

Noria connects daily records, notes, and knowledge management with planning, execution, and review. Its configurable Home brings together Task Board, Task Timeline, projects, Inbox and MOCs, habits, trends, and Review Center, helping you see the current state, choose the next useful action, and let long-term knowledge support ongoing work.

![Noria Home dashboard](docs/assets/en/home-dashboard.png)

---

## Design Direction

| Principle | What it means in Noria |
| --- | --- |
| Visibility | Home statistics, heatmaps, task trends, note distribution, and daily-state signals make real work visible. |
| Low-friction planning | Task Board and Task Timeline help move from capture to arrangement without moving work into a separate app. |
| Configurability | Home is a widget dashboard; paths, scan scopes, modules, templates, filters, and appearance can be adapted to your vault. |
| Reusable data | The same Data API powers Home, tasks, timelines, periodic stats, review evidence, exports, and custom views. |

---

## Core Surfaces

### Home Dashboard

Home is Noria's overview surface. It brings "what needs attention today," "what has been accumulating recently," and "which entrances are worth revisiting" into one configurable dashboard: tasks, projects, Inbox, MOC links, habits, countdowns, weather, note trends, task completion trends, note distribution, heatmaps, and daily-state signals form a lightweight status board.

The statistics make workload visible. You can see recent note growth, task completion, habit continuity, daily-state changes, and vault distribution together. Inbox helps manage temporary capture; projects bring you back to active themes; habits support quick habit setup and 21-day style habit building; countdowns keep important dates inside daily awareness.

Home is also a widget dashboard. Built-in widgets can be enabled, disabled, reordered, and resized. You can add content widgets and, after explicitly granting trust under Maintenance, custom JavaScript view widgets from your vault. The default layout is only a starting point.

Markdown widgets can display daily briefings, current suggestions, weekly reviews, or project-monitor notes produced elsewhere. Noria reads and links the configured `.md` files; it does not require a model connection or generate those documents itself.

### Task Board

Task Board turns tasks scattered across diaries, projects, and other notes into views you can plan from. Month view is useful for cycles and multi-day work, week view for near-term planning, day view for today's work, and matrix view for priority decisions.

Tasks remain in their original notes. New tasks can be written back to the matching diary, weekly note, or monthly note, while edits, drag actions, and completion changes stay in sync with Home statistics and the timeline.

![Task Board month view](docs/assets/en/task-board-month.png)

![Task Board week view](docs/assets/en/task-board-week.png)

![Task Board day view](docs/assets/en/task-board-day.png)

![Task Board matrix view](docs/assets/en/task-board-quadrant.png)

### Task Timeline

Task Timeline puts tasks into a time context. It helps answer questions like "how does today unfold," "where should this task sit," and "what is already occupying attention." You can arrange tasks by date and time block, or keep the side timeline open as a lightweight view of the current schedule.

The timeline is not meant to add more constraints. It makes time placement visible so capture, planning, and actual progress stay connected, while each task still keeps its original note and project context.

The Noria-owned renderer keeps the accepted side-panel design while supporting source opening, background pan and zoom, Today and overview navigation, task move/resize, range marks, and reusable filters. Tasks, records, projects, annotations, Pomodoro data, notes, Git activity, and Noria traces remain selectable layers rather than mandatory noise.

![Task Timeline](docs/assets/en/task-timeline.png)

### Calendar

Calendar lives in the Obsidian sidebar and opens or creates daily, weekly, monthly, quarterly, and yearly notes. It can follow Noria-managed paths, Obsidian Daily Notes, or a custom folder and naming pattern. Missing notes are created directly by default; an optional confirmation can be enabled in Settings.

### Habits

Habits separate "did I do this today" from "is this becoming established." Home keeps today's check-in lightweight, while full habit cards, individual heatmaps, and aggregate trends live in the trends area. Habit records remain ordinary Markdown.

### Trends And Statistics

Trends help you observe change across a period instead of judging each day. Note growth, task completion, habit and workload heatmaps, vault distribution, and daily-state signals share one time range and can be arranged as independent Home widgets.

### Review Center

Review Center opens directly on the editable final review, so you can write first instead of waiting for a report to assemble. A lightweight evidence summary follows; full evidence and analysis load only when you open the support area. Noria can prepare daily, weekly, monthly, and yearly evidence for an external AI workflow or another tool, but it does not call a model or auto-save an adopted draft. Markdown is written back only after you confirm it.

![Review Center](docs/assets/en/review-center.png)

The same data layer powers Home statistics, task views, timeline summaries, periodic views, review evidence, and exports. This avoids each workflow scanning the vault in its own way and makes Noria data easier to use from external agents, scripts, and synchronization workflows.

### Configure It Around Your Vault

Noria can run in a new portable `Noria/` workspace or connect to an existing vault through paths and scan scopes. Settings cover paths, Home widgets, task filtering, templates, appearance, weather, review prompts, and diagnostics. The goal is to fit your knowledge system rather than force your vault into a fixed directory layout.

---

## Workflow

Noria is designed around a simple knowledge-work loop:

1. **Capture** in Inbox, diary notes, or project notes.
2. **Organize** through Home, project panels, MOC links, and Inbox actions.
3. **Plan** with Task Board and Task Timeline.
4. **Execute** from the day view, side timeline, and source tasks.
5. **Review** with reusable evidence and write the final reflection back into your diary.

---

## Quick Start

1. Install and enable **Noria** from `Settings -> Community plugins`.
2. Open `Settings -> Noria -> Overview` and choose **Standard workspace** for a new vault or **Custom paths** for an existing vault.
3. Review the initialization preview, then create only the missing starter files you want. The examples are ordinary Markdown and can be edited or removed at any time.
4. Open **Home** and follow one sample task from the dashboard to its source note, then inspect the same task in **Task Board** or **Task Timeline**.
5. Adjust diary paths, templates, modules, and Home widgets only when you need a different structure.

Noria can create diary notes from its task and review flows, and it also works with Obsidian's core Templates plugin or calendar-style plugins that create dated notes from templates. Use whichever diary creation flow fits your vault best; Noria only needs the diary root and template paths to be configured correctly.

---

## Roadmap

- **Workbench experience**: continue refining module interfaces, responsiveness, interaction logic, and narrow-pane behavior so common workflows stay direct.
- **Composable Home**: improve card creation, visibility, ordering, and sizing, and explore long-term content entrances such as bookshelves, media shelves, and game shelves.
- **Feeds and briefings**: let RSS and other external workflows write daily feeds, summaries, and project monitoring into agreed Markdown files for Home to present.
- **External agent collaboration**: help external agents organize plans, projects, habits, and periodic reviews within clear data and write-back boundaries.

---

## Installation

For normal use, install the release assets. Do not clone the source repository into `.obsidian/plugins/noria/`.

1. Download the latest release assets from [GitHub Releases](https://github.com/jellyns/obsidian-noria/releases/latest):
   - `manifest.json`
   - `main.js`
   - `styles.css`
2. Create the plugin directory in your vault:

   ```text
   .obsidian/plugins/noria/
   ```

3. Put the three files into that directory.
4. Restart Obsidian, or reload community plugins.
5. Enable **Noria** in `Settings -> Community plugins`.

After Obsidian saves settings, the plugin folder normally contains:

```text
.obsidian/plugins/noria/
  manifest.json
  main.js
  styles.css
  data.json
```

It should not contain `src/`, `tests/`, `scripts/`, `node_modules/`, or the full Git repository.

---

## Documentation

- [User Guide](docs/USER-GUIDE.md): installation, every module, Settings, common workflows, troubleshooting, paths, and developer reference.
- [GitHub Issues](https://github.com/jellyns/obsidian-noria/issues): bug reports and feature requests.
- [Changelog](CHANGELOG.md): release history.
- [Contributing](CONTRIBUTING.md): local development, validation, and PR expectations.
- [Security](SECURITY.md): how to report security issues.

---

## Privacy and disclosures

- Noria requires no account and contains no telemetry, analytics, ads, or payments.
- Noria does not call an AI service. Review Center prepares local evidence and prompts that you may copy to a tool you choose.
- Weather is off in a fresh installation. The first explicit workspace initialization enables it; later repairs preserve the user's choice. When weather loads, Noria may contact IP-location and weather services such as `ipwho.is`, `ipapi.co`, Open-Meteo, or `wttr.in`; QWeather is contacted only when you configure its host and API key.
- Review Center keeps its Git evidence field compatible with external evidence providers, but Noria does not execute Git or other shell commands.
- Copy commands use write-only clipboard access through the browser or Electron. Noria does not read clipboard contents or write temporary files for clipboard fallback.
- Custom JavaScript view widgets are disabled by default. If you explicitly enable them under Maintenance, they execute a configured vault-relative JavaScript file with Noria and Obsidian plugin access. Noria blocks protocols, absolute paths, and path traversal; only enable this for files you trust. Built-in Noria views do not require this permission.
- Settings stay in the plugin `data.json`; supported secrets are stored through Obsidian SecretStorage. Snapshot and review exports remain inside the vault unless you choose another vault path.

---

## Development

Clone this repository only when you want to develop Noria itself.

```bash
npm install
npm run check
```

To install the current build into a separate test vault while keeping the plugin directory clean:

```bash
npm run install:vault -- F:/NoriaTest
```

That command builds the plugin and copies only `manifest.json`, `main.js`, and `styles.css` to `F:/NoriaTest/.obsidian/plugins/noria/`. Existing Noria `data.json` is preserved.

---

## Project Layout

- `src/main.js`: Obsidian plugin entry and settings implementation.
- `src/runtime/`: Home, Task Board, Timeline, Review Center, and shared runtime sources embedded into `main.js` during build.
- `src/generated/embedded-runtime-sources.js`: generated embedded resource index. Do not edit it manually.
- `scripts/`: build, release check, and test-vault install scripts.
- `tests/`: Node tests for runtime behavior, settings, packaging, and release checks.
- `manifest.json`, `main.js`, `styles.css`: release assets installed into Obsidian.

---

## Data Storage

- Noria settings are stored in Obsidian's plugin `data.json`.
- Optional weather credentials use Obsidian SecretStorage.
- Review evidence and snapshot exports are written under the plugin cache unless you choose another output path.

---

## License

MIT. See [LICENSE](LICENSE).
