const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function readPluginSource(relativePath = "src/main.js") {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractBody(source, name) {
  const declaration = source.indexOf(`${name}(containerEl) {`);
  const start = declaration !== -1 ? declaration : source.indexOf(`${name}(`);
  assert.notEqual(start, -1, `Expected ${name} to exist`);
  const brace = source.indexOf("{", start);
  assert.notEqual(brace, -1, `Expected ${name} body to exist`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(brace, i + 1);
  }
  throw new Error(`Could not extract body for ${name}`);
}

function loadPluginClass() {
  const source = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
  class PluginSettingTab {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = { empty() {}, createDiv() { return this; }, createEl() { return this; }, appendChild() {} };
    }
  }
  class Plugin {
    constructor() {
      this.app = {
        vault: { adapter: {}, getAbstractFileByPath: () => null },
        workspace: { getLeavesOfType: () => [], detachLeavesOfType: () => {} },
      };
    }
    async loadData() { return {}; }
    async saveData(data) { this.savedData = data; }
    addRibbonIcon() { return {}; }
    addCommand(command) { return command; }
    registerView() {}
    registerEvent() {}
    registerDomEvent() {}
  }
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require(request) {
      if (request === "obsidian") {
        return {
          Plugin,
          PluginSettingTab,
          Setting: class {},
          Notice: class {},
          ItemView: class {},
          MarkdownRenderer: {},
          TFile: class {},
          getLanguage: () => "en",
        };
      }
      return require(request);
    },
    console,
    globalThis: {},
  };
  vm.runInNewContext(source, sandbox, { filename: "main.js" });
  return sandbox.module.exports.default || sandbox.module.exports;
}

function makePlugin(input = {}) {
  const PluginClass = loadPluginClass();
  const plugin = new PluginClass();
  plugin.settings = plugin.normalizeSettings(input.settings || {});
  plugin.getNoriaLocale = () => input.locale || "en";
  return plugin;
}

