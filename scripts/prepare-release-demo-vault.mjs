import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const targetArg = process.argv[2];
const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const localeArg = process.argv.find((arg) => arg.startsWith("--locale="));

function fail(message) {
  console.error(`Noria demo vault: ${message}`);
  process.exit(1);
}

if (!targetArg) fail("pass a new empty target directory");
const targetRoot = path.resolve(targetArg);
const anchorDate = String(dateArg ? dateArg.slice("--date=".length) : new Date().toISOString().slice(0, 10));
const locale = String(localeArg ? localeArg.slice("--locale=".length) : "en");
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) fail("--date must use YYYY-MM-DD");
if (!["en", "zh-CN"].includes(locale)) fail("--locale must be en or zh-CN");
const isZh = locale === "zh-CN";
const tx = (english, chinese) => isZh ? chinese : english;

if (fs.existsSync(targetRoot) && fs.readdirSync(targetRoot).length) {
  fail(`target directory is not empty: ${targetRoot}`);
}
fs.mkdirSync(targetRoot, { recursive: true });

function targetPath(rel) {
  return path.join(targetRoot, ...String(rel).split("/"));
}

function write(rel, content) {
  const file = targetPath(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(content).replace(/\r\n/g, "\n"), "utf8");
}

function copyReleaseAsset(name) {
  const source = path.join(repoRoot, name);
  if (!fs.existsSync(source)) fail(`missing ${name}; run npm run build first`);
  const destination = targetPath(`.obsidian/plugins/noria/${name}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDemoAsset(name, destinationPath) {
  const source = path.join(repoRoot, "scripts", "demo-assets", name);
  if (!fs.existsSync(source)) fail(`missing demo asset: ${name}`);
  const destination = targetPath(destinationPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function utcDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== iso) fail(`invalid date: ${iso}`);
  return date;
}

function shiftDate(iso, days) {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dailyNote(date, index) {
  const weather = (isZh ? ["晴", "多云", "阴", "晴", "雨"] : ["clear", "partly cloudy", "overcast", "clear", "rain"])[index % 5];
  const mood = (isZh ? ["稳定", "很好", "一般", "稳定", "很好"] : ["steady", "great", "neutral", "steady", "great"])[index % 5];
  const focus = (isZh ? ["基本专注", "很专注", "易分心", "基本专注", "很专注"] : ["mostly focused", "deeply focused", "distracted", "mostly focused", "deeply focused"])[index % 5];
  const energy = 3 + (index % 3);
  const historical = date !== anchorDate;
  const tasks = historical
    ? [
        `- [x] ${tx("Review one captured note", "回看一条已捕捉笔记")} [completion:: ${date}] #noria-demo`,
        ...(index % 3 === 0 ? [`- [x] ${tx("Complete a focused writing block", "完成一个专注写作时段")} [completion:: ${date}] #noria-demo`] : [])
      ]
    : [
        `- [x] ${tx("Process three Inbox notes", "处理三条 Inbox 笔记")} [start:: ${date} 08:20] [due:: ${date} 08:50] [completion:: ${date}] #noria-demo`,
        `- [ ] ${tx("Walk and reset attention", "散步并重置注意力")} [start:: ${date} 17:30] [due:: ${date} 18:00] #wellbeing`,
        `- [ ] ${tx("Read for twenty minutes", "阅读二十分钟")} [start:: ${date} 20:00] [due:: ${date} 20:20] #habit`,
        `- [ ] ${tx("Write the daily review", "写下今日复盘")} [start:: ${date} 21:20] [due:: ${date} 21:40] #review`
      ];
  const habits = historical
    ? [
        ...(index % 5 !== 0 ? [`- [x] ${tx("Morning planning", "晨间规划")} #habit #active [due:: ${date}] [completion:: ${date}]`] : []),
        ...(index % 3 !== 0 ? [`- [x] ${tx("Read for twenty minutes", "阅读二十分钟")} #habit #active [due:: ${date}] [completion:: ${date}]`] : []),
        ...(index % 4 !== 0 ? [`- [x] ${tx("Deep work", "深度工作")} #habit #active [due:: ${date}] [completion:: ${date}]`] : []),
        ...(index % 6 !== 0 ? [`- [x] ${tx("Evening reflection", "晚间复盘")} #habit #active [due:: ${date}] [completion:: ${date}]`] : [])
      ]
    : [
        `- [ ] ${tx("Morning planning", "晨间规划")} #habit #active [due:: ${date}]`,
        `- [ ] ${tx("Read for twenty minutes", "阅读二十分钟")} #habit #active [due:: ${date}]`,
        `- [ ] ${tx("Deep work", "深度工作")} #habit #active [due:: ${date}]`,
        `- [ ] ${tx("Evening reflection", "晚间复盘")} #habit #active [due:: ${date}]`
      ];
  return `---
date: "${date}"
created: "${date}"
weather: "${weather}"
mood: "${mood}"
energy: ${energy}
focus: "${focus}"
tags:
  - daily-plan
cssclasses:
  - daily-clean
---

## ${tx("Today", "今日")}

${tasks.join("\n")}

## ${tx("Habits", "习惯")}

${habits.join("\n")}

## Inbox

${historical ? tx("- One useful idea captured and routed.", "- 捕捉并分流了一条有用想法。") : tx("- Capture before deciding where the material belongs.", "- 先捕捉，再决定材料的归属。")}

## ${tx("Review", "复盘")}

- ${tx("Highlight", "亮点")}: ${historical ? tx("Kept the next action visible.", "让下一步行动保持可见。") : tx("Protected one focused block.", "保护了一个专注时段。")}
- ${tx("Adjustment", "调整")}: ${historical ? tx("Reduce context switching.", "减少上下文切换。") : tx("Leave more space between writing and review.", "在写作与复盘之间留出更多空间。")}
`;
}

