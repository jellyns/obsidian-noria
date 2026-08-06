const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");
const vm = require("node:vm");

const pluginRoot = path.resolve(__dirname, "..");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadPluginClass(options = {}) {
  const language = options.language || "en";
  const code = fs.readFileSync(pluginPath("main.js"), "utf8");
  const module = { exports: {} };
  const timers = options.timers || [];
  const context = {
    console: options.console || console,
    module,
    exports: module.exports,
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout(id) {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
    require(id) {
      if (id === "obsidian") {
        return {
          Plugin: class {},
          PluginSettingTab: class {
            constructor(app, plugin) {
              this.app = app;
              this.plugin = plugin;
              this.containerEl = null;
            }
          },
          ItemView: class {
            constructor(leaf) {
              this.leaf = leaf;
              this.containerEl = null;
            }
          },
          Setting: class {},
          Notice: class {},
          setIcon() {},
          getLanguage() {
            return language;
          }
        };
      }
      if (id === "child_process") return options.childProcess || {};
      if (id === "electron") return options.electron || {};
      if (id === "fs") return options.fs || require("node:fs");
      if (id === "os") return options.os || require("node:os");
      if (id === "path") return options.path || require("node:path");
      throw new Error(`Unexpected require: ${id}`);
    },
    navigator: options.navigator,
    window: options.window,
    process: options.process || process,
    __noriaHomePerformanceSummary: options.homePerformanceSummary,
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "main.js" });
  return module.exports;
}

function makePlugin(options = {}) {
  const Plugin = loadPluginClass(options);
  const plugin = new Plugin();
  let triggerCount = 0;
  const triggers = [];
  plugin.app = {
    workspace: {
      trigger(name) {
        triggerCount += 1;
        triggers.push(String(name || ""));
      },
      getLeavesOfType() {
        return [];
      },
      revealLeaf() {
      }
    },
    vault: {
      getAbstractFileByPath() {
        return null;
      }
    },
    secretStorage: {
      async getSecret() {
        return "";
      },
      async setSecret() {}
    }
  };
  plugin.__getTriggers = () => ({ triggerCount, triggers: [...triggers] });
  return plugin;
}

test("fresh settings retire entry note and migrate legacy Chinese managed paths", () => {
  const plugin = makePlugin();

  const settings = plugin.normalizeSettings({
    onboarding: { profile: "custom" },
    viewNotePath: "02_Areas/知识库管理/Noria入口说明.md",
    managedPaths: {
      entryNote: "02_Areas/知识库管理/Noria入口说明.md",
      timelineSettings: "02_Areas/知识库管理/清单-时间线设置.md",
      templateLibrary: "02_Areas/知识库管理/清单-事件库.md",
      importantDates: "02_Areas/知识库管理/清单-重要日期.md",
      habitRegistry: "02_Areas/知识库管理/清单-习惯打卡.md",
      projectRegistry: "02_Areas/知识库管理/清单-项目.md",
      inboxRoot: "00_Inbox"
    },
    home: {
      identity: {
        quoteListPath: "02_Areas/知识库管理/清单-名言.md"
      }
    }
  });

  assert.equal(settings.weather.provider, "qweather-ip-fallback");
  assert.equal(settings.weather.cacheMinutes, 45);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.managedPaths, "entryNote"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings, "viewNotePath"), false);
  assert.equal(settings.managedPaths.timelineSettings, "02_Areas/知识库管理/Timeline settings.md");
  assert.equal(settings.managedPaths.templateLibrary, "02_Areas/知识库管理/Event library.md");
  assert.equal(settings.managedPaths.importantDates, "02_Areas/知识库管理/Countdowns.md");
  assert.equal(settings.managedPaths.habitRegistry, "02_Areas/知识库管理/Habits.md");
  assert.equal(settings.managedPaths.projectRegistry, "02_Areas/知识库管理/Projects.md");
  assert.equal(settings.managedPaths.inboxWorkflow, "02_Areas/知识库管理/Inbox workflow.md");
  assert.equal(settings.managedPaths.inboxQueue, "02_Areas/知识库管理/Inbox queue.base");
  assert.equal(settings.home.identity.quoteListPath, "02_Areas/知识库管理/Quotes.md");
  assert.equal(Object.prototype.hasOwnProperty.call(settings.managedPaths, "taskRegistry"), false);
  assert.deepEqual(plain(settings.taskTagFilter.excludeTags), ["#habit"]);
});

test("weather settings normalize the account-specific QWeather API host", () => {
  const plugin = makePlugin();

  const configured = plugin.normalizeSettings({
    weather: { qweatherApiHost: "https://abc123.def.qweatherapi.com/ignored/path" }
  });
  const invalid = plugin.normalizeSettings({
    weather: { qweatherApiHost: "https://bad host.example.com/path" }
  });

  assert.equal(configured.weather.qweatherApiHost, "abc123.def.qweatherapi.com");
  assert.equal(invalid.weather.qweatherApiHost, "");
});

test("review recovery cache path respects the vault config directory and plugin id", () => {
  const plugin = makePlugin();
  plugin.manifest = { id: "noria-preview" };
  plugin.app.vault.configDir = ".obsidian-custom";

  assert.equal(
    plugin.getReviewRecoveryDraftPath(),
    ".obsidian-custom/plugins/noria-preview/cache/review/recovery-drafts.json"
  );
});

test("plugin cache paths and runtime bridge respect the vault config directory and plugin id", () => {
  const plugin = makePlugin();
  plugin.manifest = { id: "noria-preview", version: "0.3.6" };
  plugin.app.vault.configDir = ".obsidian-custom";
  plugin.settings = plugin.normalizeSettings({});

  assert.equal(
    plugin.getHomePerformanceSummaryCachePath(),
    ".obsidian-custom/plugins/noria-preview/cache/stats/home-performance/latest.json"
  );
  assert.equal(
    plugin.getTaskTimelinePerformanceSummaryCachePath(),
    ".obsidian-custom/plugins/noria-preview/cache/stats/task-timeline-performance/latest.json"
  );
  assert.equal(
    plugin.getReviewEvidencePath("2026-07-15"),
    ".obsidian-custom/plugins/noria-preview/cache/stats/review/2026/2026-07-15.json"
  );

  const bridge = plugin.buildRuntimeBridgeConfig();
  assert.equal(bridge.pluginId, "noria-preview");
  assert.equal(bridge.storagePaths.pluginRoot, ".obsidian-custom/plugins/noria-preview");
  assert.equal(bridge.storagePaths.cacheRoot, ".obsidian-custom/plugins/noria-preview/cache");
  assert.equal(bridge.storagePaths.reviewEvidenceRoot, ".obsidian-custom/plugins/noria-preview/cache/stats/review");
  assert.equal(bridge.storagePaths.snapshotRoot, ".obsidian-custom/plugins/noria-preview/cache/stats/snapshots");
});

test("runtime bridge defaults its public plugin id to noria when the manifest is unavailable", () => {
  const plugin = makePlugin();
  plugin.manifest = undefined;
  plugin.settings = plugin.normalizeSettings({});

  assert.equal(plugin.buildRuntimeBridgeConfig().pluginId, "noria");
});

