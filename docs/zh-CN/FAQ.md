# FAQ

**语言**： [English](../FAQ.md) | 简体中文

## Q1: Noria 应该怎么安装？

正常安装只需要 GitHub Release 里的三个文件：

- `manifest.json`
- `main.js`
- `styles.css`

把它们放到当前库的 `.obsidian/plugins/noria/`，然后在 Obsidian 社区插件里启用 Noria。不要把整个源码仓库 clone 到插件目录；源码仓库里有 `src/`、`tests/`、`scripts/`、`node_modules/` 等开发文件，不属于用户安装包。

保存设置后，Obsidian 还会在插件目录生成 `data.json`，这是正常现象。

## Q2: 打开后空白怎么办？

按这个顺序检查：

1. Noria 是否在社区插件中启用。
2. `Settings -> Noria -> Overview` 是否能打开。
3. 插件安装目录里是否是 release 资产，而不是源码仓库。
4. Overview 是否提示缺失 seed 文件或目录。
5. `Overview -> Paths` 里的 Diary、Projects、Inbox、模板和清单路径是否符合你的库。
6. 当前任务源目录里是否真的有 Markdown 任务。
7. 开发者控制台是否有 `noria` 相关错误。

新库建议先使用 Standard workspace 初始化；已有库建议切到 Custom paths 并把 `Overview -> Paths` 填准，再看具体视图。

## Q3: 为什么任务看板创建日记的目录不对？

任务看板创建日记时应使用 `Overview -> Paths -> Diary root`。如果目录不对：

1. 打开 `Settings -> Noria -> Overview -> Paths`。
2. 检查 `Diary root` 是否是你想要的目录，例如 `Noria/Diary` 或 `06_Diary`。
3. 保存设置后重新打开任务看板。
4. 再从任务看板点击日期创建日记。

如果你刚从旧配置迁移，优先使用 Overview 的 profile 预览确认当前路径来源。

## Q4: 为什么我的任务没显示？

常见原因是路径、过滤条件或任务语义：

- 任务不在当前扫描范围内。
- `Tasks -> Include tags` 非空，导致只显示指定标签。
- `Tasks -> Exclude tags` 或兼容过滤排除了 `#habit`、`#tl/*` 或你的自定义标签。
- 任务日期、scheduled、start、due、completion 或当前视图范围不匹配。
- 取消任务或习惯任务可能在某些视图中被刻意隐藏。
- 笔记尚未保存。

排查时先把过滤条件清空，只保留最小任务样本，确认路径正确后再逐步恢复过滤。

## Q5: 时间轴和任务看板为什么不一致？

它们使用同一套任务事实，但展示目标不同：

- 任务看板强调月、周、日和矩阵规划。
- 任务时间轴强调日期、时间段和日内安排。

先检查：

1. `Overview -> Paths` 和 `Tasks` 中的 Diary、Projects、Inbox 和扫描范围。
2. `Tasks` 里的 include / exclude 标签。
3. 时间轴相关策略是否隐藏了 overdue、cancelled、untimed 或 waiting 任务。
4. 当前选择的看板视图和日期范围。

任务完成和任务编辑应该能较快从 Markdown 原文更新。如果某条任务长时间停留在旧状态，先保存源笔记，再重新打开受影响视图；仍有问题时记录文件路径、任务行和控制台错误。

## Q6: 为什么主页统计和我预期不一致？

主页统计使用同一套范围控制。默认是最近 30 天；周、月、年、自选范围会改变笔记趋势、任务完成趋势、热力图、笔记占比和日态分布共用的 snapshot。

检查：

1. `趋势和统计` 标题行中选择的范围。
2. 任务是否有完成日期，或能否使用日记日期兜底。
3. 笔记是否在配置好的 notes 扫描范围内。
4. 日记和复盘 artifact 是否按预期被过滤。
5. 相关源文件是否已经保存。

如果你在和旧的周/月/年内嵌统计块对比，优先以当前主页统计或独立 Diary Stats 命令为准。

## Q7: 主页小组件怎么用？

主页有默认小组件布局，但它不是固定页面。

在 `Settings -> Noria -> Home` 中可以：

- 启用或禁用内置组件。
- 调整组件顺序。
- 调整组件尺寸。
- 添加 Markdown 小组件，用于静态内容。
- 在高级设置中显式授予信任后，添加库内自定义 JavaScript view 小组件用于动态内容。

Markdown 小组件不执行内联脚本。自定义 JavaScript view 默认关闭；只对可信文件开启 **高级 -> 自定义 JavaScript 视图**，再通过 `noriaBridge.data.*` 读取 Noria 统计或任务。

