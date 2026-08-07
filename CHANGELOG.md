# Changelog

## 0.4.3 - 2026-08-07

- Fixed the Home habit history header so its two 11-day groups align with the habit rows instead of collapsing all dates into a narrow strip.
- Restored root-scoped Calendar button resets so the side calendar remains flat and aligned under both the default and Minimal themes.
- Added regression contracts and real Obsidian Default/Minimal acceptance checks for the affected layouts.

## 0.4.2 - 2026-08-07

- Limited task, statistics, source suggestion, and health queries to configured Noria roots instead of enumerating the entire vault.
- Removed clipboard, direct filesystem, shell execution, retired runtime host, and obsolete Inbox migration paths from the production bundle.
- Consolidated Task Board rendering and styles around one canonical task row while preserving month, week, day, matrix, timeline, light, dark, and narrow-pane behavior.
- Fixed Home card content shrinking after the style cleanup and added release gates that prevent reviewed permission and CSS warning patterns from returning.

## 0.4.1 - 2026-08-06

- Updated the manifest description to comply with the Obsidian community plugin directory requirements.
- Removed direct filesystem access, PowerShell clipboard fallback, and plugin-internal Git shell execution from the release bundle while preserving review and timeline evidence contracts for external providers.
- Unified development and release builds so automated source rebuilds produce the same `main.js` artifact.
- Replaced two unnecessary CSS compatibility patterns flagged by the community lint without changing the accepted interface design.

## 0.4.0 - 2026-08-05

- Replaced the retired timeline runtime with the Noria-owned Task Timeline renderer while preserving the accepted side-panel design, overview band, source actions, pan/zoom, task move/resize, annotations, optional layers, and restored-pane lifecycle.
- Promoted Home workbench, navigation, review, and trend cards to first-class configurable widgets while preserving the accepted normal-mode composition.
- Reworked settings into seven focused pages with clearer task, timeline, calendar, appearance, workspace, and maintenance controls.
- Strengthened Review Center evidence handling for concise multi-project reviews and explicit external-agent handoff, adoption, editing, and saving.
- Added real English and Chinese product screenshots and consolidated public documentation into one README and one complete User Guide per language.
- Added standard Obsidian release metadata, version synchronization, and a tagged draft-release workflow for `manifest.json`, `main.js`, and `styles.css`.

## 0.3.6 - 2026-05-09

- Fixed Task Board panel-level view tabs still rendering smaller than auxiliary toolbar actions because the nested label span kept an old compact font size.
- Split Task Board view and Eisenhower segmented controls away from Home dashboard compact class names, keeping large-panel controls visually independent.
- Tuned Task Board auxiliary actions such as Morning Axis and Quick to keep the same control height while using quieter typography.

## 0.3.5 - 2026-05-09

- Split segmented controls into widget-level and panel-level sizes so large panel headers no longer look undersized.
- Aligned Home trends, Review Center, Task Board view switching, and Eisenhower range switching to the panel-level segment size.
- Reduced the visual weight of Task Board auxiliary toolbar actions such as Morning Axis and Quick so they no longer overpower the main view tabs.

## 0.3.4 - 2026-05-09

- Unified compact segmented controls across Home tasks, Home trends, heatmaps, Review Center, Task Board view switching, and Eisenhower range switching.
- Kept inactive mode buttons borderless and transparent while aligning active states, font weight, height, and hover behavior.

## 0.3.3 - 2026-05-09

- Fixed Task Timeline card titles so regular Markdown tags such as `#proj-equation` are removed from the title while remaining available as metadata chips.
- Updated README, Chinese README, User Guide, FAQ, and Settings Mapping to match the current Home widgets, Data API, review evidence, Task Board, and Task Timeline behavior.
- Added documentation screenshot placeholders for future real UI captures.

## 0.3.2 - 2026-05-08

- Fixed Review Center expansion failures caused by stack overflow when review snapshot evidence contained circular references.
- Shortened Review Center period controls to `Day / Week / Month / Year`, while keeping longer labels for title and aria text.
- Unified Home task controls and Task Board period controls with the quieter compact segmented button style used by heatmap controls.

## 0.3.1 - 2026-05-08

