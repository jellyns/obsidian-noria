# 设置映射

**语言**： [English](../SETTINGS-MAPPING.md) | 简体中文

本文件是维护者参考，用来说明持久化设置、runtime bridge 字段和 Data API 契约之间的关系。面向使用者的流程说明放在 [User Guide](USER-GUIDE.md)。

## 1. 设置页结构

Noria 设置页包含七个顶层 tab：

- `Overview / 总览`
- `Home / 主页`
- `Tasks / 任务`
- `Timeline / 时间轴`
- `Calendar / 日历`
- `Appearance / 外观`
- `Advanced / 高级`

职责划分：

- `Overview`：初始化状态、模块开关、路径组、数据扫描范围和 quick actions。
- `Home`：身份信息、主页小组件、MOC 入口、导引面板、复盘中心 prompt、主页默认行为和小组件 JSON。
- `Tasks`：任务扫描策略、任务标签过滤、任务看板默认值和任务显示行为。
- `Timeline`：时间轴设置、快速设置、计划交互策略和视觉调参。
- `Calendar`：日历根目录、日记创建、模板、快速添加和点击行为。
- `Appearance`：主题跟随、密度、颜色和视觉调参。
- `Advanced`：迁移状态、SecretStorage、诊断、性能开关和底层运行时维护。

## 2. 核心字段映射

| UI / 概念 | 持久化字段 |
| --- | --- |
| Workspace profile | `onboarding.profile` |
| Standard workspace root | `onboarding.workspaceRoot` |
| 旧入口说明路径 | `viewNotePath` 仅迁移读取 |
| 旧时间线设置路径 | `timelineSettingsPath` 仅迁移读取 |
| 旧事件库路径 | `templateLibraryPath` 仅迁移读取 |
| 托管路径 | `managedPaths.*` |
| Home profile | `home.identity.*` |
| Home defaults | `home.defaults.*` |
| Home guide panels | `home.guidePanels.*` |
| Home widgets | `home.widgets[]` |
| MOC entries | `homeDashboard.mocEntryPaths`、`homeDashboard.mocEntries` |
| Inbox workflow | `inboxWorkflow.*` |
| Task include / exclude tags | `taskTagFilter.includeTags`、`taskTagFilter.excludeTags` |
| Task query policy | `taskQueryPolicy.*` |
| Task Board defaults | `tasksCalendar.*` |
| 模块开关和视图能力 | `features.*` |
| Timeline UI mode | `features.timelineUiPhase` |
| Planner interaction policy | `plannerUxPolicy.*` |
| Planner visual tuning | `plannerLabControls.v2` |
| Pomodoro state | `pomodoro.*` |
| Weather | `weather.*` |
| Review center | `reviewCenter.*` |
| Review prompt | `reviewCenter.prompt.*` |
| Appearance | `appearance.*`、`sizing.*`、`colorPalette.*` |
| Performance | `performance.*` |

天气凭据通过 Obsidian SecretStorage 保存。全新安装使用 `noria-weather-qweather-key`；已识别的旧天气密钥名称会被规范化，不影响其他 Secret。

## 3. Managed Paths

`managedPaths.*` 是普通用户路径注册的唯一真源。运行时视图应优先读取 `globalThis.__noriaRuntimeBridge.paths`，不要硬编码 vault 路径。

Standard workspace 默认路径：

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

| 设置含义 | `data.json` 字段 | runtime bridge 字段 |
| --- | --- | --- |
| Home guide note | `managedPaths.entryNote` | `paths.entryNotePath` |
| Timeline settings | `managedPaths.timelineSettings` | `paths.timelineSettingsPath` |
| Event library | `managedPaths.templateLibrary` | `paths.templateLibraryPath` |
| 倒计时 / 重要日期 | `managedPaths.importantDates` | `paths.importantDatesPath` |
| Habit registry | `managedPaths.habitRegistry` | `paths.habitRegistryPath` |
| Project registry | `managedPaths.projectRegistry` | `paths.projectRegistryPath` |
| Inbox root | `managedPaths.inboxRoot` | `paths.inboxRoot` |
| Projects root | `managedPaths.projectsRoot` | `paths.projectsRoot` |
| Diary root | `managedPaths.diaryRoot` | `paths.diaryRoot` |
| Daily template | `managedPaths.dailyTemplate` | `paths.dailyTemplatePath` |
| Weekly template | `managedPaths.weeklyTemplate` | `paths.weeklyTemplatePath` |
| Monthly template | `managedPaths.monthlyTemplate` | `paths.monthlyTemplatePath` |
| Yearly template | `managedPaths.yearlyTemplate` | `paths.yearlyTemplatePath` |