for (const asset of ["manifest.json", "main.js", "styles.css"]) copyReleaseAsset(asset);
write(".gitignore", [
  ".obsidian/workspace*.json",
  ".obsidian/plugins/noria/main.js",
  ".obsidian/plugins/noria/manifest.json",
  ".obsidian/plugins/noria/styles.css",
  ".trash/",
  ".DS_Store",
  "Thumbs.db",
  ""
].join("\n"));
write(".obsidian/community-plugins.json", `${JSON.stringify(["noria"], null, 2)}\n`);
write(".obsidian/appearance.json", `${JSON.stringify({ baseFontSize: 16, theme: "moonstone" }, null, 2)}\n`);
write(".obsidian/app.json", `${JSON.stringify({ attachmentFolderPath: "99_Attachment", newFileLocation: "folder", newFileFolderPath: "00_Inbox" }, null, 2)}\n`);

const managedPaths = {
  timelineSettings: "02_Areas/Noria/Timeline settings.md",
  templateLibrary: "02_Areas/Noria/Event library.md",
  importantDates: "02_Areas/Noria/Countdowns.md",
  habitRegistry: "02_Areas/Noria/Habits.md",
  projectRegistry: "02_Areas/Noria/Projects.md",
  inboxWorkflow: "02_Areas/Noria/Inbox workflow.md",
  inboxQueue: "02_Areas/Noria/Inbox queue.base",
  inboxRoot: "00_Inbox",
  projectsRoot: "01_Projects",
  diaryRoot: "06_Diary",
  dailyTemplate: "02_Areas/Noria/Templates/Daily Template.md",
  weeklyTemplate: "02_Areas/Noria/Templates/Weekly Template.md",
  monthlyTemplate: "02_Areas/Noria/Templates/Monthly Template.md",
  yearlyTemplate: "02_Areas/Noria/Templates/Yearly Template.md"
};
const pluginData = {
  managedPaths,
  onboarding: {
    profile: "standard",
    workspaceRoot: "02_Areas/Noria",
    initializedAt: `${anchorDate}T08:00:00.000Z`,
    dismissedVersion: ""
  },
  home: {
    profilePreset: "default",
    identity: {
      displayName: "乙辛Zmod31",
      greetingName: "乙辛Zmod31",
      avatarPath: "99_Attachment/乙辛Zmod31头像.jpg",
      quoteListPath: "02_Areas/Noria/Quotes.md"
    },
    guidePanels: { inbox: true, projects: true, moc: true, reviewCenter: true, reviewCenterExpanded: false }
  },
  homeDashboard: {
    mocEntryPaths: ["05_MOC/工作流\u00b7MOC.md", "05_MOC/知识管理\u00b7MOC.md"]
  },
  tasksCalendar: { defaultView: "week", taskTimelineOpenMode: "right-sidebar" },
  performance: {
    queryScopes: {
      tasks: { mode: "managed", customRoots: [] },
      notes: { mode: "managed", customRoots: [] }
    }
  },
  weather: {
    enabled: true,
    provider: "open-meteo",
    qweatherSecretName: "noria-weather-qweather-key",
    qweatherApiHost: "",
    manualCity: tx("Berlin", "北京"),
    cacheMinutes: 45
  },
  features: {
    modules: { home: true, tasksBoard: true, taskTimeline: true, pomodoro: false, diaryStats: true, calendar: true }
  }
};
write(".obsidian/plugins/noria/data.json", `${JSON.stringify(pluginData, null, 2)}\n`);
write(".noria-demo-vault", `Noria release demo\nDate: ${anchorDate}\nLocale: ${locale}\n`);

