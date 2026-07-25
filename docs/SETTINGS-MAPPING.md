# Settings Mapping

**Language**: English | [简体中文](zh-CN/SETTINGS-MAPPING.md)

This file is a maintainer reference for persisted settings, runtime bridge fields, and the Data API contract. User-facing workflows belong in the [User Guide](USER-GUIDE.md).

## 1. Settings Structure

Noria settings have seven top-level tabs:

- `Overview / 总览`
- `Home / 主页`
- `Tasks / 任务`
- `Timeline / 时间轴`
- `Calendar / 日历`
- `Appearance / 外观`
- `Advanced / 高级`

Responsibilities:

- `Overview`: initialization status, module toggles, path groups, data scan ranges, and quick actions.
- `Home`: identity, dashboard widgets, MOC entries, guide panels, Review Center prompt settings, Home defaults, and Home widget JSON.
- `Tasks`: task scan policy, task tag filters, Task Board defaults, and task display behavior.
- `Timeline`: timeline settings, quick settings, planner interaction policy, and visual tuning.
- `Calendar`: calendar roots, diary-note creation, templates, quick add, and click behavior.
- `Appearance`: theme-following behavior, density, colors, and visual tuning.
- `Advanced`: migration state, SecretStorage, diagnostics, performance knobs, and low-level runtime maintenance.

## 2. Core Field Map

| UI / concept | Persisted field |
| --- | --- |
| Workspace profile | `onboarding.profile` |
| Standard workspace root | `onboarding.workspaceRoot` |
| Legacy entry note path | `viewNotePath` read only for migration |
| Legacy timeline settings path | `timelineSettingsPath` read only for migration |
| Legacy event library path | `templateLibraryPath` read only for migration |
| Managed paths | `managedPaths.*` |
| Home profile | `home.identity.*` |
| Home defaults | `home.defaults.*` |
| Home guide panels | `home.guidePanels.*` |
| Home widgets | `home.widgets[]` |
| MOC entries | `homeDashboard.mocEntryPaths`, `homeDashboard.mocEntries` |
| Inbox workflow | `inboxWorkflow.*` |
| Task include / exclude tags | `taskTagFilter.includeTags`, `taskTagFilter.excludeTags` |
| Task query policy | `taskQueryPolicy.*` |
| Task Board defaults | `tasksCalendar.*` |
| Module toggles and view capabilities | `features.*` |
| Timeline UI mode | `features.timelineUiPhase` |
| Planner interaction policy | `plannerUxPolicy.*` |
| Planner visual tuning | `plannerLabControls.v2` |
| Pomodoro state | `pomodoro.*` |
| Weather | `weather.*` |
| Review center | `reviewCenter.*` |
| Review prompt | `reviewCenter.prompt.*` |
| Appearance | `appearance.*`, `sizing.*`, `colorPalette.*` |
| Performance | `performance.*` |

Weather credentials are stored through Obsidian SecretStorage. Fresh installs use `noria-weather-qweather-key`; recognized legacy weather-key names are normalized without changing unrelated secrets.

## 3. Managed Paths

`managedPaths.*` is the source of truth for normal user path registration. Runtime views should read `globalThis.__noriaRuntimeBridge.paths` first and avoid hardcoded vault paths.

Standard workspace defaults:

```text
Noria/Home.md
Noria/Habits.md
Noria/Countdowns.md
Noria/Projects.md
Noria/Workflow·MOC.md
Noria/Knowledge Base·MOC.md
Noria/Timeline settings.md
Noria/Event library.md
Noria/Inbox queue.md
Noria/Quotes.md
Noria/avatar.svg
Noria/Inbox
Noria/Projects
Noria/Diary
Noria/Templates/Daily template.md
Noria/Templates/Weekly template.md
Noria/Templates/Monthly template.md
Noria/Templates/Yearly template.md
```