test("settings overview owns data source paths without a separate data sources tab", () => {
  const source = readPluginSource();
  assert.match(source, /id:\s*"overview"/);
  assert.doesNotMatch(source, /id:\s*"dataSources"/);
  assert.doesNotMatch(source, /id:\s*"ai"/);
  assert.match(source, /settings\.tabs\.overview/);
  assert.doesNotMatch(source, /settings\.tabs\.ai/);
  assert.match(source, /renderOverviewTab\(/);
  assert.match(source, /renderOverviewDataSourcesSection\(/);
  assert.doesNotMatch(source, /renderAiTab\(/);
  assert.match(source, /renderSettingsSearch\(/);

  const overview = extractBody(source, "renderOverviewTab");
  assert.match(overview, /renderSetupWizard/);
  assert.match(overview, /renderSettingsControlCenter/);
  assert.match(overview, /renderOverviewDataSourcesSection/);
  assert.doesNotMatch(overview, /renderDependencyStatus/);
  assert.match(overview, /addSettingHeading\(containerEl,\s*"settings\.sections\.modules"\)/);
  assert.match(overview, /renderAdvancedDisclosure\(containerEl,\s*"settings\.modules\.featureSwitches",\s*"settings\.desc\.modules"/);
  assert.match(overview, /renderModuleSettings\(details,\s*\{\s*heading:\s*false\s*\}\)/);

  const dataSources = extractBody(source, "renderOverviewDataSourcesSection");
  assert.match(dataSources, /renderManagedPathGroup/);
  assert.match(dataSources, /renderPerformanceSettings/);
});

test("overview control summary reports coherent workspace data-source and module facts", () => {
  const source = readPluginSource();
  const controlCenter = extractBody(source, "renderSettingsControlCenter");

  assert.match(controlCenter, /settings\.sections\.setupWizard/);
  assert.match(controlCenter, /settings\.sections\.paths/);
  assert.match(controlCenter, /settings\.sections\.modules/);
  assert.doesNotMatch(controlCenter, /settings\.sections\.reviewPrompt/);
  assert.doesNotMatch(controlCenter, /reviewPrompt\.skillName/);
  assert.doesNotMatch(controlCenter, /settings\.review\.promptTemplateDesc/);
});

test("starter defaults use Noria root and year-bucket diary paths", () => {
  const plugin = makePlugin();
  const settings = plugin.normalizeSettings({});
  assert.equal(settings.onboarding.profile, "standard");
  assert.equal(settings.onboarding.workspaceRoot, "Noria");
  assert.equal(Object.prototype.hasOwnProperty.call(settings.managedPaths, "entryNote"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings, "viewNotePath"), false);
  assert.equal(settings.managedPaths.diaryRoot, "Noria/Diary");
  assert.equal(settings.managedPaths.projectsRoot, "Noria/Projects");
  assert.equal(settings.managedPaths.inboxRoot, "Noria/Inbox");
  assert.equal(settings.managedPaths.inboxWorkflow, "Noria/Inbox workflow.md");
  assert.equal(settings.managedPaths.inboxQueue, "Noria/Inbox queue.base");
  assert.equal(settings.managedPaths.timelineSettings, "Noria/Timeline settings.md");
  assert.equal(settings.managedPaths.templateLibrary, "Noria/Event library.md");
  assert.equal(Object.prototype.hasOwnProperty.call(settings.managedPaths, "taskRegistry"), false);
  assert.equal(settings.managedPaths.importantDates, "Noria/Countdowns.md");
  assert.equal(settings.managedPaths.dailyTemplate, "Noria/Templates/Daily template.md");
  assert.deepEqual(JSON.parse(JSON.stringify(settings.homeDashboard.mocEntryPaths)), ["Noria/Workflow·MOC.md", "Noria/Knowledge Base·MOC.md"]);
  assert.equal(settings.homeDashboard.mocEntries.length, 2);
  assert.notEqual(settings.homeDashboard.mocEntries[0].color, settings.homeDashboard.mocEntries[1].color);
  assert.equal(settings.weather.enabled, false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.managedPaths, "reviewArtifactBase"), false);
  assert.equal(plugin.getDiaryPathForDate(new Date("2026-05-03T12:00:00Z")), "Noria/Diary/2026/2026-05-03.md");
  assert.equal(plugin.getReviewNotePathForDate(new Date("2026-05-03T12:00:00Z")), "Noria/Diary/2026/2026-05-03-review.md");
});

test("settings registry makes important controls searchable", () => {
  const plugin = makePlugin();
  assert.equal(typeof plugin.getSettingsRegistry, "function");
  assert.equal(typeof plugin.searchSettingsRegistry, "function");

  const registry = plugin.getSettingsRegistry();
  assert.ok(registry.find((entry) => entry.id === "managedPaths.diaryRoot" && entry.tab === "overview"));
  assert.ok(registry.find((entry) => entry.id === "performance.queryScopes.tasks" && entry.tab === "overview"));
  assert.ok(registry.find((entry) => entry.id === "features.modules.home" && entry.tab === "overview"));
  assert.ok(registry.find((entry) => entry.id === "home.dailyState.defaultRange" && entry.status !== "planned"));
  assert.ok(registry.find((entry) => entry.id === "calendar.calendarIntegrationMode" && entry.tab === "calendar"));
  assert.ok(registry.find((entry) => entry.id === "calendar.calendarCustomFilePattern" && entry.tab === "calendar"));
  assert.ok(registry.find((entry) => entry.id === "tasksCalendar.openingBehavior" && entry.tab === "tasks"));
  assert.ok(registry.find((entry) => entry.id === "tasksCalendar.taskTimelineOpenMode" && entry.tab === "timeline"));

  assert.ok(plugin.searchSettingsRegistry("diary").some((entry) => entry.id === "managedPaths.diaryRoot"));
  assert.ok(plugin.searchSettingsRegistry("calendar").some((entry) => entry.id === "calendar.calendarIntegrationMode"));
  const zhPlugin = makePlugin({ locale: "zh" });
  assert.ok(zhPlugin.searchSettingsRegistry("日记").some((entry) => entry.id === "managedPaths.diaryRoot"));
  assert.ok(zhPlugin.searchSettingsRegistry("日历").some((entry) => entry.id === "calendar.calendarIntegrationMode"));
});

test("settings search hands off to stable rendered targets instead of only changing tabs", () => {
  const source = readPluginSource();
  const search = extractBody(source, "renderSettingsSearch");
  const focusTarget = extractBody(source, "focusSettingsSearchTarget");

  assert.match(source, /decorateSettingsTarget\(setting,\s*settingId\)\s*\{[\s\S]*?data-noria-setting-id[\s\S]*?tabindex/);
  assert.match(focusTarget, /data-noria-setting-id/);
  assert.match(focusTarget, /details/);
  assert.match(focusTarget, /ancestor\.open\s*=\s*true/);
  assert.match(focusTarget, /scrollIntoView/);
  assert.match(focusTarget, /focus/);
  assert.match(search, /focusSettingsSearchTarget\(contentEl,\s*entry\)/);

  for (const id of [
    "managedPaths.${key}",
    "features.modules.${key}",
    "performance.queryScopes.${scopeId}",
    "home.identity.${key}",
    "home.dailyState.defaultRange",
    "home.defaults.rememberBlockSelections",
    "inboxWorkflow.${key}",
    "tasksCalendar.openingBehavior",
    "tasksCalendar.taskTimelineOpenMode",
    "tasksCalendar.taskColorMode",
    "timelineView.scaleMode",
    "timelineView.timelineTagPlacement",
    "timelineView.defaultLayers",
    "timelineView.presets",
    "calendar.calendarIntegrationMode",
    "calendar.calendarRootFolder",
    "calendar.calendarCustomFilePattern",
    "reviewCenter.prompt.skillName",
    "reviewCenter.prompt.promptTemplate",
    "appearance.density"
  ]) {
    assert.match(source, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), id);
  }

  assert.match(source, /labelKey:\s*`settings\.modules\.\$\{key\}`/);
  assert.doesNotMatch(source, /labelKey:\s*`settings\.module\.\$\{key\}`/);
  assert.doesNotMatch(source, /id:\s*"home\.dailyState\.defaultRange"[\s\S]{0,180}status:\s*"planned"/);
});

test("settings chrome uses a compact product hierarchy and actionable disclosures", () => {
  const source = readPluginSource();
  const search = extractBody(source, "renderSettingsSearch");
  const overview = extractBody(source, "renderOverviewTab");

  assert.match(source, /display\(\)\s*\{[\s\S]*noria-settings-header/);
  assert.match(source, /noria-settings-chrome/);
  assert.match(source, /renderSettingsSearch\(header,\s*content,\s*renderActive\)/);
  assert.match(search, /role:\s*"combobox"/);
  assert.match(search, /"aria-expanded"/);
  assert.match(search, /role:\s*"listbox"/);
  assert.match(search, /role:\s*"option"/);
  assert.match(search, /event\.key\s*===\s*"Escape"/);
  assert.match(search, /input\.value\s*=\s*""/);
  assert.match(overview, /settings\.sections\.workspace/);
  assert.match(source, /renderAdvancedDisclosure\(containerEl,[\s\S]*noria-settings-disclosure-summary/);
  assert.match(source, /noria-settings-disclosure-chevron/);
  assert.match(source, /setIcon\([^,]+,\s*"chevron-right"\)/);
  assert.match(source, /noria-settings-overview-advanced[\s\S]*noria-settings-disclosure-summary/);
  assert.doesNotMatch(source, /renderDataSourcesHint\(containerEl\)/);
});

test("applying starter defaults fills missing paths without overwriting manual paths", () => {
  const plugin = makePlugin({
    settings: {
      onboarding: { workspaceRoot: "Noria" },
      managedPaths: {
        inboxWorkflow: "Custom/Inbox workflow.md",
        diaryRoot: "",
      },
    },
  });
  assert.equal(typeof plugin.applyStarterWorkspaceDefaults, "function");

  plugin.applyStarterWorkspaceDefaults({ workspaceRoot: "Noria", replaceAll: false });
  assert.equal(plugin.settings.managedPaths.inboxWorkflow, "Custom/Inbox workflow.md");
  assert.equal(plugin.settings.managedPaths.diaryRoot, "Noria/Diary");

  plugin.applyStarterWorkspaceDefaults({ workspaceRoot: "Noria", replaceAll: true });
  assert.equal(plugin.settings.managedPaths.inboxWorkflow, "Noria/Inbox workflow.md");
  assert.equal(plugin.settings.managedPaths.diaryRoot, "Noria/Diary");
});

test("release settings schema exposes standard workspace home defaults and task calendar defaults", () => {
  const plugin = makePlugin();
  const settings = plugin.normalizeSettings({});

  assert.equal(settings.onboarding.profile, "standard");
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home.identity)), {
    displayName: "",
    greetingName: "",
    avatarPath: "Noria/avatar.svg",
    quoteListPath: "Noria/Quotes.md"
  });
  assert.equal(settings.home.defaults.dailyStateRangeDays, 30);
  assert.equal(settings.home.defaults.rememberBlockSelections, true);
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home.guidePanels)), {
    inbox: false,
    projects: true,
    moc: true,
    reviewCenter: true,
    reviewCenterExpanded: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home.sections.enabled)), ["overview", "tasks", "habits", "countdown", "guide", "moc", "trends"]);
  assert.deepEqual(JSON.parse(JSON.stringify(settings.home.sections.order)), ["overview", "tasks", "habits", "countdown", "guide", "moc", "trends"]);

  assert.equal(settings.tasksCalendar.defaultView, "month");
  assert.equal(settings.tasksCalendar.calendarDensity, "useGlobal");
  assert.equal(settings.tasksCalendar.taskColorMode, "statusFirst");
  assert.equal(settings.tasksCalendar.showSourceChips, false);
  assert.equal(settings.tasksCalendar.showCompletedTasks, "dim");
  assert.equal(settings.tasksCalendar.monthOverflowBehavior, "scroll");
  assert.equal(settings.tasksCalendar.rememberLastView, true);
  assert.equal(settings.tasksCalendar.eisenhowerGranularity, "week");
  assert.equal(settings.tasksCalendar.showEarlyHours, false);

  const taskCalendarPrefs = plugin.normalizeSettings({
    tasksCalendar: {
      eisenhowerGranularity: "day",
      showEarlyHours: true
    }
  }).tasksCalendar;
  assert.equal(taskCalendarPrefs.eisenhowerGranularity, "day");
  assert.equal(taskCalendarPrefs.showEarlyHours, true);

  const invalidTaskCalendarPrefs = plugin.normalizeSettings({
    tasksCalendar: {
      eisenhowerGranularity: "quarter",
      showEarlyHours: "yes"
    }
  }).tasksCalendar;
  assert.equal(invalidTaskCalendarPrefs.eisenhowerGranularity, "week");
  assert.equal(invalidTaskCalendarPrefs.showEarlyHours, false);
  assert.deepEqual(JSON.parse(JSON.stringify(settings.timelineView)), {
    scaleMode: "auto",
    defaultLayers: ["task", "annotation"],
    showDone: true,
    timelineTagPlacement: "start-due-only",
    overviewContextLabels: true,
    presets: []
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(plugin.normalizeSettings({ timelineView: { defaultLayers: ["task", "annotation", "pomodoro"] } }).timelineView.defaultLayers)),
    ["task", "annotation"],
    "old built-in Pomodoro default should migrate to the quieter two-layer default"
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(plugin.normalizeSettings({ timelineView: { defaultLayers: ["task", "annotation", "pomodoro"], defaultLayersUserConfigured: true } }).timelineView.defaultLayers)),
    ["task", "annotation", "pomodoro"],
    "explicit user-configured Pomodoro defaults should be preserved"
  );
  assert.equal(plugin.normalizeSettings({ timelineView: { scaleMode: "today", timelineTagPlacement: "any-date", showDone: false, defaultLayers: ["task", "git", "bad"], overviewContextLabels: false } }).timelineView.scaleMode, "today");
  const manualTimelineView = plugin.normalizeSettings({
    timelineView: {
      scaleMode: "manual",
      manualCenter: "2026-05-25T10:00:00.000Z",
      manualZoomIndex: "2",
      manualOverviewZoomIndex: "3"
    }
  }).timelineView;
  assert.equal(manualTimelineView.scaleMode, "manual");
  assert.equal(manualTimelineView.manualCenter, "2026-05-25T10:00:00.000Z");
  assert.equal(manualTimelineView.manualZoomIndex, 2);
  assert.equal(manualTimelineView.manualOverviewZoomIndex, 3);
  const timelinePresetView = plugin.normalizeSettings({
    timelineView: {
      presets: [
        {
          id: "proj-weno",
          label: "WENO",
          layers: ["task", "annotation", "bad"],
          showDone: false,
          query: "tag:#proj/weno -status:done",
          scaleMode: "manual",
          manualCenter: "2026-05-25T10:00:00.000Z",
          manualZoomIndex: "2",
          manualOverviewZoomIndex: "3"
        }
      ]
    }
  }).timelineView;
  assert.deepEqual(JSON.parse(JSON.stringify(timelinePresetView.presets)), [
    {
      id: "proj-weno",
      label: "WENO",
      layers: ["task", "annotation"],
      showDone: false,
      query: "tag:#proj/weno -status:done",
      includeTags: [],
      excludeTags: [],
      scaleMode: "manual",
      manualCenter: "2026-05-25T10:00:00.000Z",
      manualZoomIndex: 2,
      manualOverviewZoomIndex: 3
    }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.normalizeSettings({ timelineView: { defaultLayers: ["task", "git", "bad"] } }).timelineView.defaultLayers)), ["task", "git"]);
  assert.equal(settings.calendar.calendarIntegrationMode, "noria");
  assert.equal(settings.calendar.calendarPlacement, "right-sidebar");
  assert.equal(settings.calendar.calendarRootFolder, "Noria/Diary");
  assert.equal(settings.calendar.calendarConfirmBeforeCreate, false);

  assert.equal(typeof plugin.getStarterProfileManagedPaths, "function");
  assert.equal(plugin.getStarterProfileManagedPaths("standard").diaryRoot, "Noria/Diary");
  assert.equal(plugin.getStarterProfileManagedPaths("starter").diaryRoot, "Noria/Diary");
  assert.equal(plugin.normalizeSettings({ onboarding: { profile: "ipara" } }).onboarding.profile, "custom");
  assert.equal(plugin.getStarterProfileManagedPaths("custom").diaryRoot, settings.managedPaths.diaryRoot);
});