test("managed note seeds are minimal and parseable by current views", () => {
  const plugin = makePlugin();
  const zhPlugin = makePlugin({ language: "zh" });

  assert.match(plugin.getManagedNoteSeed("importantDates"), /\|\s*Date\s*\|\s*Name\s*\|\s*Type\s*\|/);
  assert.match(plugin.getManagedNoteSeed("habitRegistry"), /## Active habits/);
  assert.match(plugin.getManagedNoteSeed("habitRegistry"), /## Daily recurring task source/);
  assert.match(plugin.getManagedNoteSeed("projectRegistry"), /## Active projects/);
  assert.match(plugin.getManagedNoteSeed("projectRegistry"), /## Hidden projects/);
  assert.match(zhPlugin.getManagedNoteSeed("habitRegistry"), /## 打卡中的习惯/);
  assert.match(zhPlugin.getManagedNoteSeed("projectRegistry"), /## 进行中的项目/);
  assert.match(plugin.getManagedNoteSeed("habitRegistry"), /#habit/);
  assert.match(plugin.getManagedNoteSeed("habitRegistry"), /#active/);
  assert.match(plugin.getManagedNoteSeed("templateLibrary"), /#tl\/template/);
  assert.match(plugin.getManagedNoteSeed("templateLibrary"), /\[default_tag:: #tl\/breakfast\]/);
  assert.doesNotMatch(plugin.getManagedNoteSeed("templateLibrary"), /\|\s*Name\s*\|\s*Start\s*\|\s*Duration\s*\|\s*Tag\s*\|/);
  assert.match(plugin.getManagedNoteSeed("inboxWorkflow"), /Inbox|inbox/);
  assert.match(plugin.getManagedNoteSeed("inboxQueue"), /views:\n\s+- type: table/);
  assert.match(plugin.getManagedNoteSeed("inboxQueue"), /inbox-action/);
  assert.throws(() => plugin.getManagedNoteSeed("entryNote"), /retired|unknown|unsupported/i);
});

test("habit task exclusion defaults on but can be explicitly configured", () => {
  const plugin = makePlugin();

  assert.deepEqual(plain(plugin.normalizeSettings({
    taskTagFilter: {
      includeTags: [],
      excludeTags: []
    }
  }).taskTagFilter.excludeTags), ["#habit"]);

  assert.deepEqual(plain(plugin.normalizeSettings({
    taskTagFilter: {
      includeTags: [],
      excludeTags: [],
      excludeTagsUserConfigured: true
    }
  }).taskTagFilter.excludeTags), []);

  assert.deepEqual(plain(plugin.normalizeSettings({
    taskTagFilter: {
      includeTags: [],
      excludeTags: ["#archive"]
    }
  }).taskTagFilter.excludeTags), ["#archive", "#habit"]);
});

test("non-diary starter notes do not opt into diary styling", () => {
  const plugin = makePlugin({ language: "zh-CN" });

  for (const key of ["timelineSettings", "templateLibrary", "importantDates", "habitRegistry", "projectRegistry", "inboxWorkflow", "inboxQueue"]) {
    assert.doesNotMatch(plugin.getManagedNoteSeed(key), /^---\n[\s\S]*cssclasses:/m, key);
  }
  for (const [key, pathText] of [
    ["homeQuoteList", "Noria/Quotes.md"],
    ["starterMoc", "Noria/Workflow·MOC.md"]
  ]) {
    assert.doesNotMatch(plugin.getSupportSeedText(key, pathText), /^---\n[\s\S]*cssclasses:/m, key);
  }
  assert.doesNotMatch(plugin.buildStarterProjectSeed({ summary: "demo" }, "setup"), /^---\n[\s\S]*cssclasses:/m);
  assert.doesNotMatch(plugin.buildStarterInboxSeed({ title: "demo" }), /^---\n[\s\S]*cssclasses:/m);
  assert.match(plugin.buildStarterInboxSeed({ title: "demo" }), /^---\n[\s\S]*inbox-status:/m);
});

test("daily and periodic templates use daily-clean blocks without embedded periodic stats", () => {
  const plugin = makePlugin({ language: "zh-CN" });
  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "custom" },
    managedPaths: {
      habitRegistry: "02_Areas/知识库管理/清单-习惯打卡.md"
    }
  });

  for (const key of ["dailyTemplate", "weeklyTemplate", "monthlyTemplate", "yearlyTemplate"]) {
    const seed = plugin.getManagedNoteSeed(key);
    assert.match(seed, /^---\n[\s\S]*cssclasses:\n[\s\S]*  - daily-clean/m, key);
    assert.doesNotMatch(seed, /noria-note|noria-diary|noria-project/, key);
    assert.match(seed, /\n---\n\n## /, key);
    assert.doesNotMatch(seed, /[ \t]+$/m, `${key} must not contain trailing whitespace`);
  }

  const daily = plugin.getManagedNoteSeed("dailyTemplate");
  assert.match(daily, /tags:\n  - '#daily-plan'/);
  assert.match(daily, /```noria-view\n\{\n  "view": "focusPanel"/);
  assert.match(daily, /"sourcePath": "02_Areas\/知识库管理\/Habits\.md"/);
  assert.match(daily, /"view": "dailyOtherToday"/);
  assert.match(daily, /"view": "statusSelector"/);
  assert.doesNotMatch(daily, /weather:/);

  assert.match(plugin.getManagedNoteSeed("weeklyTemplate"), /"view": "weeklyOtherTasks"/);
  assert.match(plugin.getManagedNoteSeed("monthlyTemplate"), /"view": "monthlyOtherTasks"/);
  assert.doesNotMatch(plugin.getManagedNoteSeed("weeklyTemplate"), /periodicStats/);
  assert.doesNotMatch(plugin.getManagedNoteSeed("monthlyTemplate"), /periodicStats/);
  assert.doesNotMatch(plugin.getManagedNoteSeed("yearlyTemplate"), /periodicStats/);

  assert.match(plugin.createDailyDiarySeed(), /^---\n[\s\S]*cssclasses:\n[\s\S]*  - daily-clean/m);
  assert.doesNotMatch(plugin.createDailyDiarySeed(), /noria-note|noria-diary|weather:/);
  assert.match(plugin.createDailyDiarySeed(), /\n---\n\n## 待办/);
});

test("runtime bridge exposes managed paths, refresh bus, and performance defaults", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  const bridge = plugin.buildRuntimeBridgeConfig();

  assert.equal(bridge.paths.importantDatesPath, "Noria/Countdowns.md");
  assert.equal(bridge.paths.habitRegistryPath, "Noria/Habits.md");
  assert.equal(bridge.paths.projectRegistryPath, "Noria/Projects.md");
  assert.equal(bridge.paths.inboxWorkflowPath, "Noria/Inbox workflow.md");
  assert.equal(bridge.paths.inboxQueuePath, "Noria/Inbox queue.base");
  assert.equal(Object.prototype.hasOwnProperty.call(bridge.paths, "entryNotePath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(bridge.paths, "taskRegistryPath"), false);
  assert.equal(bridge.paths.diaryRoot, "Noria/Diary");
  assert.equal(Object.prototype.hasOwnProperty.call(bridge.paths, "reviewArtifactBasePath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(bridge, "runtimeFiles"), false);
  assert.equal(typeof bridge.refresh.requestRefresh, "function");
  assert.equal(typeof bridge.refresh.scopeFor, "function");
  assert.equal(bridge.refresh.scopeFor("setting:weather"), "home");
  assert.equal(bridge.refresh.scopeFor("setting:calendar"), "calendar");
  assert.equal(bridge.refresh.scopeFor("writeback:task"), "tasks");
  assert.equal(bridge.calendarSettings.calendarIntegrationMode, "noria");
  assert.equal(bridge.calendarSettings.calendarRootFolder, "Noria/Diary");
  assert.equal(typeof bridge.data.resolveRange, "function");
  assert.equal(typeof bridge.data.getSnapshot, "function");
  assert.equal(typeof bridge.data.getTasks, "function");
  assert.equal(typeof bridge.data.getTimelineTraces, "function");
  assert.equal(typeof bridge.data.getPeriods, "function");
  assert.equal(typeof bridge.data.getReviewEvidence, "function");
  assert.equal(typeof bridge.data.export, "function");
  assert.equal(typeof bridge.data.invalidate, "function");
  assert.equal(typeof bridge.calendar.getMonthModel, "function");
  assert.equal(typeof bridge.calendar.openPeriodNote, "function");
  assert.equal(typeof bridge.calendar.resolveNote, "function");
  assert.equal(Object.prototype.hasOwnProperty.call(bridge, "stats"), false);
  assert.equal(typeof plugin.ensureDataService, "function");
  assert.equal(typeof plugin.ensureStatsService, "undefined");
  assert.equal(bridge.performance.viewSourceCache, true);
  assert.equal(bridge.performance.taskSnapshotTtlMs, 1200);
  assert.equal(bridge.performance.queryScopes.tasks.mode, "managed");
  assert.equal(bridge.performance.queryScopes.notes.mode, "all");
  assert.equal(typeof bridge.runtime.scopeFor, "function");
  assert.equal(typeof bridge.runtime.pagesForScope, "function");
  assert.equal(typeof bridge.runtime.tasksForScope, "function");
  assert.equal(bridge.runtime.scopeFor("tasks").query, '"Noria/Diary" or "Noria/Projects" or "Noria/Inbox"');
  assert.equal(bridge.runtime.scopeFor("tasks").roots[0], "Noria/Diary");
  assert.deepEqual(plain(bridge.taskQueryContext.taskTagFilter.excludeTags), ["#habit"]);
  assert.equal(bridge.runtime.scopeFor("notes").isAllVault, true);
  assert.equal(typeof bridge.taskSnapshots.get, "function");
  assert.equal(typeof bridge.taskSnapshots.set, "function");
  assert.equal(typeof bridge.taskSnapshots.invalidate, "function");
  assert.equal(typeof bridge.calendar.getPickerModel, "function");
  assert.equal(typeof bridge.calendar.addDateTask, "function");
});

test("runtime bridge keeps the Git trace contract without executing local commands", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  const traces = await plugin.buildRuntimeBridgeConfig().data.getTimelineTraces({
    range: { start: "2026-06-12", end: "2026-06-13" }
  });

  assert.equal(traces.git.available, false);
  assert.equal(traces.git.source, "git-log");
  assert.match(traces.git.error, /external/i);
  assert.equal(typeof traces.meta.performance.totalMs, "number");
  assert.equal(typeof traces.meta.performance.gitMs, "number");
  assert.equal(typeof traces.meta.performance.cacheMs, "number");
  assert.deepEqual(plain(traces.git.commits), []);
  assert.equal(traces.meta.scope, "human-markdown");
  assert.equal(traces.meta.noiseFiltered, true);
});

test("runtime bridge exposes review evidence cache traces by timeline range", async () => {
  const files = new Map([
    [
      ".obsidian/plugins/noria/cache/stats/review/2026/2026-06-12.json",
      JSON.stringify({
        exportKind: "noria.reviewEvidence",
        exportVersion: 1,
        exportedAt: "2026-06-12T21:30:00+08:00",
        payload: {
          mode: "daily",
          period: "2026-06-12",
          artifactPath: "06_Diary/2026/2026-06-12-review.md",
          diaryPath: "06_Diary/2026/2026-06-12.md",
          evidenceHash: "hash-a",
          range: { mode: "custom", start: "2026-06-12", end: "2026-06-12" }
        }
      })
    ],
    [
      ".obsidian/plugins/noria/cache/stats/review/2026/2026-06-13.json",
      JSON.stringify({
        exportKind: "noria.reviewEvidence",
        exportVersion: 1,
        exportedAt: "2026-06-14T00:05:00+08:00",
        payload: {
          mode: "daily",
          period: "2026-06-13",
          artifactPath: "06_Diary/2026/2026-06-13-review.md",
          diaryPath: "06_Diary/2026/2026-06-13.md",
          evidenceHash: "hash-b"
        }
      })
    ],
    [
      ".obsidian/plugins/noria/cache/stats/review/2026/not-review.json",
      JSON.stringify({ exportKind: "other" })
    ]
  ]);
  const plugin = makePlugin({
    childProcess: {
      execFile(_command, _args, _options, callback) {
        callback(null, "");
      }
    }
  });
  plugin.settings = plugin.normalizeSettings({});
  plugin.app.vault.adapter = {
    getBasePath() {
      return "F:/Library";
    },
    async list(pathText) {
      const prefix = String(pathText || "").replace(/\/+$/, "");
      const filesOut = [];
      const folders = new Set();
      for (const key of files.keys()) {
        if (!key.startsWith(`${prefix}/`)) continue;
        const rest = key.slice(prefix.length + 1);
        const first = rest.split("/")[0];
        if (rest.includes("/")) folders.add(`${prefix}/${first}`);
        else filesOut.push(key);
      }
      return { files: filesOut, folders: Array.from(folders) };
    },
    async read(pathText) {
      const key = String(pathText || "");
      if (!files.has(key)) throw new Error(`missing ${key}`);
      return files.get(key);
    },
    async stat(pathText) {
      if (!files.has(String(pathText || ""))) throw new Error("missing");
      return { mtime: new Date("2026-06-12T21:31:00+08:00").getTime() };
    }
  };

  const traces = await plugin.buildRuntimeBridgeConfig().data.getTimelineTraces({
    range: { start: "2026-06-12", end: "2026-06-12" }
  });

  assert.equal(traces.cache.available, true);
  assert.equal(traces.cache.source, "noria-cache");
  assert.equal(traces.cache.events.length, 1);
  assert.deepEqual(plain(traces.cache.events[0]), {
    id: "review-evidence-2026-06-12",
    kind: "review-evidence",
    title: "Review evidence: daily 2026-06-12",
    time: "2026-06-12T21:30:00+08:00",
    path: ".obsidian/plugins/noria/cache/stats/review/2026/2026-06-12.json",
    mode: "daily",
    period: "2026-06-12",
    artifactPath: "06_Diary/2026/2026-06-12-review.md",
    diaryPath: "06_Diary/2026/2026-06-12.md",
    evidenceHash: "hash-a",
    range: { mode: "custom", start: "2026-06-12", end: "2026-06-12" }
  });
  assert.equal(traces.meta.cacheFiltered, true);
  assert.equal(traces.meta.scope, "human-markdown");
});

test("Home performance summary can be formatted and exposed through a semantic command", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  assert.match(main, /id:\s*"copy-home-performance-summary"/);
  assert.match(main, /id:\s*"measure-home-performance-summary"/);

  const plugin = makePlugin();
  const summary = {
    type: "home-dashboard-summary",
    sampleCount: 4,
    total: { p50Ms: 120.25, p95Ms: 240.5 },
    cold: { count: 1, p95Ms: 260 },
    hot: { count: 3, p95Ms: 180 },
    io: { avgCtxLoad: 8, avgAdapterRead: 2, avgCacheHit: 5 },
    snapshots: { totalCalls: 6, cachedCalls: 4, avgCalls: 1.5 },
    slowest: {
      widgets: [
        { id: "builtin:workbench", count: 3, avgMs: 720.5, p95Ms: 900, maxMs: 950, lastMs: 680 }
      ],
      sections: [
        { id: "views/dashboard/home/sections/overview-columns/view.js", count: 3, avgMs: 610, p95Ms: 700, maxMs: 720, lastMs: 600 }
      ]
    },
    last: { status: "ok", totalMs: 118.75, cacheState: "hot" }
  };

  assert.equal(typeof plugin.formatHomePerformanceSummary, "function");
  const text = plugin.formatHomePerformanceSummary(summary);

  assert.match(text, /Noria Home Performance/);
  assert.match(text, /samples: 4/);
  assert.match(text, /total p50\/p95: 120\.25ms \/ 240\.5ms/);
  assert.match(text, /cold\/hot p95: 260ms \/ 180ms/);
  assert.match(text, /io avg ctx\/adapter\/cache: 8 \/ 2 \/ 5/);
  assert.match(text, /snapshots: 6 calls, 4 cached/);
  assert.match(text, /slow widgets: builtin:workbench 720\.5ms avg, 900ms p95/);
  assert.match(text, /slow sections: views\/dashboard\/home\/sections\/overview-columns\/view\.js 610ms avg, 700ms p95/);
  assert.match(text, /last: ok, 118\.75ms, hot/);
  assert.match(plugin.formatHomePerformanceSummary(null), /No Home performance summary yet/);
});

test("Home performance summary copy falls back to Electron clipboard outside browser clipboard contexts", async () => {
  const electronWrites = [];
  const plugin = makePlugin({
    navigator: {},
    electron: {
      clipboard: {
        writeText(text) {
          electronWrites.push(String(text || ""));
        }
      }
    },
    homePerformanceSummary: {
      type: "home-dashboard-summary",
      sampleCount: 1,
      total: { p50Ms: 42, p95Ms: 42 },
      cold: { p95Ms: 42 },
      hot: { p95Ms: 42 },
      io: {},
      snapshots: {},
      last: { status: "ok", totalMs: 42, cacheState: "hot" }
    }
  });

  const result = await plugin.copyHomePerformanceSummary();

  assert.equal(result.ok, true);
  assert.equal(result.copied, true);
  assert.equal(electronWrites.length, 1);
  assert.match(electronWrites[0], /Noria Home Performance/);
});

test("Home performance summary copy fails cleanly when native clipboards are unavailable", async () => {
  const plugin = makePlugin({
    navigator: {},
    electron: {},
    homePerformanceSummary: {
      type: "home-dashboard-summary",
      sampleCount: 1,
      total: { p50Ms: 43, p95Ms: 43 },
      cold: { p95Ms: 43 },
      hot: { p95Ms: 43 },
      io: {},
      snapshots: {},
      last: { status: "ok", totalMs: 43, cacheState: "hot" }
    }
  });

  const result = await plugin.copyHomePerformanceSummary();

  assert.equal(result.ok, true);
  assert.equal(result.copied, false);
});

test("Home performance summary copy reads the renderer window summary when the command global is separate", async () => {
  const clipboardWrites = [];
  const plugin = makePlugin({
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(String(text || ""));
        }
      }
    },
    window: {
      __noriaHomePerformanceSummary: {
        type: "home-dashboard-summary",
        sampleCount: 2,
        total: { p50Ms: 51, p95Ms: 52 },
        cold: { p95Ms: 53 },
        hot: { p95Ms: 54 },
        io: {},
        snapshots: {},
        last: { status: "ok", totalMs: 55, cacheState: "hot" }
      }
    }
  });

  const result = await plugin.copyHomePerformanceSummary();

  assert.equal(result.ok, true);
  assert.equal(result.copied, true);
  assert.equal(clipboardWrites.length, 1);
  assert.match(clipboardWrites[0], /samples: 2/);
});

test("Home performance summary copy writes a diagnostic cache for REST-triggered measurements", async () => {
  const files = new Map();
  const folders = new Set();
  const plugin = makePlugin({
    navigator: {
      clipboard: {
        async writeText() {}
      }
    },
    homePerformanceSummary: {
      type: "home-dashboard-summary",
      sampleCount: 3,
      total: { p50Ms: 61, p95Ms: 62 },
      cold: { p95Ms: 63 },
      hot: { p95Ms: 64 },
      io: {},
      snapshots: {},
      last: { status: "ok", totalMs: 65, cacheState: "hot" }
    }
  });
  plugin.app.vault = {
    adapter: {
      async exists(pathText) {
        return files.has(String(pathText || "")) || folders.has(String(pathText || ""));
      },
      async write(pathText, text) {
        files.set(String(pathText || ""), String(text || ""));
      }
    },
    getAbstractFileByPath(pathText) {
      const p = String(pathText || "");
      return files.has(p) ? { path: p, text: files.get(p) } : null;
    },
    async createFolder(pathText) {
      folders.add(String(pathText || ""));
    },
    async create(pathText, text) {
      const p = String(pathText || "");
      files.set(p, String(text || ""));
      return { path: p };
    },
    async modify(file, text) {
      files.set(file.path, String(text || ""));
    }
  };

  const result = await plugin.copyHomePerformanceSummary();

  assert.equal(result.cacheWritten, true);
  assert.equal(result.cachePath, ".obsidian/plugins/noria/cache/stats/home-performance/latest.json");
  const payload = JSON.parse(files.get(result.cachePath));
  assert.equal(payload.hasSummary, true);
  assert.equal(payload.copied, true);
  assert.equal(payload.summary.sampleCount, 3);
  assert.match(payload.text, /samples: 3/);
});

test("Home performance summary cache skips quietly when vault write APIs are unavailable", async () => {
  const warnings = [];
  const plugin = makePlugin({
    console: {
      ...console,
      warn(...args) {
        warnings.push(args.map(String).join(" "));
      }
    },
    navigator: {
      clipboard: {
        async writeText() {}
      }
    },
    homePerformanceSummary: {
      type: "home-dashboard-summary",
      sampleCount: 1,
      total: { p50Ms: 1, p95Ms: 1 },
      cold: { p95Ms: 1 },
      hot: { p95Ms: 1 },
      io: {},
      snapshots: {},
      last: { status: "ok", totalMs: 1, cacheState: "hot" }
    }
  });

  const result = await plugin.copyHomePerformanceSummary();

  assert.equal(result.cacheWritten, false);
  assert.equal(warnings.length, 0);
});

test("Home performance measurement reloads Home before copying the summary", async () => {
  const plugin = makePlugin();
  const calls = [];
  plugin.openDashboardHomeLeaf = async () => {
    calls.push("open");
  };
  plugin.resetHomePerformanceSamples = () => {
    calls.push("reset");
  };
  plugin.reloadOpenNoriaViews = async (scope) => {
    calls.push(`reload:${scope}`);
  };
  plugin.copyHomePerformanceSummary = async () => {
    calls.push("copy");
    return { ok: true, copied: true, text: "summary" };
  };

  const result = await plugin.measureHomePerformanceSummary({ count: 3 });

  assert.deepEqual(calls, ["open", "reset", "reload:home", "reload:home", "reload:home", "copy"]);
  assert.deepEqual(plain(result), { ok: true, copied: true, text: "summary", sampled: 3 });
});

test("Task timeline performance summary can be read, formatted, and exposed through semantic commands", async () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  assert.match(main, /id:\s*"copy-task-timeline-performance-summary"/);
  assert.match(main, /id:\s*"measure-task-timeline-performance-summary"/);

  const rootAttrs = {
    "data-noria-timeline-density": "normal",
    "data-noria-timeline-render-state": "ready"
  };
  const nodeAttrs = {
    "data-noria-timeline-source": "tasks",
    "data-noria-timeline-load-state": "ready",
    "data-noria-timeline-load-total-ms": "480",
    "data-noria-timeline-load-modules-ms": "80",
    "data-noria-timeline-load-task-source-ms": "160",
    "data-noria-timeline-load-task-query-ms": "150",
    "data-noria-timeline-load-task-fallback-ms": "0",
    "data-noria-timeline-load-task-data-source-ms": "145",
    "data-noria-timeline-load-task-data-enumerate-ms": "2",
    "data-noria-timeline-load-task-data-read-ms": "136",
    "data-noria-timeline-load-task-data-normalize-ms": "5",
    "data-noria-timeline-load-task-data-filter-ms": "2",
    "data-noria-timeline-load-task-cache-state": "cold",
    "data-noria-timeline-load-task-files": "42",
    "data-noria-timeline-load-task-scope-files": "1116",
    "data-noria-timeline-load-task-index-state": "metadata-cache",
    "data-noria-timeline-load-task-model-ms": "20",
    "data-noria-timeline-load-provider-source-ms": "90",
    "data-noria-timeline-load-annotation-source-ms": "3",
    "data-noria-timeline-load-pomodoro-source-ms": "0",
    "data-noria-timeline-load-trace-source-ms": "88",
    "data-noria-timeline-load-trace-git-ms": "82",
    "data-noria-timeline-load-trace-cache-ms": "12",
    "data-noria-timeline-load-provider-model-ms": "30",
    "data-noria-timeline-load-provider-collect-ms": "22",
    "data-noria-timeline-load-provider-filter-ms": "5",
    "data-noria-timeline-load-provider-json-ms": "3",
    "data-noria-timeline-load-mount-ms": "100",
    "data-noria-timeline-host-wait-ms": "40",
    "data-noria-timeline-render-wait-ms": "20",
    "data-noria-timeline-item-mount-ms": "540",
    "data-noria-timeline-load-tasks": "44",
    "data-noria-timeline-load-events": "52",
    "data-noria-timeline-load-visible-events": "50",
    "data-noria-timeline-load-unplaced": "2",
    "data-noria-timeline-load-provider-errors": "0"
  };
  const root = {
    getAttribute(name) {
      return rootAttrs[name] ?? null;
    },
    classList: {
      contains(name) {
        return name === "noria-task-timeline-root";
      }
    }
  };
  const timelineNode = {
    getAttribute(name) {
      return nodeAttrs[name] ?? null;
    },
    closest(selector) {
      return selector === ".noria-task-timeline-root" ? root : null;
    }
  };
  const clipboardWrites = [];
  const plugin = makePlugin({
    window: {
      document: {
        visibilityState: "hidden",
        querySelectorAll(selector) {
          return selector === ".noria-task-timeline-root .noria-task-timeline-surface"
            ? [timelineNode]
            : [];
        }
      }
    },
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(String(text || ""));
        }
      }
    }
  });

  const summary = plugin.readTaskTimelinePerformanceSummary();
  assert.equal(summary.type, "task-timeline-performance-summary");
  assert.equal(summary.paneCount, 1);
  assert.equal(summary.environment.visibilityState, "hidden");
  assert.equal(summary.environment.backgroundThrottlingLikely, true);
  assert.equal(summary.panes[0].timings.taskSourceMs, 160);
  assert.equal(summary.panes[0].timings.traceGitMs, 82);
  assert.equal(summary.panes[0].timings.hostWaitMs, 40);
  assert.equal(summary.panes[0].timings.renderWaitMs, 20);
  assert.equal(summary.panes[0].timings.itemMountMs, 540);
  assert.equal(summary.panes[0].taskSource.state, "cold");
  assert.equal(summary.panes[0].taskSource.files, 42);
  assert.equal(summary.panes[0].taskSource.scopeFiles, 1116);
  assert.equal(summary.panes[0].taskSource.indexState, "metadata-cache");
  assert.equal(summary.panes[0].counts.visibleEvents, 50);

  const text = plugin.formatTaskTimelinePerformanceSummary(summary);
  assert.match(text, /Noria Task Timeline Performance/);
  assert.match(text, /environment: hidden, background throttling likely/);
  assert.match(text, /pane 1: ready, runtime 480ms, end-to-end 540ms, host wait 40ms, render wait 20ms, density normal, render ready, slowest task source 160ms/);
  assert.match(text, /phases: modules 80ms, task source 160ms, task model 20ms, provider source 90ms, provider model 30ms, mount 100ms/);
  assert.match(text, /details: task query 150ms, task fallback 0ms, data source 145ms, file enumerate 2ms, file read 136ms, task normalize 5ms, task filter 2ms, annotation 3ms, pomodoro 0ms, trace 88ms, trace git 82ms, trace cache 12ms, provider collect 22ms, provider filter 5ms, provider json 3ms/);
  assert.match(text, /task source: cold, files 42\/1116, index metadata-cache/);
  assert.match(text, /counts: tasks 44, events 50\/52, unplaced 2, provider errors 0/);

  const result = await plugin.copyTaskTimelinePerformanceSummary();
  assert.equal(result.ok, true);
  assert.equal(result.copied, true);
  assert.equal(clipboardWrites.length, 1);
  assert.match(clipboardWrites[0], /slowest task source 160ms/);

  rootAttrs["data-noria-timeline-render-state"] = "failed";
  rootAttrs["data-noria-timeline-render-error"] = "native mount failed";
  nodeAttrs["data-noria-timeline-load-state"] = "failed";
  nodeAttrs["data-noria-timeline-load-error"] = "native mount failed";
  delete nodeAttrs["data-noria-timeline-load-total-ms"];
  delete nodeAttrs["data-noria-timeline-load-modules-ms"];

  const failedSummary = plugin.readTaskTimelinePerformanceSummary();
  assert.equal(failedSummary.panes[0].timings.totalMs, null);
  const failedText = plugin.formatTaskTimelinePerformanceSummary(failedSummary);
  assert.match(failedText, /pane 1: failed, runtime --ms, end-to-end 540ms, host wait 40ms, render wait 20ms/);
  assert.match(failedText, /error: native mount failed/);
  const failedResult = await plugin.copyTaskTimelinePerformanceSummary();
  assert.equal(failedResult.ok, false);
  assert.equal(failedResult.copied, true, "failed diagnostics should remain copyable");
});

test("Task timeline performance measurement reloads the task timeline before copying the summary", async () => {
  const plugin = makePlugin();
  const calls = [];
  plugin.openTasksTimelineLeaf = async () => {
    calls.push("open");
  };
  plugin.reloadOpenNoriaViews = async (scope) => {
    calls.push(`reload:${scope}`);
  };
  plugin.copyTaskTimelinePerformanceSummary = async () => {
    calls.push("copy");
    return { ok: true, copied: true, text: "summary" };
  };

  const result = await plugin.measureTaskTimelinePerformanceSummary({ count: 2 });

  assert.deepEqual(calls, ["open", "reload:timeline", "reload:timeline", "copy"]);
  assert.deepEqual(plain(result), { ok: true, copied: true, text: "summary", sampled: 2 });
});

test("targeted Noria settings consume the requested tab before display", () => {
  const plugin = makePlugin();
  const observed = [];
  plugin.manifest = { id: "noria" };
  plugin.app.setting = {
    open() {
      observed.push(["open", plugin._settingsPreferredTab]);
    },
    openTabById(id) {
      observed.push([`tab:${id}`, plugin._settingsPreferredTab]);
    }
  };

  const result = plugin.openNoriaSettings("home");

  assert.deepEqual(plain(result), { ok: true, tab: "home" });
  assert.deepEqual(observed, [["open", "home"], ["tab:noria", "home"]]);

  const source = fs.readFileSync(path.join(pluginRoot, "src/main.js"), "utf8");
  const displayStart = source.indexOf("  display() {");
  const displayEnd = source.indexOf("\n  }\n}\n\nclass NoriaPlugin", displayStart);
  const displayBody = source.slice(displayStart, displayEnd);
  assert.match(displayBody, /const preferredTab = this\.plugin\._settingsPreferredTab/);
  assert.match(displayBody, /this\.plugin\._settingsPreferredTab = ""/);
  assert.match(displayBody, /this\.activeTab = this\.normalizeTabId\(preferredTab \|\| this\.activeTab\)/);
});

test("Home widget settings handoff records the exact widget before opening Home settings", () => {
  const plugin = makePlugin();
  const calls = [];
  plugin.openNoriaSettings = (tab) => {
    calls.push([tab, plugin._settingsHomeWidgetFocusId]);
    return { ok: true, tab };
  };

  const result = plugin.openHomeWidgetSettings("workbench");

  assert.deepEqual(calls, [["home", "workbench"]]);
  assert.deepEqual(plain(result), { ok: true, tab: "home", widgetId: "workbench" });
  assert.deepEqual(plain(plugin.openHomeWidgetSettings("")), { ok: false, error: "missing-widget-id" });
});

test("Home edit mode keeps chrome transient while persisting widget edits through existing schema helpers", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  const saves = [];
  const refreshes = [];
  plugin.saveSettings = async () => {
    saves.push("save");
  };
  plugin.requestNoriaRefresh = async (scope, reason, options) => {
    refreshes.push([scope, reason, options?.immediate === true]);
    return { ok: true };
  };

  assert.deepEqual(plain(await plugin.setHomeEditMode(true)), { ok: true, enabled: true });
  assert.equal(plugin._homeEditMode, true);
  assert.equal(saves.length, 0, "edit chrome state must not be persisted");

  const moved = await plugin.editHomeWidget({ widgetId: "projects-card", action: "move", value: "up" });
  assert.equal(moved.ok, true);
  assert.equal(moved.widgetId, "projects-card");
  assert.equal(saves.length, 1);

  const sized = await plugin.editHomeWidget({ widgetId: "projects-card", action: "size", value: "wide" });
  assert.equal(sized.widget.size, "wide");
  const hidden = await plugin.editHomeWidget({ widgetId: "projects-card", action: "enabled", value: false });
  assert.equal(hidden.widget.enabled, false);
  const restored = await plugin.editHomeWidget({ widgetId: "projects-card", action: "enabled", value: true });
  assert.equal(restored.widget.enabled, true);
  assert.deepEqual(refreshes.map((entry) => entry[0]), ["home", "home", "home", "home", "home"]);
  assert.ok(refreshes.every((entry) => entry[2] === true));

  assert.deepEqual(plain(await plugin.setHomeEditMode(false)), { ok: true, enabled: false });
  assert.equal(plugin._homeEditMode, false);
  assert.equal(saves.length, 4, "only schema edits should save settings");
});

test("Noria Calendar settings default to Noria paths and normalize custom values", () => {
  const plugin = makePlugin();
  const settings = plugin.normalizeSettings({});

  assert.equal(settings.features.modules.calendar, true);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.calendar, "calendarEnabled"), false);
  assert.equal(settings.calendar.calendarPlacement, "right-sidebar");
  assert.equal(settings.calendar.calendarConfirmBeforeCreate, false);
  assert.equal(settings.calendar.calendarIntegrationMode, "noria");
  assert.equal(settings.calendar.calendarRootFolder, "Noria/Diary");
  assert.equal(settings.calendar.calendarCustomFilePattern, "YYYY/YYYY-MM-DD");
  assert.equal(settings.calendar.calendarCustomWeekPattern, "gggg/gggg-[W]ww");
  assert.equal(settings.calendar.calendarCustomMonthPattern, "YYYY/YYYY-MM");
  assert.equal(settings.calendar.calendarCustomQuarterPattern, "YYYY/YYYY-[Q]Q");
  assert.equal(settings.calendar.calendarCustomYearPattern, "YYYY/YYYY");
  assert.equal(settings.calendar.calendarCustomFileTemplate, "Noria/Templates/Daily template.md");
  assert.equal(settings.calendar.calendarCustomWeekTemplate, "Noria/Templates/Weekly template.md");
  assert.equal(settings.calendar.calendarCustomMonthTemplate, "Noria/Templates/Monthly template.md");
  assert.equal(settings.calendar.calendarCustomQuarterTemplate, "");
  assert.equal(settings.calendar.calendarCustomYearTemplate, "Noria/Templates/Yearly template.md");

  const normalized = plugin.normalizeSettings({
    features: { modules: { calendar: false, obsoleteModule: true } },
    calendar: {
      calendarEnabled: false,
      calendarPlacement: "left-sidebar",
      calendarConfirmBeforeCreate: false,
      calendarLocale: " zh-CN ",
      calendarWeekendDays: "fri-sat",
      calendarMonthHeadingFormat: "numeric",
      calendarHighlightToday: false,
      calendarShowFeatureImage: false,
      calendarShowWeekNumber: false,
      calendarShowQuarter: true,
      calendarShowYearCalendar: true,
      calendarWeeksToShow: 99,
      calendarIntegrationMode: "notebook-navigator",
      calendarRootFolder: "/06_Diary/",
      calendarCustomFilePattern: "",
      calendarCustomWeekPattern: "YYYY/[Week]-ww",
      calendarCustomMonthPattern: "YYYY/MM",
      calendarCustomQuarterPattern: "YYYY/Q[Q]",
      calendarCustomYearPattern: "YYYY",
      calendarCustomFileTemplate: "/02_Areas/Templates/Daily Template.md",
      calendarCustomWeekTemplate: "02_Areas/Templates/Weekly Template.md",
      calendarCustomMonthTemplate: "02_Areas/Templates/Monthly Template.md",
      calendarCustomQuarterTemplate: "02_Areas/Templates/Quarter Template.md",
      calendarCustomYearTemplate: "02_Areas/Templates/Yearly Template.md"
    }
  });

  assert.equal(normalized.features.modules.calendar, false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.features.modules, "obsoleteModule"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.calendar, "calendarEnabled"), false);
  assert.equal(normalized.calendar.calendarPlacement, "right-sidebar");
  assert.equal(normalized.calendar.calendarConfirmBeforeCreate, false);
  assert.equal(normalized.calendar.calendarLocale, "zh-CN");
  assert.equal(normalized.calendar.calendarWeekendDays, "fri-sat");
  assert.equal(normalized.calendar.calendarMonthHeadingFormat, "numeric");
  assert.equal(normalized.calendar.calendarHighlightToday, false);
  assert.equal(normalized.calendar.calendarShowFeatureImage, false);
  assert.equal(normalized.calendar.calendarShowWeekNumber, false);
  assert.equal(normalized.calendar.calendarShowQuarter, true);
  assert.equal(normalized.calendar.calendarShowYearCalendar, true);
  assert.equal(normalized.calendar.calendarWeeksToShow, 5);
  assert.equal(normalized.calendar.calendarIntegrationMode, "noria");
  assert.equal(normalized.calendar.calendarRootFolder, "06_Diary");
  assert.equal(normalized.calendar.calendarCustomFilePattern, "YYYY/YYYY-MM-DD");
  assert.equal(normalized.calendar.calendarCustomWeekPattern, "YYYY/[Week]-ww");
  assert.equal(normalized.calendar.calendarCustomMonthPattern, "YYYY/MM");
  assert.equal(normalized.calendar.calendarCustomQuarterPattern, "YYYY/Q[Q]");
  assert.equal(normalized.calendar.calendarCustomYearPattern, "YYYY");
  assert.equal(normalized.calendar.calendarCustomFileTemplate, "02_Areas/Templates/Daily Template.md");
  assert.equal(normalized.calendar.calendarCustomQuarterTemplate, "02_Areas/Templates/Quarter Template.md");

  const explicitConfirm = plugin.normalizeSettings({ calendar: { calendarConfirmBeforeCreate: true } });
  assert.equal(explicitConfirm.calendar.calendarConfirmBeforeCreate, true);

  const legacyOnly = plugin.normalizeSettings({
    features: { modules: { navigationCalendar: false } },
    navigationCalendar: {
      calendarRootFolder: "Legacy/Diary",
      calendarIntegrationMode: "custom"
    }
  });
  assert.equal(legacyOnly.features.modules.calendar, true);
  assert.equal(Object.prototype.hasOwnProperty.call(legacyOnly.features.modules, "navigationCalendar"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(legacyOnly, "navigationCalendar"), false);
  assert.equal(legacyOnly.calendar.calendarRootFolder, "Noria/Diary");
  assert.equal(legacyOnly.calendar.calendarIntegrationMode, "noria");

  const legacyDisabled = plugin.normalizeSettings({ calendar: { calendarEnabled: false } });
  const moduleDisabled = plugin.normalizeSettings({
    features: { modules: { calendar: false } },
    calendar: { calendarEnabled: true }
  });
  const enabled = plugin.normalizeSettings({
    features: { modules: { calendar: true } },
    calendar: { calendarEnabled: true }
  });
  assert.equal(legacyDisabled.features.modules.calendar, false);
  assert.equal(moduleDisabled.features.modules.calendar, false);
  assert.equal(enabled.features.modules.calendar, true);
  assert.equal(plugin.settingsInputNeedsCanonicalSave({ calendar: { calendarEnabled: false } }), true);
  assert.equal(Object.prototype.hasOwnProperty.call(plugin.serializeSettingsForSave({ calendar: { calendarEnabled: false } }).calendar, "calendarEnabled"), false);
});

test("calendar opens missing notes directly by default and only confirms when enabled", async () => {
  let confirmCalls = 0;
  const plugin = makePlugin({
    window: {
      confirm() {
        confirmCalls += 1;
        return false;
      }
    }
  });
  const created = [];
  const opened = [];
  plugin.settings = plugin.normalizeSettings({});
  plugin.resolveCalendarNoteSpecAsync = async () => ({
    path: "Noria/Diary/2026/2026-07-25.md",
    period: "daily"
  });
  plugin.createCalendarNoteIfMissing = async (spec) => {
    created.push(spec.path);
    return { file: { path: spec.path }, created: true };
  };
  plugin.openCalendarNoteFile = async (pathValue) => {
    opened.push(pathValue);
    return { ok: true, path: pathValue };
  };
  plugin.requestNoriaRefresh = () => {};

  const direct = await plugin.openCalendarPeriodNote({ period: "daily", date: "2026-07-25" });
  assert.equal(direct.ok, true);
  assert.equal(confirmCalls, 0);
  assert.deepEqual(created, ["Noria/Diary/2026/2026-07-25.md"]);
  assert.deepEqual(opened, ["Noria/Diary/2026/2026-07-25.md"]);

  created.length = 0;
  opened.length = 0;
  plugin.settings.calendar.calendarConfirmBeforeCreate = true;
  const cancelled = await plugin.openCalendarPeriodNote({ period: "daily", date: "2026-07-25" });
  assert.deepEqual(plain(cancelled), {
    ok: false,
    cancelled: true,
    path: "Noria/Diary/2026/2026-07-25.md"
  });
  assert.equal(confirmCalls, 1);
  assert.deepEqual(created, []);
  assert.deepEqual(opened, []);
});

test("calendar missing-note creation is single-flight and never overwrites a concurrent file", async () => {
  const plugin = makePlugin();
  const files = new Map();
  let createCalls = 0;
  let modifyCalls = 0;
  plugin.app.vault = {
    getAbstractFileByPath(pathValue) {
      return files.get(pathValue) || null;
    },
    async create(pathValue, content) {
      createCalls += 1;
      await Promise.resolve();
      const file = { path: pathValue, content };
      files.set(pathValue, file);
      return file;
    },
    async modify() {
      modifyCalls += 1;
    }
  };
  plugin.ensureVaultParent = async () => {};
  plugin.buildCalendarNoteContent = async () => "# Daily\n";
  const spec = { path: "06_Diary/2026/2026-07-11.md", period: "daily" };

  const [first, second] = await Promise.all([
    plugin.createCalendarNoteIfMissing(spec),
    plugin.createCalendarNoteIfMissing(spec)
  ]);

  assert.equal(createCalls, 1);
  assert.equal(modifyCalls, 0);
  assert.equal(first.file.path, spec.path);
  assert.equal(second.file.path, spec.path);
  assert.equal(first.created, true);
  assert.equal(second.created, false);

  const existing = await plugin.createCalendarNoteIfMissing(spec);
  assert.equal(existing.created, false);
  assert.equal(createCalls, 1);
  assert.equal(modifyCalls, 0);
});

test("Noria Calendar resolves fresh periodic note paths from Noria patterns", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  assert.equal(
    plugin.resolveCalendarNoteSpec("daily", "2026-01-05").path,
    "Noria/Diary/2026/2026-01-05.md"
  );
  assert.equal(
    plugin.resolveCalendarNoteSpec("weekly", "2026-01-05").path,
    "Noria/Diary/2026/2026-W02.md"
  );
  assert.equal(
    plugin.resolveCalendarNoteSpec("monthly", "2026-01-05").path,
    "Noria/Diary/2026/2026-01.md"
  );
  assert.equal(
    plugin.resolveCalendarNoteSpec("quarterly", "2026-05-31").path,
    "Noria/Diary/2026/2026-Q2.md"
  );
  assert.equal(
    plugin.resolveCalendarNoteSpec("yearly", "2026-05-31").path,
    "Noria/Diary/2026/2026.md"
  );

  plugin.settings = plugin.normalizeSettings({
    calendar: {
      calendarIntegrationMode: "custom",
      calendarRootFolder: "06_Diary",
      calendarCustomFilePattern: "YYYY/MM/YYYY-MM-DD",
      calendarCustomWeekPattern: "YYYY/[weeks]/gggg-[W]ww"
    }
  });

  assert.equal(
    plugin.resolveCalendarNoteSpec("daily", "2026-01-05").path,
    "06_Diary/2026/01/2026-01-05.md"
  );
  assert.equal(
    plugin.resolveCalendarNoteSpec("weekly", "2026-01-05").path,
    "06_Diary/2026/weeks/2026-W02.md"
  );
});

test("Noria Calendar month model returns adaptive week windows", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  const getLocalYmd = plugin.getLocalYmd.bind(plugin);
  plugin.getLocalYmd = function fixedToday(input) {
    if (arguments.length === 0) return "2026-05-31";
    return getLocalYmd(input);
  };

  const compact = await plugin.getCalendarMonthModel({
    anchor: "2026-05",
    selectedDate: "2026-05-31",
    focusDate: "2026-05-31",
    visibleWeeks: 2
  });
  assert.equal(compact.fullWeeks, 5);
  assert.equal(compact.visibleWeeks, 2);
  assert.equal(compact.weekOffset, 3);
  assert.equal(compact.maxWeekOffset, 3);
  assert.equal(compact.days.length, 14);
  assert.equal(compact.windowStart, "2026-05-18");
  assert.equal(compact.windowEnd, "2026-05-31");
  assert.equal(compact.days.some((day) => day.today), true);

  const clamped = await plugin.getCalendarMonthModel({
    anchor: "2026-05",
    selectedDate: "2026-05-01",
    visibleWeeks: 2,
    weekOffset: 999
  });
  assert.equal(clamped.weekOffset, 3);
  assert.equal(clamped.windowStart, "2026-05-18");

  const full = await plugin.getCalendarMonthModel({
    anchor: "2026-05",
    selectedDate: "2026-05-31",
    visibleWeeks: 6
  });
  assert.equal(full.visibleWeeks, 5);
  assert.equal(full.weekOffset, 0);
  assert.equal(full.days.length, 35);
});

test("Noria Calendar picker models expose month and year note markers", async () => {
  const plugin = makePlugin({ language: "zh-CN" });
  plugin.settings = plugin.normalizeSettings({});
  const files = new Set([
    "Noria/Diary/2026/2026-05.md",
    "Noria/Diary/2026/2026.md"
  ]);
  plugin.app.vault.getAbstractFileByPath = (pathText) => files.has(String(pathText || "")) ? { path: String(pathText || ""), stat: {} } : null;

  const months = await plugin.getCalendarPickerModel({ mode: "months", anchor: "2026-05" });
  assert.equal(months.mode, "months");
  assert.equal(months.months.length, 12);
  assert.equal(months.months[4].label, "5月");
  assert.equal(months.months[4].exists, true);
  assert.equal(months.months[4].selected, true);
  assert.equal(months.months[5].exists, false);

  const years = await plugin.getCalendarPickerModel({ mode: "years", anchor: "2026-05", yearStart: 2018 });
  assert.equal(years.mode, "years");
  assert.equal(years.years.length, 16);
  assert.equal(years.startYear, 2018);
  assert.equal(years.endYear, 2033);
  assert.equal(years.years.find((item) => item.year === 2026).exists, true);
  assert.equal(years.years.find((item) => item.year === 2026).selected, true);
});

test("Noria Calendar date task writeback creates daily notes and uses start due fields", async () => {
  const plugin = makePlugin({ language: "zh-CN" });
  plugin.settings = plugin.normalizeSettings({});
  const files = new Map();
  const folders = new Set();
  plugin.app.vault = {
    adapter: {
      async exists(pathText) {
        return files.has(String(pathText || "")) || folders.has(String(pathText || ""));
      },
      async write(pathText, text) {
        files.set(String(pathText || ""), String(text || ""));
      },
      async read(pathText) {
        if (!files.has(String(pathText || ""))) throw new Error("missing");
        return files.get(String(pathText || ""));
      }
    },
    getAbstractFileByPath(pathText) {
      const pathValue = String(pathText || "");
      return files.has(pathValue) ? { path: pathValue, text: files.get(pathValue), stat: {} } : null;
    },
    async cachedRead(file) {
      return files.get(file.path) || file.text || "";
    },
    async createFolder(pathText) {
      folders.add(String(pathText || ""));
    },
    async create(pathText, text) {
      const pathValue = String(pathText || "");
      files.set(pathValue, String(text || ""));
      return { path: pathValue, text: String(text || "") };
    },
    async modify(file, text) {
      files.set(file.path, String(text || ""));
      file.text = String(text || "");
    }
  };

  const first = await plugin.addCalendarDateTask({ date: "2026-05-31", title: "写总结" });
  assert.equal(first.created, true);
  assert.equal(first.path, "Noria/Diary/2026/2026-05-31.md");
  let text = files.get("Noria/Diary/2026/2026-05-31.md");
  assert.match(text, /### 今日任务/);
  assert.match(text, /- \[ \] 写总结 \[start:: 2026-05-31\] \[due:: 2026-05-31\]/);
  assert.doesNotMatch(text, /scheduled::/);

  const second = await plugin.addCalendarDateTask({ date: "2026-05-31", title: "晚间推进", time: "23:45" });
  assert.equal(second.created, false);
  text = files.get("Noria/Diary/2026/2026-05-31.md");
  assert.match(text, /- \[ \] 晚间推进 \[start:: 2026-05-31 23:45\] \[due:: 2026-06-01 00:15\]/);
  assert.doesNotMatch(text, /scheduled::/);
});

test("Noria Calendar date task writeback preserves a concurrent diary edit", async () => {
  const plugin = makePlugin({ language: "zh-CN" });
  plugin.settings = plugin.normalizeSettings({});
  const diaryPath = "Noria/Diary/2026/2026-05-31.md";
  const files = new Map([[diaryPath, "## 待办\n\n### 今日任务\n\n- [ ] 已有任务\n"]]);
  let processCalls = 0;
  plugin.app.vault = {
    adapter: {
      async exists(pathText) { return files.has(String(pathText || "")); },
      async read(pathText) { return files.get(String(pathText || "")) || ""; },
      async write(pathText, text) { files.set(String(pathText || ""), String(text || "")); }
    },
    getAbstractFileByPath(pathText) {
      const pathValue = String(pathText || "");
      return files.has(pathValue) ? { path: pathValue, stat: {} } : null;
    },
    async cachedRead(file) { return files.get(file.path) || ""; },
    async modify(file, text) { files.set(file.path, String(text || "")); },
    async process(file, transform) {
      processCalls += 1;
      const concurrent = `${files.get(file.path) || ""}- 并发编辑\n`;
      files.set(file.path, String(transform(concurrent) || ""));
    }
  };

  await plugin.addCalendarDateTask({ date: "2026-05-31", title: "新增任务" });

  assert.equal(processCalls, 1);
  assert.match(files.get(diaryPath), /- 并发编辑/);
  assert.match(files.get(diaryPath), /- \[ \] 新增任务/);
});

test("Noria Calendar date task writeback preserves English task headings", () => {
  const plugin = makePlugin({ language: "en" });
  plugin.settings = plugin.normalizeSettings({});
  const taskLine = "- [ ] Draft release note [start:: 2026-05-31] [due:: 2026-05-31]";

  const existing = plugin.insertCalendarTaskLine("## Tasks\n\n", taskLine);
  assert.match(existing, /^## Tasks$/m);
  assert.match(existing, /^### Today tasks$/m);
  assert.doesNotMatch(existing, /^### 今日任务$/m);

  const empty = plugin.insertCalendarTaskLine("", taskLine);
  assert.match(empty, /^## Tasks$/m);
  assert.match(empty, /^### Today tasks$/m);
  assert.doesNotMatch(empty, /^## 待办$/m);
});

test("Home quick capture writes today's diary Inbox through shared diary block helper", async () => {
  const plugin = makePlugin({ language: "zh-CN" });
  plugin.settings = plugin.normalizeSettings({});
  const files = new Map();
  const folders = new Set();
  plugin.app.vault = {
    adapter: {
      async exists(pathText) {
        return files.has(String(pathText || "")) || folders.has(String(pathText || ""));
      },
      async write(pathText, text) {
        files.set(String(pathText || ""), String(text || ""));
      },
      async read(pathText) {
        if (!files.has(String(pathText || ""))) throw new Error("missing");
        return files.get(String(pathText || ""));
      }
    },
    getAbstractFileByPath(pathText) {
      const pathValue = String(pathText || "");
      return files.has(pathValue) ? { path: pathValue, text: files.get(pathValue), stat: {} } : null;
    },
    async cachedRead(file) {
      return files.get(file.path) || file.text || "";
    },
    async createFolder(pathText) {
      folders.add(String(pathText || ""));
    },
    async create(pathText, text) {
      const pathValue = String(pathText || "");
      files.set(pathValue, String(text || ""));
      return { path: pathValue, text: String(text || "") };
    },
    async modify(file, text) {
      files.set(file.path, String(text || ""));
      file.text = String(text || "");
    }
  };

  const result = await plugin.appendHomeQuickCapture({
    text: "整理 Dashboard 操作台",
    target: "diary-inbox",
    date: "2026-06-08",
    now: "2026-06-08T09:05:00"
  });

  assert.equal(result.ok, true);
  assert.equal(result.path, "Noria/Diary/2026/2026-06-08.md");
  const text = files.get("Noria/Diary/2026/2026-06-08.md");
  assert.match(text, /## Inbox\n\n- \[09:05\] 整理 Dashboard 操作台\n/);

  const taskResult = await plugin.appendHomeQuickCapture({
    text: "推进 Home 捕获命令条",
    target: "today-task",
    date: "2026-06-08"
  });

  assert.equal(taskResult.ok, true);
  assert.equal(taskResult.target, "today-task");
  const taskText = files.get("Noria/Diary/2026/2026-06-08.md");
  assert.match(taskText, /### 今日任务[\s\S]*- \[ \] 推进 Home 捕获命令条 \[start:: 2026-06-08\] \[due:: 2026-06-08\]/);
});

test("Home quick capture processes the latest diary text without overwriting a concurrent edit", async () => {
  const plugin = makePlugin({ language: "zh-CN" });
  plugin.settings = plugin.normalizeSettings({});
  const diaryPath = "Noria/Diary/2026/2026-06-08.md";
  const files = new Map([[diaryPath, "## Inbox\n\n- 已有记录\n"]]);
  let processCalls = 0;
  plugin.app.vault = {
    adapter: {
      async exists(pathText) {
        return files.has(String(pathText || ""));
      },
      async write(pathText, text) {
        files.set(String(pathText || ""), String(text || ""));
      },
      async read(pathText) {
        return files.get(String(pathText || "")) || "";
      }
    },
    getAbstractFileByPath(pathText) {
      const pathValue = String(pathText || "");
      return files.has(pathValue) ? { path: pathValue, stat: {} } : null;
    },
    async cachedRead(file) {
      return files.get(file.path) || "";
    },
    async modify(file, text) {
      files.set(file.path, String(text || ""));
    },
    async process(file, transform) {
      processCalls += 1;
      const concurrent = `${files.get(file.path) || ""}- 并发新增\n`;
      files.set(file.path, concurrent);
      files.set(file.path, String(transform(concurrent) || ""));
    }
  };

  const result = await plugin.appendHomeQuickCapture({
    text: "事务式捕捉",
    target: "diary-inbox",
    date: "2026-06-08",
    now: "2026-06-08T10:30:00"
  });

  assert.equal(result.ok, true);
  assert.equal(processCalls, 1);
  assert.match(files.get(diaryPath), /- 并发新增/);
  assert.match(files.get(diaryPath), /- \[10:30\] 事务式捕捉/);
});

test("Noria Calendar runtime view parses and calls the bridge API", () => {
  const source = fs.readFileSync(pluginPath("src/runtime/views/calendar/view.js"), "utf8");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  assert.doesNotThrow(() => new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", "setIcon", source));
  assert.match(source, /getMonthModel/);
  assert.match(source, /openPeriodNote/);
  assert.match(source, /getPickerModel/);
  assert.match(source, /addDateTask/);
  assert.match(source, /contextmenu/);
  assert.match(source, /noria-calendar-task-panel/);
  assert.match(source, /formatTaskDateHeading/);
  assert.match(source, /formatTaskTimeRange/);
  assert.match(source, /wheelTaskTime/);
  assert.match(source, /toggleTaskTimePicker/);
  assert.match(source, /addEventListener\("mousedown"/);
  assert.doesNotMatch(source, /runtime\.calendar\.addTaskForDate/);
  assert.match(source, /noria-calendar-picker--months/);
  assert.match(source, /noria-calendar-picker--years/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /addEventListener\("wheel"/);
  assert.match(source, /visibleWeeks/);
  assert.match(source, /weekOffset/);
  assert.match(source, /noria-calendar-root/);
  assert.doesNotMatch(source, /noria-nav-results|runtime\.calendar\.selectedDate|runtime\.calendar\.noResults/);
});

test("runtime bridge exposes shared helpers for native runtime views", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  let quickCaptureRequest = null;
  plugin.appendHomeQuickCapture = async (request = {}) => {
    quickCaptureRequest = { ...request };
    return { ok: true, path: "Noria/Diary/2026/2026-06-08.md" };
  };
  const bridgeCalls = [];
  plugin.openCalendarPeriodNote = async (request = {}) => {
    bridgeCalls.push({ method: "openCalendarPeriodNote", request: { ...request } });
    return { ok: true, path: "06_Diary/2026/2026-06-09.md" };
  };
  plugin.openTaskBoardDay = async (date) => {
    bridgeCalls.push({ method: "openTaskBoardDay", date: date || "" });
    return { ok: true };
  };
  plugin.openTasksTimelineLeaf = async () => {
    bridgeCalls.push({ method: "openTasksTimelineLeaf" });
    return { ok: true };
  };
  plugin.openCalendarLeaf = async () => {
    bridgeCalls.push({ method: "openCalendarLeaf" });
    return { ok: true };
  };

  const bridge = plugin.buildRuntimeBridgeConfig();
  const iterable = new Set(["x", "y"]);
  const dataArray = { array: () => ["a", "b"] };

  assert.equal(typeof bridge.runtime.toArray, "function");
  assert.equal(typeof bridge.runtime.emptyState, "function");
  assert.equal(typeof bridge.runtime.notice, "function");
  assert.equal(typeof bridge.runtime.openSetupWizard, "function");
  assert.equal(typeof bridge.runtime.scopeStatus, "function");
  assert.equal(typeof bridge.runtime.pagesForScope, "function");
  assert.equal(typeof bridge.runtime.tasksForScope, "function");
  assert.equal(typeof bridge.runtime.pagesForManagedPath, "function");
  assert.equal(typeof bridge.runtime.displayLabel, "function");
  assert.equal(typeof bridge.quickCapture.append, "function");
  assert.equal(typeof bridge.openDailyNote, "function");
  assert.equal(typeof bridge.openTaskBoardDay, "function");
  assert.equal(typeof bridge.openTasksTimeline, "function");
  assert.equal(typeof bridge.openCalendar, "function");
  assert.deepEqual(await bridge.quickCapture.append({ text: "Bridge capture", target: "diary-inbox" }), {
    ok: true,
    path: "Noria/Diary/2026/2026-06-08.md"
  });
  assert.deepEqual(await bridge.openDailyNote({ source: "test" }), { ok: true, path: "06_Diary/2026/2026-06-09.md" });
  assert.deepEqual(await bridge.openTaskBoardDay("2026-06-09"), { ok: true });
  assert.deepEqual(await bridge.openTasksTimeline({ source: "test" }), { ok: true });
  assert.deepEqual(await bridge.openCalendar({ source: "test" }), { ok: true });
  assert.deepEqual(quickCaptureRequest, { text: "Bridge capture", target: "diary-inbox" });
  assert.deepEqual(bridgeCalls, [
    { method: "openCalendarPeriodNote", request: { source: "test", period: "daily" } },
    { method: "openTaskBoardDay", date: "2026-06-09" },
    { method: "openTasksTimelineLeaf" },
    { method: "openCalendarLeaf" }
  ]);
  assert.deepEqual(plain(bridge.runtime.toArray([1, 2])), [1, 2]);
  assert.deepEqual(plain(bridge.runtime.toArray(dataArray)), ["a", "b"]);
  assert.deepEqual(plain(bridge.runtime.toArray(iterable)), ["x", "y"]);
  assert.equal(bridge.runtime.scopeStatus("notes").mode, "all");
  assert.equal(bridge.runtime.scopeStatus("tasks").mode, "managed");
  assert.equal(bridge.runtime.scopeStatus("tasks").isEmpty, false);
  assert.equal(bridge.runtime.openSetupWizard().ok, true);
});

test("runtime display labels localize legacy data values without changing raw note values", () => {
  const enPlugin = makePlugin({ language: "en" });
  enPlugin.settings = enPlugin.normalizeSettings({});
  const enBridge = enPlugin.buildRuntimeBridgeConfig();

  assert.equal(enBridge.weather.locale, "en");
  assert.equal(enBridge.runtime.displayLabel("weather", "晴", "晴"), "Clear");
  assert.equal(enBridge.runtime.displayLabel("weather", "暴晒", "暴晒"), "Scorching");
  assert.equal(enBridge.runtime.displayLabel("mood", "很好", "很好"), "Great");
  assert.equal(enBridge.runtime.displayLabel("weekday", "一", "一"), "Mon");
  assert.equal(enBridge.runtime.displayLabel("metric", "总量", "总量"), "Total");
  assert.equal(enBridge.runtime.displayLabel("weather", "未知天气", "未知天气"), "未知天气");

  const zhPlugin = makePlugin({ language: "zh-CN" });
  zhPlugin.settings = zhPlugin.normalizeSettings({});
  const zhBridge = zhPlugin.buildRuntimeBridgeConfig();

  assert.equal(zhBridge.weather.locale, "zh");
  assert.equal(zhBridge.runtime.displayLabel("weather", "晴", "晴"), "晴");
  assert.equal(zhBridge.runtime.displayLabel("mood", "很好", "很好"), "很好");
  assert.equal(zhBridge.runtime.displayLabel("weekday", "一", "一"), "一");
});

test("runtime query helpers return plain arrays for scoped and managed-path native reads", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({
    managedPaths: {
      diaryRoot: "06_Diary",
      projectsRoot: "01_Projects",
      inboxRoot: "00_Inbox"
    }
  });
  const files = [
    {
      path: "06_Diary/2026/2026-05-03.md",
      text: "- [ ] daily task\n",
      stat: { ctime: Date.parse("2026-05-03T08:00:00Z"), mtime: Date.parse("2026-05-03T09:00:00Z") },
      listItems: [{ task: " ", text: "daily task", position: { start: { line: 0 } } }]
    },
    {
      path: "06_Diary/2026/2026-05-03-review.md",
      text: "- [ ] review task\n",
      stat: { ctime: Date.parse("2026-05-03T08:00:00Z"), mtime: Date.parse("2026-05-03T09:00:00Z") },
      listItems: [{ task: " ", text: "review task", position: { start: { line: 0 } } }]
    },
    {
      path: "01_Projects/demo.md",
      text: "- [x] project task\n",
      stat: { ctime: Date.parse("2026-05-03T08:00:00Z"), mtime: Date.parse("2026-05-03T09:00:00Z") },
      listItems: [{ task: "x", text: "project task", position: { start: { line: 0 } } }]
    },
    {
      path: "00_Inbox/capture.md",
      text: "Inbox note\n",
      stat: { ctime: Date.parse("2026-05-03T08:00:00Z"), mtime: Date.parse("2026-05-03T09:00:00Z") },
      listItems: []
    }
  ];
  plugin.app.vault.getMarkdownFiles = () => files;
  plugin.app.vault.cachedRead = async (file) => String(file?.text || "");
  plugin.app.vault.getAbstractFileByPath = (pathText) => files.find((file) => file.path === pathText) || null;
  plugin.app.metadataCache = {
    getFileCache(file) {
      return {
        frontmatter: file?.frontmatter || {},
        listItems: file?.listItems || []
      };
    }
  };

  const bridge = plugin.buildRuntimeBridgeConfig();

  const taskPages = bridge.runtime.pagesForScope("tasks");
  const taskRows = await bridge.runtime.tasksForScope("tasks");
  const inboxPages = bridge.runtime.pagesForManagedPath("inboxRoot");
  const missingPages = bridge.runtime.pagesForManagedPath("notAPath");

  assert.equal(Array.isArray(taskPages), true);
  assert.equal(Array.isArray(taskRows), true);
  assert.equal(Array.isArray(inboxPages), true);
  assert.equal(Array.isArray(missingPages), true);
  assert.equal(taskRows.length, 2);
  assert.deepEqual(plain(taskRows.map((task) => task.text)), ["daily task", "project task"]);
  assert.deepEqual(plain(taskPages.map((page) => page.file.path)), ["06_Diary/2026/2026-05-03.md", "01_Projects/demo.md", "00_Inbox/capture.md"]);
  assert.deepEqual(plain(inboxPages.map((page) => page.file.path)), ["00_Inbox/capture.md"]);
  assert.deepEqual(plain(missingPages), []);
});

test("runtime bridge sync is silent unless refresh is explicitly requested", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  const result = plugin.syncRuntimeBridgeConfig();

  assert.equal(plugin.__getTriggers().triggerCount, 0);
  assert.equal(result.ok, true);
  assert.equal(result.refreshed, false);
});

test("local refresh scopes do not trigger global workspace events by default", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({ performance: { refreshDebounceMs: 20 } });

  await plugin.requestNoriaRefresh("home", "unit-test", { immediate: true });
  assert.deepEqual(plugin.__getTriggers().triggers, []);

  await plugin.requestNoriaRefresh("tasks", "unit-test", { immediate: true });
  assert.deepEqual(plugin.__getTriggers().triggers, []);
});

test("refresh bus coalesces duplicate immediate requests", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({ performance: { refreshDebounceMs: 20 } });

  await plugin.requestNoriaRefresh("tasks", "same", { immediate: true });
  await plugin.requestNoriaRefresh("tasks", "same", { immediate: true });

  assert.deepEqual(plugin.__getTriggers().triggers, []);
});

test("plugin unload cancels queued refresh work and stale callbacks cannot reload views", async () => {
  const timers = [];
  const plugin = makePlugin({ timers });
  plugin.settings = plugin.normalizeSettings({ performance: { refreshDebounceMs: 20 } });
  plugin._noriaPluginDisposed = false;
  plugin._noriaRuntimeOwnerToken = null;
  let invalidations = 0;
  let reloads = 0;
  plugin.invalidateTaskSnapshots = () => {
    invalidations += 1;
  };
  plugin.createDataService = async () => ({
    invalidate() {
      invalidations += 1;
    }
  });
  plugin.reloadOpenNoriaViews = async () => {
    reloads += 1;
  };

  const queued = plugin.requestNoriaRefresh("home", "unit-test");
  assert.equal(queued.queued, true);
  assert.equal(timers.length, 1);

  plugin.onunload();

  assert.equal(timers[0].cleared, true);
  assert.equal(plugin._noriaRefreshTimer, null);
  assert.equal(plugin._noriaRefreshPending, null);

  await timers[0].fn();
  assert.equal(invalidations, 0);
  assert.equal(reloads, 0);

  const afterUnload = plugin.requestNoriaRefresh("home", "after-unload");
  assert.equal(afterUnload.skipped, true);
  assert.equal(timers.length, 1);

  const staleTimers = [];
  const stalePlugin = makePlugin({ timers: staleTimers });
  stalePlugin.settings = stalePlugin.normalizeSettings({ performance: { refreshDebounceMs: 20 } });
  stalePlugin._noriaPluginDisposed = false;
  let ownerActive = true;
  stalePlugin.isNoriaRecoveryOwnerActive = () => ownerActive;
  stalePlugin.invalidateTaskSnapshots = () => {
    invalidations += 1;
  };
  stalePlugin.createDataService = async () => ({
    invalidate() {
      invalidations += 1;
    }
  });
  stalePlugin.reloadOpenNoriaViews = async () => {
    reloads += 1;
  };

  stalePlugin.requestNoriaRefresh("tasks", "old-owner");
  ownerActive = false;
  await staleTimers[0].fn();
  assert.equal(invalidations, 0);
  assert.equal(reloads, 0);
});

test("task snapshot cache keys include task query scope but not note scope", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  const defaultKey = plugin.getTaskSnapshotCacheKey({ scopeId: "tasks", view: "week" });

  plugin.settings = plugin.normalizeSettings({
    performance: {
      queryScopes: {
        notes: { mode: "custom", customRoots: ["03_Resources"] }
      }
    }
  });
  assert.equal(plugin.getTaskSnapshotCacheKey({ scopeId: "tasks", view: "week" }), defaultKey);

  plugin.settings = plugin.normalizeSettings({
    performance: {
      queryScopes: {
        tasks: { mode: "custom", customRoots: ["06_Diary"] }
      }
    }
  });
  assert.notEqual(plugin.getTaskSnapshotCacheKey({ scopeId: "tasks", view: "week" }), defaultKey);
});

test("home leaf open sets view state for new leaves only", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  let reloads = 0;
  let setViewStates = 0;
  const leaf = {
    view: {
      reload() {
        reloads += 1;
      }
    },
    async setViewState() {
      setViewStates += 1;
    }
  };
  plugin.pickLeafForView = () => ({ leaf, hadExisting: false });

  await plugin.openDashboardHomeLeaf();
  assert.equal(setViewStates, 1);
  assert.equal(reloads, 0);
});

test("home leaf open reveals a healthy existing leaf without rerender or delayed recovery", async () => {
  const timers = [];
  const plugin = makePlugin({ timers });
  plugin.settings = plugin.normalizeSettings({});
  let reloads = 0;
  let setViewStates = 0;
  const leaf = {
    view: {
      hostEl: {
        querySelector(selector) {
          if (selector === ".dashboard-home-root") return {};
          if (selector === ".noria-itemview-error") return null;
          return null;
        }
      },
      reload() {
        reloads += 1;
      }
    },
    async setViewState() {
      setViewStates += 1;
    }
  };
  plugin.pickLeafForView = () => ({ leaf, hadExisting: true });

  await plugin.openDashboardHomeLeaf();
  assert.equal(setViewStates, 0);
  assert.equal(reloads, 0);
  assert.equal(timers.length, 0);
});

test("home leaf open reloads an unhealthy restored leaf once", async () => {
  const timers = [];
  const plugin = makePlugin({ timers });
  plugin.settings = plugin.normalizeSettings({});
  let reloads = 0;
  let hasRoot = false;
  let hasError = false;
  let isRendering = false;
  let setViewStates = 0;
  const leaf = {
    view: {
      _homeRenderInFlight: false,
      hostEl: {
        querySelector(selector) {
          if (selector === ".dashboard-home-root") return hasRoot ? {} : null;
          if (selector === ".noria-itemview-error") return hasError ? {} : null;
          return null;
        },
        getAttribute(name) {
          if (name === "data-noria-home-rendering") return isRendering ? "1" : null;
          return null;
        }
      },
      reload() {
        reloads += 1;
      }
    },
    async setViewState() {
      setViewStates += 1;
    }
  };
  plugin.pickLeafForView = () => ({ leaf, hadExisting: true });

  await plugin.openDashboardHomeLeaf();
  assert.equal(setViewStates, 1);
  assert.equal(reloads, 0);
  assert.equal(timers.length, 1);
  await timers[0].fn();
  assert.equal(reloads, 1);

  reloads = 0;
  hasRoot = true;
  await plugin.openDashboardHomeLeaf();
  assert.equal(setViewStates, 1);
  assert.equal(reloads, 0);
  assert.equal(timers.length, 1);
  assert.equal(reloads, 0);

  hasRoot = false;
  hasError = true;
  await plugin.openDashboardHomeLeaf();
  assert.equal(timers.length, 1);
  assert.equal(reloads, 0);

  hasError = false;
  isRendering = true;
  await plugin.openDashboardHomeLeaf();
  assert.equal(timers.length, 1);
  assert.equal(reloads, 0);
});

test("home startup recovery reloads visible and active empty leaves without mounting hidden Home", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  const reloads = { visible: 0, active: 0, healthy: 0, hidden: 0 };
  const visibleContainer = {
    isConnected: true,
    getBoundingClientRect() { return { width: 720, height: 560 }; }
  };
  const hiddenContainer = {
    isConnected: true,
    getBoundingClientRect() { return { width: 0, height: 0 }; }
  };
  const healthyHost = {
    isConnected: true,
    getBoundingClientRect() { return { width: 720, height: 560 }; },
    querySelector(selector) { return selector === ".dashboard-home-root" ? {} : null; },
    getAttribute() { return null; }
  };
  const visibleLeaf = { view: { hostEl: null, containerEl: visibleContainer, async reload() { reloads.visible += 1; } } };
  const activeLeaf = { view: { hostEl: null, containerEl: hiddenContainer, async reload() { reloads.active += 1; } } };
  const healthyLeaf = { view: { hostEl: healthyHost, containerEl: visibleContainer, async reload() { reloads.healthy += 1; } } };
  const hiddenLeaf = { view: { hostEl: null, containerEl: hiddenContainer, async reload() { reloads.hidden += 1; } } };
  plugin.app.workspace.activeLeaf = activeLeaf;
  plugin.app.workspace.getLeavesOfType = () => [visibleLeaf, activeLeaf, healthyLeaf, hiddenLeaf];

  await plugin.runHomeLeavesStartupRecovery();

  assert.deepEqual(reloads, { visible: 1, active: 1, healthy: 0, hidden: 0 });
});

test("Home onOpen defers full runtime for hidden restored tabs", () => {
  const source = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const classStart = source.indexOf("class NoriaHomeView");
  const classEnd = source.indexOf("class NoriaCalendarView", classStart);
  const homeView = source.slice(classStart, classEnd);

  assert.ok(classStart > 0 && classEnd > classStart);
  assert.match(homeView, /activeLeaf/);
  assert.match(homeView, /noriaElementIsVisibleEnough/);
  assert.match(homeView, /data-noria-home-deferred/);
});

test("task board startup recovery reloads only visible unhealthy restored leaves", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  const reloads = { unhealthy: 0, healthy: 0, hidden: 0 };
  const visibleContainer = {
    isConnected: true,
    getBoundingClientRect() {
      return { width: 640, height: 480 };
    }
  };
  const healthyHost = {
    isConnected: true,
    getBoundingClientRect() {
      return { width: 640, height: 480 };
    },
    querySelector(selector) {
      return String(selector).includes(".tasksCalendar") ? {} : null;
    }
  };
  const hiddenContainer = {
    isConnected: true,
    getBoundingClientRect() {
      return { width: 0, height: 0 };
    }
  };
  const leaves = [
    {
      view: {
        hostEl: null,
        containerEl: visibleContainer,
        async reload() {
          reloads.unhealthy += 1;
        }
      }
    },
    {
      view: {
        hostEl: healthyHost,
        containerEl: visibleContainer,
        async reload() {
          reloads.healthy += 1;
        }
      }
    },
    {
      view: {
        hostEl: null,
        containerEl: hiddenContainer,
        async reload() {
          reloads.hidden += 1;
        }
      }
    }
  ];
  plugin.app.workspace.getLeavesOfType = () => leaves;

  await plugin.runTasksBoardLeavesStartupRecovery();

  assert.deepEqual(reloads, { unhealthy: 1, healthy: 0, hidden: 0 });
});

test("layout-ready recovery schedules task board checks on restored and activated leaves", () => {
  const source = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = source.indexOf("this.app.workspace.onLayoutReady(() => {");
  const end = source.indexOf("\n    });\n  }", start);
  const layoutReady = source.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(layoutReady, /scheduleTasksBoardRecoveryTick\(\d+\)/);
  assert.match(layoutReady, /active-leaf-change[\s\S]{0,260}scheduleTasksBoardRecoveryTick/);
  assert.match(layoutReady, /layout-change[\s\S]{0,260}scheduleTasksBoardRecoveryTick/);
  assert.match(layoutReady, /scheduleHomeRecoveryTick\(\d+\)/);
  assert.match(layoutReady, /active-leaf-change[\s\S]{0,320}scheduleHomeRecoveryTick/);
  assert.match(layoutReady, /layout-change[\s\S]{0,320}scheduleHomeRecoveryTick/);
});

test("layout-ready recovery timers are plugin-owned instead of detached window timers", () => {
  const source = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = source.indexOf("this.app.workspace.onLayoutReady(() => {");
  const end = source.indexOf("\n    });\n  }", start);
  const layoutReady = source.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(layoutReady, /window\.setTimeout\(/);
  assert.match(layoutReady, /scheduleNoriaRecoveryTimer\(homeTick,/);
  assert.match(layoutReady, /scheduleNoriaRecoveryTimer\(tasksBoardTick,/);
  assert.match(layoutReady, /scheduleNoriaRecoveryTimer\(tick,/);
  assert.match(layoutReady, /scheduleNoriaRecoveryTimer\(coldRefresh,/);
});

test("plugin recovery timer ownership suppresses stale callbacks and clears before owner bailout", async () => {
  const timers = [];
  const windowTimers = [];
  const plugin = makePlugin({
    timers,
    window: {
      setTimeout(fn, delay) {
        windowTimers.push({ fn, delay, cleared: false });
        return windowTimers.length;
      },
      clearTimeout(id) {
        if (windowTimers[id - 1]) windowTimers[id - 1].cleared = true;
      }
    }
  });
  plugin._noriaPluginDisposed = false;
  plugin._noriaStartupRecoveryTimers = new Set();
  plugin._noriaRuntimeOwnerToken = {};
  plugin.isNoriaRecoveryOwnerActive = () => true;
  let calls = 0;

  const completedTimer = plugin.scheduleNoriaRecoveryTimer(() => {
    calls += 1;
  }, 120);
  assert.equal(windowTimers[0].delay, 120);
  assert.equal(plugin._noriaStartupRecoveryTimers.has(completedTimer), true);
  await windowTimers[0].fn();
  assert.equal(calls, 1);
  assert.equal(plugin._noriaStartupRecoveryTimers.has(completedTimer), false);

  plugin.isNoriaRecoveryOwnerActive = () => false;
  plugin.scheduleNoriaRecoveryTimer(() => {
    calls += 1;
  }, 240);
  await windowTimers[1].fn();
  assert.equal(calls, 1);

  plugin.isNoriaRecoveryOwnerActive = () => true;
  const pendingTimer = plugin.scheduleNoriaRecoveryTimer(() => {
    calls += 1;
  }, 400);
  assert.equal(plugin._noriaStartupRecoveryTimers.has(pendingTimer), true);
  plugin.onunload();
  assert.equal(plugin._noriaPluginDisposed, true);
  assert.equal(windowTimers[2].cleared, true);
  assert.equal(plugin._noriaStartupRecoveryTimers.size, 0);
});

test("ribbon storage keys use the current manifest id and locale title", () => {
  const zhPlugin = makePlugin({ language: "zh-CN" });
  zhPlugin.manifest = { id: "noria" };
  zhPlugin.settings = zhPlugin.normalizeSettings({});
  const enPlugin = makePlugin({ language: "en" });
  enPlugin.manifest = { id: "noria" };
  enPlugin.settings = enPlugin.normalizeSettings({});

  const zhKeys = zhPlugin.getEnabledCoreRibbonSpecs().map((spec) => zhPlugin.getRibbonStorageKey(spec));
  const enKeys = enPlugin.getEnabledCoreRibbonSpecs().map((spec) => enPlugin.getRibbonStorageKey(spec));

  assert.deepEqual(plain(zhKeys), ["noria:主页", "noria:任务看板", "noria:任务时间轴", "noria:日历"]);
  assert.deepEqual(plain(enKeys), ["noria:Home", "noria:Tasks board", "noria:Task timeline", "noria:Calendar"]);
});

test("ribbon storage keys fall back to the public Noria id when manifest is unset", () => {
  const plugin = makePlugin({ language: "en" });
  plugin.manifest = undefined;
  plugin.settings = plugin.normalizeSettings({});

  const keys = plugin.getEnabledCoreRibbonSpecs().map((spec) => plugin.getRibbonStorageKey(spec));

  assert.deepEqual(plain(keys), [
    "noria:Home",
    "noria:Tasks board",
    "noria:Task timeline",
    "noria:Calendar"
  ]);
});

test("ribbon ordering recognizes only current storage and logical keys", () => {
  const plugin = makePlugin({ language: "en" });
  plugin.manifest = { id: "noria" };
  plugin.settings = plugin.normalizeSettings({});

  assert.deepEqual(
    plain(plugin.getOrderedCoreRibbonSpecs().map((spec) => spec.key)),
    ["noria:home", "noria:tasks", "noria:task-timeline", "noria:calendar"]
  );

  plugin.app.workspace.leftRibbon = {
    hiddenItems: {
      "noria:calendar": false,
      "noria:Task timeline": false,
      "noria:Home": false,
      "noria:tasks": false
    }
  };
  assert.deepEqual(
    plain(plugin.getOrderedCoreRibbonSpecs().map((spec) => spec.key)),
    ["noria:calendar", "noria:task-timeline", "noria:home", "noria:tasks"]
  );
});

test("ribbon registration uses the custom Home mark or only its house fallback", () => {
  const plugin = makePlugin({ language: "en" });
  plugin.manifest = { id: "noria" };
  plugin.settings = plugin.normalizeSettings({});
  const icons = [];
  plugin.addRibbonIcon = (icon) => icons.push(icon);

  plugin._noriaHomeIconRegistered = true;
  plugin.registerCoreRibbons();
  assert.deepEqual(icons, ["noria-home", "list-checks", "chart-gantt", "calendar-days"]);

  icons.length = 0;
  plugin._noriaHomeIconRegistered = false;
  plugin.registerCoreRibbons();
  assert.deepEqual(icons, ["house", "list-checks", "chart-gantt", "calendar-days"]);
});

test("MOC settings keep rich entries and compatibility paths synchronized", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const saved = [];
  plugin.settings = plugin.normalizeSettings({
    homeDashboard: {
      mocEntries: [{ path: "05_MOC/Old·MOC.md", color: "#ABCDEF" }],
      mocEntryPaths: ["05_MOC/stale.md"]
    }
  });
  plugin.saveSettings = async () => { saved.push(plain(plugin.settings.homeDashboard)); };
  plugin.requestNoriaRefresh = () => {};

  const result = await plugin.setMocEntries([
    { path: "/05_MOC/Research·MOC.md", color: "#10B981" },
    { path: "05_MOC/Research·MOC.md", color: "#ffffff" },
    { path: "05_MOC/Writing.canvas", color: "invalid" }
  ]);

  assert.deepEqual(plain(result.entries), [
    { path: "05_MOC/Research·MOC.md", color: "#10b981" },
    { path: "05_MOC/Writing.canvas", color: "" }
  ]);
  assert.deepEqual(plain(plugin.settings.homeDashboard.mocEntryPaths), [
    "05_MOC/Research·MOC.md",
    "05_MOC/Writing.canvas"
  ]);
  assert.equal(saved.length, 1);
});

test("Home settings render an ordered MOC entry manager instead of a raw textarea", () => {
  const source = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const managerSource = source.slice(
    source.indexOf("renderMocEntrySettings(containerEl)"),
    source.indexOf("renderHomeTab(containerEl)")
  );

  assert.match(source, /renderMocEntrySettings\(containerEl\)/);
  assert.match(source, /noria-moc-entry-manager/);
  assert.match(source, /data-noria-moc-entry-path/);
  assert.match(source, /settings\.home\.mocEntryAdd/);
  assert.match(source, /settings\.home\.mocEntryMoveUp/);
  assert.match(source, /settings\.home\.mocEntryMoveDown/);
  assert.doesNotMatch(source, /mocEntryPaths[\s\S]{0,280}\.addTextArea/);
  assert.equal(
    (managerSource.match(/this\.plugin\.attachHomeWidgetSourceSuggest\(text\.inputEl,\s*\(\)\s*=>\s*"moc"\)/g) || []).length,
    2
  );
  assert.doesNotMatch(managerSource, /\bthis\.attachHomeWidgetSourceSuggest/);
});

test("refresh scope classification separates local task, home, and reload work", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  assert.equal(plugin.classifyChangedPath("Noria/Countdowns.md"), "home");
  assert.equal(plugin.classifyChangedPath("Noria/Habits.md"), "home");
  assert.equal(plugin.classifyChangedPath("Noria/Projects.md"), "home");
  assert.equal(plugin.classifyChangedPath("Noria/Diary/2026/2026-05-02.md"), "tasks");
  assert.equal(plugin.classifyChangedPath(".obsidian/plugins/noria/views/tasks-calendar/runtime-core.js"), "reload");
});

test("refresh scope map routes embedded review work through home", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  const source = fs.readFileSync(pluginPath("src/main.js"), "utf8");

  assert.match(source, /NORIA_REFRESH_SCOPE_MAP/);
  assert.equal(plugin.getRefreshScopeForEvent("setting:managedPaths.importantDates"), "home");
  assert.equal(plugin.getRefreshScopeForEvent("setting:managedPaths.timelineSettings"), "timeline");
  assert.equal(plugin.getRefreshScopeForEvent("setting:managedPaths.diaryRoot"), "tasks");
  assert.equal(plugin.getRefreshScopeForEvent("writeback:task"), "tasks");
  assert.equal(plugin.getRefreshScopeForEvent("seed:create"), "reload");
  assert.equal(plugin.getRefreshScopeForEvent("weather:refresh"), "home");
  assert.equal(plugin.getRefreshScopeForEvent("review:save"), "home");
  assert.equal(plugin.getRefreshScopeForEvent("unknown:event"), "all");
});

test("vault file changes silently invalidate data caches without forcing a home refresh", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("  registerNoriaDataInvalidationEvents()");
  const end = main.indexOf("async reloadOpenNoriaViews", start);
  const body = main.slice(start, end);

  assert.ok(start > 0 && end > start);
  assert.match(main, /this\.registerNoriaDataInvalidationEvents\(\)/);
  assert.match(body, /this\.app\.vault\.on\("modify"/);
  assert.match(body, /this\.app\.vault\.on\("create"/);
  assert.match(body, /this\.app\.vault\.on\("delete"/);
  assert.match(body, /this\.app\.vault\.on\("rename"/);
  assert.match(body, /service\.invalidate\(`vault:/);
  assert.match(body, /invalidateTaskSnapshots\(affectsTasks \? "tasks" : scope\)/);
  assert.doesNotMatch(body, /requestNoriaRefresh/);
  assert.doesNotMatch(body, /reloadOpenNoriaViews/);
});

test("task snapshot cache honors TTL and invalidates task scopes", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({ performance: { taskSnapshotTtlMs: 1000, refreshDebounceMs: 20 } });

  const key = plugin.getTaskSnapshotCacheKey({ pages: '"06_Diary"', view: "week", scope: "tasks" });
  assert.equal(key, plugin.getTaskSnapshotCacheKey({ scope: "tasks", view: "week", pages: '"06_Diary"' }));
  assert.equal(plugin.getTaskSnapshot(key), null);

  plugin.setTaskSnapshot(key, [{ text: "A" }]);
  assert.deepEqual(plain(plugin.getTaskSnapshot(key)), [{ text: "A" }]);

  await plugin.requestNoriaRefresh("home", "unit-test", { immediate: true });
  assert.equal(plugin.getTaskSnapshot(key), null);

  plugin.setTaskSnapshot(key, [{ text: "A" }]);
  assert.deepEqual(plain(plugin.getTaskSnapshot(key)), [{ text: "A" }]);

  await plugin.requestNoriaRefresh("tasks", "unit-test", { immediate: true });
  assert.equal(plugin.getTaskSnapshot(key), null);
});

test("settings implementation declares localized top-level panes with paths folded into overview", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const tabsStart = main.indexOf("const NORIA_SETTING_TABS");
  const tabsEnd = main.indexOf("];", tabsStart);
  assert.ok(tabsStart >= 0);
  assert.ok(tabsEnd > tabsStart);
  const tabsSource = main.slice(tabsStart, tabsEnd + 2);

  for (const id of ["overview", "home", "tasks", "timeline", "appearance", "advanced"]) {
    assert.match(tabsSource, new RegExp(`id:\\s*"${id}"`));
  }
  assert.doesNotMatch(tabsSource, /id:\s*"ai"/);
  assert.doesNotMatch(tabsSource, /id:\s*"review"/);
  assert.doesNotMatch(tabsSource, /id:\s*"dataSources"/);
  for (const method of ["renderOverviewTab", "renderOverviewDataSourcesSection", "renderHomeTab", "renderTasksTab", "renderTimelineTab", "renderAppearanceTab", "renderAdvancedTab"]) {
    assert.match(main, new RegExp(`${method}\\(containerEl\\)`));
  }
  assert.doesNotMatch(main, /renderAiTab\(containerEl\)/);
  assert.doesNotMatch(main, /renderReviewTab\(containerEl\)/);
  assert.match(main, /getNoriaLocale/);
  assert.match(main, /settings\.tabs\.overview/);
  assert.doesNotMatch(main, /settings\.tabs\.ai/);
  assert.match(main, /settings\.tabs\.appearance/);
  assert.match(main, /settings\.tabs\.advanced/);
});

test("settings chrome uses accessible flat tabs and keeps search in the compact header", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");

  assert.match(main, /role:\s*"tablist"/);
  assert.match(main, /role:\s*"tab"/);
  assert.match(main, /aria-selected/);
  assert.match(main, /content\.setAttr\("role",\s*"tabpanel"\)/);
  assert.match(main, /noria-settings-chrome/);
  assert.match(main, /noria-settings-header/);
  assert.match(main, /renderSettingsSearch\(header,\s*content,\s*renderActive\)/);
  assert.match(main, /content\.setAttr\("aria-labelledby",\s*`noria-settings-tab-\$\{this\.activeTab\}`\)/);
});

test("complex JSON settings render the editor full-width below labels", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /noria-setting-full-width-control/);
  assert.match(main, /noria-setting-json-textarea/);
  assert.match(main, /renderAdvancedDisclosure\(containerEl,\s*"settings\.home\.widgetsJson"/);
  assert.match(main, /renderAdvancedDisclosure\(containerEl,\s*"settings\.inboxWorkflow\.advancedJson"/);
  assert.match(main, /settings\.home\.widgetsJson[\s\S]*applyFullWidthJsonSetting/);
  assert.match(main, /settings\.inboxWorkflow\.statuses[\s\S]*settings\.inboxWorkflow\.homeViews[\s\S]*settings\.inboxWorkflow\.baseViews/);
  assert.match(main, /settings\.inboxWorkflow\.baseViews[\s\S]*new obsidian\.Setting\(details\)[\s\S]*settings\.inboxWorkflow\.actions/);
  assert.doesNotMatch(main, /new obsidian\.Setting\(containerEl\)\s*[\s\S]{0,160}\.setName\(this\.t\("settings\.inboxWorkflow\.actions"\)\)/);
  assert.match(styles, /\.noria-setting-full-width-control\s*\{/);
  assert.match(styles, /\.noria-setting-full-width-control\s+\.setting-item-control/);
  assert.match(styles, /\.noria-setting-json-textarea/);
});

test("i18n defaults to English and switches to Chinese for Obsidian zh locales", () => {
  const enPlugin = makePlugin({ language: "en" });
  const zhPlugin = makePlugin({ language: "zh-CN" });

  assert.equal(enPlugin.getNoriaLocale(), "en");
  assert.equal(zhPlugin.getNoriaLocale(), "zh");
  assert.equal(enPlugin.t("settings.tabs.general"), "General");
  assert.equal(zhPlugin.t("settings.tabs.general"), "通用");
  assert.equal(enPlugin.t("commands.openHome"), "Open home");
  assert.equal(zhPlugin.t("commands.openHome"), "打开主页");
  assert.equal(enPlugin.t("ribbon.review"), "Review center");
  assert.equal(zhPlugin.t("ribbon.review"), "复盘中心");
  assert.equal(enPlugin.t("views.tasks.title"), "Tasks board");
  assert.equal(zhPlugin.t("views.tasks.title"), "任务看板");
  assert.equal(enPlugin.t("settings.missing.key"), "settings.missing.key");
});

test("runtime bridge exposes locale and translation helper to native views", () => {
  const plugin = makePlugin({ language: "zh-CN" });
  plugin.settings = plugin.normalizeSettings({});
  const bridge = plugin.buildRuntimeBridgeConfig();

  assert.equal(bridge.locale, "zh");
  assert.equal(bridge.i18n.locale, "zh");
  assert.equal(typeof bridge.t, "function");
  assert.equal(bridge.t("views.home.title"), "主页");
  assert.equal(bridge.t("not.catalogued"), "not.catalogued");
});

test("commands and ribbon tooltips use the locale catalog instead of fixed labels", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.match(main, /nameKey:\s*"commands\.openHome"/);
  assert.doesNotMatch(main, /titleKey:\s*"ribbon\.review"/);
  assert.match(main, /id:\s*"open-review-center",\s*nameKey:\s*"commands\.openReview"/);
  assert.match(main, /name:\s*this\.t\(spec\.nameKey\)/);
  assert.match(main, /addRibbonIcon\(icon,\s*this\.t\(spec\.titleKey\)/);
});

test("core ItemView titles and Notices use the locale catalog", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  for (const key of [
    "views.tasks.title",
    "views.timeline.title",
    "views.home.title",
    "views.stats.title",
    "views.review.title",
    "notices.healthOk",
    "notices.healthFailed",
    "notices.reviewPromptCopied",
    "notices.reviewPromptManual"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  assert.doesNotMatch(main, /getDisplayText\(\)\s*\{\s*return\s*"任务看板"/);
  assert.doesNotMatch(main, /new obsidian\.Notice\("Noria 架构健康检查通过"/);
});

test("settings save serialization keeps release schema and removes weather secrets", () => {
  const plugin = makePlugin();
  const settings = plugin.normalizeSettings({
    onboarding: { profile: "custom" },
    managedPaths: {
      entryNote: "02_Areas/知识库管理/Noria入口说明.md",
      timelineSettings: "02_Areas/知识库管理/清单-时间线设置.md",
      templateLibrary: "02_Areas/知识库管理/清单-事件库.md",
      importantDates: "02_Areas/知识库管理/清单-重要日期.md",
      habitRegistry: "02_Areas/知识库管理/清单-习惯打卡.md",
      projectRegistry: "02_Areas/知识库管理/清单-项目.md"
    },
    weather: { qweatherKey: "weather-key", manualCity: "Shanghai" },
    reviewCenter: {
      prompt: {
        skillName: "custom-review",
        promptNotePath: "03_Resources/Prompts/review.md",
        promptTemplate: "custom template"
      }
    }
  });

  assert.equal(typeof plugin.serializeSettingsForSave, "function");
  const saved = plugin.serializeSettingsForSave(settings);

  assert.equal(Object.prototype.hasOwnProperty.call(saved.managedPaths, "entryNote"), false);
  assert.equal(saved.managedPaths.timelineSettings, "02_Areas/知识库管理/Timeline settings.md");
  assert.equal(saved.managedPaths.templateLibrary, "02_Areas/知识库管理/Event library.md");
  assert.equal(saved.managedPaths.importantDates, "02_Areas/知识库管理/Countdowns.md");
  assert.equal(saved.managedPaths.habitRegistry, "02_Areas/知识库管理/Habits.md");
  assert.equal(saved.managedPaths.projectRegistry, "02_Areas/知识库管理/Projects.md");
  assert.equal(saved.managedPaths.inboxWorkflow, "02_Areas/知识库管理/Inbox workflow.md");
  assert.equal(saved.managedPaths.inboxQueue, "02_Areas/知识库管理/Inbox queue.base");
  assert.equal(saved.weather.manualCity, "Shanghai");
  assert.equal(Object.prototype.hasOwnProperty.call(saved.managedPaths, "reviewArtifactBase"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, "viewNotePath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, "timelineSettingsPath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, "templateLibraryPath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, "runtimeFiles"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved.reviewCenter, "artifactBasePath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, "reviewGeneration"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved.weather, "qweatherKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, "ai"), false);
  assert.equal(settings.reviewCenter.prompt.skillName, "custom-review");
  assert.equal(settings.reviewCenter.prompt.promptNotePath, "03_Resources/Prompts/review.md");
  assert.equal(settings.reviewCenter.prompt.promptTemplate, "custom template");
});

test("only Overview edits managed paths while business tabs link to folded path details", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const bodyOf = (name) => {
    const marker = `${name}(containerEl) {`;
    const start = main.indexOf(marker);
    assert.notEqual(start, -1, `${name} should exist`);
    const next = main.indexOf("\n  render", start + marker.length);
    return main.slice(start, next === -1 ? main.length : next);
  };

  assert.match(bodyOf("renderOverviewTab"), /renderOverviewDataSourcesSection/);
  assert.match(bodyOf("renderOverviewDataSourcesSection"), /renderManagedPathGroup/);
  for (const name of ["renderHomeTab", "renderTasksTab", "renderTimelineTab"]) {
    const body = bodyOf(name);
    assert.doesNotMatch(body, /renderManagedPathSetting/);
    assert.doesNotMatch(body, /renderManagedPathStatusSummary/);
  }
});

test("retired path fields are not exposed as editable settings", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.doesNotMatch(main, /\.setName\("View note path"\)/);
  assert.doesNotMatch(main, /\.setName\("Daily review artifact directory"\)/);
  assert.doesNotMatch(main, /\.setName\("Template library path"\)/);
});

test("weather secret migration stores legacy key before destructive save cleanup", async () => {
  const plugin = makePlugin();
  const writes = [];
  const secrets = new Map();
  plugin.app.secretStorage = {
    async setSecret(key, value) {
      if (!/^[a-z0-9-]+$/.test(key)) throw new Error("invalid secret id");
      writes.push({ key, value });
      secrets.set(key, value);
    },
    async getSecret(key) {
      return secrets.get(key) || "";
    }
  };
  plugin.settings = plugin.normalizeSettings({
    weather: { qweatherKey: "legacy-secret" }
  });

  assert.equal(typeof plugin.migrateWeatherSecretFromSettings, "function");
  const result = await plugin.migrateWeatherSecretFromSettings(plugin.settings);

  assert.deepEqual(writes, [{ key: "noria-weather-qweather-key", value: "legacy-secret" }]);
  assert.equal(result.ok, true);
  assert.equal(plugin.settings.weather.qweatherSecretName, "noria-weather-qweather-key");
  assert.equal(plugin.settings.weather.qweatherKey, "");
});

test("weather secret migration keeps the legacy key until a storage round trip succeeds", async () => {
  const plugin = makePlugin();
  plugin.app.secretStorage = {
    async setSecret() {},
    async getSecret() {
      return "";
    }
  };
  plugin.settings = plugin.normalizeSettings({
    weather: { qweatherKey: "legacy-secret" }
  });

  const result = await plugin.migrateWeatherSecretFromSettings(plugin.settings);

  assert.equal(result.ok, false);
  assert.equal(result.migrated, false);
  assert.equal(plugin.settings.weather.qweatherKey, "legacy-secret");
});

test("unsupported weather secret ids fall back to the release-safe SecretStorage id", () => {
  const plugin = makePlugin();
  const settings = plugin.normalizeSettings({
    weather: { qweatherSecretName: "noria.weather.qweatherKey" }
  });

  assert.equal(settings.weather.qweatherSecretName, "noria-weather-qweather-key");
});

test("loadSettings auto-saves canonical data when top-level path aliases are present", async () => {
  const plugin = makePlugin();
  const saved = [];
  plugin.loadData = async () => ({
    viewNotePath: "02_Areas/知识库管理/Noria入口说明.md",
    timelineSettingsPath: "02_Areas/知识库管理/清单-时间线设置.md",
    templateLibraryPath: "02_Areas/知识库管理/清单-事件库.md",
    onboarding: { profile: "custom" },
    home: {
      identity: {
        quoteListPath: "02_Areas/知识库管理/清单-名言.md"
      }
    }
  });
  plugin.saveData = async (value) => {
    saved.push(value);
  };

  await plugin.loadSettings();

  assert.equal(saved.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(saved[0], "viewNotePath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved[0], "timelineSettingsPath"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(saved[0], "templateLibraryPath"), false);
  assert.equal(saved[0].home.identity.quoteListPath, "02_Areas/知识库管理/Quotes.md");
});

test("sparse current settings inherit Noria defaults without losing explicit values", async () => {
  const plugin = makePlugin();
  const saved = [];
  plugin.loadData = async () => ({
    appearance: { density: "compact" },
    timelineSettingsPath: "Custom/Timeline.md",
    templateLibraryPath: "Custom/Event library.md",
    reviewCenter: { prompt: { skillName: "custom-review" } },
    inboxWorkflow: {}
  });
  plugin.saveData = async (value) => {
    saved.push(value);
  };

  await plugin.loadSettings();

  assert.equal(saved.length, 1);
  assert.equal(saved[0].appearance.density, "compact");
  assert.equal(saved[0].onboarding.workspaceRoot, "Noria");
  assert.equal(saved[0].managedPaths.diaryRoot, "Noria/Diary");
  assert.equal(saved[0].managedPaths.timelineSettings, "Custom/Timeline.md");
  assert.equal(saved[0].managedPaths.templateLibrary, "Custom/Event library.md");
  assert.equal(saved[0].home.identity.avatarPath, "Noria/avatar.svg");
  assert.deepEqual(plain(saved[0].homeDashboard.mocEntryPaths), ["Noria/Workflow·MOC.md", "Noria/Knowledge Base·MOC.md"]);
  assert.equal(saved[0].calendar.calendarRootFolder, "Noria/Diary");
  assert.equal(saved[0].weather.qweatherSecretName, "noria-weather-qweather-key");
  assert.equal(saved[0].reviewCenter.prompt.skillName, "custom-review");
});

test("invalid non-empty current Noria data never falls back to legacy Noria settings", async () => {
  const plugin = makePlugin();
  let adapterReadCount = 0;
  const saved = [];
  plugin.manifest = { id: "noria" };
  plugin.app.vault.adapter = {
    async exists() {
      adapterReadCount += 1;
      return true;
    },
    async read() {
      adapterReadCount += 1;
      return JSON.stringify({ managedPaths: { diaryRoot: "Noria/Diary" } });
    }
  };
  plugin.loadData = async () => ["corrupt-current-data"];
  plugin.saveData = async (value) => {
    saved.push(value);
  };

  await plugin.loadSettings();

  assert.equal(adapterReadCount, 0);
  assert.equal(saved.length, 0);
  assert.equal(plugin.settings.managedPaths.diaryRoot, "Noria/Diary");
});

test("non-empty Noria settings never read or merge legacy Noria settings", async () => {
  const plugin = makePlugin();
  let adapterReadCount = 0;
  const saved = [];
  plugin.manifest = { id: "noria" };
  plugin.app.vault.configDir = ".obsidian";
  plugin.app.vault.adapter = {
    async exists() {
      adapterReadCount += 1;
      return true;
    },
    async read() {
      adapterReadCount += 1;
      return JSON.stringify({ managedPaths: { diaryRoot: "Noria/Diary" } });
    }
  };
  plugin.loadData = async () => ({
    onboarding: { profile: "custom", workspaceRoot: "Personal" },
    managedPaths: { diaryRoot: "Personal/Diary" },
    inboxWorkflow: {}
  });
  plugin.saveData = async (value) => {
    saved.push(value);
  };

  await plugin.loadSettings();

  assert.equal(adapterReadCount, 0);
  assert.equal(plugin.settings.onboarding.workspaceRoot, "Personal");
  assert.equal(plugin.settings.managedPaths.diaryRoot, "Personal/Diary");
  assert.equal(saved.some((value) => value.managedPaths?.diaryRoot === "Noria/Diary"), false);
});

test("SecretStorage failure preserves the legacy weather key on save", async () => {
  const plugin = makePlugin();
  const saved = [];
  plugin.app.secretStorage = {
    async setSecret() {
      throw new Error("secret locked");
    },
    async getSecret() {
      return "";
    }
  };
  plugin.saveData = async (value) => {
    saved.push(value);
  };
  plugin.settings = plugin.normalizeSettings({
    weather: { qweatherKey: "legacy-secret" }
  });

  await plugin.saveSettings();

  assert.equal(saved.length, 1);
  assert.equal(saved[0].weather.qweatherKey, "legacy-secret");
});

test("human-readable source views read managed paths from the bridge", () => {
  const files = [
    "views/periodic/dashboardCountdown.js",
    "views/periodic/dashboardHabitWeek.js",
    "views/periodic/dashboardGuideProjects.js",
    "views/tasks-calendar/runtime-core.js"
  ];
  const combined = files.map((file) => fs.readFileSync(pluginPath(file), "utf8")).join("\n");

  assert.match(combined, /bridge\.paths\?\.importantDatesPath/);
  assert.match(combined, /bridge\.paths\?\.habitRegistryPath/);
  assert.match(combined, /bridge\.paths\?\.projectRegistryPath/);
  assert.match(combined, /bridge\.paths\?\.dailyTemplatePath/);
  assert.match(combined, /bridge\.paths\?\.weeklyTemplatePath/);
});

test("periodic stats uses shared chart and habit components without workload boards", () => {
  const statsView = fs.readFileSync(pluginPath("views/dashboard/periodic-stats/impl-legacy/view.js"), "utf8");
  const boards = fs.readFileSync(pluginPath("views/dashboard/periodic-stats/impl-legacy/fallbacks/boards.js"), "utf8");
  const charts = fs.readFileSync(pluginPath("views/dashboard/periodic-stats/impl-legacy/fallbacks/charts.js"), "utf8");

  assert.match(statsView, /chartAdapter\.renderDualAxis/);
  assert.match(boards, /renderHabitWeekMatrix/);
  assert.doesNotMatch(statsView, /工作量打卡/);
  assert.doesNotMatch(statsView, /工作量热力图/);
  assert.doesNotMatch(boards, /renderWeeklyWorkloadBoard/);
  assert.doesNotMatch(charts, /Date\.now\(\)/);
});