旧路径字段只作为兼容输入：

- `viewNotePath` -> `managedPaths.entryNote`
- `timelineSettingsPath` -> `managedPaths.timelineSettings`
- `templateLibraryPath` -> `managedPaths.templateLibrary`

迁移后，后续保存应以 `managedPaths.*` 为路径真源。

## 4. Workspace Profiles

Noria 支持两种 setup mode：

| Profile | 适用场景 | 行为 |
| --- | --- | --- |
| `standard` | 新库、测试库或希望独立工作区的库 | 使用便携 `Noria/` 工作区。 |
| `custom` | 已有知识库或手动维护路径 | 保留 `Overview -> Paths` 中已编辑路径。 |

旧值读取时会规范化：

- `starter` -> `standard`
- `ipara` -> `custom`

Profile 操作：

- **Apply missing/default paths**：只补空路径字段。
- **Replace all paths**：用所选 profile 替换全部托管路径。
- 初始化只创建缺失 seed 文件和父目录，不覆盖已有文件。

## 5. 主页小组件

`home.widgets[]` 驱动可配置的主页看板。可见功能卡都作为一级根组件存在，不再嵌套在固定的 Workbench、Guide 或 Trends 外壳中。

| 内置 id | Source family | 常用尺寸 | 用途 |
| --- | --- | --- | --- |
| `identity`、`metrics` | `home-identity`、`overview-metrics` | `wide` | 个人身份、引语、天气和紧凑指标；退出编辑模式后重新组合成已经验收的 Hero。 |
| `today-actions`、`focus-strip` | 主页命令面 | `full` | 捕捉、日记入口与“下一步有用工作”桥接。 |
| `today-tasks-card`、`inbox-card`、`countdown-card` | `overview-columns` | `medium` | 可独立安排的日常工作卡；`inbox-card` 默认保留 Inbox 与今日习惯打卡组合。 |
| `projects-card`、`moc-strip`、`review-focus` | `guide-panels` | `full` | 项目推进、知识入口与同页复盘中心。 |
| `trends-range` | `trends-and-stats` | `full` | 所有可见趋势与统计卡共享的一套周期控制。 |
| `note-trend-card`、`task-trend-card` | `trends-and-stats` | `wide` | 笔记增长趋势和任务完成趋势。 |
| `habit-history-card`、`habit-heatmap-card`、`workload-heatmap-card` | `trends-and-stats` | `full` / `wide` | 习惯历史，以及可独立摆放的习惯与工作量热力图。 |
| `tag-distribution-card`、`daily-state-card` | `trends-and-stats` | `wide` | 知识库分布与日态信号。 |

小组件结构：

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

规范化规则：

- `type` 必须是 `builtin`、`markdown` 或 `view`。
- `size` 必须是 `small`、`medium`、`wide` 或 `full`。
- 内置小组件必须使用已知内置 id。
- `markdown` 和 `view` 小组件必须提供 vault 相对 `source`。
- 已退役的分组 id `workbench`、`guide`、`trends` 会在规范化时展开为一级卡片；旧外壳与生成后的卡片不会同时渲染。
- 旧内置英文标题，例如 `Trends`、`Guide`，会被清空，让运行时本地化显示正确语言。
- 未知、重复或缺少必要字段的小组件会在规范化时丢弃。

## 6. Runtime Bridge

`buildRuntimeBridgeConfig()` 暴露给嵌入视图的运行时契约：