test("user guide action opens external documentation instead of creating a vault docs note", () => {
  const source = readPluginSource();

  assert.match(source, /NORIA_USER_GUIDE_URL\s*=/);
  assert.match(source, /NORIA_USER_GUIDE_URL_ZH\s*=/);
  assert.match(source, /openUserGuide\(\)\s*\{[\s\S]*getNoriaLocale\(\)\s*===\s*"zh"[\s\S]*NORIA_USER_GUIDE_URL_ZH[\s\S]*NORIA_USER_GUIDE_URL/);
  assert.doesNotMatch(source, /openLinkText\?\.\(\s*"docs\/USER-GUIDE\.md"/);
  assert.doesNotMatch(source, /openLinkText\(\s*"docs\/USER-GUIDE\.md"/);
});

test("settings renderers include release control center anchors", () => {
  const source = readPluginSource();

  for (const key of [
    "settings.overview.profileStandard",
    "settings.overview.openUserGuide",
    "settings.home.profile",
    "settings.home.displayName",
    "settings.home.greetingName",
    "settings.home.avatarPath",
    "settings.home.quoteListPath",
    "settings.home.sections",
    "settings.home.dailyStateDefaultRange",
    "settings.home.rememberBlockSelections",
    "settings.tasks.openingBehavior",
    "settings.tasks.calendarDensity",
    "settings.tasks.taskColorMode",
    "settings.tasks.showSourceChips",
    "settings.tasks.showCompletedTasks",
    "settings.tasks.monthOverflowBehavior",
    "settings.tasks.advancedFilters",
    "settings.tasks.addTag",
    "settings.timeline.openMode",
    "settings.timeline.scaleMode",
    "settings.timeline.timelineTagPlacement",
    "settings.timeline.defaultLayers",
    "settings.timeline.showDone",
    "settings.timeline.presets",
    "settings.tabs.calendar",
    "settings.calendar.calendarIntegrationMode",
    "settings.calendar.calendarCustomFilePattern",
    "settings.calendar.confirmBeforeCreate",
    "settings.calendar.rootFolder"
  ]) {
    assert.match(source, new RegExp(JSON.stringify(key)), key);
  }

  const overview = extractBody(source, "renderOverviewTab");
  assert.match(overview, /renderSetupWizard/);
  assert.match(overview, /renderStarterProfileSettings/);
  assert.match(overview, /renderOverviewQuickActions/);
  assert.doesNotMatch(overview, /renderManagedPathStatusSummary/);
  assert.doesNotMatch(source, /settings\.overview\.profileIpAra/);
  assert.doesNotMatch(source, /Existing IPARA/);

  const home = extractBody(source, "renderHomeTab");
  assert.match(source, /renderHomeProfileSettings/);
  assert.match(home, /renderHomeDefaultSettings/);
  assert.doesNotMatch(home, /renderManagedPathStatusSummary/);

  const tasks = extractBody(source, "renderTasksTab");
  assert.match(tasks, /renderTasksCalendarDefaultSettings/);
  assert.match(tasks, /renderTaskTagEditor/);
  assert.match(tasks, /settings\.tasks\.advancedFilters/);
  assert.doesNotMatch(tasks, /renderManagedPathStatusSummary/);
  assert.doesNotMatch(tasks, /renderPlannerVisualTuning/);

  assert.match(source, /renderCalendarTab\(/);
  const calendar = extractBody(source, "renderCalendarTab");
  assert.match(calendar, /calendar/);
  assert.match(calendar, /calendarIntegrationMode/);
  assert.match(calendar, /renderCalendarCustomPeriodSettings/);
  assert.match(calendar, /renderCalendarDisplaySettings/);

  const customCalendar = extractBody(source, "renderCalendarCustomPeriodSettings");
  assert.match(customCalendar, /calendarCustomFilePattern/);

  const calendarDisplay = extractBody(source, "renderCalendarDisplaySettings");
  assert.match(calendarDisplay, /addDropdown\("calendarLocale"/);
  assert.doesNotMatch(calendarDisplay, /addText\("calendarLocale"/);
});

test("timeline settings copy describes user-facing defaults without diagnostic modes", () => {
  const source = readPluginSource();

  assert.match(source, /"settings\.timeline\.openMode": "Open location"/);
  assert.match(source, /"settings\.timeline\.interaction": "Interaction"/);
  assert.match(source, /"settings\.timeline\.scaleModeDesc": "Auto fits visible events\. Today centers the formal bands on today's work\. Manual preserves Ctrl-wheel zoom state\."/);
  assert.match(source, /"settings\.timeline\.defaultLayersDesc": "Choose the layers shown when the timeline opens\. Pomodoro stays optional by default; presets can switch scope without changing this default\."/);
  assert.match(source, /"settings\.timeline\.openMode": "打开位置"/);
  assert.match(source, /"settings\.timeline\.interaction": "交互"/);
  assert.match(source, /"settings\.timeline\.scaleModeDesc": "自适应会匹配可见事件；聚焦今天会将时间带居中到今日工作；手动会保留 Ctrl\/Cmd \+ 滚轮调整的视口。"/);
  assert.match(source, /"settings\.timeline\.timelineTagPlacementDesc": "仅开始与截止日期只使用任务的开始和截止信息；任意任务日期还会参考计划日期与修改时间，用于更宽松的记录线索。"/);
  assert.match(source, /"settings\.timeline\.defaultLayersDesc": "选择时间轴打开时显示的图层。番茄钟默认保持可选不显示；预设可以临时切换范围，不会改掉这里的默认值。"/);
});

test("task opening behavior maps continue and fixed views onto existing calendar fields", () => {
  const plugin = makePlugin({
    settings: {
      tasksCalendar: { defaultView: "week", rememberLastView: true }
    }
  });

  assert.equal(plugin.getTasksCalendarOpeningBehavior(), "continue");
  assert.equal(plugin.setTasksCalendarOpeningBehavior("day"), "day");
  assert.equal(plugin.settings.tasksCalendar.defaultView, "day");
  assert.equal(plugin.settings.tasksCalendar.rememberLastView, false);
  assert.equal(Object.prototype.hasOwnProperty.call(plugin.settings.tasksCalendar, "openingBehavior"), false);

  assert.equal(plugin.setTasksCalendarOpeningBehavior("continue"), "continue");
  assert.equal(plugin.settings.tasksCalendar.defaultView, "day");
  assert.equal(plugin.settings.tasksCalendar.rememberLastView, true);

  assert.equal(plugin.setTasksCalendarOpeningBehavior("not-a-view"), "continue");
  assert.equal(plugin.settings.tasksCalendar.defaultView, "day");
  assert.equal(plugin.settings.tasksCalendar.rememberLastView, true);
});

test("task tag filters normalize suggestions and explicit include or exclude edits", () => {
  const plugin = makePlugin();
  plugin.app.metadataCache = {
    getTags: () => ({ research: 2, "#writing": 1, "#tl/deep": 1, "": 3 })
  };

  assert.deepEqual(JSON.parse(JSON.stringify(plugin.getTaskTagSuggestions())), ["#research", "#tl/deep", "#writing"]);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.setTaskTagFilterTags("include", ["research", "#writing", "research"]))), ["#research", "#writing"]);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.taskTagFilter.includeTags)), ["#research", "#writing"]);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.setTaskTagFilterTags("exclude", "habit, #archive"))), ["#habit", "#archive"]);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.taskTagFilter.excludeTags)), ["#habit", "#archive"]);
  assert.equal(plugin.settings.taskTagFilter.excludeTagsUserConfigured, true);
});