copyDemoAsset("avatar.jpg", "99_Attachment/乙辛Zmod31头像.jpg");
if (isZh) copyDemoAsset("Quotes.zh-CN.md", "02_Areas/Noria/Quotes.md");
else write("02_Areas/Noria/Quotes.md", `- Knowledge becomes useful when it changes the next action.\n- Review connects activity with direction.\n- A system should make useful work easier to see.\n`);
const researchProjectName = tx("Research writing", "研究写作");
const knowledgeProjectName = tx("Knowledge system", "知识系统");
const researchProjectPath = `01_Projects/${researchProjectName}/${researchProjectName}.md`;
const knowledgeProjectPath = `01_Projects/${knowledgeProjectName}/${knowledgeProjectName}.md`;
write("02_Areas/Noria/Projects.md", `---\ncreated: "${shiftDate(anchorDate, -75)}"\ntags:\n  - noria-demo\n---\n\n## ${tx("Active projects", "进行中的项目")}\n\n- [[${researchProjectPath}|${researchProjectName}]]: ${tx("turn notes into a clear draft.", "把分散材料推进为一版可讨论的研究初稿。")}\n- [[${knowledgeProjectPath}|${knowledgeProjectName}]]: ${tx("improve capture, navigation, and reuse.", "让捕捉、组织、提炼与复用形成连贯流程。")}\n\n## ${tx("Planned projects", "计划中的项目")}\n\n- ${tx("Reading synthesis", "专题阅读综合")}\n\n## ${tx("Completed projects", "已完成项目")}\n\n- [[04_Archives/01_Projects/工作区初始化/工作区初始化.md|${tx("Workspace setup", "工作区初始化")}]]\n`);
write(researchProjectPath, `---\nproject: ${researchProjectName}\nstatus: active\ncreated: "${shiftDate(anchorDate, -68)}"\ntags:\n  - project/research\n---\n\n## ${tx("Outcome", "目标结果")}\n\n${tx("A readable first draft with a clear problem, evidence chain, and next validation step.", "形成一版问题清楚、证据可追溯、下一步验证明确的研究初稿。")}\n\n## ${tx("Next actions", "下一步行动")}\n\n- [ ] ${tx("Draft the introduction outline", "起草引言提纲")} [start:: ${anchorDate} 09:00] [due:: ${anchorDate} 10:30] #project/writing\n- [ ] ${tx("Review the experiment summary", "检查实验总结")} [start:: ${shiftDate(anchorDate, 1)} 11:00] [due:: ${shiftDate(anchorDate, 1)} 11:40] #project/research\n- [ ] ${tx("Prepare a readable first draft", "准备一版可读初稿")} [due:: ${shiftDate(anchorDate, 7)}] #project/writing\n`);
write(knowledgeProjectPath, `---\nproject: ${knowledgeProjectName}\nstatus: active\ncreated: "${shiftDate(anchorDate, -54)}"\ntags:\n  - project/knowledge\n---\n\n## ${tx("Outcome", "目标结果")}\n\n${tx("A low-friction knowledge workflow that keeps useful material connected to action.", "形成一套低负担的知识工作流程，让长期积累持续服务于行动。")}\n\n## ${tx("Next actions", "下一步行动")}\n\n- [ ] ${tx("Organize two evergreen notes", "整理两条常青笔记")} [scheduled:: ${shiftDate(anchorDate, 2)} 14:00] #knowledge\n- [ ] ${tx("Refine the weekly briefing", "完善每周简报")} [scheduled:: ${shiftDate(anchorDate, 3)} 15:30] #writing\n- [ ] ${tx("Review navigation entry points", "检查导航入口")} [due:: ${shiftDate(anchorDate, 5)}] #knowledge\n`);
const habitHistory = [];
for (let index = 0; index < 89; index += 1) {
  const date = shiftDate(anchorDate, index - 89);
  if (index % 5 !== 0) habitHistory.push(`- [x] ${tx("Morning planning", "晨间规划")} #habit #active [due:: ${date}] [completion:: ${date}]`);
  if (index % 5 !== 0) habitHistory.push(`- [x] ${tx("Deep work", "深度工作")} #habit #active [due:: ${date}] [completion:: ${date}]`);
  if (index % 3 !== 0) habitHistory.push(`- [x] ${tx("Read for twenty minutes", "阅读二十分钟")} #habit #active [due:: ${date}] [completion:: ${date}]`);
  if (index % 4 !== 0) habitHistory.push(`- [x] ${tx("Evening reflection", "晚间反思")} #habit #active [due:: ${date}] [completion:: ${date}]`);
}
const habitPlanning = tx("Morning planning", "晨间规划");
const habitDeepWork = tx("Deep work", "深度工作");
const habitReading = tx("Read for twenty minutes", "阅读二十分钟");
const habitReflection = tx("Evening reflection", "晚间反思");
write("02_Areas/Noria/Habits.md", `---\ncreated: "${shiftDate(anchorDate, -82)}"\ntags:\n  - noria-demo\n---\n\n## ${tx("Active habits", "打卡中的习惯")}\n\n- ${habitPlanning} [type:: check]\n- ${habitDeepWork} [type:: check]\n- ${habitReading} [type:: check]\n- ${habitReflection} [type:: check]\n\n## ${tx("Paused habits", "暂停的习惯")}\n\n- ${tx("Weekly planning", "每周计划")} [type:: check]\n\n## ${tx("Established habits", "已养成习惯")}\n\n- ${tx("Clear the desk", "清理桌面")} [type:: check]\n\n## ${tx("Daily recurring task source", "循环任务源（每日）")}\n\n${habitHistory.join("\n")}\n- [ ] ${habitPlanning} #habit #active [due:: ${anchorDate}]\n- [ ] ${habitDeepWork} #habit #active [due:: ${anchorDate}]\n- [ ] ${habitReading} #habit #active [due:: ${anchorDate}]\n- [ ] ${habitReflection} #habit #active [due:: ${anchorDate}]\n`);
write("02_Areas/Noria/Countdowns.md", `---\ncreated: "${shiftDate(anchorDate, -40)}"\ntags:\n  - noria-demo\n---\n\n## ${tx("Countdowns", "倒计时")}\n\n| ${tx("Date", "日期")} | ${tx("Name", "名称")} | ${tx("Type", "类型")} | ${tx("Note", "说明")} |\n| --- | --- | --- | --- |\n| ${shiftDate(anchorDate, 12)} | ${tx("Draft review", "初稿评审")} | project | ${tx("Share a readable first draft", "分享一版可读初稿")} |\n| ${shiftDate(anchorDate, 30)} | ${tx("Monthly reflection", "月度复盘")} | review | ${tx("Review projects, habits, and notes", "回看项目、习惯与笔记")} |\n`);
write("05_MOC/工作流\u00b7MOC.md", `---\ncreated: "${shiftDate(anchorDate, -72)}"\ntags:\n  - moc\n  - noria-demo\n---\n\n# ${tx("Workflow MOC", "工作流 MOC")}\n\n- [[02_Areas/Noria/Projects.md|${tx("Projects", "项目")}]]\n- [[02_Areas/Noria/Inbox queue.base|Inbox]]\n- [[02_Areas/Noria/Habits.md|${tx("Habits", "习惯")}]]\n- [[02_Areas/Noria/Countdowns.md|${tx("Countdowns", "倒计时")}]]\n`);
write("05_MOC/知识管理\u00b7MOC.md", `---\ncreated: "${shiftDate(anchorDate, -66)}"\ntags:\n  - moc\n  - knowledge-management\n---\n\n# ${tx("Knowledge management MOC", "知识管理 MOC")}\n\n## ${tx("Current projects", "当前项目")}\n\n- [[${researchProjectPath}|${researchProjectName}]]\n- [[${knowledgeProjectPath}|${knowledgeProjectName}]]\n\n## ${tx("Reusable knowledge", "可复用知识")}\n\n- [[03_Resources/知识工作/渐进式提炼.md|${tx("Progressive distillation", "渐进式提炼")}]]\n- [[03_Resources/知识工作/行动与知识的连接.md|${tx("Connect knowledge with action", "行动与知识的连接")}]]\n\n## ${tx("Lifecycle", "知识生命周期")}\n\nCapture -> Organize -> Distill -> Express\n`);
const inboxWorkflowDocument = isZh
  ? `# Inbox 处置工作流\n\n> Inbox 是临时决策队列，不是长期存放区。用 [[Inbox queue.base|Inbox 队列]] 集中查看仍待处理的 Markdown。\n\n## 默认阶段\n\n| 阶段 | 状态 id | 含义 |\n| --- | --- | --- |\n| 判断去留 | \`triage\` | 判断删除、合并、拆分、加工、迁出或继续保留。 |\n| 正在加工 | \`processing\` | 正在精炼、拆分或并入其他内容。 |\n| 准备迁出 | \`ready\` | 去向和下一步已经明确，可以离开 Inbox。 |\n\n主页默认显示这三个阶段。“到期回看”和“补证据”只是可选分组，不是工作流阶段。处理完成不是第四个状态：删除、合并、迁出或归档成功后，条目直接离开 Inbox。\n\n## 处理顺序\n\n\`delete -> merge -> split/refine -> file/archive -> defer\`\n\n\`defer\` 表示暂时保留，状态仍为 \`triage\`（判断去留），不是独立的默认阶段。只有确实存在回看日期时才填写 \`inbox-review\`。\n\n内容离开 Inbox 后，删除临时 \`inbox-*\` 字段。\n`
  : `# Inbox workflow\n\n> Inbox is a temporary decision queue, not long-term storage. Use [[Inbox queue.base|Inbox queue]] to review Markdown that still needs handling.\n\n## Default stages\n\n| Stage | Status id | Meaning |\n| --- | --- | --- |\n| Triage | \`triage\` | Decide whether to delete, merge, split, refine, move, or keep the item. |\n| Processing | \`processing\` | Refine, split, or merge the item. |\n| Ready | \`ready\` | The destination and next action are clear; the item can leave Inbox. |\n\nHome shows these three stages by default. Review due and Needs evidence are optional groups, not workflow stages. Completion is not a fourth status: after deletion, merging, moving, or archiving succeeds, the item leaves Inbox.\n\n## Handling order\n\n\`delete -> merge -> split/refine -> file/archive -> defer\`\n\n\`defer\` keeps the item in \`triage\`; it is not a separate default stage. Add \`inbox-review\` only when a real review date exists.\n\nRemove temporary \`inbox-*\` fields after the content leaves Inbox.\n`;
