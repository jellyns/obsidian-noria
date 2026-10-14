# Changelog

## 0.5.0 - Unreleased

- Keep the public build focused on the core workbench; media, RSS, health, finance, inventory, wardrobe and travel remain outside the release bundle.
- Start with a shared location chooser, root-level IPARA defaults and optional starter examples. Keep setup guidance inside the plugin and preserve existing notes, templates and custom paths.
- Simplify settings navigation and Inbox assignment controls; share date controls across core pages and preserve card configuration when removing or restoring an instance.
- Update bilingual documentation with screenshots from the current public build, including Inbox assignment and dragging a task into Focus.

- Align card menus, apply functional colors, restore connected habit bands and warm countdowns, and keep expired countdowns in the manager. Simplify task summaries, weather and project labels while preserving registry descriptions.
- Align daily record fields on one interactive date axis, preserve missing-day gaps, and keep mood choices distinct. Share field colors across recording and statistics.

- Share the card catalog, real previews, layout menu, resizing, duplicate and restore across Home and per-period Diary layouts. Use the Noria color mark for the default avatar and a common list/detail editor for projects, MOCs, habits and countdowns.
- Add real countdown start dates, drag-to-reschedule with cancellation, and reversible archives in source Markdown. Keep today accessible alongside configurable habit history and preserve numeric targets and recorded values.
- Add configurable daily record fields and statistics for diary properties, arbitrary note properties, folders, tasks and habits, with source drilldown, missing-value handling and scoped review material.
- Provide a card-provider lifecycle and a Dataview note adapter through Obsidian's plugin installer. Preserve independent instances and restore them after dependency changes.
- Offer optional starter tasks, habits and a countdown without inventing completed activity. Keep the richer documentation scenario in an isolated demo vault.

- Keep Month view tasks and multi-day bars inside their week, with one native scroll area and fixed date headings. Retain the scroll position through task edits, unify view toolbars, and prioritize readable titles in short time blocks.
- Add multi-line quick notes to Diary, Home, and a global command, with selected-date templates, native Markdown links, recovery drafts, and no invented time for historical entries.
- Record mood and energy beside the diary. Show sparse daily-state records clearly, link trends back to dates, and exclude missing values from averages.
- Prepare compact review material with original prose, task facts, lower-period reviews, and source references. Replace fixed GDD and word targets with grounded theme-based reflection and purposeful source checks; accept natural analysis headings without automatically adopting content.

- Unify Home card header icons, add buttons and menus; stretch MOC cards with their row and restore adjustable/automatic height.
- Keep habit names readable with a single scrolling 21-day history, selectable from 7 to 90 days; open workflow and Base sources without replacing Home.

- Align Home MOC entries in a responsive grid with small color markers, direct Canvas icons, native quick add, and the existing card menu. Keep saved paths in sync with vault renames and protect concurrent edits in the entry manager.
- Reuse open source tabs for Home projects and MOCs, retain heading targets, and support native Page preview and modifier keys. Add a project main-note icon beside the next-step input.

- Unify task editing across Home, Diary, Task Board, Timeline, and the cursor command, including tags, priorities, repeat rules, dependencies, and lifecycle dates. Refine native date/time fields and preserve optional dates, unfinished input, and concurrent source changes.
- Create or link tasks from selected Diary and Review passages through native menus and the shared task editor. Preserve the original prose, keep readable Markdown citations, select an existing project task note or daily tasks, and find previously linked tasks without duplicating their state.
- Accept project registry links followed by descriptive text in Home and the data service, so those projects remain available as task destinations.

- Share task checkboxes and compact title/date/status editing across Home projects and Diary. Preserve undated and partially dated tasks, source metadata, expanded lists, and unfinished edits. Open the source at the task line.
- Add project next steps to the existing task note and section, retain input after failures, and expose remaining tasks and completed items through the existing list controls.
- Route older embedded habit controls to dated diary records, preserve explicitly configured registry paths, and support withdrawals without inventing measured values. Align date-note headings in reading and Live Preview.
- Autosave Diary and Review without replacing the editor or interrupting IME composition. Reuse Obsidian's reading/editing command and assigned shortcut, and keep recovery drafts subject to inspection or adoption before saving.
- Preview the configured period template before first writing; allow explicit source-note creation and reuse the template for first habit records and quick capture. Start new built-in templates with Notes and Plan while preserving existing empty files and custom templates.
- Reuse the task panel's period arrows in Diary, consolidate Diary and Review toolbar actions into labeled native icons, and remove redundant month/year note buttons from Calendar. Keep month/year browsing in the calendar headings.
- Unify Home card settings, collapse, width, move, and visibility in one native menu. Keep frequent actions directly available and restore hidden cards through the existing layout entry.