test("timeline preset settings operations preserve normalized schema and explicit order", () => {
  const plugin = makePlugin();

  assert.equal(typeof plugin.addTimelinePresetInSettings, "function");
  assert.equal(typeof plugin.updateTimelinePresetInSettings, "function");
  assert.equal(typeof plugin.reorderTimelinePresetInSettings, "function");
  assert.equal(typeof plugin.moveTimelinePresetInSettings, "function");
  assert.equal(typeof plugin.removeTimelinePresetInSettings, "function");
  assert.equal(typeof plugin.replaceTimelinePresetsInSettings, "function");

  const first = plugin.addTimelinePresetInSettings({
    label: "Research",
    layers: ["task", "git", "bad"],
    showDone: false,
    query: "tag:#research",
    includeTags: ["research", "#writing"],
    excludeTags: ["#admin"],
    scaleMode: "today"
  });
  const second = plugin.addTimelinePresetInSettings({ label: "Review" });
  const third = plugin.addTimelinePresetInSettings({ label: "Planning" });

  assert.equal(first.id, "preset-1");
  assert.equal(second.id, "preset-2");
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.timelineView.presets)), [
    {
      id: "preset-1",
      label: "Research",
      layers: ["task", "git"],
      showDone: false,
      query: "tag:#research",
      includeTags: ["#research", "#writing"],
      excludeTags: ["#admin"],
      scaleMode: "today"
    },
    {
      id: "preset-2",
      label: "Review",
      layers: ["task", "annotation"],
      showDone: true,
      query: "",
      includeTags: [],
      excludeTags: [],
      scaleMode: "auto"
    },
    {
      id: "preset-3",
      label: "Planning",
      layers: ["task", "annotation"],
      showDone: true,
      query: "",
      includeTags: [],
      excludeTags: [],
      scaleMode: "auto"
    }
  ]);

  const updated = plugin.updateTimelinePresetInSettings("preset-1", {
    label: "Research focus",
    layers: ["annotation", "pomodoro"],
    includeTags: ["#analysis"],
    excludeTags: ["#waiting"],
    manualCenter: "2026-07-11T10:00:00.000Z",
    manualZoomIndex: 2
  });
  assert.equal(updated.label, "Research focus");
  assert.deepEqual(JSON.parse(JSON.stringify(updated.layers)), ["annotation", "pomodoro"]);
  assert.deepEqual(JSON.parse(JSON.stringify(updated.includeTags)), ["#analysis"]);
  assert.deepEqual(JSON.parse(JSON.stringify(updated.excludeTags)), ["#waiting"]);
  assert.equal(updated.manualCenter, "2026-07-11T10:00:00.000Z");
  assert.equal(updated.manualZoomIndex, 2);

  assert.equal(plugin.reorderTimelinePresetInSettings("preset-3", 0), true);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.timelineView.presets.map((preset) => preset.id))), ["preset-3", "preset-1", "preset-2"]);
  assert.equal(plugin.reorderTimelinePresetInSettings("preset-3", 0), false);
  assert.equal(plugin.reorderTimelinePresetInSettings("missing", 1), false);
  assert.equal(plugin.moveTimelinePresetInSettings("preset-2", "up"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.timelineView.presets.map((preset) => preset.id))), ["preset-3", "preset-2", "preset-1"]);
  assert.equal(plugin.removeTimelinePresetInSettings("preset-2"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings.timelineView.presets.map((preset) => preset.id))), ["preset-3", "preset-1"]);

  const replaced = plugin.replaceTimelinePresetsInSettings({
    custom: { label: "Custom", layers: ["note"], showDone: false, scaleMode: "manual", manualZoomIndex: 4 }
  });
  assert.equal(replaced[0].id, "custom");
  assert.deepEqual(JSON.parse(JSON.stringify(replaced[0].layers)), ["note"]);
  assert.equal(replaced[0].manualZoomIndex, 4);
});