- 身份和本地化：`bridgeVersion`、`runtimeBuildId`、`pluginVersion`、`generatedAt`、`locale`、`i18n`、`t(key, params)`。
- 路径和范围 helper：`paths`、`runtimePaths`、`taskQueryContext`、`runtime.filesForScope()`、`runtime.filesForManagedPath()`。
- 模块设置：`features`、`homeSettings`、`homeDashboard`、`inboxWorkflow`、`tasksCalendarSettings`、`plannerUxPolicy`、`plannerLabControls`、`timelineViewSettings`、`timelineAnnotations`、`pomodoro`、`weather`。
- 外观和尺寸：`appearance`、`appearanceTokens`、`sizing`、`colorPalette`。
- 刷新和缓存 hook：`refresh.requestRefresh()`、`refresh.classifyPath()`、`taskSnapshots.*`。
- 时间轴服务：`timeline.getAnnotations()`、`timeline.saveAnnotation()` 和 `timeline.deleteAnnotation()`。
- 数据访问：`data.resolveRange()`、`data.getSnapshot()`、`data.getTasks()`、`data.getTimelineAnnotations()`、`data.getTimelineTraces()`、`data.getPeriods()`、`data.getReviewEvidence()`、`data.export()`、`data.invalidate()`。

运行时视图应优先使用 bridge 字段，而不是直接读取插件设置。

### 任务时间轴运行时

`timelineViewSettings` 是 Noria 自有渲染器的规范化输入：

- `layers`：可选 `task`、`annotation`、`pomodoro`、`note`、`git` 和 `noria`。
- `showDone` 与 `query`：完成状态显示和标题/来源过滤。
- `scaleMode`：`auto`、`today` 或 `manual`。
- `manualCenter`、`manualZoomIndex`、`manualOverviewZoomIndex`：持久化的手动视口状态。
- `presets`：用户保存的筛选与视口预设。

`timelineAnnotations` 和 `timeline.*` 提供普通 Noria 范围标记。任务拖动与区间调整仍然是有来源绑定的 Markdown 写回；渲染器只发出交互意图，不直接写入知识库文件。

## 7. Data API

`noriaBridge.data.*` 是主页、任务看板、任务时间轴、周期统计、复盘中心、自定义 view 小组件和 JSON 导出的统一数据主干。

### 方法

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

`invalidate()` 是内部运行时 hook，不承诺为稳定外部 API。

### 范围模式

`resolveRange()` 支持：

- `last30`
- `week`
- `month`
- `year`
- `custom`
- `homeCurrent`

年范围默认按周聚合，除非调用方显式请求 `granularity: "month"`。

### Preset 和 Domain

内置 preset：

| Preset | Domains | Views | Detail |
| --- | --- | --- | --- |
| `home` | `notes`, `tasks`, `dailyState`, `habits`, `workload` | `home` | `summary` |
| `review` | `notes`, `tasks`, `dailyState`, `habits`, `workload`, `inbox`, `projects`, `focus`, `pomodoro`, `git` | `review` | `evidence` |
| `board` | `tasks` | `board` | `summary` |
| `timeline` | `tasks`, `focus` | `timeline` | `summary` |
| `periodic` | `notes`, `tasks`, `dailyState`, `habits`, `workload` | `periodic` | `summary` |
| `exportAll` | `all` | `home`, `board`, `timeline`, `review` | `evidence` |

已注册 domain：

```text
notes, tasks, dailyState, habits, workload, inbox, projects, focus, pomodoro, git
```

`include` 选择 domain；`views` 描述消费视图。第一版不维护用户自定义 preset。

### Snapshot 结构

`getSnapshot()` 返回：

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

主页统计应按当前范围只请求一次 `preset: "home"` snapshot，然后所有统计块从同一个 snapshot 渲染。

### 任务事实

`getTasks()` 返回规范化 Markdown 任务事实，不返回 UI HTML。任务身份基于源文件语境：

```text
sourcePath + line/blockId + fingerprint
```

支持的策略包括：

- `bucketBy: "completion" | "due" | "scheduled" | "start" | "active" | "board" | "timeline"`
- 任务看板或任务时间轴需要完整事实时使用 `rangePolicy: "allFacts"`。
- `status: "all" | "done" | "open" | "cancelled"`

