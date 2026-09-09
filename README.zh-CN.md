# Noria

**语言**： [English](README.md) | 简体中文

![version](https://img.shields.io/badge/version-0.4.6-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.5%2B-7c3aed)
![license](https://img.shields.io/badge/license-MIT-green)

<p align="center">
  <img src="docs/assets/brand/noria-app-icon.svg" width="112" alt="Noria 应用图标">
</p>

**让知识进入行动，让行动沉淀为知识。**

Noria 是一款以灵活主页为中心的 Obsidian 个人工作台。它把日常记录、笔记与知识库管理，同计划、执行和复盘连接起来；通过任务看板、任务时间轴、日历、项目、Inbox、MOC、习惯、趋势统计与复盘中心，帮助你看清当前状态、专注下一步，并让长期积累重新服务于行动。

![Noria 主页看板](docs/assets/zh-CN/home-dashboard.png)

---

## 设计取向

| 取向 | 在 Noria 中意味着什么 |
| --- | --- |
| 可见 | 主页统计、热力图、任务趋势、笔记占比和日态信号让实际工作量更清楚。 |
| 低负担 | 任务看板和任务时间轴帮助任务从记录进入安排与执行，不需要搬到另一套应用里。 |
| 可配置 | 主页是小组件看板；路径、扫描范围、模块、模板、过滤和外观都可以按知识库调整。 |
| 可复用 | 任务、统计、复盘和外部工作流共享同一份 Markdown 来源，减少重复维护。 |

---

## 核心界面

### 主页看板

主页是 Noria 的总览入口。它把“今天要推进什么、最近积累了什么、哪些入口需要回看”放在同一张可配置看板上：任务、项目、Inbox、MOC、习惯、倒计时、天气、笔记趋势、任务完成趋势、笔记占比、热力图和日态分布共同构成一个轻量状态面板。

这里的统计用于让工作量可见：你能看到最近一段时间的笔记增长、任务完成、习惯连续性、日态变化和知识库分布，也能从 Inbox 管理临时收集，从项目区回到正在推进的主题。今日习惯用于快速打卡，倒计时则把重要日期放进日常视野。

主页也是一个小组件看板。内置组件可以启用、禁用、排序、调整尺寸；你也可以添加内容小组件，或在“维护”中显式授予信任后添加库内 JavaScript view 小组件。默认布局只是起点。

Markdown 小组件可以展示由其他流程生成的每日简报、当前建议、每周回顾或项目监控笔记。Noria 只读取并链接配置好的 `.md` 文件，不要求接入模型，也不会自行生成这些内容。

### 任务看板

任务看板把分散在日记、项目和其他笔记里的任务整理成可操作视图。月视图用于观察周期和跨天任务，周视图用于安排近期推进，日视图用于进入当天节奏，四象限用于快速梳理优先级。

任务仍然保留在原始笔记中。新建任务可以写回对应日记、周记或月记；拖动、编辑和完成状态会同步到主页统计和时间轴。这样任务既有看板的可操作性，也保留笔记系统的上下文。

![任务看板月视图](docs/assets/zh-CN/task-board-month.png)

![任务看板周视图](docs/assets/zh-CN/task-board-week.png)

![任务看板日视图](docs/assets/zh-CN/task-board-day.png)

![任务看板四象限](docs/assets/zh-CN/task-board-quadrant.png)

### 任务时间轴

任务时间轴将带日期的任务和项目阶段放到同一条时间线上。可以在主编辑区查看整体安排，也可以在侧栏常驻查看当前任务；从日尺度放大到小时，就能查看一天内的具体排期。

任务统一以圆点和短标题显示，完成状态由圆点颜色表达，标题保持清晰。悬停或键盘聚焦可查看完整时间、持续跨度与来源笔记；拖动底部日期行或缩略图可平移时间范围。

通过命名的项目或全局时间标注，可以在任务上方标明阶段。编辑这些时段不会修改任务日期，任务仍保留在原来的 Markdown 笔记中。

![任务时间轴中的两周任务与项目阶段](docs/assets/zh-CN/task-timeline-wide.png)

*此处配图使用示例任务，展示 Noria 0.4.6 的 Timeline 交互。* [时间轴使用说明](docs/zh-CN/USER-GUIDE.md#4-任务时间轴)

### 日历

日历位于 Obsidian 侧边栏，用于定位和创建日、周、月、季、年周期笔记。它可以使用 Noria 托管路径、Obsidian Daily Notes，或接入自定义目录与命名格式；点击日期默认直接创建，也可以在设置中开启创建确认。

### 习惯

习惯系统把“今天是否完成”和“长期是否形成”分开呈现。主页保留低干扰的今日打卡入口，完整习惯卡片、单项热力图和汇总趋势则放在趋势区；习惯始终记录在普通 Markdown 中。

### 趋势统计

趋势统计用于观察一段时间内的变化，而不是每天评价自己。笔记增长、任务完成、习惯与工作量热力图、知识库分布和日态信号共享同一时间范围，也可以作为独立主页卡片重新排列。

### 复盘中心

复盘中心会先打开可编辑的最终稿，让你无需等待整份报告生成就能直接开始回看与书写；轻量证据摘要随后出现，完整证据和分析只在展开支持区时加载。它同时提供外部模型复盘结果的可视化与编辑窗口：Noria 准备日、周、月、年的本地证据，外部 Agent 生成分析，用户确认采纳后再写回 Markdown。

![复盘中心](docs/assets/zh-CN/review-center.png)

主页统计、任务视图、时间轴摘要、周期视图、复盘证据和导出能力共用同一套数据层。这样不同流程不需要各自重复扫描知识库，也让外部 Agent、脚本和同步流程更容易接入 Noria 数据。

### 按你的知识库配置

Noria 可以使用新的 `Noria/` 标准工作区，也可以通过路径和扫描范围接入已有知识库。设置页覆盖路径、主页小组件、任务过滤、日历来源与周期模板、外观、天气、复盘提示词和维护工具。它会适配你的知识系统，而不是把知识库改成固定目录。

---

## 工作流

Noria 围绕一个简单的知识工作循环设计：

1. **捕捉**：进入 Inbox、日记或项目笔记。
2. **整理**：通过主页、项目面板、MOC 和 Inbox 动作处理。
3. **安排**：使用任务看板和任务时间轴。
4. **执行**：回到日视图、侧边任务轴和原始任务。
5. **复盘**：用可复用证据生成回看材料，再把最终反思写回日记。

---

## 快速开始

1. 在 `设置 -> 第三方插件` 中安装并启用 **Noria**。
2. 打开 `设置 -> Noria -> 总览`：新库选择 **标准工作区**，已有知识库选择 **自定义路径**。
3. 检查初始化预览，只创建需要的缺失入门文件。示例都是普通 Markdown，可以随时修改或删除。
4. 打开 **主页**，从一条示例任务进入来源笔记，再到 **任务看板** 或 **任务时间轴** 查看同一任务。
5. 只有在需要不同结构时，再调整日记路径、模板、模块和主页组件。

Noria 可以在任务和复盘流程中创建日记笔记，也可以配合 Obsidian 核心 Templates 插件，或其他带日历能力、能从模板创建日期笔记的插件使用。你可以选择最符合自己知识库习惯的日记生成方式；Noria 只需要正确配置 Diary root 和对应模板路径。

---

## 路线图

- **工作台体验**：继续优化各模块的界面、响应速度、操作逻辑和窄栏适配，让常用流程更直接。
- **可组合主页**：完善卡片添加、隐藏、排序和尺寸调整，并探索书架、影音架与游戏架等长期内容入口。
- **信息流与简报**：支持 RSS 等外部流程把当日推送、摘要和项目监控写入约定 Markdown，由主页统一展示。
- **外部 Agent 协作**：让外部 Agent 在清晰的数据和写回边界内，更好地协助组织计划、项目、习惯与周期复盘。

---

## 安装

普通用户不要把整个源码仓库 clone 到 `.obsidian/plugins/noria/`。标准安装只需要发行版三件套。

1. 从 [GitHub Releases](https://github.com/jellyns/obsidian-noria/releases/latest) 下载最新发行版资产：
   - `manifest.json`
   - `main.js`
   - `styles.css`
2. 在你的 Obsidian 库中创建插件目录：

   ```text
   .obsidian/plugins/noria/
   ```

3. 把三个文件放入该目录。
4. 重启 Obsidian，或重新加载社区插件。
5. 在 `Settings -> Community plugins` 中启用 **Noria**。

Obsidian 保存设置后，插件目录通常是：

```text
.obsidian/plugins/noria/
  manifest.json
  main.js
  styles.css
  data.json
```

不应出现 `src/`、`tests/`、`scripts/`、`node_modules/` 或整个 Git 仓库。

---

## 文档

- [用户手册](docs/zh-CN/USER-GUIDE.md)：安装初始化、全部模块、设置、常用工作流、FAQ、路径与开发参考。
- [GitHub Issues](https://github.com/jellyns/obsidian-noria/issues)：提交 Bug 和功能建议。
- [社区交流](docs/COMMUNITY.md#中文)：使用帮助、工作流分享与交流群入口。
- [支持开发](docs/SUPPORT.md#中文)：自愿支持 Noria 的持续维护。
- [Changelog](CHANGELOG.md)：版本变更。
- [Contributing](CONTRIBUTING.md)：本地开发、验证和 PR 要求。
- [Security](SECURITY.md)：安全问题报告方式。

---

## 隐私与披露

- Noria 不需要账户，不包含遥测、行为分析、广告或付费功能。
- Noria 不会调用 AI 服务。复盘中心为外部模型生成的复盘提供证据交接、可视化、编辑和明确采纳入口。
- 新安装在显式初始化前默认关闭天气；完成首次初始化后会启用，仍可随时在设置中关闭。加载天气时，Noria 可能访问 `ipwho.is`、`ipapi.co`、Open-Meteo 或 `wttr.in` 等定位与天气服务；只有配置 QWeather Host 和 API Key 后才会访问 QWeather。
- 复盘中心保留兼容外部证据提供方的 Git 证据字段，但 Noria 不会执行 Git 或其他 Shell 命令。
- 自定义 JavaScript view 小组件默认关闭。只有在“维护”中显式开启后，它才会以 Noria 与 Obsidian 插件权限执行配置的库内相对路径 JavaScript 文件。Noria 会阻止协议、绝对路径和路径穿越；请只对可信文件开启。Noria 内建视图不需要此权限。
- 设置保存在插件 `data.json`；支持的密钥通过 Obsidian SecretStorage 保存。snapshot 和复盘导出默认留在知识库内，除非你选择其他库内路径。

---

## 开发

只有在开发 Noria 插件本身时，才需要 clone 本源码仓库。

```bash
npm install
npm run check
```

如果要把当前构建结果安装到单独测试库，并保持安装目录干净：

```bash
npm run install:vault -- "/path/to/test-vault"
```

将示例路径替换为一个独立的测试库。该命令会构建插件，并只复制 `manifest.json`、`main.js`、`styles.css` 到该库的 `.obsidian/plugins/noria/` 目录。已有 Noria `data.json` 会保留。

---

## 项目结构

- `src/main.js`：Obsidian 插件入口和设置页实现。
- `src/runtime/`：主页、任务看板、时间轴、复盘和共享运行时源码，构建时嵌入 `main.js`。
- `src/generated/embedded-runtime-sources.js`：构建生成的嵌入资源索引，不要手动编辑。
- `scripts/`：构建、release 检查和测试库安装脚本。
- `tests/`：运行时、设置、打包和发行检查的 Node 测试。
- `manifest.json`、`main.js`、`styles.css`：安装到 Obsidian 的发行版资产。

---

## 数据存储

- Noria 设置保存在 Obsidian 插件的 `data.json`。
- 可选天气凭据使用 Obsidian SecretStorage。
- 复盘 evidence 和 snapshot 导出默认写入插件 cache，除非你指定其他输出路径。

---

## 许可证

MIT. See [LICENSE](LICENSE).