test("timeline settings use a draggable expandable saved-view list without raw JSON", () => {
  const source = readPluginSource();
  const timeline = extractBody(source, "renderTimelineTab");
  const presetManager = extractBody(source, "renderTimelinePresetSettings");

  assert.match(timeline, /renderTimelinePresetSettings\(containerEl\)/);
  assert.match(presetManager, /noria-timeline-preset-manager/);
  assert.match(presetManager, /noria-timeline-layer-selector/);
  assert.match(presetManager, /addTimelinePresetInSettings/);
  assert.match(presetManager, /updateTimelinePresetInSettings/);
  assert.match(presetManager, /reorderTimelinePresetInSettings/);
  assert.match(presetManager, /removeTimelinePresetInSettings/);
  assert.match(presetManager, /dragstart/);
  assert.match(presetManager, /drop/);
  assert.match(presetManager, /noria-timeline-preset-editor/);
  assert.match(presetManager, /new obsidian\.Menu/);
  assert.doesNotMatch(presetManager, /presetMoveUp|presetMoveDown|presetsJson|replaceTimelinePresetsInSettings/);
  assert.doesNotMatch(timeline, /settings\.timeline\.uiPhase|overviewContextLabels|pregenSpanDays|pregenItems/);
  assert.match(timeline, /settings\.timeline\.openMode/);
  assert.match(timeline, /settings\.timeline\.interaction/);
  assert.match(timeline, /dragStepMin/);
  assert.match(timeline, /durationDragStepMin/);

  for (const key of [
    "settings.timeline.scale.auto",
    "settings.timeline.scale.today",
    "settings.timeline.scale.manual",
    "settings.timeline.placement.strict",
    "settings.timeline.placement.anyDate",
    "settings.timeline.layer.task",
    "settings.timeline.layer.annotation",
    "settings.timeline.presetAdd",
    "settings.timeline.presetDelete",
    "settings.timeline.openMode",
    "settings.timeline.interaction"
  ]) {
    assert.match(source, new RegExp(JSON.stringify(key)), key);
  }
});

