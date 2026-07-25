# Noria

**语言**： [English](README.md) | 简体中文

![version](https://img.shields.io/badge/version-0.4.0-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.5%2B-7c3aed)
![license](https://img.shields.io/badge/license-MIT-green)

<p align="center">
  <img src="docs/assets/brand/noria-app-icon.svg" width="112" alt="Noria 应用图标">
</p>

**让知识进入行动，让行动沉淀为知识。**

Noria 是一款以灵活主页为中心的 Obsidian 个人工作台。它把日常记录、笔记与知识库管理，同计划、执行和复盘连接起来；通过任务看板、任务时间轴、项目、Inbox、MOC、习惯、趋势统计与复盘中心，帮助你看清当前状态、专注下一步，并让长期积累重新服务于行动。

![Noria 主页看板](docs/assets/zh-CN/home-dashboard.png)

---

## 设计取向

| 取向 | 在 Noria 中意味着什么 |
| --- | --- |
| 可见 | 主页统计、热力图、任务趋势、笔记占比和日态信号让实际工作量更清楚。 |
| 低负担 | 任务看板和任务时间轴帮助任务从记录进入安排与执行，不需要搬到另一套应用里。 |
| 可配置 | 主页是小组件看板；路径、扫描范围、模块、模板、过滤和外观都可以按知识库调整。 |
| 可复用 | 同一套 Data API 支撑主页、任务、时间轴、周期统计、复盘证据、导出和自定义视图。 |

---

## 核心界面

### 主页看板

主页是 Noria 的总览入口。它把“今天要推进什么、最近积累了什么、哪些入口需要回看”放在同一张可配置看板上：任务、项目、Inbox、MOC、习惯、倒计时、天气、笔记趋势、任务完成趋势、笔记占比、热力图和日态分布共同构成一个轻量状态面板。

这里的统计用于让工作量可见：你能看到最近一段时间的笔记增长、任务完成、习惯连续性、日态变化和知识库分布，也能从 Inbox 管理临时收集，从项目区回到正在推进的主题。习惯模块按 21 天养成的思路组织，可快速添加和追踪不同习惯；倒计时则用于把重要日期放进日常视野。

主页也是一个小组件看板。内置组件可以启用、禁用、排序、调整尺寸；你也可以添加内容小组件，或在高级设置中显式授予信任后添加库内 JavaScript view 小组件。默认布局只是起点。

Markdown 小组件可以展示由其他流程生成的每日简报、当前建议、每周回顾或项目监控笔记。Noria 只读取并链接配置好的 `.md` 文件，不要求接入模型，也不会自行生成这些内容。

### 任务看板

任务看板把分散在日记、项目和其他笔记里的任务整理成可操作视图。月视图用于观察周期和跨天任务，周视图用于安排近期推进，日视图用于进入当天节奏，四象限用于快速梳理优先级。

任务仍然保留在原始笔记中。新建任务可以写回对应日记、周记或月记；拖动、编辑和完成状态会同步到主页统计和时间轴。这样任务既有看板的可操作性，也保留笔记系统的上下文。

![任务看板](docs/assets/zh-CN/task-board.png)

### 任务时间轴

任务时间轴把任务放进一天或一周的时间结构里。它适合处理“今天怎么展开、哪些任务有明确时段、哪些事情只是待排”这类问题。你可以在主视图中查看日/周节奏，也可以把侧边任务轴常驻在右侧，用较低切换成本感知当前安排。

时间轴不是为了把一天切得更碎，而是让安排自然落到时间上。对于喜欢进入心流的人，它更像一个低干扰参照：任务可以先被捕捉，再被安排到合适时段，推进过程中仍能回到原始笔记和项目语境。

Noria 自有渲染器保留已经收敛的侧栏视觉，同时支持打开任务来源、平移与缩放、Today 与概览导航、任务移动和区间调整、范围标记以及可复用筛选。任务、记录、项目、标记、番茄钟、笔记、Git 活动和 Noria 轨迹都只是可选图层，不会默认堆成信息噪声。

![任务时间轴](docs/assets/zh-CN/task-timeline.png)

### 复盘与可复用数据

复盘中心会先打开可编辑的最终稿，让你无需等待整份报告生成就能直接开始回看与书写；轻量证据摘要随后出现，完整证据和分析只在展开支持区时加载。Noria 可以按日、周、月、年为外部 AI 流程或其他工具准备结构化证据，但不会调用模型，也不会自动保存采纳的草稿；只有你明确确认后才写回 Markdown。

![复盘中心](docs/assets/zh-CN/review-center.png)

主页统计、任务视图、时间轴摘要、周期视图、复盘证据和导出能力共用同一套数据层。这样不同流程不需要各自重复扫描知识库，也让 AI prompt、脚本和外部同步更容易接入 Noria 数据。

### 按你的知识库配置

Noria 可以使用新的 `Noria/` 标准工作区，也可以通过路径和扫描范围接入已有知识库。设置页覆盖路径、主页小组件、任务过滤、模板、外观、天气、复盘 prompt 和诊断。它会适配你的知识系统，而不是把知识库改成固定目录。

---

## 工作流

Noria 围绕一个简单的知识工作循环设计：

1. **捕捉**：进入 Inbox、日记或项目笔记。
2. **整理**：通过主页、项目面板、MOC 和 Inbox 动作处理。
3. **安排**：使用任务看板和任务时间轴。
4. **执行**：回到日视图、侧边任务轴和原始任务。
5. **复盘**：用可复用证据生成回看材料，再把最终反思写回日记。

---

## 功能地图

| 模块 | 提供什么 |
| --- | --- |
| 主页看板 | 任务、项目、Inbox、MOC、习惯、倒计时、统计和日态的可配置总览面板。 |
| 任务看板 | 管理来自日记、项目和普通笔记的任务，支持月、周、日和四象限视图。 |
| 任务时间轴 | 按日期和时段安排任务，可作为主视图或右侧低干扰节奏视图。 |
| 日记统计 | 按周期汇总笔记、任务、日态、习惯和工作量。 |
| 复盘中心 | 基于证据的日、周、月、年复盘工作流。 |
| Data API | 结构化 snapshot、任务事实、周期信息、复盘证据和 JSON 导出。 |
| 设置 | 路径 profile、扫描范围、主页小组件、任务过滤、外观、天气、复盘 prompt 和诊断。 |

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

- [ ] 更便捷的日记笔记创建方式，并补充日、周、月、年模板化日记的使用说明。
- [ ] 更清楚地说明如何配合 Obsidian Templates 插件或其他日历插件创建带模板的 Noria 日期笔记。
- [ ] 更完整的主页小组件示例和更顺手的自定义组件配置。
- [ ] 更深入的周、月、年复盘 rollup 工作流。
- [ ] 基于 Data API 的导出、同步和外部工具接入示例。
- [ ] 持续优化任务编辑、时间轴安排和主页看板的信息密度。

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

- [用户指南](docs/zh-CN/USER-GUIDE.md)：功能流程、主页小组件、任务视图、复盘、Data API 和导出。
- [FAQ](docs/zh-CN/FAQ.md)：安装、空白视图、任务缺失、路径错配、刷新、天气和复盘排查。
- [设置映射](docs/zh-CN/SETTINGS-MAPPING.md)：设置页、`data.json`、runtime bridge、Data API 和主页小组件的字段参考。
- [Changelog](CHANGELOG.md)：版本变更。
- [Contributing](CONTRIBUTING.md)：本地开发、验证和 PR 要求。
- [Security](SECURITY.md)：安全问题报告方式。

---

## 隐私与披露

- Noria 不需要账户，不包含遥测、行为分析、广告或付费功能。
- Noria 不会调用 AI 服务。复盘中心只准备本地证据和 prompt，由你决定是否复制到其他工具。
- 天气默认启用。加载天气时，Noria 可能访问 `ipwho.is`、`ipapi.co`、Open-Meteo 或 `wttr.in` 等定位与天气服务；只有配置 QWeather Host 和 API Key 后才会访问 QWeather。天气可以在设置中关闭。
- 复盘证据可以选择运行当前知识库内的本机 Git 只读命令；Noria 不会推送提交，也不会修改 Git 历史。
- 复制操作会优先使用浏览器或 Electron 剪贴板。在 Windows 上两者都不可用时，Noria 可能短暂把待复制文本写入 UTF-8 系统临时文件并调用 PowerShell `Set-Clipboard`；回退流程结束后会删除该临时文件。
- 自定义 JavaScript view 小组件默认关闭。只有在高级设置中显式开启后，它才会以 Noria 与 Obsidian 插件权限执行配置的库内相对路径 JavaScript 文件。Noria 会阻止协议、绝对路径和路径穿越；请只对可信文件开启。Noria 内建视图不需要此权限。
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
npm run install:vault -- F:/NoriaTest
```

该命令会构建插件，并只复制 `manifest.json`、`main.js`、`styles.css` 到 `F:/NoriaTest/.obsidian/plugins/noria/`。已有 Noria `data.json` 会保留。

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