## Q8: 可以只用某个模块吗？

可以。你可以只用 Home、Task Board、Task Timeline、Diary Stats 或 Review Center。未使用的模块不会要求你提前创建所有清单。建议在 Overview 或 Home 设置里关闭暂时不用的模块和面板。

## Q9: 默认笔记会自动生成很多文件吗？

不会。Noria 不会在启动时批量创建文件。文件生成只发生在两类操作里：

- 你在 Overview 或路径设置旁点击初始化、生成或修复。
- 某个功能需要写入目标文件，而目标文件不存在。

生成位置遵循当前 `Overview -> Paths` 配置。初始化不覆盖已有文件，也不会自动迁移旧文件。

## Q10: 如何恢复默认配置？

不要直接删除整个 `data.json`，除非你明确想重置所有 Noria 设置。更安全的做法：

1. 备份 `.obsidian/plugins/noria/data.json`。
2. 打开 `Settings -> Noria -> Overview`。
3. 选择 Standard workspace 或 Custom paths。
4. 使用 **Apply missing/default paths** 只补空路径。
5. 只有在你确认要切换整套路径时，才使用 **Replace all paths**。
6. 对缺失清单使用生成/修复按钮。

## Q11: 修改路径后为什么没有立刻刷新？

大多数写入操作会请求局部刷新，但 Obsidian 仍会异步分发文件变更事件。建议：

1. 保存设置。
2. 关闭并重新打开对应视图。
3. 如果是任务源变化，重新打开任务看板和任务时间轴。
4. 如果仍不一致，记录入口、目标文件、操作步骤和控制台错误。

任务状态变化通常应从 Markdown 原文更新，不需要等待单独的外部索引。

## Q12: 天气凭据怎样保存？

可选的 QWeather 凭据会在可用时通过 Obsidian SecretStorage 保存；迁移成功后，后续保存的 `data.json` 不应保留其明文值。

排查时只记录天气 provider、是否启用、缓存时间、手动城市，以及凭据是否 configured/missing。不要公开完整凭据。

## Q13: 复盘笔记和 evidence 文件保存在哪里？

复盘 artifact 是从日记或周期路径派生的 Markdown 笔记。例如：

```text
Noria/Diary/2026/2026-05-03-review.md
Noria/Diary/2026/2026-W19-review.md
Noria/Diary/2026/2026-05-review.md
Noria/Diary/2026/2026-review-month.md
Noria/Diary/2026/2026-review-week.md
```

复盘 evidence 是插件 cache 下的 JSON 文件，例如：

```text
.obsidian/plugins/noria/cache/stats/review/2026/2026-05-03.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-W19.json
.obsidian/plugins/noria/cache/stats/review/2026/2026-05.json
```

复盘 artifact 是可以保留和纳入版本控制的知识工作产物。cache evidence 是生成辅助数据，通常不需要提交。

## Q14: 怎样使用外部 AI 工具辅助复盘？

Noria 不调用模型，也不保存模型凭据。复盘中心只准备本地复盘笔记、evidence 文件和 prompt；你可以把它复制到 Codex、其他助手或自己的脚本中。

prompt 会引用 review note 和 evidence file。让外部工具先读取 evidence，再按复盘问题检查少量相关笔记；是否采纳由你决定，Noria 只有在明确确认后才写回 Markdown。

## Q15: 外部脚本或自定义小组件能读取 Noria 数据吗？

可以。在 Noria runtime view 中可以使用 `noriaBridge.data.*`：

- `getSnapshot()`：读取主页、周期、看板、时间轴或复盘 snapshot。
- `getTasks()`：读取规范化 Markdown 任务事实。
- `getPeriods()`：读取日/周/月/年周期元数据。
- `getReviewEvidence()`：读取复盘 evidence。
- `export()`：导出 `noria.snapshot`、`noria.tasks`、`noria.reviewEvidence` 等 JSON envelope。

主页自定义 view 小组件优先使用 runtime bridge。Obsidian 外部脚本则更适合读取导出的 JSON 文件。

## Q16: 为什么 User Guide 打开后创建了 `docs/` 空目录？

这属于旧版本的问题。当前版本应打开 GitHub 上的 User Guide 链接，而不是在你的 vault 里生成 `docs/USER-GUIDE.md`。如果你仍看到 `docs/` 被创建：

1. 确认安装目录里的 `main.js` 已更新到最新 release。
2. 删除测试时产生的空 `docs/` 目录。
3. 重新加载 Noria 后再点击 User Guide。