无日期完成任务保留在 `undated.completed`，不要强行塞进日期 bucket。

### 导出 Envelope

`data.export()` 写出并返回：

```json
{
  "exportKind": "noria.snapshot",
  "exportVersion": 1,
  "exportedAt": "",
  "noriaVersion": "",
  "payload": {}
}
```

支持的导出 payload 为 `snapshot`、`tasks` 和 `reviewEvidence`。

默认 cache root：

```text
.obsidian/plugins/noria/cache/stats/snapshots/
.obsidian/plugins/noria/cache/stats/tasks/
.obsidian/plugins/noria/cache/stats/review/
```

## 8. 复盘 Evidence

复盘中心使用 JSON evidence 作为交给 `noria-review` skill 的正式数据交接。

`reviewCenter.prompt.*` 字段：

| 字段 | 用途 |
| --- | --- |
| `reviewCenter.prompt.skillName` | Skill 名称，默认 `noria-review`。 |
| `reviewCenter.prompt.promptTemplate` | 外部 AI 调用的 prompt envelope。 |
| `reviewCenter.prompt.promptNotePath` | 可选的 vault 相对自定义 prompt 笔记。 |

默认 prompt 模板使用这些变量：

```text
{skill}
{mode}
{period}
{review_note}
{evidence_file}
```

引用 `evidence_context` 的旧模板会被规范化回当前默认模板。

Evidence 路径：

```text
.obsidian/plugins/noria/cache/stats/review/2026/2026-05-08.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-W19.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-05.json
.obsidian/plugins/noria/cache/stats/review/2026/2026.month.json
.obsidian/plugins/noria/cache/stats/review/2026/2026.week.json
```

Artifact 路径：

```text
06_Diary/2026/2026-05-08-review.md
06_Diary/2026/2026-W19-review.md
06_Diary/2026/2026-05-review.md
06_Diary/2026/2026-review-month.md
06_Diary/2026/2026-review-week.md
```

写回目标小节：

- `## 日复盘`
- `## 周复盘`
- `## 月复盘`
- `## 年复盘`

写回时，artifact 内部 `##` 标题会先降级为 `###` 再插入目标周期笔记。

## 9. Refresh Scopes

| Scope | 典型来源 | 预期行为 |
| --- | --- | --- |
| `home` | MOC、重要日期、习惯、项目、Inbox 变化 | 刷新 Home 相关 leaf。 |
| `tasks` | 任务过滤、模板、任务写回 | 刷新 Task Board 和任务事实。 |
| `timeline` | 时间轴设置、时间轴写回 | 刷新 Task Timeline。 |
| `review` | 复盘保存或复盘设置 | 刷新 Review Center。 |
| `reload` | runtime source、CSS 或模块变化 | 重新加载已打开 Noria leaf。 |
| `all` | 多 scope 或无法精确分类的配置变化 | 重新加载相关 Noria 视图。 |

优先使用 scoped refresh。任务写回应直接更新本地任务事实和受影响 slot；广义 reload 只作为无法精确分类时的兜底。

## 10. `data.json` 可缺省的默认字段

以下字段可以由 `DEFAULT_SETTINGS` 或 default factory 注入，即使保存文件中暂时不存在也应可用：

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

新增字段时，文档需要说明它是立即持久化，还是默认注入直到用户保存设置。

## 11. 维护规则

1. 新增设置项时，先在 `DEFAULT_SETTINGS` 或对应 default factory 中定义默认值。
2. 如果设置影响运行时视图，同步 runtime bridge 契约和相关 Data API 行为。
3. 如果设置是用户路径，同步 `managedPaths.*`、Overview 路径组、本文件和 User Guide。
4. 如果设置改变主页默认行为，同步 `home.widgets[]` 文档和主页行为测试。
5. 如果设置改变复盘 evidence，同步 Review Center 文档、`noria-review` skill 文档和复盘测试。
6. 如果设置影响安装、发布或用户排障，同步 README 和 FAQ。
7. 密钥类配置不得在诊断、日志、issue、截图或文档中展开完整值。
8. 修改源码后重新构建嵌入资源：

   ```bash
   npm run build
   ```