| Setting meaning | `data.json` field | runtime bridge field |
| --- | --- | --- |
| Home guide note | `managedPaths.entryNote` | `paths.entryNotePath` |
| Timeline settings | `managedPaths.timelineSettings` | `paths.timelineSettingsPath` |
| Event library | `managedPaths.templateLibrary` | `paths.templateLibraryPath` |
| Countdowns / important dates | `managedPaths.importantDates` | `paths.importantDatesPath` |
| Habit registry | `managedPaths.habitRegistry` | `paths.habitRegistryPath` |
| Project registry | `managedPaths.projectRegistry` | `paths.projectRegistryPath` |
| Inbox root | `managedPaths.inboxRoot` | `paths.inboxRoot` |
| Projects root | `managedPaths.projectsRoot` | `paths.projectsRoot` |
| Diary root | `managedPaths.diaryRoot` | `paths.diaryRoot` |
| Daily template | `managedPaths.dailyTemplate` | `paths.dailyTemplatePath` |
| Weekly template | `managedPaths.weeklyTemplate` | `paths.weeklyTemplatePath` |
| Monthly template | `managedPaths.monthlyTemplate` | `paths.monthlyTemplatePath` |
| Yearly template | `managedPaths.yearlyTemplate` | `paths.yearlyTemplatePath` |

Legacy path fields are compatibility inputs only:

- `viewNotePath` -> `managedPaths.entryNote`
- `timelineSettingsPath` -> `managedPaths.timelineSettings`
- `templateLibraryPath` -> `managedPaths.templateLibrary`

After migration, future saves should treat `managedPaths.*` as the path source of truth.

## 4. Workspace Profiles

Noria supports two setup modes:

| Profile | Use case | Behavior |
| --- | --- | --- |
| `standard` | New, test, or self-contained vault | Uses a portable `Noria/` workspace. |
| `custom` | Existing vault or manually maintained paths | Keeps paths edited in `Overview -> Paths`. |

Legacy values normalize on load:

- `starter` -> `standard`
- `ipara` -> `custom`

Profile actions:

- **Apply missing/default paths**: fills only empty path fields.
- **Replace all paths**: replaces all managed paths with the selected profile.
- Initialization creates only missing seed files and parent directories; it does not overwrite existing files.

## 5. Home Widgets

`home.widgets[]` drives the configurable Home dashboard. Visible functional cards are first-class root widgets rather than nested cards inside fixed Workbench, Guide, or Trends wrappers.

| Built-in widget ids | Source family | Typical size | Purpose |
| --- | --- | --- | --- |
| `identity`, `metrics` | `home-identity`, `overview-metrics` | `wide` | Profile, quote, weather, and compact metrics. They recombine into the accepted Hero outside edit mode. |
| `today-actions`, `focus-strip` | Home command surfaces | `full` | Capture, diary entrances, and the next useful work bridge. |
| `today-tasks-card`, `inbox-card`, `countdown-card` | `overview-columns` | `medium` | Independently placeable daily work cards. `inbox-card` keeps Inbox and today's habit check-in together by default. |
| `projects-card`, `moc-strip`, `review-focus` | `guide-panels` | `full` | Project work, knowledge entrances, and the same-leaf Review Center. |
| `trends-range` | `trends-and-stats` | `full` | One shared period control for every visible trend/stat card. |
| `note-trend-card`, `task-trend-card` | `trends-and-stats` | `wide` | Note growth and task completion trends. |
| `habit-history-card`, `habit-heatmap-card`, `workload-heatmap-card` | `trends-and-stats` | `full` / `wide` | Habit history plus independently placeable habit and workload heatmaps. |
| `tag-distribution-card`, `daily-state-card` | `trends-and-stats` | `wide` | Vault distribution and daily-state signals. |

Widget shape:

```json
{
  "id": "note-trend-card",
  "type": "builtin",
  "enabled": true,
  "order": 71,
  "size": "wide",
  "title": "",
  "source": "trends-and-stats",
  "props": { "renderMode": "block", "block": "note-trend", "lazy": true }
}
```

Rules enforced by normalization:

- `type` must be `builtin`, `markdown`, or `view`.
- `size` must be `small`, `medium`, `wide`, or `full`.
- Built-in widgets must use known built-in ids.
- `markdown` and `view` widgets must provide a vault-relative `source`.
- The retired grouped ids `workbench`, `guide`, and `trends` are expanded into first-class cards during normalization; the grouped wrapper and generated cards are never rendered together.
- Legacy built-in English titles such as `Trends` and `Guide` are cleared so runtime localization can display the correct language.
- Unknown, duplicate, or incomplete widgets are dropped during normalization.

## 6. Runtime Bridge

`buildRuntimeBridgeConfig()` exposes the runtime contract to embedded views:

- Identity and localization: `bridgeVersion`, `runtimeBuildId`, `pluginVersion`, `generatedAt`, `locale`, `i18n`, `t(key, params)`.
- Paths and scope helpers: `paths`, `runtimePaths`, `taskQueryContext`, `runtime.filesForScope()`, `runtime.filesForManagedPath()`.
- Module settings: `features`, `homeSettings`, `homeDashboard`, `inboxWorkflow`, `tasksCalendarSettings`, `plannerUxPolicy`, `plannerLabControls`, `timelineViewSettings`, `timelineAnnotations`, `pomodoro`, `weather`.
- Appearance and sizing: `appearance`, `appearanceTokens`, `sizing`, `colorPalette`.
- Refresh and cache hooks: `refresh.requestRefresh()`, `refresh.classifyPath()`, `taskSnapshots.*`.
- Timeline services: `timeline.getAnnotations()`, `timeline.saveAnnotation()`, and `timeline.deleteAnnotation()`.
- Data access: `data.resolveRange()`, `data.getSnapshot()`, `data.getTasks()`, `data.getTimelineAnnotations()`, `data.getTimelineTraces()`, `data.getPeriods()`, `data.getReviewEvidence()`, `data.export()`, `data.invalidate()`.

Runtime views should prefer bridge fields over direct plugin settings reads.

### Task Timeline Runtime

`timelineViewSettings` is the normalized input for the Noria-owned renderer:

- `layers`: any of `task`, `annotation`, `pomodoro`, `note`, `git`, and `noria`.
- `showDone` and `query`: status visibility and title/source filtering.
- `scaleMode`: `auto`, `today`, or `manual`.
- `manualCenter`, `manualZoomIndex`, `manualOverviewZoomIndex`: persisted manual viewport state.
- `presets`: user-saved filter and viewport presets.

`timelineAnnotations` and `timeline.*` provide ordinary Noria range marks. Task drag/resize writes remain source-linked Markdown operations; the renderer emits interaction intent and does not write vault files directly.

## 7. Data API

`noriaBridge.data.*` is the single data trunk for Home, Task Board, Task Timeline, periodic stats, Review Center, custom view widgets, and JSON export.

### Methods

```js
noriaBridge.data.resolveRange(request)
noriaBridge.data.getSnapshot(request)
noriaBridge.data.getTasks(request)
noriaBridge.data.getTimelineAnnotations(request)
noriaBridge.data.getTimelineTraces(request)
noriaBridge.data.getPeriods(request)
noriaBridge.data.getReviewEvidence(request)
noriaBridge.data.export(request)
noriaBridge.data.invalidate(reason, scope)
```

`invalidate()` is an internal runtime hook. Do not promise it as a stable external API.

### Range Modes

`resolveRange()` supports:

- `last30`
- `week`
- `month`
- `year`
- `custom`
- `homeCurrent`

Year ranges default to weekly granularity unless the caller requests `granularity: "month"`.

### Presets And Domains

Built-in presets:

| Preset | Domains | Views | Detail |
| --- | --- | --- | --- |
| `home` | `notes`, `tasks`, `dailyState`, `habits`, `workload` | `home` | `summary` |
| `review` | `notes`, `tasks`, `dailyState`, `habits`, `workload`, `inbox`, `projects`, `focus`, `pomodoro`, `git` | `review` | `evidence` |
| `board` | `tasks` | `board` | `summary` |
| `timeline` | `tasks`, `focus` | `timeline` | `summary` |
| `periodic` | `notes`, `tasks`, `dailyState`, `habits`, `workload` | `periodic` | `summary` |
| `exportAll` | `all` | `home`, `board`, `timeline`, `review` | `evidence` |

Registered domains:

```text
notes, tasks, dailyState, habits, workload, inbox, projects, focus, pomodoro, git
```

`include` selects domains. `views` describes the consuming surface. The first release does not maintain user-defined presets.

### Snapshot Shape

`getSnapshot()` returns:

```json
{
  "meta": { "schemaVersion": 1, "request": {}, "resolvedRequest": {}, "policy": {} },
  "range": {},
  "granularity": "day",
  "domains": {},
  "views": {},
  "warnings": [],
  "sourceCompleteness": {}
}
```

Home statistics should request one `preset: "home"` snapshot per range and render all blocks from that snapshot.

### Task Facts

`getTasks()` returns normalized Markdown task facts, not UI HTML. Task identity is based on source file context:

```text
sourcePath + line/blockId + fingerprint
```

Supported policies include:

- `bucketBy: "completion" | "due" | "scheduled" | "start" | "active" | "board" | "timeline"`
- `rangePolicy: "allFacts"` when Task Board or Task Timeline needs complete facts beyond the visible date range.
- `status: "all" | "done" | "open" | "cancelled"`

Undated completed tasks stay in `undated.completed`; they should not be forced into date buckets.

### Export Envelope

`data.export()` writes and returns:

```json
{
  "exportKind": "noria.snapshot",
  "exportVersion": 1,
  "exportedAt": "",
  "noriaVersion": "",
  "payload": {}
}
```

Supported export payloads are `snapshot`, `tasks`, and `reviewEvidence`.

Default cache roots:

```text
.obsidian/plugins/noria/cache/stats/snapshots/
.obsidian/plugins/noria/cache/stats/tasks/
.obsidian/plugins/noria/cache/stats/review/
```

## 8. Review Evidence

Review Center uses JSON evidence as the formal handoff to the `noria-review` skill.

`reviewCenter.prompt.*` fields:

| Field | Purpose |
| --- | --- |
| `reviewCenter.prompt.skillName` | Skill name, default `noria-review`. |
| `reviewCenter.prompt.promptTemplate` | Prompt envelope for the external AI run. |
| `reviewCenter.prompt.promptNotePath` | Optional vault-relative note containing a custom prompt. |

The default prompt template uses these variables:

```text
{skill}
{mode}
{period}
{review_note}
{evidence_file}
```

Legacy templates that reference `evidence_context` are normalized back to the current default template.

Evidence paths:

```text
.obsidian/plugins/noria/cache/stats/review/2026/2026-05-08.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-W19.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-05.json
.obsidian/plugins/noria/cache/stats/review/2026/2026.month.json
.obsidian/plugins/noria/cache/stats/review/2026/2026.week.json
```

Artifact paths:

```text
06_Diary/2026/2026-05-08-review.md
06_Diary/2026/2026-W19-review.md
06_Diary/2026/2026-05-review.md
06_Diary/2026/2026-review-month.md
06_Diary/2026/2026-review-week.md
```

Writeback target sections:

- `## 日复盘`
- `## 周复盘`
- `## 月复盘`
- `## 年复盘`

When writing back, artifact headings at `##` are downgraded to `###` before insertion.

## 9. Refresh Scopes

| Scope | Typical source | Expected behavior |
| --- | --- | --- |
| `home` | MOC, important dates, habits, projects, Inbox changes | Refresh Home-related leaves. |
| `tasks` | Task filters, templates, task writes | Refresh Task Board and task facts. |
| `timeline` | Timeline settings, timeline writes | Refresh Task Timeline. |
| `review` | Review save or review settings | Refresh Review Center. |
| `reload` | Runtime source, CSS, or module changes | Reload open Noria leaves. |
| `all` | Multiple scopes or broad configuration changes | Reload relevant open Noria leaves. |

Prefer scoped refresh. Task writes should update local task facts and affected slots directly; broad reload remains a fallback for changes that cannot be classified precisely.

## 10. Default Fields That May Be Missing From `data.json`

The following fields can be injected by `DEFAULT_SETTINGS` or default factories even when they are not currently persisted:

- `onboarding.*`
- `home.*`
- `home.widgets[]`
- `homeDashboard.*`
- `inboxWorkflow.*`
- `tasksCalendar.*`
- `appearance.*`
- `wrapperTimelineCompat.*`
- `timelineQuickSettings.*`
- `managedPaths.*`
- `weather.*`
- `performance.*`
- `reviewCenter.prompt.*`

When adding a field, document whether it is persisted immediately or default-injected until the user saves settings.

## 11. Maintenance Rules

1. Define a default in `DEFAULT_SETTINGS` or the relevant default factory before exposing a new setting.
2. If the setting affects runtime views, update the runtime bridge contract and the relevant Data API behavior.
3. If the setting is a user path, update `managedPaths.*`, Overview path groups, this file, and the User Guide.
4. If the setting changes Home defaults, update `home.widgets[]` docs and Home behavior tests.
5. If the setting changes review evidence, update Review Center docs, `noria-review` skill docs, and review tests.
6. If the setting affects installation, release, or user troubleshooting, update README and FAQ.
7. Never expose full secret values in diagnostics, logs, issues, screenshots, or documentation.
8. Rebuild embedded resources after source changes:

   ```bash
   npm run build
   ```