test("task timeline filter chrome localizes the focused filter hierarchy", () => {
  const source = readPluginSource();
  const modes = extractBody(source, "getTimelineModePresetList");
  const summary = extractBody(source, "getTimelineChromeFilterSummary");
  const panel = extractBody(source, "renderTimelineFilterPanel");

  assert.match(modes, /this\.plugin\.t\("timeline\.filter\.mode\.task"\)/);
  assert.match(summary, /timeline\.filter\.summary/);
  assert.match(panel, /timeline\.filter\.layer\.\$\{layer\}/);
  assert.match(panel, /timeline\.filter\.manageViews/);
  assert.match(panel, /timeline\.filter\.moreFilters/);
  assert.match(panel, /timeline\.filter\.openOnly/);
  assert.match(panel, /timeline\.filter\.includeDone/);
  assert.match(panel, /timeline\.filter\.searchPlaceholder/);
  assert.doesNotMatch(panel, /timeline\.filter\.scale\.\$\{mode\}/);
  assert.doesNotMatch(panel, /timeline\.filter\.mark/);
  assert.doesNotMatch(modes, /label:\s*"Tasks"/);
  assert.doesNotMatch(panel, /\["task",\s*"Tasks"\]/);
  assert.doesNotMatch(panel, /text:\s*"Reset"/);
});

