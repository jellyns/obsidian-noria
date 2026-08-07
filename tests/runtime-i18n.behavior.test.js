const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");

const pluginRoot = path.resolve(__dirname, "..");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function read(rel) {
  return fs.readFileSync(pluginPath(rel), "utf8");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("home daily-state picker localizes mood and focus labels without changing raw values", () => {
  const srcMain = read("src/main.js");
  const dailyState = read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js");

  assert.match(srcMain, /displayRuntimeLabel\(domain,\s*value,\s*fallback\s*=/);
  assert.match(dailyState, /dailyStateLabel\("mood",\s*x\.key,\s*x\.key\)/);
  assert.match(dailyState, /dailyStateLabel\("focus",\s*x\.key,\s*x\.key\)/);
  assert.match(dailyState, /saveStatePatch\(date,\s*kind,\s*op\.value,\s*\{\s*refresh:\s*false\s*\}\)/);
  assert.match(dailyState, /\["mood",\s*"energy",\s*"focus"\]\.includes\(kind\)/);
  assert.doesNotMatch(dailyState, /saveStatePatch\(date,\s*"weather"/);

  for (const literal of [
    '{ key: "很好", emoji: "😀", score: 5 }',
    '{ key: "很专注", emoji: "🟢", score: 4 }'
  ]) {
    assert.match(dailyState, new RegExp(escapeRegExp(literal)), "daily-state choices should keep raw protocol values for diary writeback");
  }

  for (const key of [
    "runtime.label.mood.great",
    "runtime.label.mood.stable",
    "runtime.label.focus.deep",
    "runtime.label.focus.steady"
  ]) {
    assert.match(srcMain, new RegExp(JSON.stringify(key)));
  }
});

test("home runtime panels consume the Noria locale bridge", () => {
  const countdown = read("views/periodic/dashboardCountdown.js");
  const habits = read("views/periodic/dashboardHabitWeek.js");

  for (const source of [countdown, habits]) {
    assert.match(source, /const runtimeT\s*=/);
    assert.match(source, /bridge\.t/);
    assert.match(source, /bridge\.i18n/);
  }
});

test("starter registry readers and writers accept localized Markdown section titles", () => {
  const targets = {
    habitData: read("views/dashboard/core/data/data-service.js"),
    habitParsing: read("views/dashboard/core/utils/habit-parsing.js"),
    habitHome: read("views/periodic/dashboardHabitWeek.js"),
    habitFocus: read("views/periodic/focusPanel.js"),
    projectHome: read("views/periodic/dashboardGuideProjects.js"),
    projectGuide: read("views/dashboard/home/sections/guide-panels/view.js")
  };

  for (const source of [targets.habitData, targets.habitParsing, targets.habitHome, targets.habitFocus]) {
    assert.match(source, /Active habits/);
    assert.match(source, /打卡中的习惯/);
  }
  for (const source of [targets.habitData, targets.habitParsing, targets.habitHome]) {
    assert.match(source, /Daily recurring task source/);
    assert.match(source, /循环任务源（每日）/);
  }
  for (const source of [targets.habitData, targets.projectHome, targets.projectGuide]) {
    assert.match(source, /Active projects/);
    assert.match(source, /进行中的项目/);
    assert.match(source, /Hidden projects/);
    assert.match(source, /项目隐藏清单/);
  }
});

test("countdown manager primary UI strings are catalog keys", () => {
  const main = read("main.js");
  const countdown = read("views/periodic/dashboardCountdown.js");

  for (const key of [
    "runtime.countdown.managerTitle",
    "runtime.countdown.managerSubtitle",
    "runtime.countdown.fieldDate",
    "runtime.countdown.fieldName",
    "runtime.countdown.fieldType",
    "runtime.countdown.fieldActions",
    "runtime.countdown.empty",
    "runtime.countdown.noticeInvalid",
    "runtime.countdown.noticeSaveFailed",
    "runtime.countdown.noticeSaved",
    "runtime.common.cancel",
    "runtime.common.save"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.match(countdown, new RegExp(JSON.stringify(key)));
  }

  for (const literal of [
    "倒计时管理",
    "新增 / 编辑 / 删除在此统一操作",
    "暂无手动倒计时",
    "请填写有效日期和名称",
    "保存失败",
    "已保存"
  ]) {
    assert.doesNotMatch(countdown, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("habit manager primary UI strings are catalog keys", () => {
  const main = read("main.js");
  const habits = read("views/periodic/dashboardHabitWeek.js");

  for (const key of [
    "runtime.habits.managerTitle",
    "runtime.habits.managerSubtitle",
    "runtime.habits.empty",
    "runtime.habits.name",
    "runtime.habits.type",
    "runtime.habits.target",
    "runtime.habits.unit",
    "runtime.habits.normal",
    "runtime.habits.active",
    "runtime.habits.paused",
    "runtime.habits.done",
    "runtime.habits.noticeInvalidName",
    "runtime.habits.noticeSaveFailed",
    "runtime.habits.noticeAddFailed",
    "runtime.habits.noticeSleepSyncRequested",
    "runtime.habits.toggleRecord",
    "runtime.habits.recordValueForDate",
    "runtime.habits.recordSleepForDate"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.match(habits, new RegExp(JSON.stringify(key)));
  }

  for (const literal of [
    "习惯管理",
    "可编辑类型、目标与单位",
    "暂无习惯",
    "请输入有效习惯名称",
    "新增失败",
    "已请求从 #tl/sleep 刷新睡眠习惯"
  ]) {
    assert.doesNotMatch(habits, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("task calendar high-impact chrome strings use locale catalog", () => {
  const main = read("main.js");
  const runtime = read("views/tasks-calendar/runtime-core.js");

  for (const key of [
    "runtime.tasksCalendar.editor.createTask",
    "runtime.tasksCalendar.editor.editTask",
    "runtime.tasksCalendar.common.close",
    "runtime.tasksCalendar.time.now",
    "runtime.tasksCalendar.time.clear",
    "runtime.tasksCalendar.editor.advanced",
    "runtime.tasksCalendar.editor.beforeThis",
    "runtime.tasksCalendar.editor.afterThis",
    "runtime.tasksCalendar.nav.prevMonth",
    "runtime.tasksCalendar.nav.nextMonth",
    "runtime.tasksCalendar.eisenhower.rangeAria",
    "runtime.tasksCalendar.waiting.aria",
    "runtime.tasksCalendar.quickTimeline.title",
    "runtime.tasksCalendar.lab.title",
    "runtime.tasksCalendar.task.toggleComplete",
    "runtime.tasksCalendar.task.save",
    "runtime.tasksCalendar.task.saving",
    "runtime.tasksCalendar.task.delete",
    "runtime.tasksCalendar.task.deleting",
    "runtime.tasksCalendar.task.deleteWithWriteback",
    "runtime.tasksCalendar.task.removeDependency",
    "runtime.tasksCalendar.task.saved",
    "runtime.tasksCalendar.task.deleted",
    "runtime.tasksCalendar.lab.resetScope",
    "runtime.tasksCalendar.lab.resetAll"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.match(runtime, new RegExp(JSON.stringify(key)));
  }

  assert.match(runtime, /function tcRuntimeT\s*\(/);
  assert.match(runtime, /noriaBridge\.t/);
  assert.match(runtime, /noriaBridge\.i18n/);

  for (const pattern of [
    /h2\.textContent\s*=\s*createMode\s*\?\s*"新建任务"\s*:\s*"编辑任务"/,
    /btnClose\.setAttribute\("aria-label",\s*"关闭"\)/,
    /nowBtn\.textContent\s*=\s*"现在"/,
    /clearBtn\.textContent\s*=\s*"清空"/,
    /advancedSummary\.textContent\s*=\s*"高级"/,
    /prev\.setAttribute\("title",\s*"上个月"\)/,
    /next\.setAttribute\("title",\s*"下个月"\)/,
    /ariaLabel:\s*"四象限统计范围"/,
    /host\.setAttribute\("aria-label",\s*"待排任务"\)/,
    /strip\.setAttribute\("aria-label",\s*"待排任务"\)/,
    /heading\.textContent\s*=\s*"周\/日高级实验面板"/,
    /titleText\.textContent[\s\S]{0,120}"快捷时间轴"/,
    /btn\.setAttribute\("aria-label",\s*"切换完成状态"\)/,
    /chip\.title\s*=\s*"点击移除"/,
    /makeTaskEditorIconButton\("danger",\s*"trash-2",\s*"删除该任务"\)/,
    /makeTaskEditorIconButton\("primary",\s*"save",\s*"保存任务"\)/,
    /btnSave\.title\s*=\s*"正在保存任务"/,
    /btnDelete\.title\s*=\s*"删除该任务（写回原笔记）"/,
    /showDebugNotice\("已保存任务"\)/,
    /showDebugNotice\("已删除任务"\)/,
    /resetScope\.textContent\s*=\s*"恢复本视图默认"/,
    /resetAll\.textContent\s*=\s*"恢复全部默认"/
  ]) {
    assert.doesNotMatch(runtime, pattern);
  }
});

test("task editor Chinese catalog has no English primary or advanced field labels", () => {
  const main = read("src/main.js");

  for (const [key, value] of [
    ["runtime.tasksCalendar.fields.start", "开始"],
    ["runtime.tasksCalendar.fields.end", "截止"],
    ["runtime.tasksCalendar.fields.scheduled", "计划"],
    ["runtime.tasksCalendar.fields.created", "创建"],
    ["runtime.tasksCalendar.fields.done", "完成"],
    ["runtime.tasksCalendar.fields.cancelled", "取消"],
    ["runtime.tasksCalendar.fields.status", "状态"],
    ["runtime.tasksCalendar.fields.recurs", "重复"],
    ["runtime.tasksCalendar.editor.advanced", "高级"],
    ["runtime.tasksCalendar.editor.beforeThis", "前置任务"],
    ["runtime.tasksCalendar.editor.afterThis", "后续任务"]
  ]) {
    assert.match(main, new RegExp(`${escapeRegExp(JSON.stringify(key))}:\\s*${escapeRegExp(JSON.stringify(value))}`));
  }
});

test("home guide panel managers use locale catalog for primary labels and notices", () => {
  const main = read("src/main.js");
  const guidePanels = read("views/dashboard/home/sections/guide-panels/view.js");
  const overviewColumns = read("views/dashboard/home/sections/overview-columns/view.js");
  const mocChips = read("views/dashboard/home/sections/moc-chips/view.js");

  for (const key of [
    "runtime.home.notice.missingPath",
    "runtime.home.moc.managerTitle",
    "runtime.home.moc.pathPicker",
    "runtime.home.moc.empty",
    "runtime.home.project.managerTitle",
    "runtime.home.project.title",
    "runtime.home.project.openRegistry",
    "runtime.home.project.manage",
    "runtime.home.project.savePath",
    "runtime.home.project.restore",
    "runtime.home.project.delete",
    "runtime.home.project.hiddenEmpty",
    "runtime.home.project.add",
    "runtime.home.path.choose",
    "runtime.home.moc.bridgeNotReady"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.match(guidePanels, new RegExp(JSON.stringify(key)));
  }
  for (const key of [
    "runtime.home.notice.missingPath",
    "runtime.home.notice.createFailed",
    "runtime.home.overview.openInboxWorkflow",
    "runtime.home.overview.openInboxQueue",
    "runtime.home.overview.newInboxScratch"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.match(overviewColumns, new RegExp(JSON.stringify(key)));
  }
  assert.match(main, new RegExp(JSON.stringify("runtime.home.moc.openVisual")));
  assert.match(mocChips, new RegExp(JSON.stringify("runtime.home.moc.openVisual")));

  assert.match(guidePanels, /function homeRuntimeT\s*\(/);
  assert.match(guidePanels, /runtimeBridge\.t/);
  assert.match(guidePanels, /runtimeBridge\.i18n/);
  assert.match(guidePanels, /makePanel\(homeRuntimeT\("runtime\.home\.project\.title"\)/);
  assert.doesNotMatch(guidePanels, /makePanel\("项目"/);

  for (const pattern of [
    /title\.textContent\s*=\s*"MOC 管理"/,
    /title\.textContent\s*=\s*"项目管理"/,
    /this\.setPlaceholder\("搜索文件路径（支持 \.md \/ \.canvas）"\)/,
    /new Notice\(`未找到：/,
    /new Notice\(`无法新建：/,
    /new Notice\("保存路径失败"/,
    /new Notice\("已保存跳转路径"/,
    /new Notice\("请输入项目名称"/,
    /new Notice\("已添加"/,
    /new Notice\("无法写入 MOC：/,
    /setAttribute\("title",\s*"选择路径"\)/,
    /setAttribute\("aria-label",\s*"选择路径"\)/,
    /empty\.textContent\s*=\s*"暂无 MOC 入口，可在下方新增。"/,
    /empty\.textContent\s*=\s*key === "hidden" \? "暂无隐藏项"/
  ]) {
    assert.doesNotMatch(guidePanels, pattern);
  }
});

test("home overview metrics formats compact numbers with the runtime locale", () => {
  const metrics = read("views/dashboard/home/sections/overview-metrics/view.js");

  assert.match(metrics, /metricsBridge\?\.locale\s*\|\|\s*metricsBridge\?\.i18n\?\.locale/);
  assert.match(metrics, /new Intl\.NumberFormat\(metricsLocale/);
  assert.match(metrics, /notation:\s*"compact"/);
  assert.doesNotMatch(metrics, /toFixed\(2\)\}万/);
});

test("settings planner visual tuning strings are catalogued", () => {
  const main = read("src/main.js");

  for (const key of [
    "settings.plannerTuning.title",
    "settings.plannerTuning.desc",
    "settings.plannerTuning.weekDay",
    "settings.plannerTuning.timeline",
    "settings.plannerTuning.resetDesc",
    "settings.plannerTuning.reset",
    "settings.plannerTuning.fields.titleGap",
    "settings.plannerTuning.fields.timeColWidth"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  const bodyStart = main.indexOf("renderPlannerVisualTuning(containerEl)");
  const bodyEnd = main.indexOf("\n  renderStatusBanner", bodyStart);
  assert.notEqual(bodyStart, -1);
  const body = main.slice(bodyStart, bodyEnd);
  for (const literal of [
    "核心视觉参数已从视图内入口迁移到这里",
    "标题与时段间距",
    "任务条圆角",
    "时间列宽",
    "恢复默认后会刷新外部索引。",
    "恢复 Week / Day 默认"
  ]) {
    assert.doesNotMatch(body, new RegExp(escapeRegExp(literal)));
  }
});

test("runtime native scans go through Noria query scope helpers", () => {
  const main = read("src/main.js");
  const targets = [
    "views/dashboard/home/sections/overview-metrics/view.js",
    "views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js",
    "views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js",
    "views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution/view.js",
    "views/periodic/dailyMit.js",
    "views/periodic/dailyOtherToday.js",
    "views/periodic/dashboardCountdown.js",
    "views/periodic/dashboardTodayTasks.js",
    "views/periodic/focusPanel.js",
    "views/periodic/monthlyOtherTasks.js",
    "views/periodic/weeklyOtherTasks.js",
    "views/tasks-calendar/runtime-core.js"
  ];

  assert.match(main, /pagesForScope/);
  assert.match(main, /tasksForScope/);
  for (const rel of targets) {
    const source = read(rel);
    assert.doesNotMatch(source, /\bctx\.pages\s*\(\s*\)/, `${rel} must not use bare ctx.pages()`);
  }

  assert.match(read("views/tasks-calendar/runtime-core.js"), /data\.getTasks/);
  assert.match(read("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js"), /pagesForScope\("notes"/);
  assert.match(read("views/periodic/dashboardTodayTasks.js"), /tasksForScope\("tasks"/);
});

test("home and periodic runtime queries use runtime helper scopes instead of local default scans", () => {
  const targets = {
    overviewMetrics: read("views/dashboard/home/sections/overview-metrics/view.js"),
    heatmaps: read("views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js"),
    noteTrend: read("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js"),
    tagDistribution: read("views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution/view.js"),
    inbox: read("views/periodic/dashboardGuideInbox.js"),
    dailyMit: read("views/periodic/dailyMit.js"),
    dailyOther: read("views/periodic/dailyOtherToday.js"),
    countdown: read("views/periodic/dashboardCountdown.js"),
    todayTasks: read("views/periodic/dashboardTodayTasks.js"),
    focus: read("views/periodic/focusPanel.js"),
    monthlyOther: read("views/periodic/monthlyOtherTasks.js"),
    weeklyOther: read("views/periodic/weeklyOtherTasks.js")
  };

  for (const [name, source] of Object.entries(targets)) {
    assert.doesNotMatch(source, /ctx\.pages\('"06_Diary" or "01_Projects" or "00_Inbox"'\)/, name);
    assert.doesNotMatch(source, /const\s+noriaTaskArray\s*=/, name);
    assert.doesNotMatch(source, /const\s+toPlainArray\s*=/, name);
  }
  for (const name of ["dailyMit", "dailyOther", "countdown", "todayTasks", "focus", "monthlyOther", "weeklyOther"]) {
    assert.match(targets[name], /runtime\?\.tasksForScope\?\.\("tasks",\s*ctx\)/, name);
  }
  assert.match(targets.inbox, /runtime\?\.pagesForManagedPath\?\.\("inboxRoot",\s*ctx\)/);
  assert.match(targets.noteTrend, /runtime\.pagesForScope\?\.\("notes",\s*ctx\)|runtime\.pagesForScope\("notes",\s*ctx\)/);
  assert.match(targets.tagDistribution, /runtime\.pagesForScope\?\.\("notes",\s*ctx\)|runtime\.pagesForScope\("notes",\s*ctx\)/);
});

test("home facade localizes chrome without visible second-pass placeholders", () => {
  const main = read("src/main.js");
  const home = read("views/dashboard/home/view.js");

  for (const key of [
    "runtime.home.facade.missingContainer",
    "runtime.home.facade.sectionFailed",
    "runtime.home.layoutEdit.widget.projects",
    "runtime.home.layoutEdit.widget.review",
    "runtime.home.layoutEdit.widget.trendsRange"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.match(home, new RegExp(JSON.stringify(key)));
  }

  assert.match(home, /homeLazySections/);
  assert.match(home, /renderLazySection/);
  assert.doesNotMatch(home, /dashboard-home-lazy-placeholder/);
  assert.doesNotMatch(home, /requestIdleCallback/);
  assert.doesNotMatch(home, /setTimeout\(\(\) => \{ void run\(\); \}, 140\)/);
  assert.doesNotMatch(home, /runtime\.home\.facade\.(?:deferred|retrying)/);
  assert.doesNotMatch(home, /HOME_SECOND_PASS_STATE_KEY/);
  assert.doesNotMatch(home, /rerenderCriticalSections/);
  assert.doesNotMatch(home, /shouldSecondPassOnce/);
  assert.match(main, /_viewSourceTextCache/);
  for (const literal of [
    "home facade: 未找到可用容器",
    "home facade: section 加载失败",
    "导引",
    "趋势和统计"
  ]) {
    assert.doesNotMatch(home, new RegExp(escapeRegExp(literal)));
  }
});

test("home identity and trend cards use catalogued high-frequency chrome", () => {
  const main = read("src/main.js");
  const files = {
    identity: read("views/dashboard/home/sections/home-identity/view.js"),
    moc: read("views/dashboard/home/sections/moc-chips/view.js"),
    overview: read("views/dashboard/home/sections/overview-columns/view.js"),
    dailyState: read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js"),
    heatmaps: read("views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js"),
    noteTrend: read("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js"),
    tagDistribution: read("views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution/view.js")
  };

  const expected = [
    "runtime.home.identity.welcome",
    "runtime.home.identity.quoteFallback",
    "runtime.home.weather.loading",
    "runtime.home.weather.disabled",
    "runtime.home.weather.unavailable",
    "runtime.home.weather.failed",
    "runtime.home.moc.emptyInline",
    "runtime.home.moc.add",
    "runtime.home.overview.trayResize",
    "runtime.home.trends.dailyStateTitle",
    "runtime.home.trends.rangeToggle",
    "runtime.home.trends.pickEndDate",
    "runtime.home.trends.today",
    "runtime.home.trends.previousRange",
    "runtime.home.trends.nextRange",
    "runtime.home.trends.heatmapMissing",
    "runtime.home.trends.habitHeatmap",
    "runtime.home.trends.workHeatmap",
    "runtime.home.trends.overview",
    "runtime.home.trends.newNotes",
    "runtime.home.trends.tasks",
    "runtime.home.trends.words",
    "runtime.home.trends.noteTrendTitle",
    "runtime.home.trends.noteTrendAria",
    "runtime.home.trends.noteShareTitle",
    "runtime.home.trends.noMarkdownPaths",
    "runtime.home.trends.pieMissing"
  ];
  for (const key of expected) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  assert.match(files.identity, /homeIdentityT/);
  assert.match(files.identity, /homeSettings\?\.identity/);
  assert.match(files.identity, /greetingName\s*\|\|\s*displayName/);
  assert.doesNotMatch(files.identity, /乙辛Zmod31|99_Attachment\/乙辛Zmod31头像\.jpg/);
  assert.match(files.moc, /homeMocT/);
  assert.match(files.overview, /homeOverviewT/);
  for (const [name, source] of Object.entries(files)) {
    assert.doesNotMatch(source, /欢迎您|天气信息加载中|天气自动化已关闭|天气服务不可用|天气获取失败/, name);
    assert.doesNotMatch(source, /尚未配置 MOC|添加 MOC 入口|添加 MOC|未找到 MOC|缺失：/, name);
    assert.doesNotMatch(source, /拖拽调整托盘高度|日态分布|切换统计范围|选择结束日期|上一段|下一段|今天/, name);
    assert.doesNotMatch(source, /原生热力图组件未加载|习惯打卡热力图|工作量热力图|笔记趋势|新建笔记|字数|笔记占比|暂无可统计的 Markdown 笔记路径|原生饼图组件未加载/, name);
  }
});

test("periodic panels use catalogued high-frequency chrome and shared runtime helpers", () => {
  const main = read("src/main.js");
  const dailyRecap = read("views/periodic/dashboardDailyRecap.js");
  const projects = read("views/periodic/dashboardGuideProjects.js");
  const todayTasks = read("views/periodic/dashboardTodayTasks.js");
  const statusSelector = read("views/periodic/statusSelector.js");

  for (const key of [
    "runtime.periodic.dailyRecap.blocksMissing",
    "runtime.periodic.dailyRecap.stepHint",
    "runtime.periodic.projects.hidden",
    "runtime.periodic.projects.completed",
    "runtime.periodic.projects.removed",
    "runtime.periodic.projects.sourceMissing",
    "runtime.periodic.projects.emptyPlanTasks",
    "runtime.periodic.projects.emptyActive",
    "runtime.periodic.projects.openTaskSource",
    "runtime.periodic.projects.taskStats",
    "runtime.periodic.projects.nextPlaceholder",
    "runtime.periodic.projects.nextAria",
    "runtime.periodic.projects.nextAdd",
    "runtime.periodic.projects.nextEmpty",
    "runtime.periodic.projects.nextAdded",
    "runtime.periodic.projects.nextAddFailed",
    "runtime.periodic.todayTasks.add",
    "runtime.periodic.todayTasks.addTitle",
    "runtime.periodic.todayTasks.inputPlaceholder",
    "runtime.periodic.todayTasks.metadata",
    "runtime.periodic.todayTasks.toggleDone",
    "runtime.periodic.todayTasks.toggleOpen",
    "runtime.periodic.todayTasks.countTitle",
    "runtime.periodic.todayTasks.completed",
    "runtime.periodic.todayTasks.groupOpen",
    "runtime.periodic.todayTasks.openSummary",
    "runtime.periodic.todayTasks.rhythmNow",
    "runtime.periodic.todayTasks.rhythmNext",
    "runtime.periodic.todayTasks.rhythmLater",
    "runtime.periodic.todayTasks.missingPath",
    "runtime.periodic.status.weatherUnavailable",
    "runtime.periodic.status.refreshing",
    "runtime.periodic.status.weatherFailed",
    "runtime.periodic.status.weatherServiceMissing"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  assert.match(projects, /bridge\.runtime\?\.toArray/);
  assert.match(todayTasks, /bridge\.runtime\?\.tasksForScope\?\.\("tasks",\s*ctx\)/);
  for (const [name, source] of Object.entries({ dailyRecap, projects, todayTasks, statusSelector })) {
    assert.doesNotMatch(source, /无法加载 diary-day-blocks\.js|方向键切换步骤|已隐藏项目|已标记完成|已移除项目|未找到：|暂无未完成计划任务|暂无进行中\/计划中项目/, name);
    assert.doesNotMatch(source, /按当前筛选周期添加任务|输入任务，回车保存|保存时自动附加 旧字段|标记未完成|当前筛选下已完成|已完成 \(/, name);
    assert.doesNotMatch(source, /天气服务不可用|刷新中|获取失败|天气请求失败|点击刷新以自动获取天气|暂无天气附加信息/, name);
  }
});

test("tasks calendar and timeline residual chrome use locale catalog", () => {
  const main = read("src/main.js");
  const runtime = read("views/tasks-calendar/runtime-core.js");
  const ui = read("views/tasks-calendar/runtime-ui-components.js");
  const timeline = read("views/tasks-timeline/view.js");

  for (const key of [
    "runtime.tasksCalendar.jump.toWeek",
    "runtime.tasksCalendar.jump.toYear",
    "runtime.tasksCalendar.jump.toMonth",
    "runtime.tasksCalendar.jump.hintWeek",
    "runtime.tasksCalendar.jump.hintFull",
    "runtime.tasksCalendar.jump.doneWeek",
    "runtime.tasksCalendar.nav.group",
    "runtime.tasksCalendar.nav.previous",
    "runtime.tasksCalendar.nav.today",
    "runtime.tasksCalendar.nav.next",
    "runtime.tasksCalendar.nav.stats",
    "runtime.timeline.task.toggleDone",
    "runtime.timeline.task.toggleOpen",
    "runtime.timeline.task.lineMissing",
    "runtime.timeline.task.durationDrag",
    "runtime.timeline.task.openLine",
    "runtime.timeline.task.openNote",
    "runtime.timeline.lab.axis",
    "runtime.timeline.lab.card",
    "runtime.timeline.lab.sort",
    "runtime.timeline.lab.drag",
    "runtime.timeline.lab.motion",
    "runtime.timeline.lab.switch"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  assert.doesNotMatch(runtime, /textContent\s*=\s*"到周"|textContent\s*=\s*"到年"|textContent\s*=\s*"到月"/);
  assert.doesNotMatch(runtime, /可输入日期后点击 到周|可输入日期后点击 到年\/到月\/到周|已跳转到周/);
  assert.doesNotMatch(ui, /时期导航|上一段时期|回到今天 \/ 本期|下一段时期|查看统计与待办明细/);
  assert.doesNotMatch(timeline, /撤销完成|标记完成|无法定位行号|上下拖动调整时长|打开笔记并定位到本任务所在行|打开此笔记（从篇首）/);
});

test("remaining high-frequency runtime actions avoid ordinary Chinese UI literals", () => {
  const main = read("src/main.js");
  const runtime = read("views/tasks-calendar/runtime-core.js");
  const timeline = read("views/tasks-timeline/view.js");
  const dailyRecap = read("views/periodic/dashboardDailyRecap.js");
  const statusSelector = read("views/periodic/statusSelector.js");
  const guideInbox = read("views/periodic/dashboardGuideInbox.js");
  const statsLegacy = read("views/dashboard/periodic-stats/impl-legacy/view.js");
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");
  const charts = [
    read("views/dashboard/core/components/charts/dual-axis-svg-chart.js"),
    read("views/dashboard/core/components/charts/leader-donut-chart.js"),
    read("views/dashboard/core/components/charts/stacked-distribution-bar.js"),
    read("views/dashboard/core/components/charts/strip-heat-series.js")
  ].join("\n");

  for (const key of [
    "runtime.tasksCalendar.notice.movedToDiary",
    "runtime.tasksCalendar.notice.savedLine",
    "runtime.tasksCalendar.notice.rescheduleStaged",
    "runtime.tasksCalendar.notice.rescheduled",
    "runtime.tasksCalendar.notice.rescheduleFailed",
    "runtime.tasksCalendar.notice.deletedItem",
    "runtime.tasksCalendar.notice.completed",
    "runtime.tasksCalendar.notice.incomplete",
    "runtime.tasksCalendar.notice.noPendingEdits",
    "runtime.tasksCalendar.notice.commitSummary",
    "runtime.tasksCalendar.notice.noDependencyMatch",
    "runtime.tasksCalendar.notice.createBeforeOpen",
    "runtime.tasksCalendar.notice.invalidTime",
    "runtime.tasksCalendar.notice.endAfterStart",
    "runtime.tasksCalendar.notice.titleRequired",
    "runtime.tasksCalendar.notice.created",
    "runtime.tasksCalendar.notice.saveFailed",
    "runtime.tasksCalendar.notice.deleteCreateMode",
    "runtime.tasksCalendar.notice.deleteFailed",
    "runtime.tasksCalendar.notice.addedToDaily",
    "runtime.tasksCalendar.notice.createFailed",
    "runtime.tasksCalendar.menu.complete",
    "runtime.tasksCalendar.menu.incomplete",
    "runtime.tasksCalendar.menu.editTime",
    "runtime.tasksCalendar.menu.openNote",
    "runtime.tasksCalendar.time.editHint",
    "runtime.timeline.notice.toggleLineMissing",
    "runtime.timeline.notice.toggleFailed",
    "runtime.timeline.onlyToday",
    "runtime.timeline.dragAttachPomodoro",
    "runtime.timeline.addTodayTask",
    "runtime.periodic.dailyRecap.submit",
    "runtime.periodic.dailyRecap.save",
    "runtime.periodic.energyValue",
    "runtime.periodic.inbox.reviewDue",
    "runtime.periodic.inbox.triage",
    "runtime.periodic.inbox.processing",
    "runtime.periodic.inbox.closing",
    "runtime.periodic.inbox.trust",
    "runtime.home.trends.blockFailed",
    "runtime.stats.loadFailed",
    "runtime.chart.dualAxisTitle",
    "runtime.chart.donutAria",
    "runtime.chart.totalNotes",
    "runtime.chart.empty"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  for (const [name, source] of Object.entries({ runtime, timeline, dailyRecap, statusSelector, guideInbox, statsLegacy, trends, charts })) {
    assert.doesNotMatch(source, /show(?:Debug|Brief)Notice\("[^"\n]*[\u4e00-\u9fff]/, name);
    assert.doesNotMatch(source, /title\s*=\s*"[^"\n]*[\u4e00-\u9fff]/, name);
    assert.doesNotMatch(source, /aria-label",\s*`?[^`\n]*[\u4e00-\u9fff]/, name);
    assert.doesNotMatch(source, /textContent\s*=\s*`?[^`\n]*[\u4e00-\u9fff]/, name);
  }
});

test("shared runtime components use catalog labels instead of ordinary Chinese chrome", () => {
  const main = read("src/main.js");
  const files = {
    habitWeek: read("views/dashboard/core/components/boards/habit-week-matrix.js"),
    workloadWeek: read("views/dashboard/core/components/boards/workload-week-rings.js"),
    managerPanel: read("views/dashboard/core/components/ui/manager-panel.js"),
    dualAxis: read("views/dashboard/core/components/charts/dual-axis-svg-chart.js"),
    stacked: read("views/dashboard/core/components/charts/stacked-distribution-bar.js"),
    strip: read("views/dashboard/core/components/charts/strip-heat-series.js"),
    yearHeatmap: read("views/dashboard/core/components/charts/year-heatmap-calendar.js"),
    timeline: read("views/tasks-timeline/view.js"),
    tasksCalendar: read("views/tasks-calendar/runtime-core.js")
  };

  for (const key of [
    "runtime.board.habitWeekTitle",
    "runtime.board.habitWeekEmpty",
    "runtime.board.workloadWeekTitle",
    "runtime.chart.noRecords",
    "runtime.chart.metricTotal",
    "runtime.chart.metricAverage",
    "runtime.chart.metricPeak",
    "runtime.chart.recorded",
    "runtime.chart.noRecord",
    "runtime.manager.close",
    "runtime.tasksCalendar.notice.customInlineOpen",
    "runtime.tasksCalendar.notice.customInlineClosed",
    "runtime.timeline.lab.title"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  assert.match(files.habitWeek, /displayLabel/);
  assert.match(files.workloadWeek, /displayLabel|runtime\.chart\.metricTotal/);
  assert.match(files.managerPanel, /runtime\.manager\.close/);
  assert.match(files.timeline, /runtime\.timeline\.lab\.title/);
  assert.match(files.tasksCalendar, /runtime\.tasksCalendar\.notice\.customInlineOpen/);

  const ordinaryUiChinese = /(title\s*=\s*"[^"\n]*[\u4e00-\u9fff]|aria-label",\s*`?[^`\n]*[\u4e00-\u9fff]|textContent\s*=\s*`?[^`\n]*[\u4e00-\u9fff]|createDiv\(\{\s*text:\s*"[^"\n]*[\u4e00-\u9fff]|createEl\("[^"]+",\s*\{\s*text:\s*"[^"\n]*[\u4e00-\u9fff]|showDebugNotice\([^)]*[\u4e00-\u9fff])/;
  for (const [name, source] of Object.entries(files)) {
    assert.doesNotMatch(source, ordinaryUiChinese, name);
  }
});

test("runtime tail chrome uses catalog keys and display labels", () => {
  const main = read("src/main.js");
  const files = {
    statusSelector: read("views/periodic/statusSelector.js"),
    dailyRecap: read("views/periodic/dashboardDailyRecap.js"),
    focusPanel: read("views/periodic/focusPanel.js"),
    weeklyOtherTasks: read("views/periodic/weeklyOtherTasks.js"),
    monthlyOtherTasks: read("views/periodic/monthlyOtherTasks.js"),
    gddRecap: read("views/periodic/dashboardGddRecap.js"),
    statsShell: read("views/dashboard/periodic-stats/view.js"),
    statsCharts: read("views/dashboard/periodic-stats/impl-legacy/fallbacks/charts.js"),
    statsBoards: read("views/dashboard/periodic-stats/impl-legacy/fallbacks/boards.js"),
    guidePanels: read("views/dashboard/home/sections/guide-panels/view.js"),
    tasksCalendar: read("views/tasks-calendar/runtime-core.js"),
    timeline: read("views/tasks-timeline/view.js")
  };

  for (const key of [
    "runtime.periodic.status.weather",
    "runtime.periodic.status.loading",
    "runtime.periodic.status.energy",
    "runtime.periodic.status.mood",
    "runtime.periodic.status.focus",
    "runtime.periodic.status.templatePreview",
    "runtime.periodic.status.writeHint",
    "runtime.periodic.focus.none",
    "runtime.periodic.focus.habitCheckin",
    "runtime.periodic.focus.noEnabledHabits",
    "runtime.periodic.focus.unnamedHabit",
    "runtime.periodic.otherTasks.weekEmpty",
    "runtime.periodic.otherTasks.monthEmpty",
    "runtime.periodic.otherTasks.weekNameInvalid",
    "runtime.periodic.otherTasks.weekYearMismatch",
    "runtime.periodic.otherTasks.monthNameInvalid",
    "runtime.periodic.gddRecap.missingFile",
    "runtime.periodic.dailyRecap.inboxPlaceholder",
    "runtime.periodic.dailyRecap.saveInbox",
    "runtime.periodic.dailyRecap.choiceScrollHint",
    "runtime.periodic.dailyRecap.weatherHoverHint",
    "runtime.periodic.dailyRecap.fieldPlaceholder",
    "runtime.periodic.dailyRecap.thoughtPlaceholder",
    "runtime.periodic.dailyRecap.saveThought",
    "runtime.stats.fallbackNativeHeatmapMissing",
    "runtime.stats.fallbackHabitRegistryMissing",
    "runtime.stats.fallbackHabitWeekEmpty",
    "runtime.stats.fallbackHabitMatrixMissing",
    "runtime.stats.groupByWeek",
    "runtime.stats.groupByMonth",
    "runtime.home.moc.pathPlaceholder",
    "runtime.home.path.placeholder",
    "runtime.home.project.loading",
    "runtime.home.project.refreshLater",
    "runtime.tasksCalendar.quick.breakfast",
    "runtime.tasksCalendar.quick.lunch",
    "runtime.tasksCalendar.quick.dinner",
    "runtime.tasksCalendar.quick.nap",
    "runtime.tasksCalendar.quick.pregen",
    "runtime.tasksCalendar.quick.custom",
    "runtime.tasksCalendar.quick.library",
    "runtime.tasksCalendar.quick.labelPlaceholder",
    "runtime.tasksCalendar.quick.tagPlaceholder",
    "runtime.tasksCalendar.quick.startPlaceholder",
    "runtime.tasksCalendar.quick.durationPlaceholder",
    "runtime.tasksCalendar.quick.add",
    "runtime.tasksCalendar.quick.save",
    "runtime.tasksCalendar.quick.saved",
    "runtime.tasksCalendar.quick.close",
    "runtime.timeline.lab.scope",
    "runtime.timeline.lab.presetCompact",
    "runtime.timeline.lab.presetBalanced",
    "runtime.timeline.lab.presetRelaxed",
    "runtime.timeline.lab.applyPreset",
    "runtime.timeline.lab.savePreset",
    "runtime.timeline.lab.resetScope",
    "runtime.timeline.lab.resetAll",
    "runtime.timeline.editorApiMissing",
    "runtime.timeline.notice.timeAdjusted",
    "runtime.timeline.notice.durationAdjusted",
    "runtime.timeline.emptyToday",
    "runtime.timeline.emptyFiltered",
    "runtime.timeline.dateTitle",
    "runtime.timeline.monthTagToday",
    "runtime.timeline.relative.hoursAgo",
    "runtime.timeline.task.noDescription",
    "runtime.timeline.lab.booleanOn",
    "runtime.timeline.lab.field.timeColWidth",
    "runtime.timeline.lab.option.timeColAlign.left",
    "runtime.label.focus.deep",
    "runtime.label.focus.steady",
    "runtime.label.focus.distracted",
    "runtime.label.focus.blocked",
    "runtime.label.energy.high",
    "runtime.label.energy.medium",
    "runtime.label.energy.low",
    "runtime.label.periodicStatus.active",
    "runtime.label.periodicStatus.paused",
    "runtime.label.homeAction.openTasks"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)), key);
  }

  assert.match(files.statusSelector, /statusLabel\("weather"/);
  assert.match(files.statusSelector, /statusLabel\(group\.key/);
  assert.match(files.dailyRecap, /periodicRecapLabel\(g\.key/);

  const forbiddenUiPatterns = [
    /ctx\.paragraph\("状态组件加载失败：未找到当前文件。"\)/,
    /text:\s*"天气"/,
    /text:\s*"加载中\.\.\."/,
    /title:\s*"心情"/,
    /title:\s*"专注"/,
    /text:\s*"能量"/,
    /"模板内仅预览，不写库。"/,
    /"写入位置：frontmatter 日态字段/,
    /text:\s*"无"/,
    /text:\s*"习惯打卡"/,
    /text:\s*"今日无启用习惯。"/,
    /text:\s*"本周暂无外部补充任务。"/,
    /text:\s*"本月暂无外部补充任务。"/,
    /ctx\.paragraph\("命名不符合规范：周记/,
    /ctx\.paragraph\("周记文件名年份/,
    /ctx\.paragraph\("命名不符合规范：月记/,
    /text:\s*`找不到/,
    /placeholder\s*=\s*"日记 ## Inbox，回车或确认"/,
    /"悬停天气区域可展开全部选项。"/,
    /"可横向滑动查看全部选项。"/,
    /placeholder\s*=\s*`\$\{label\}（Ctrl\+Enter 保存）`/,
    /placeholder\s*=\s*"感想（可选，Ctrl\+Enter 保存）"/,
    /attachRailSaveButton\(right,\s*"保存感想（Ctrl\+Enter）"/,
    /textContent\s*=\s*`日记统计视图加载失败/,
    /text:\s*"Noria 原生热力图组件未加载。"/,
    /text:\s*"未找到习惯清单，无法渲染本周矩阵。"/,
    /text:\s*"本周无可跟踪习惯/,
    /text:\s*"Noria 习惯周矩阵组件未加载。"/,
    /text:\s*"按周"/,
    /text:\s*"按月"/,
    /placeholder\s*=\s*"MOC 路径（\.md \/ \.canvas）"/,
    /placeholder\s*=\s*"Vault 路径（\.md \/ \.canvas）"/,
    /text:\s*"项目区加载中\.\.\."/,
    /text:\s*"项目区稍后刷新"/,
    /data-action='breakfast'>早餐/,
    /data-action='lunch'>午餐/,
    /data-action='dinner'>晚餐/,
    /data-action='nap'>午休/,
    /data-action='pregen'>预生成/,
    /data-action='custom'>自定义/,
    /data-action='open-library'>事件库/,
    /placeholder='事件名'/,
    /placeholder='tag后缀'/,
    /placeholder='开始HH:mm'/,
    /placeholder='分钟'/,
    /data-action='custom-save-toggle'.*保存/,
    /text:\s*"作用域：timeline/,
    /text:\s*"切换预设"/,
    /text:\s*"保存到预设"/,
    /text:\s*"复制当前参数 JSON"/,
    /text:\s*"粘贴覆盖参数 JSON"/,
    /text:\s*"恢复本视图默认"/,
    /text:\s*"恢复全部默认"/,
    /window\.prompt\("复制参数 JSON"/,
    /window\.prompt\("粘贴 timeline 参数 JSON/,
    /new N\("时段编辑器未就绪/,
    /new N\(`已调整时段/,
    /new N\(`已调整时长/,
    /title:\s*"拖动到任务卡片右侧以附着番茄钟/,
    /text:\s*dayMeta\.isToday \? "今天为空" : "当日为空"/,
    /text:\s*filterEmpty\s*\?\s*"所选范围内无任务/,
    /updateValue\(input\.checked \? "开" : "关"\)/
  ];

  for (const pattern of forbiddenUiPatterns) {
    for (const [name, source] of Object.entries(files)) {
      assert.doesNotMatch(source, pattern, `${name}: ${pattern}`);
    }
  }

  const labStart = files.timeline.indexOf("const NORIA_TL_LAB_FIELDS");
  const labEnd = files.timeline.indexOf("function noriaTlLabTimelineFieldSpecMap", labStart);
  assert.notEqual(labStart, -1);
  const labFields = files.timeline.slice(labStart, labEnd);
  assert.doesNotMatch(labFields, /label:\s*"[^"]*[\u4e00-\u9fff]/);
  assert.doesNotMatch(labFields, /optionLabels:\s*\{[^}]*[\u4e00-\u9fff]/s);

  for (const literal of [
    "未命名习惯",
    "tag后缀",
    "保存✓",
    "复制参数 JSON",
    "（无描述）"
  ]) {
    const re = new RegExp(escapeRegExp(literal));
    for (const [name, source] of Object.entries(files)) {
      assert.doesNotMatch(source, re, `${name}: ${literal}`);
    }
  }
});

test("full interface i18n tail audit covers block titles hover text css content and weather errors", () => {
  const main = read("src/main.js");
  const files = {
    overviewColumns: read("views/dashboard/home/sections/overview-columns/view.js"),
    guidePanels: read("views/dashboard/home/sections/guide-panels/view.js"),
    guideInbox: read("views/periodic/dashboardGuideInbox.js"),
    periodicStats: read("views/dashboard/periodic-stats/impl-legacy/view.js"),
    tasksCalendarCss: read("views/tasks-calendar/default.css"),
    weatherService: read("views/dashboard/core/utils/weather-service.js"),
    dailyState: read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js"),
    heatmaps: read("views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js"),
    overviewMetrics: read("views/dashboard/home/sections/overview-metrics/view.js"),
    homeIdentity: read("views/dashboard/home/sections/home-identity/view.js"),
    mocChips: read("views/dashboard/home/sections/moc-chips/view.js"),
    dailyMit: read("views/periodic/dailyMit.js"),
    dailyOtherToday: read("views/periodic/dailyOtherToday.js"),
    dailyRecap: read("views/periodic/dashboardDailyRecap.js"),
    habitCheckin: read("views/periodic/habitCheckin.js"),
    todayTasks: read("views/periodic/dashboardTodayTasks.js"),
    habitWeek: read("views/periodic/dashboardHabitWeek.js"),
    guideProjects: read("views/periodic/dashboardGuideProjects.js"),
    tasksCalendar: read("views/tasks-calendar/runtime-core.js")
  };

  for (const key of [
    "runtime.home.overview.tasksTitle",
    "runtime.home.overview.inboxTitle",
    "runtime.home.overview.habitsTitle",
    "runtime.home.overview.countdownTitle",
    "runtime.home.overview.openTasks",
    "runtime.home.overview.openHabits",
    "runtime.home.overview.openInboxWorkflow",
    "runtime.home.overview.openInboxQueue",
    "runtime.home.overview.newInboxScratch",
    "runtime.home.overview.openImportantDates",
    "runtime.home.habits.todayTitle",
    "runtime.home.habits.todayPending",
    "runtime.home.habits.todayAllDone",
    "runtime.home.moc.color.indigo",
    "runtime.home.moc.color.sky",
    "runtime.home.moc.color.teal",
    "runtime.home.moc.color.amber",
    "runtime.home.moc.color.rose",
    "runtime.home.trends.mood",
    "runtime.home.trends.weather",
    "runtime.home.trends.energy",
    "runtime.home.trends.focus",
    "runtime.home.trends.unrecorded",
    "runtime.home.trends.none",
    "runtime.home.trends.monthLabel",
    "runtime.home.trends.dayUnit",
    "runtime.home.trends.activeMonth",
    "runtime.home.trends.activeDay",
    "runtime.home.trends.longestStreak",
    "runtime.home.trends.currentStreak",
    "runtime.home.metrics.daysUsed",
    "runtime.home.metrics.usageStreak",
    "runtime.home.metrics.totalNotes",
    "runtime.home.metrics.todayNotes",
    "runtime.home.metrics.totalWords",
    "runtime.home.metrics.completedTasks",
    "runtime.home.metrics.missingTags",
    "runtime.home.metrics.brokenLinks",
    "runtime.home.todayActions.capturePlaceholder",
    "runtime.home.todayActions.taskPlaceholder",
    "runtime.home.todayActions.captureModeInbox",
    "runtime.home.todayActions.captureModeTask",
    "runtime.home.todayActions.capture",
    "runtime.home.todayActions.addTask",
    "runtime.home.todayActions.openDaily",
    "runtime.home.todayActions.todayBoard",
    "runtime.home.todayActions.calendar",
    "runtime.home.todayActions.review",
    "runtime.periodic.inbox.filter.triageTitle",
    "runtime.periodic.inbox.filter.reviewTitle",
    "runtime.periodic.inbox.filter.processingTitle",
    "runtime.periodic.inbox.filter.closingTitle",
    "runtime.periodic.inbox.filter.trustTitle",
    "runtime.periodic.inbox.emptyQueue",
    "runtime.periodic.inbox.emptyFiltered",
    "runtime.periodic.inbox.emptyActive",
    "runtime.periodic.inbox.openNoteHint",
    "runtime.periodic.inbox.queueSummary",
    "runtime.periodic.inbox.queueSummaryFiltered",
    "runtime.periodic.inbox.queueHidden",
    "runtime.periodic.inbox.queueExpand",
    "runtime.periodic.inbox.queueCollapse",
    "runtime.periodic.inbox.actionMeta",
    "runtime.periodic.inbox.shapeMeta",
    "runtime.periodic.inbox.nextMeta",
    "runtime.periodic.inbox.reviewMeta",
    "runtime.periodic.inbox.needsDecision",
    "runtime.periodic.inbox.needsEvidence",
    "runtime.periodic.inbox.cuePrefix",
    "runtime.periodic.inbox.rhythm.now",
    "runtime.periodic.inbox.rhythm.next",
    "runtime.periodic.inbox.rhythm.later",
    "runtime.periodic.inbox.primaryNext.decideStatus",
    "runtime.periodic.inbox.primaryNext.addEvidence",
    "runtime.periodic.inbox.primaryNext.reviewSource",
    "runtime.periodic.inbox.primaryNext.openSource",
    "runtime.stats.noteTrendWeek",
    "runtime.stats.noteTrendMonth",
    "runtime.stats.taskTrendWeek",
    "runtime.stats.taskTrendMonth",
    "runtime.stats.noteTrend",
    "runtime.stats.taskTrend",
    "runtime.stats.words",
    "runtime.stats.noteCount",
    "runtime.stats.taskCount",
    "runtime.stats.completionRate",
    "runtime.stats.weatherDistribution",
    "runtime.stats.moodDistribution",
    "runtime.stats.weeklyHabitMatrix",
    "runtime.stats.taskActivityHeatmap",
    "runtime.stats.taskActivityHeatmapYear",
    "runtime.periodic.dailyRecap.panelHint",
    "runtime.habits.sourceMissing",
    "runtime.periodic.todayTasks.overdueTitle",
    "runtime.periodic.todayTasks.groupOpen",
    "runtime.periodic.todayTasks.openSummary",
    "runtime.periodic.todayTasks.rhythmNow",
    "runtime.periodic.todayTasks.rhythmNext",
    "runtime.periodic.todayTasks.rhythmLater",
    "runtime.periodic.habits.weekdayTitle",
    "runtime.periodic.projects.progressTitle",
    "runtime.tasksCalendar.lab.field.titleGap",
    "runtime.tasksCalendar.lab.field.timeBadgeMinWidth",
    "runtime.tasksCalendar.lab.field.timeBadgeMaxWidth",
    "runtime.tasksCalendar.lab.field.taskRadius",
    "runtime.tasksCalendar.lab.field.singleHeightThreshold",
    "runtime.tasksCalendar.lab.field.hiddenThreshold",
    "runtime.tasksCalendar.lab.field.startOnlyThreshold",
    "runtime.tasksCalendar.lab.field.timeFontSize",
    "runtime.tasksCalendar.lab.field.modeLockMs",
    "runtime.tasksCalendar.lab.field.widthBucketStep",
    "runtime.tasksCalendar.lab.field.heightBucketStep",
    "runtime.tasksCalendar.lab.field.keepBias",
    "runtime.tasksCalendar.crossDay.hint",
    "runtime.tasksCalendar.css.timelineMode",
    "runtime.tasksCalendar.css.pendingDelete",
    "runtime.tasksCalendar.eisenhower.empty",
    "runtime.weather.error.emptyResponse",
    "runtime.weather.error.jsonParse",
    "runtime.weather.error.ipLocationFailed",
    "runtime.weather.error.missingQweatherKey"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)), key);
  }

  for (const obsoleteKey of [
    "runtime.periodic.inbox.prioritySummary",
    "runtime.periodic.inbox.queueHealthSummary",
    "runtime.periodic.inbox.attentionSummary",
    "runtime.periodic.inbox.reviewDueSummary",
    "runtime.periodic.inbox.writebackSummary",
    "runtime.periodic.inbox.structuralSummary"
  ]) {
    assert.doesNotMatch(main, new RegExp(JSON.stringify(obsoleteKey)), `${obsoleteKey} should not remain after visible Inbox summaries were removed`);
  }

  const forbidden = {
    overviewColumns: [
      /makeCol\("待办"/,
      /makeCol\("习惯打卡"/,
      /makeCol\("倒计时"/,
      /"打开任务看板"/,
      /"打开习惯打卡清单"/,
      /"打开 Countdowns"/,
      /ctx\.paragraph\("overview-columns: 无可用容器。"\)/
    ],
    guidePanels: [
      /label:\s*"靛蓝"/,
      /label:\s*"天蓝"/,
      /label:\s*"青绿"/,
      /label:\s*"琥珀"/,
      /label:\s*"玫红"/,
      /throw new Error\(`自定义视图加载失败：/,
      /ctx\.paragraph\("guide-panels: 无可用容器。"\)/,
      /"拖拽调整托盘高度"/
    ],
    guideInbox: [
      /label:\s*"判断去留"/,
      /label:\s*"到期回看"/,
      /label:\s*"正在加工"/,
      /label:\s*"准备迁出"/,
      /label:\s*"补证据"/,
      /title:\s*"筛选需要先判断去留、形态或状态的 Inbox。"/,
      /title:\s*"筛选 review 日期已到的 Inbox。"/,
      /title:\s*"筛选 refine \/ split \/ merge 等加工中的 Inbox。"/,
      /title:\s*"筛选可以 file \/ archive \/ delete 的 Inbox。"/,
      /title:\s*"筛选迁出前需要补来源、关联或去向的 Inbox。"/,
      /renderEmpty\("Inbox 队列为空。可用标题栏「＋」新建速记。"\)/,
      /"当前筛选下没有 Inbox 项。"/,
      /"当前没有活动 Inbox 项。"/,
      /\$\{stage\.title\} 点击打开笔记。/
    ],
    periodicStats: [
      /ctx\.paragraph\("统计视图依赖加载失败。"\)/,
      /title:\s*"笔记趋势（按周）"/,
      /title:\s*"笔记趋势（按月）"/,
      /title:\s*"任务完成趋势（按周）"/,
      /title:\s*"任务完成趋势（按月）"/,
      /"笔记趋势"/,
      /"任务完成趋势"/,
      /"码字"/,
      /"笔记数"/,
      /"任务数"/,
      /"完成率\(%\)"/,
      /"天气分布"/,
      /"心情分布"/,
      /"习惯打卡矩阵"/,
      /"任务活跃热力图/
    ],
    tasksCalendarCss: [
      /content:\s*"时间轴模式 · "/,
      /content:\s*"待删"/
    ],
    weatherService: [
      /空响应:/,
      /JSON解析失败/,
      /空定位字段/,
      /IP定位失败/,
      /空城市，无法地理编码/,
      /地理编码失败/,
      /城市检索失败/,
      /天气获取失败/,
      /未配置 QWeather API Key/,
      /IP 定位失败，且未设置手动城市/
    ],
    dailyState: [
      /\{ label:\s*"心情"/,
      /\{ label:\s*"天气"/,
      /\{ label:\s*"能量"/,
      /\{ label:\s*"专注"/,
      /未记录/,
      /statPill\(`\$\{d\.emoji\} \$\{d\.key\}/
    ],
    heatmaps: [
      /`\$\{Number\(m\[2\]\)\}月`/,
      /main:\s*"无"/,
      /String\(value \|\| "无"\)/,
      /\["最活跃月份"/,
      /\["最活跃天"/,
      /\["最长连续"/,
      /\["目前连续"/
    ],
    overviewMetrics: [
      /ctx\.paragraph\("overview-metrics: 无可用容器。"\)/,
      /label:\s*"OB天数"/,
      /label:\s*"连续使用"/,
      /label:\s*"累计新建笔记"/,
      /label:\s*"今日累计新建"/,
      /label:\s*"累计字数"/,
      /label:\s*"累计完成事项"/,
      /label:\s*"tag缺失"/,
      /label:\s*"断链"/
    ],
    homeIdentity: [
      /ctx\.paragraph\("home-identity: 无可用容器。"\)/
    ],
    mocChips: [
      /ctx\.paragraph\("moc-chips: 无可用容器。"\)/
    ],
    dailyMit: [
      /ctx\.paragraph\("- 无"\)/
    ],
    dailyOtherToday: [
      /ctx\.paragraph\("- 无"\)/
    ],
    dailyRecap: [
      /ctx\.paragraph\("dashboardDailyRecap: 无可用 mount。"\)/,
      /← → 切换 · Enter 写入/
    ],
    habitCheckin: [
      /ctx\.paragraph\("未找到习惯源文件：\[\[Habits\.md\]\]"\)/
    ],
    todayTasks: [
      /原定/
    ],
    habitWeek: [
      /`\$\{ds\} 周\$\{wd\}`/
    ],
    guideProjects: [
      /进度 \$\{proj\.done\}\/\$\{proj\.total\}/,
      /单击切换待办/,
      /双击打开项目/,
      /右键操作/
    ],
    tasksCalendar: [
      /host\.innerHTML = "<div class='qEmpty'>暂无任务<\/div>"/,
      /el\.title[\s\S]{0,120}跨日连续/,
      /仅在开始日显示本条/,
      /"标题间距"/,
      /"时段最小宽"/,
      /"时段最大宽"/,
      /"任务条圆角"/,
      /"单行阈值"/,
      /"隐藏阈值"/,
      /"仅开始阈值"/,
      /"时段字号"/,
      /"模式锁窗"/,
      /"宽度桶粒度"/,
      /"高度桶粒度"/,
      /"临界保持偏置"/
    ]
  };

  for (const [name, patterns] of Object.entries(forbidden)) {
    for (const pattern of patterns) {
      assert.doesNotMatch(files[name], pattern, `${name}: ${pattern}`);
    }
  }
});

test("runtime native scan allowlist excludes log text and names dynamic fallbacks", () => {
  const tasksCalendar = read("views/tasks-calendar/runtime-core.js");
  const timeline = read("views/tasks-timeline/view.js");
  const guideProjects = read("views/periodic/dashboardGuideProjects.js");

  assert.doesNotMatch(guideProjects, /ctx\.pages\(01_Projects\)/);
  assert.match(tasksCalendar, /function collectPagesFromDynamicSpec/);
  assert.match(timeline, /function noriaTlPagesFromDynamicSpec/);
  assert.doesNotMatch(tasksCalendar, /var pr2 = ctx\.pages\(bare\)/);
  assert.doesNotMatch(timeline, /const pr2 = ctx\.pages\(bare\)/);
});

test("managed runtime views do not hardcode default query roots outside bridge helpers", () => {
  const targets = {
    diaryMetrics: read("views/dashboard/core/data/diary-metrics-adapter.js"),
    dailyState: read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js"),
    periodicStats: read("views/dashboard/periodic-stats/impl-legacy/view.js"),
    periodicBoards: read("views/dashboard/periodic-stats/impl-legacy/fallbacks/boards.js"),
    guideProjects: read("views/periodic/dashboardGuideProjects.js"),
    habitWeek: read("views/periodic/dashboardHabitWeek.js"),
    tasksCalendar: read("views/tasks-calendar/runtime-core.js")
  };

  for (const [name, source] of Object.entries(targets)) {
    assert.doesNotMatch(source, /ctx\.pages\(\s*['"]"06_Diary"['"]\s*\)/, name);
    assert.doesNotMatch(source, /ctx\.pages\(\s*diaryRoot\s*\)/, name);
    assert.doesNotMatch(source, /ctx\.pages\(\s*`"\$\{projectsRoot\}"`\s*\)/, name);
    assert.doesNotMatch(source, /"06_Diary"\s+or\s+"01_Projects"\s+or\s+"00_Inbox"/, name);
  }

  assert.match(targets.diaryMetrics, /pagesForManagedPath\?\.\("diaryRoot",\s*ctx\)/);
  assert.match(targets.guideProjects, /pagesForManagedPath\?\.\("projectsRoot",\s*ctx\)/);
  assert.match(targets.tasksCalendar, /data\.getTasks/);
});

test("task timeline high-impact pomodoro strings use locale catalog", () => {
  const main = read("src/main.js");
  const timeline = read("views/tasks-timeline/view.js");

  for (const key of [
    "runtime.timeline.pomodoro.title",
    "runtime.timeline.pomodoro.attached",
    "runtime.timeline.pomodoro.startOrResume",
    "runtime.timeline.pomodoro.pause",
    "runtime.timeline.pomodoro.stop",
    "runtime.timeline.pomodoro.detach",
    "runtime.timeline.pomodoro.started",
    "runtime.timeline.pomodoro.paused",
    "runtime.timeline.pomodoro.stopped",
    "runtime.timeline.pomodoro.saveFailed"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.match(timeline, new RegExp(JSON.stringify(key)));
  }

  assert.match(timeline, /function noriaTlRuntimeT\s*\(/);
  for (const literal of [
    "番茄钟已附着",
    "开始或继续番茄钟",
    "停止当前番茄钟",
    "取消附着番茄钟",
    "番茄钟已开始",
    "番茄钟状态保存失败"
  ]) {
    assert.doesNotMatch(timeline, new RegExp(escapeRegExp(literal)));
  }
});