write("02_Areas/Noria/Inbox workflow.md", `---\ncreated: "${shiftDate(anchorDate, -80)}"\ntags:\n  - noria-demo\n---\n\n${inboxWorkflowDocument}`);
write("02_Areas/Noria/Inbox queue.base", `filters:\n  and:\n    - file.inFolder("00_Inbox")\nviews:\n  - type: table\n    name: ${tx("Active Inbox", "当前 Inbox")}\n    order:\n      - file.name\n      - inbox-status\n      - inbox-next\n`);

const inboxRows = [
  [tx("reading-notes-to-synthesize", "待综合的阅读笔记"), tx("Reading notes to synthesize", "待综合的阅读笔记"), "processing", "refine", "note", tx("Extract two reusable claims", "提炼两条可复用观点")],
  [tx("meeting-idea-to-evaluate", "待评估的会议想法"), tx("Meeting idea to evaluate", "待评估的会议想法"), "triage", "", "", tx("Decide whether it belongs in a project", "判断是否应进入项目")],
  [tx("weekly-briefing-draft", "每周简报草稿"), tx("Weekly briefing draft", "每周简报草稿"), "ready", "file", "briefing", tx("Move into the writing project", "移入写作项目")],
  [tx("reference-image-without-context", "缺少上下文的参考图片"), tx("Reference image without context", "缺少上下文的参考图片"), "triage", "defer", "reference", tx("Revisit when the related note is clear", "相关笔记明确后再回看")]
];
for (const [slug, title, status, action, shape, next] of inboxRows) {
  write(`00_Inbox/${slug}.md`, `---\ncreated: "${shiftDate(anchorDate, -4)}"\ninbox-status: "${status}"\ninbox-action: "${action}"\ninbox-shape: "${shape}"\ninbox-next: "${next}"\ninbox-review: ${shiftDate(anchorDate, 7)}\ntags:\n  - noria-demo\n---\n\n## ${title}\n\n${tx("A generic demo item showing how capture can become an action, note, or project input.", "这条演示捕捉展示了材料如何经过判断，转化为行动、长期笔记或项目输入。")}\n`);
}