test("weather settings expose only SecretStorage capability beside Weather", () => {
  const plugin = makePlugin();
  const home = extractBody(readPluginSource(), "renderHomeTab");

  assert.equal(typeof plugin.hasWeatherSecretStorage, "function");
  plugin.app.secretStorage = { async getSecret() {}, async setSecret() {} };
  assert.equal(plugin.hasWeatherSecretStorage(), true);
  plugin.app.secretStorage = { async getSecret() {} };
  assert.equal(plugin.hasWeatherSecretStorage(), false);
  plugin.app.secretStorage = null;
  assert.equal(plugin.hasWeatherSecretStorage(), false);

  assert.match(home, /hasWeatherSecretStorage\(\)/);
  assert.match(home, /data-noria-secret-storage-available/);
  assert.match(home, /settings\.weather\.secretStorageAvailable/);
  assert.match(home, /settings\.weather\.secretStorageUnavailable/);
  assert.doesNotMatch(home, /getSecret|qweatherSecretName|qweatherKey/);
});

test("timeline preset settings use a quiet continuous list instead of nested cards", () => {
  const styles = readPluginSource("styles.css");

  assert.match(styles, /\.noria-timeline-preset-manager-head,[\s\S]*?\.noria-timeline-preset-row\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  assert.match(styles, /\.noria-timeline-preset-row \.setting-item-control button[\s\S]*?width:\s*28px;[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /\.noria-timeline-layer-selector\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(styles, /\.noria-timeline-layer-option input\[type="checkbox"\]\s*\{[\s\S]*?margin:\s*0;/);
  assert.match(styles, /\.noria-home-widget-editor\.noria-timeline-preset-editor:not\(\[hidden\]\)[\s\S]*?border-left:\s*1px solid var\(--noria-border-subtle\);[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /\.noria-timeline-preset-item\.is-drag-over::before[\s\S]*?background:\s*var\(--interactive-accent\);/);
  assert.match(styles, /\.noria-settings-inline-status\[data-noria-secret-storage-available="false"\]::before/);
});

test("calendar settings expose exactly one source-specific configuration surface", async () => {
  const plugin = makePlugin();

  assert.deepEqual(JSON.parse(JSON.stringify(plugin.getCalendarSettingsModeModel("noria"))), {
    mode: "noria",
    showManagedSummary: true,
    showDailyNotesStatus: false,
    showCustomFields: false
  });
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.getCalendarSettingsModeModel("daily-notes"))), {
    mode: "daily-notes",
    showManagedSummary: false,
    showDailyNotesStatus: true,
    showCustomFields: false
  });
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.getCalendarSettingsModeModel("custom"))), {
    mode: "custom",
    showManagedSummary: false,
    showDailyNotesStatus: false,
    showCustomFields: true
  });

  plugin.settings.managedPaths = {
    ...plugin.settings.managedPaths,
    diaryRoot: "Journal",
    dailyTemplate: "Templates/Noria daily.md",
    weeklyTemplate: "Templates/Noria weekly.md",
    monthlyTemplate: "Templates/Noria monthly.md",
    yearlyTemplate: "Templates/Noria yearly.md"
  };
  plugin.settings.calendar = {
    ...plugin.settings.calendar,
    calendarIntegrationMode: "noria",
    calendarRootFolder: "Stored custom root",
    calendarCustomFilePattern: "Stored custom daily",
    calendarCustomFileTemplate: "Stored custom template"
  };
  const noriaCalendar = plugin.getCalendarSettings();
  assert.equal(noriaCalendar.calendarRootFolder, "Journal");
  assert.equal(noriaCalendar.calendarCustomFilePattern, "YYYY/YYYY-MM-DD");
  assert.equal(noriaCalendar.calendarCustomFileTemplate, "Templates/Noria daily.md");

  plugin.settings.calendar.calendarIntegrationMode = "daily-notes";
  const dailyNotesCalendar = plugin.getCalendarSettings();
  assert.equal(dailyNotesCalendar.calendarRootFolder, "Journal");
  assert.equal(dailyNotesCalendar.calendarCustomFileTemplate, "");
  assert.equal(dailyNotesCalendar.calendarCustomWeekTemplate, "Templates/Noria weekly.md");

  plugin.app.vault.adapter = {
    async exists(pathText) { return pathText === ".obsidian/daily-notes.json"; },
    async read() { return JSON.stringify({ folder: "Journal", format: "YYYY/YYYY-MM-DD", template: "Templates/Daily" }); }
  };
  assert.deepEqual(JSON.parse(JSON.stringify(await plugin.getDailyNotesIntegrationStatus())), {
    available: true,
    configPath: ".obsidian/daily-notes.json",
    folder: "Journal",
    format: "YYYY/YYYY-MM-DD",
    template: "Templates/Daily"
  });

  plugin.app.vault.adapter.exists = async () => false;
  assert.deepEqual(JSON.parse(JSON.stringify(await plugin.getDailyNotesIntegrationStatus())), {
    available: false,
    configPath: ".obsidian/daily-notes.json",
    folder: "",
    format: "YYYY-MM-DD",
    template: ""
  });
});

