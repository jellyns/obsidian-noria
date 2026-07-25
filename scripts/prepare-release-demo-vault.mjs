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
  return `---
date: "${date}"
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

## Inbox

${historical ? tx("- One useful idea captured and routed.", "- 捕捉并分流了一条有用想法。") : tx("- Capture before deciding where the material belongs.", "- 先捕捉，再决定材料的归属。")}

## ${tx("Review", "复盘")}

- ${tx("Highlight", "亮点")}: ${historical ? tx("Kept the next action visible.", "让下一步行动保持可见。") : tx("Protected one focused block.", "保护了一个专注时段。")}
- ${tx("Adjustment", "调整")}: ${historical ? tx("Reduce context switching.", "减少上下文切换。") : tx("Leave more space between writing and review.", "在写作与复盘之间留出更多空间。")}
`;
}

for (const asset of ["manifest.json", "main.js", "styles.css"]) copyReleaseAsset(asset);
write(".obsidian/community-plugins.json", `${JSON.stringify(["noria"], null, 2)}\n`);
write(".obsidian/appearance.json", `${JSON.stringify({ baseFontSize: 16, theme: "moonstone" }, null, 2)}\n`);

const managedPaths = {
  timelineSettings: "Noria/Timeline settings.md",
  templateLibrary: "Noria/Event library.md",
  importantDates: "Noria/Countdowns.md",
  habitRegistry: "Noria/Habits.md",
  projectRegistry: "Noria/Projects.md",
  inboxWorkflow: "Noria/Inbox workflow.md",
  inboxQueue: "Noria/Inbox queue.base",
  inboxRoot: "Noria/Inbox",
  projectsRoot: "Noria/Projects",
  diaryRoot: "Noria/Diary",
  dailyTemplate: "Noria/Templates/Daily template.md",
  weeklyTemplate: "Noria/Templates/Weekly template.md",
  monthlyTemplate: "Noria/Templates/Monthly template.md",
  yearlyTemplate: "Noria/Templates/Yearly template.md"
};
const pluginData = {
  managedPaths,
  onboarding: {
    profile: "standard",
    workspaceRoot: "Noria",
    initializedAt: `${anchorDate}T08:00:00.000Z`,
    dismissedVersion: ""
  },
  home: {
    profilePreset: "default",
    identity: {
      displayName: tx("Alex", "小序"),
      greetingName: tx("Alex", "小序"),
      avatarPath: "Noria/avatar.svg",
      quoteListPath: "Noria/Quotes.md"
    },
    guidePanels: { inbox: true, projects: true, moc: true, reviewCenter: true, reviewCenterExpanded: false }
  },
  homeDashboard: {
    mocEntryPaths: ["Noria/Workflow\u00b7MOC.md", "Noria/Knowledge Base\u00b7MOC.md"]
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

write("Noria/avatar.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Noria demo avatar"><rect width="128" height="128" rx="24" fill="#eef4fb"/><circle cx="64" cy="48" r="22" fill="#7aa7d8"/><path d="M28 112c4-24 18-38 36-38s32 14 36 38" fill="#5f8fc4"/><path d="M46 47h36" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>\n`);
write("Noria/Quotes.md", isZh
  ? `- 小步前进会形成可见的节律。\n- 让下一步有用的行动更容易被看见。\n- 复盘让行动重新获得方向。\n`
  : `- Small steps become a visible rhythm.\n- Make the next useful action easy to see.\n- Review turns activity into direction.\n`);
const researchProjectName = tx("Research writing", "研究写作");
const knowledgeProjectName = tx("Knowledge system", "知识系统");
const researchProjectPath = `Noria/Projects/${researchProjectName}/${researchProjectName}.md`;
const knowledgeProjectPath = `Noria/Projects/${knowledgeProjectName}/${knowledgeProjectName}.md`;
write("Noria/Projects.md", `## ${tx("Active projects", "进行中的项目")}\n\n- [[${researchProjectPath}|${researchProjectName}]]: ${tx("turn notes into a clear draft.", "把笔记整理为清晰初稿。")}\n- [[${knowledgeProjectPath}|${knowledgeProjectName}]]: ${tx("improve capture, navigation, and reuse.", "改善捕捉、导航与复用。")}\n\n## ${tx("Planned projects", "计划中的项目")}\n\n- ${tx("Reading synthesis", "阅读综合")}\n\n## ${tx("Completed projects", "已完成项目")}\n\n- ${tx("Workspace setup", "工作区搭建")}\n`);
write(researchProjectPath, `---\nproject: ${researchProjectName}\nstatus: active\n---\n\n## ${tx("Next actions", "下一步行动")}\n\n- [ ] ${tx("Draft the introduction outline", "起草引言提纲")} [start:: ${anchorDate} 09:00] [due:: ${anchorDate} 10:30] #project/writing\n- [ ] ${tx("Review the experiment summary", "检查实验总结")} [start:: ${shiftDate(anchorDate, 1)} 11:00] [due:: ${shiftDate(anchorDate, 1)} 11:40] #project/research\n- [ ] ${tx("Prepare a readable first draft", "准备一版可读初稿")} [due:: ${shiftDate(anchorDate, 7)}] #project/writing\n`);
write(knowledgeProjectPath, `---\nproject: ${knowledgeProjectName}\nstatus: active\n---\n\n## ${tx("Next actions", "下一步行动")}\n\n- [ ] ${tx("Organize two evergreen notes", "整理两条常青笔记")} [scheduled:: ${shiftDate(anchorDate, 2)} 14:00] #knowledge\n- [ ] ${tx("Refine the weekly briefing", "完善每周简报")} [scheduled:: ${shiftDate(anchorDate, 3)} 15:30] #writing\n- [ ] ${tx("Review navigation entry points", "检查导航入口")} [due:: ${shiftDate(anchorDate, 5)}] #knowledge\n`);
const habitHistory = [];
for (let index = 0; index < 29; index += 1) {
  const date = shiftDate(anchorDate, index - 29);
  if (index % 5 !== 0) habitHistory.push(`- [x] ${tx("Deep work", "深度工作")} #habit #active [due:: ${date}] [completion:: ${date}]`);
  if (index % 3 !== 0) habitHistory.push(`- [x] ${tx("Read for twenty minutes", "阅读二十分钟")} #habit #active [due:: ${date}] [completion:: ${date}]`);
  if (index % 4 !== 0) habitHistory.push(`- [x] ${tx("Evening reflection", "晚间反思")} #habit #active [due:: ${date}] [completion:: ${date}]`);
}
const habitDeepWork = tx("Deep work", "深度工作");
const habitReading = tx("Read for twenty minutes", "阅读二十分钟");
const habitReflection = tx("Evening reflection", "晚间反思");
write("Noria/Habits.md", `## ${tx("Active habits", "打卡中的习惯")}\n\n- ${habitDeepWork} [type:: check]\n- ${habitReading} [type:: check]\n- ${habitReflection} [type:: check]\n\n## ${tx("Paused habits", "暂停的习惯")}\n\n- ${tx("Weekly planning", "每周计划")} [type:: check]\n\n## ${tx("Established habits", "已养成习惯")}\n\n- ${tx("Clear the desk", "清理桌面")} [type:: check]\n\n## ${tx("Daily recurring task source", "循环任务源（每日）")}\n\n${habitHistory.join("\n")}\n- [ ] ${habitDeepWork} #habit #active [due:: ${anchorDate}]\n- [ ] ${habitReading} #habit #active [due:: ${anchorDate}]\n- [ ] ${habitReflection} #habit #active [due:: ${anchorDate}]\n`);
write("Noria/Countdowns.md", `## ${tx("Countdowns", "倒计时")}\n\n| ${tx("Date", "日期")} | ${tx("Name", "名称")} | ${tx("Type", "类型")} | ${tx("Note", "说明")} |\n| --- | --- | --- | --- |\n| ${shiftDate(anchorDate, 12)} | ${tx("Draft review", "初稿评审")} | project | ${tx("Share a readable first draft", "分享一版可读初稿")} |\n| ${shiftDate(anchorDate, 30)} | ${tx("Monthly reflection", "月度复盘")} | review | ${tx("Review projects, habits, and notes", "回看项目、习惯与笔记")} |\n`);
write("Noria/Workflow\u00b7MOC.md", `# ${tx("Workflow MOC", "工作流 MOC")}\n\n- [[Noria/Projects.md|${tx("Projects", "项目")}]]\n- [[Noria/Inbox queue.base|Inbox]]\n- [[Noria/Habits.md|${tx("Habits", "习惯")}]]\n- [[Noria/Countdowns.md|${tx("Countdowns", "倒计时")}]]\n`);
write("Noria/Knowledge Base\u00b7MOC.md", `# ${tx("Knowledge Base MOC", "知识库 MOC")}\n\n- [[${researchProjectPath}|${researchProjectName}]]\n- [[${knowledgeProjectPath}|${knowledgeProjectName}]]\n`);
write("Noria/Inbox workflow.md", `# Inbox ${tx("workflow", "工作流")}\n\n${tx("Capture first, then decide whether to delete, merge, split, file, archive, or defer.", "先捕捉，再决定删除、合并、拆分、归档、整理或暂缓。")}\n`);
write("Noria/Inbox queue.base", `filters:\n  and:\n    - file.inFolder("Noria/Inbox")\nviews:\n  - type: table\n    name: ${tx("Active Inbox", "当前 Inbox")}\n    order:\n      - file.name\n      - inbox-status\n      - inbox-next\n`);

const inboxRows = [
  [tx("reading-notes-to-synthesize", "待综合的阅读笔记"), tx("Reading notes to synthesize", "待综合的阅读笔记"), "processing", "refine", "note", tx("Extract two reusable claims", "提炼两条可复用观点")],
  [tx("meeting-idea-to-evaluate", "待评估的会议想法"), tx("Meeting idea to evaluate", "待评估的会议想法"), "triage", "", "", tx("Decide whether it belongs in a project", "判断是否应进入项目")],
  [tx("weekly-briefing-draft", "每周简报草稿"), tx("Weekly briefing draft", "每周简报草稿"), "ready", "file", "briefing", tx("Move into the writing project", "移入写作项目")],
  [tx("reference-image-without-context", "缺少上下文的参考图片"), tx("Reference image without context", "缺少上下文的参考图片"), "deferred", "", "reference", tx("Revisit when the related note is clear", "相关笔记明确后再回看")]
];
for (const [slug, title, status, action, shape, next] of inboxRows) {
  write(`Noria/Inbox/${slug}.md`, `---\ninbox-status: "${status}"\ninbox-action: "${action}"\ninbox-shape: "${shape}"\ninbox-next: "${next}"\ninbox-review: ${shiftDate(anchorDate, 7)}\n---\n\n## ${title}\n\n${tx("A generic demo item showing how capture can become an action, note, or project input.", "这是一条通用演示内容，用于展示捕捉如何转化为行动、笔记或项目输入。")}\n`);
}

write("Noria/Timeline settings.md", `---\ntimeline_settings:\n  defaultStrategy: daily-only\n  pregenSpanDays: 7\n---\n\n# ${tx("Timeline settings", "时间轴设置")}\n`);
write("Noria/Event library.md", `# ${tx("Event library", "事件库")}\n\n- [x] ${tx("Deep work", "深度工作")} [default_tag:: #tl/focus] [default_start::09:00] [default_duration_min::90] #tl/template\n- [x] ${tx("Reading", "阅读")} [default_tag:: #tl/reading] [default_start::20:00] [default_duration_min::20] #tl/template\n- [x] ${tx("Review", "复盘")} [default_tag:: #tl/review] [default_start::21:20] [default_duration_min::20] #tl/template\n`);
write("Noria/Templates/Daily template.md", `---\ntags:\n  - daily-plan\ncssclasses:\n  - daily-clean\n---\n\n## ${tx("Today", "今日")}\n\n## Inbox\n\n## ${tx("Review", "复盘")}\n`);
write("Noria/Templates/Weekly template.md", `---\ntags:\n  - weekly-plan\n---\n\n## ${tx("Focus", "聚焦")}\n\n## ${tx("Tasks", "任务")}\n\n## ${tx("Review", "复盘")}\n`);
write("Noria/Templates/Monthly template.md", `---\ntags:\n  - monthly-plan\n---\n\n## ${tx("Direction", "方向")}\n\n## ${tx("Projects", "项目")}\n\n## ${tx("Review", "复盘")}\n`);
write("Noria/Templates/Yearly template.md", `---\ntags:\n  - yearly-plan\n---\n\n## ${tx("Direction", "方向")}\n\n## ${tx("Projects", "项目")}\n\n## ${tx("Review", "复盘")}\n`);

for (let index = 0; index < 30; index += 1) {
  const date = shiftDate(anchorDate, index - 29);
  write(`Noria/Diary/${date.slice(0, 4)}/${date}.md`, dailyNote(date, index));
}

console.log(`Noria release demo vault created: ${targetRoot}`);