- Fixed the Home note trend reading the wrong home snapshot path, which caused the left axis for newly created notes to show `0`.
- Fixed note distribution and workload heatmap note counts still using older local scan paths instead of the shared Home range.
- Updated the project panel to prefer Data API task facts with `rangePolicy: "allFacts"`, keeping it aligned with Task Board and Task Timeline.
- Improved note creation-time parsing for native `Date`, timestamp, and ISO string values.

## 0.3.0 - 2026-05-08

- Removed Dataview from the Noria core runtime path. Home, Task Board, Task Timeline, periodic stats, and review evidence now use native Vault/Data API sources.
- Added native `noria-view` Markdown code blocks for embedded diary widgets.
- Updated settings and documentation language around native runtime and scan scopes.
- Bumped the plugin to `0.3.0` and kept `manifest.json` and `package.json` versions aligned.

## 0.2.3 - 2026-05-08

- Switched Task Board and the side Task Timeline to prefer Data API Markdown task facts, avoiding stale external index state after task writes.
- Added Data API support for `[ ]`, `[x]`, `[/]`, and `[-]` task states, plus `rangePolicy: "allFacts"` for full board and timeline task context.
- Reworked local refresh after task status writes to use fresh-source slot updates, reducing full rerenders and visible state rollback.

## 0.2.2 - 2026-05-08

- Updated task statistics to read task facts directly from vault Markdown first, avoiding stale task completion trends.
- File changes now silently invalidate Data API and task snapshot caches so the next Home range switch reads fresh data without forcing a scroll-to-top refresh.

## 0.2.1 - 2026-05-08

- Fixed Home task completion trend and periodic stat entries reading Data API task completion data from the wrong object level, preventing empty task trend charts.

## 0.2.0 - 2026-05-08

- Added the `noriaBridge.data.*` data trunk for ranges, snapshots, tasks, periods, review evidence, and JSON export.
- Updated Home "Trends and Stats" to read one home snapshot and share the same range data across trends, heatmaps, note distribution, and daily-state blocks.
- Migrated review generation to JSON evidence files under `.obsidian/plugins/noria/cache/stats/review/<year>/`.
- Consolidated review generation into the `noria-review` skill for daily, weekly, monthly, and yearly JSON evidence workflows.
- Removed the old `noriaBridge.stats.*` runtime bridge entry and the older Markdown review-context main flow.
- Bumped the plugin to `0.2.0` and added version-consistency tests for `manifest.json` and `package.json`.

## 0.1.3 - 2026-05-07

- Reduced Home statistics refresh noise, stabilized custom date controls, and aligned the bottom statistics card heights.
- Fixed Home range switching causing an obvious scroll-to-top jump.

## 0.1.1 - 2026-05-07

- Restored the full default Home statistics set: trends, heatmaps, note distribution, and daily-state distribution.
- Aligned the task completion trend with the note trend visual style and capped completion rate at 100%.
- Fixed Chinese localization, complex JSON setting layout, and version-consistency checks.

## 0.1.0 - 2026-05-03

- Improved public documentation structure with installation, first-run, user workflows, troubleshooting, settings mapping, and contribution guidance.
- Clarified that normal users should install release assets instead of cloning the source repository into the plugin directory.
- Switched default README and docs to English, and added `README.zh-CN.md` plus Chinese docs under `docs/zh-CN/`.
- Made the User Guide action open English or Chinese documentation based on Obsidian language.
- Renamed the plugin to Noria and completed author, description, and install-directory metadata.
- Added the unified Home dashboard for tasks, habits, important dates, projects, Inbox, MOCs, and statistics.
- Added Task Board with month, week, day, and matrix views.
- Added Task Timeline for time-based task viewing and arrangement.
- Added Review Center for evidence review, analysis generation, and final review saving.
- Added settings console, data source path configuration, module toggles, query scopes, and appearance settings.
- Added first-run initialization for a minimal Noria directory and note structure after user confirmation.
- Added English and Chinese UI support following the Obsidian language.
- Improved light and dark mode surfaces across Home, Task Board, Task Timeline, statistics, and Review Center.
- Improved embedded diary views, missing dependency messages, and error states.

## 0.0.1

- Initial local version.