- Present Diary focus, tasks, and habits in Home-style cards with adjustable width, order, and collapse. Restore the per-workbench layout after reopening without changing task or note data.
- Add persistent Home / Diary navigation and a shared-date Record / Review switch inside Diary. Keep other Home cards, per-page scrolling, selected periods, and in-progress text.
- Read and edit daily, weekly, monthly, and yearly notes with an on-demand calendar or the existing sidebar. Month/year headings browse periods without retargeting the editor. Browsing missing dates does not create files.
- Preserve period tasks and earlier unfinished work; show the dynamic top three only in the current period. Task toggles update their source and record the actual completion date.
- Write Diary and Home habit check-ins to daily notes while preserving centralized definitions and reading existing registry history. Synchronize withdrawals and quantitative records across Home and statistics. Add compact period summaries and on-demand charts.
- Use the same configured date-note path for Diary and Review. Preserve native Markdown, frontmatter, concurrent source edits, and recovery drafts; default date templates contain plain content with scoped typography.
- Keep independent habit and task writes in an unfinished diary draft, preserve source annotations and block links, and restore checkbox state after a failed write. Support the document outline while editing.

- Replace fixed daily review fields with one Markdown document across day, week, month, and year. Read saved reviews as natural sections, edit a section or the full text, and use an optional writing outline.
- Bind review saves with explicit range markers so titles can change without losing the write target. Preserve arbitrary sections and reject ambiguous or unfinished ranges.
- Add on-demand record and analysis references, month-to-week-to-day traversal, section-level analysis adoption, and a single recovery-draft entry. Keep the editor and historical date stable while consulting references or saving.
- Update bilingual review guides and screenshots from the isolated experience build. Existing notes and custom templates are not migrated automatically.
- Release embedded editor focus ownership on exit, and preserve accessible chart names without triggering Obsidian's HTML-only tooltip handler on SVG elements.
- Preserve review Markdown hard breaks, indentation, fenced examples, and unrelated note content; reject invalid dates and mismatched review periods.
- Keep conflicting and older recovery drafts available for inspection and copying. Isolate drafts by editor and clear only the saved or explicitly discarded draft.
- Preserve recovery storage during repository-based installation and distinguish user-authored drafts from regenerable caches in both user guides.

## 0.4.6 - 2026-09-09

- Refined Task Timeline with consistent task markers, readable completed titles, details on hover or keyboard focus, and a continuous date/minimap navigation area across day and hour scales.
- Added named project and global phase annotations with preview, save, edit, delete, and cancel actions that leave task dates unchanged.
- Fixed daily and periodic review replacement crossing into a following parent heading or treating headings inside fenced examples as note structure.
- Fixed the first periodic review save treating its newly created template as an external edit, while retaining conflict checks for subsequent changes.
- Fixed task views retaining stale schedules or completion state after source edits by invalidating cached data before refresh notifications and again when Obsidian finishes indexing the note.
- Added community, feedback, feature suggestion, and support links to Settings → Overview, with bilingual community/support pages and clearer feedback templates.
- Updated English and Chinese README and user guides with Timeline day/hour screenshots and the current interaction model; made the test command portable across Windows and Linux.

## 0.4.5 - 2026-08-11

- Simplified Inbox to three configurable stages and removed the retired terminal-stage model from settings, Home, statistics, managed Bases, and documentation.
- Added configurable daily-section Home cards, removed duplicate habit and focus surfaces, and improved card-toolbar hit testing without changing the established dashboard composition.
- Added immediate Eisenhower drag-and-drop with Markdown-backed quadrant placement, and reorganized Task Timeline filters around saved views, content type, completion state, tags, and search.
- Removed the Calendar date-cell context-menu composer and aligned note statistics with frontmatter `created` dates before filesystem creation times.
- Added the reproducible Chinese IPARA demo Vault source assets and expanded regression coverage for the updated workflows.

## 0.4.4 - 2026-08-07

- Removed theme-inherited underlines from compact month task titles while preserving source navigation and keyboard access.
- Aligned Task Board geometry around `2px` compact rows and `4px` timed week/day blocks without changing task height, color, or layout.
- Removed the retired task-radius tuning path from settings, runtime controls, generated CSS variables, and localization.
- Added regression coverage and real Obsidian light/dark acceptance checks for month, week, and day task rows.

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