write("02_Areas/Noria/Timeline settings.md", `---\ncreated: "${shiftDate(anchorDate, -79)}"\ntimeline_settings:\n  defaultStrategy: daily-only\n  pregenSpanDays: 7\n---\n\n# ${tx("Timeline settings", "时间轴设置")}\n`);
write("02_Areas/Noria/Event library.md", `---\ncreated: "${shiftDate(anchorDate, -78)}"\ntags:\n  - noria-demo\n---\n\n# ${tx("Event library", "事件库")}\n\n- [x] ${tx("Deep work", "深度工作")} [default_tag:: #tl/focus] [default_start::09:00] [default_duration_min::90] #tl/template\n- [x] ${tx("Reading", "阅读")} [default_tag:: #tl/reading] [default_start::20:00] [default_duration_min::20] #tl/template\n- [x] ${tx("Review", "复盘")} [default_tag:: #tl/review] [default_start::21:20] [default_duration_min::20] #tl/template\n`);
write("02_Areas/Noria/Templates/Daily Template.md", `---\ntags:\n  - daily-plan\ncssclasses:\n  - daily-clean\n---\n\n## ${tx("Today", "今日")}\n\n## ${tx("Habits", "习惯")}\n\n## Inbox\n\n## ${tx("Review", "复盘")}\n`);
write("02_Areas/Noria/Templates/Weekly Template.md", `---\ntags:\n  - weekly-plan\n---\n\n## ${tx("Focus", "聚焦")}\n\n## ${tx("Tasks", "任务")}\n\n## ${tx("Review", "复盘")}\n`);
write("02_Areas/Noria/Templates/Monthly Template.md", `---\ntags:\n  - monthly-plan\n---\n\n## ${tx("Direction", "方向")}\n\n## ${tx("Projects", "项目")}\n\n## ${tx("Review", "复盘")}\n`);
write("02_Areas/Noria/Templates/Yearly Template.md", `---\ntags:\n  - yearly-plan\n---\n\n## ${tx("Direction", "方向")}\n\n## ${tx("Projects", "项目")}\n\n## ${tx("Review", "复盘")}\n`);