test("calendar settings render source summaries custom period rows and a separate display group", () => {
  const source = readPluginSource();
  const calendar = extractBody(source, "renderCalendarTab");
  const customPeriods = extractBody(source, "renderCalendarCustomPeriodSettings");

  assert.match(calendar, /getCalendarSettingsModeModel/);
  assert.match(calendar, /renderCalendarManagedSourceSummary/);
  assert.match(calendar, /renderCalendarDailyNotesStatus/);
  assert.match(calendar, /renderCalendarCustomPeriodSettings/);
  assert.match(calendar, /settings\.calendar\.display/);
  assert.doesNotMatch(calendar, /addText\("calendarCustomFilePattern"/);
  assert.match(customPeriods, /daily[\s\S]*weekly[\s\S]*monthly[\s\S]*quarterly[\s\S]*yearly/);
  assert.match(customPeriods, /patternKey/);
  assert.match(customPeriods, /templateKey/);
});

test("appearance preferences and tag colors validate through one settings API", () => {
  const plugin = makePlugin();

  assert.equal(plugin.setAppearancePreference("density", "compact"), "compact");
  assert.equal(plugin.settings.appearance.density, "compact");
  assert.equal(plugin.setAppearancePreference("density", "not-valid"), "compact");
  assert.equal(plugin.setAppearancePreference("accentPreset", "forest"), "forest");

  assert.deepEqual(JSON.parse(JSON.stringify(plugin.setAppearanceTagColor("Research", "#AABBCC"))), {
    tag: "research",
    color: "#aabbcc"
  });
  assert.equal(plugin.settings.appearance.tagColorMap.research, "#aabbcc");
  assert.equal(plugin.settings.colorPalette.tagColorMap.research, "#aabbcc");
  assert.equal(plugin.setAppearanceTagColor("bad tag", "red"), null);
  assert.equal(plugin.removeAppearanceTagColor("research"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(plugin.settings.appearance.tagColorMap, "research"), false);
  assert.equal(plugin.removeAppearanceTagColor("research"), false);
});

test("appearance settings use visible choices a visual tag list and a semantic preview", () => {
  const source = readPluginSource();
  const appearance = extractBody(source, "renderAppearancePresetSettings");
  const preview = extractBody(source, "renderAppearancePreview");

  assert.match(appearance, /renderAppearanceChoiceSetting/);
  assert.match(appearance, /renderAppearanceTagColorSettings/);
  assert.doesNotMatch(appearance, /addTextArea/);
  assert.match(preview, /noria-appearance-preview-task/);
  assert.match(preview, /noria-appearance-preview-status/);
  assert.doesNotMatch(preview, /previewDensity|previewAccent|previewStatus|previewCard/);
});

test("home guide panel settings copy treats Inbox as a primary overview workbench", () => {
  const source = readPluginSource();

  assert.match(source, /"settings\.home\.guidePanelsDesc": "Controls secondary Guide panels\. Inbox actions live in the primary Home overview Inbox\."/);
  assert.match(source, /"settings\.home\.guidePanelsDesc": "控制次级 Guide 面板；Inbox 操作集中在主页概览 Inbox。"/);
  assert.doesNotMatch(source, /"settings\.home\.guideInbox"/);
  assert.doesNotMatch(source, /"settings\.home\.guideInbox": "Inbox panel"/);
  assert.doesNotMatch(source, /"settings\.home\.guideInbox": "Inbox 面板"/);
});

test("home widget settings disclose view widget execution boundary", () => {
  const source = readPluginSource();

  assert.match(source, /view widgets run a safe vault-relative JS view/);
  assert.match(source, /protocols, absolute paths, and path traversal are blocked/);
  assert.match(source, /view 小组件运行安全的库内相对 JS 视图/);
  assert.match(source, /协议、绝对路径和路径穿越会被阻止/);
});