write("03_Resources/知识工作/渐进式提炼.md", `---\ncreated: "${shiftDate(anchorDate, -62)}"\ntags:\n  - knowledge-work\n  - evergreen\n---\n\n## 核心判断\n\n笔记不是一次完成的容器，而是在使用中逐步提炼的工作材料。先保留来源，再提炼判断，最后把可复用部分连接到项目和 MOC。\n`);
write("03_Resources/知识工作/行动与知识的连接.md", `---\ncreated: "${shiftDate(anchorDate, -47)}"\ntags:\n  - knowledge-work\n  - action\n---\n\n## 核心判断\n\n知识管理的价值不在于保存更多，而在于让过去的记录更容易支持当前判断和下一步行动。\n`);
write("03_Resources/研究方法/证据与判断.md", `---\ncreated: "${shiftDate(anchorDate, -31)}"\ntags:\n  - research-method\n  - evidence\n---\n\n## 原则\n\n事实、推断和计划应保持清晰边界；完成状态必须由可核验产物、测试或记录支持。\n`);
write("04_Archives/01_Projects/工作区初始化/工作区初始化.md", `---\ncreated: "${shiftDate(anchorDate, -88)}"\ncompleted: "${shiftDate(anchorDate, -76)}"\nstatus: archived\ntags:\n  - project/archive\n---\n\n## 结果\n\n完成 IPARA 根桶、Noria 入口、模板和第一批 MOC 的初始化，并将后续改进转入持续领域。\n`);
const demoReadme = isZh
  ? [
      "# Noria 中文演示库",
      "",
      "这是一个可直接打开的中文 Obsidian Vault，用一组自洽的示例笔记展示 Noria 如何连接日常记录、任务推进、项目管理、知识积累、习惯观察与复盘。",
      "",
      "## 从这里开始",
      "",
      "1. 打开 [[05_MOC/知识管理·MOC.md|知识管理 MOC]]，了解知识与行动如何连接。",
      "2. 使用命令面板运行 **Noria: 打开主页**，进入完整工作台。",
      "3. 从主页继续打开任务看板、任务时间轴、日历、趋势统计和复盘中心。",
      "",
      "## 可以看到什么",
      "",
      "- **主页**：身份概览、今日待办、Inbox、项目、习惯、倒计时和复盘入口。",
      "- **任务看板**：月、周、日与四象限四种视图，共用同一批 Markdown 任务。",
      "- **任务时间轴**：在侧栏中观察任务的时间分布、跨度和完成状态。",
      "- **日历**：从日期进入对应日记，连接计划与时间记录。",
      "- **习惯**：查看四项习惯的连续记录与历史变化。",
      "- **趋势统计**：从笔记、任务和日态字段计算趋势、分布与热力图。",
      "- **复盘中心**：基于日记与任务证据整理日、周、月、年复盘。",
      "",
      "## IPARA 内容结构",
      "",
      "| 目录 | 演示内容 |",
      "| --- | --- |",
      "| 00_Inbox | 不同处理状态的捕捉笔记 |",
      "| 01_Projects | 研究写作与知识系统两个活跃项目 |",
      "| 02_Areas | Noria 清单、工作流、模板与长期职责 |",
      "| 03_Resources | 可复用的知识工作与研究方法笔记 |",
      "| 04_Archives | 已完成项目及其结果记录 |",
      "| 05_MOC | 工作流与知识管理入口 |",
      "| 06_Diary | 连续 90 天的任务、习惯和日态证据 |",
      "| 99_Attachment | 演示库自带头像与引用素材 |",
      "",
      "所有统计均由库内 Markdown 与元数据重新计算，没有预写图表结果。示例内容不包含真实私人数据，可以自由修改、删除或替换。",
      ""
    ].join("\n")
  : "# Noria demo vault\n\nThis isolated Obsidian vault demonstrates how Noria connects daily notes, tasks, projects, knowledge, habits, statistics, and reviews. Start from [[05_MOC/知识管理·MOC.md|Knowledge management MOC]] or run **Noria: Open Home**.\n";
write("README.md", demoReadme);

for (let index = 0; index < 90; index += 1) {
  const date = shiftDate(anchorDate, index - 89);
  write(`06_Diary/${date.slice(0, 4)}/${date}.md`, dailyNote(date, index));
}

console.log(`Noria release demo vault created: ${targetRoot}`);
