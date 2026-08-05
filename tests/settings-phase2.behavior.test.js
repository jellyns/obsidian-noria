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
  const context = {
    console,
    module,
    exports: module.exports,
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    require(id) {
      if (id === "obsidian") {
        return {
          Plugin: class {
            addCommand() {}
            addRibbonIcon() {}
            registerView() {}
            addSettingTab() {}
          },
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
          ButtonComponent: class {},
          setIcon() {},
          getLanguage() {
            return language;
          }
        };
      }
      if (id === "child_process") return {};
      throw new Error(`Unexpected require: ${id}`);
    },
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
  const files = new Map();
  const folders = new Set();
  const created = [];
  const deleted = [];
  for (const [filePath, text] of Object.entries(options.files || {})) {
    files.set(filePath.replace(/\\/g, "/"), { path: filePath.replace(/\\/g, "/"), text: String(text || "") });
  }
  for (const folderPath of options.folders || []) {
    folders.add(String(folderPath || "").replace(/\\/g, "/").replace(/\/+$/, ""));
  }
  plugin.app = {
    plugins: {
      plugins: options.externalPlugins === false ? {} : {}
    },
    workspace: {
      getLeavesOfType() {
        return [];
      },
      revealLeaf() {},
      onLayoutReady(fn) {
        if (typeof fn === "function") fn();
      }
    },
    vault: {
      configDir: options.configDir || ".obsidian",
      getAbstractFileByPath(filePath) {
        const p = String(filePath || "").replace(/\\/g, "/");
        return files.get(p) || null;
      },
      async create(filePath, text) {
        const p = String(filePath || "").replace(/\\/g, "/");
        if (files.has(p)) throw new Error(`already exists: ${p}`);
        const file = { path: p, text: String(text || "") };
        files.set(p, file);
        created.push({ type: "file", path: p, text: String(text || "") });
        return file;
      },
      async modify(file, text) {
        const p = String(file?.path || "").replace(/\\/g, "/");
        files.set(p, { path: p, text: String(text || "") });
      },
      async delete(file) {
        const p = String(file?.path || "").replace(/\\/g, "/");
        files.delete(p);
        deleted.push(p);
      },
      adapter: {
        async exists(filePath) {
          const p = String(filePath || "").replace(/\\/g, "/").replace(/\/+$/, "");
          return files.has(p) || folders.has(p);
        },
        async read(filePath) {
          const p = String(filePath || "").replace(/\\/g, "/");
          const file = files.get(p);
          if (!file) throw new Error(`missing: ${p}`);
          return file.text;
        },
        async write(filePath, text) {
          const p = String(filePath || "").replace(/\\/g, "/");
          files.set(p, { path: p, text: String(text || "") });
        }
      },
      async createFolder(folderPath) {
        const p = String(folderPath || "").replace(/\\/g, "/").replace(/\/+$/, "");
        folders.add(p);
        created.push({ type: "folder", path: p });
      }
    },
    fileManager: {
      async trashFile(file) {
        const p = String(file?.path || "").replace(/\\/g, "/");
        files.delete(p);
        deleted.push(p);
      }
    },
    secretStorage: {
      async getSecret() {
        return "";
      },
      async setSecret() {}
    }
  };
  plugin.saveData = async (value) => {
    plugin.__lastSaved = value;
  };
  plugin.__files = files;
  plugin.__created = created;
  plugin.__deleted = deleted;
  plugin.__folders = folders;
  return plugin;
}

function bodyOf(source, name) {
  const legacyMarker = `${name}(containerEl) {`;
  const legacyStart = source.indexOf(legacyMarker);
  const methodMarker = `\n  ${name}(`;
  const methodStart = source.indexOf(methodMarker);
  const start = legacyStart !== -1 ? legacyStart : (methodStart !== -1 ? methodStart + 3 : source.indexOf(`${name}(`));
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\n  render", start + legacyMarker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

test("phase2 settings schema defaults all modules on and normalizes appearance", () => {
  const plugin = makePlugin();
  const defaults = plugin.normalizeSettings({});

  assert.deepEqual(plain(defaults.features.modules), {
    home: true,
    tasksBoard: true,
    taskTimeline: true,
    pomodoro: true,
    diaryStats: true,
    calendar: true
  });
  assert.equal(defaults.home.guidePanels.reviewCenter, true);
  assert.equal(defaults.home.guidePanels.reviewCenterExpanded, true);
  assert.equal(defaults.onboarding.initializedAt, "");
  assert.equal(defaults.onboarding.dismissedVersion, "");
  assert.equal(defaults.onboarding.profile, "standard");
  assert.equal(defaults.reviewCenter.prompt.skillName, "noria-review");
  assert.equal(defaults.reviewCenter.prompt.promptNotePath, "");
  assert.match(defaults.reviewCenter.prompt.promptTemplate, /review_note/);
  assert.match(defaults.reviewCenter.prompt.promptTemplate, /mode/);
  assert.match(defaults.reviewCenter.prompt.promptTemplate, /period/);
  assert.match(defaults.reviewCenter.prompt.promptTemplate, /evidence_file/);
  assert.equal(Object.prototype.hasOwnProperty.call(defaults, "ai"), false);
  assert.equal(defaults.weather.enabled, false);
  assert.equal(defaults.appearance.density, "balanced");
  assert.equal(defaults.appearance.accentPreset, "obsidian");
  assert.equal(defaults.appearance.statusPalette, "balanced");
  assert.equal(defaults.appearance.cardStrength, "standard");
  assert.deepEqual(plain(defaults.appearance.tagColorMap), {});
  assert.deepEqual(plain(defaults.home.identity), {
    displayName: "",
    greetingName: "",
    avatarPath: "Noria/avatar.svg",
    quoteListPath: "Noria/Quotes.md"
  });
  assert.deepEqual(plain(defaults.homeDashboard.mocEntryPaths), ["Noria/Workflow·MOC.md", "Noria/Knowledge Base·MOC.md"]);
  assert.equal(defaults.homeDashboard.mocEntries.length, 2);

  const staleReviewPrompt = plugin.normalizeSettings({
    reviewCenter: {
      prompt: {
        skillName: "noria-review",
        promptTemplate: "${skill}\n\ndate: {date}\nreview_note: {review_note}\n请生成复盘笔记。",
        promptNotePath: ""
      }
    }
  });
  assert.match(staleReviewPrompt.reviewCenter.prompt.promptTemplate, /mode/);
  assert.match(staleReviewPrompt.reviewCenter.prompt.promptTemplate, /period/);
  assert.match(staleReviewPrompt.reviewCenter.prompt.promptTemplate, /evidence_file/);

  const customized = plugin.normalizeSettings({
    features: { modules: { home: false, taskTimeline: false, pomodoro: false } },
    colorPalette: { tagColorMap: { paper: "#22c55e" } },
    appearance: {
      density: "compact",
      accentPreset: "ocean",
      statusPalette: "calm",
      cardStrength: "strong",
      tagColorMap: { project: "#3b82f6" }
    },
    home: {
      identity: {
        displayName: "  Ada  ",
        greetingName: "  Dr. Lovelace  ",
        avatarPath: "  99_Attachment/ada.png  ",
        quoteListPath: "  Quotes.md  "
      }
    }
  });

  assert.equal(customized.features.modules.home, false);
  assert.equal(customized.features.modules.tasksBoard, true);
  assert.equal(customized.features.modules.taskTimeline, false);
  assert.equal(customized.features.modules.pomodoro, false);
  assert.equal(Object.prototype.hasOwnProperty.call(customized.features.modules, "reviewCenter"), false);
  assert.equal(customized.appearance.density, "compact");
  assert.equal(customized.appearance.accentPreset, "ocean");
  assert.equal(customized.appearance.statusPalette, "calm");
  assert.equal(customized.appearance.cardStrength, "strong");
  assert.deepEqual(plain(customized.appearance.tagColorMap), { project: "#3b82f6" });
  assert.deepEqual(plain(customized.home.identity), {
    displayName: "Ada",
    greetingName: "Dr. Lovelace",
    avatarPath: "99_Attachment/ada.png",
    quoteListPath: "Quotes.md"
  });

  const collapsedReview = plugin.normalizeSettings({
    home: { guidePanels: { reviewCenterExpanded: false } }
  });
  assert.equal(collapsedReview.home.guidePanels.reviewCenterExpanded, false);

  const migratedTags = plugin.normalizeSettings({ colorPalette: { tagColorMap: { paper: "#22c55e" } } });
  assert.deepEqual(plain(migratedTags.appearance.tagColorMap), { paper: "#22c55e" });
});

test("legacy review center module setting migrates into the home review block toggle", () => {
  const plugin = makePlugin();

  const disabledLegacy = plugin.normalizeSettings({
    features: { modules: { reviewCenter: false } }
  });

  assert.equal(disabledLegacy.home.guidePanels.reviewCenter, false);
  assert.equal(Object.prototype.hasOwnProperty.call(disabledLegacy.features.modules, "reviewCenter"), false);

  const explicitHome = plugin.normalizeSettings({
    features: { modules: { reviewCenter: false } },
    home: { guidePanels: { reviewCenter: true } }
  });

  assert.equal(explicitHome.home.guidePanels.reviewCenter, true);
});

test("legacy planner now needle policy migrates week view visibility on", () => {
  const plugin = makePlugin();

  const normalized = plugin.normalizeSettings({
    plannerUxPolicy: {
      showNowNeedle: true,
      showNowNeedleInWeekView: false,
      showNowNeedleInDayView: true
    }
  });

  assert.equal(normalized.plannerUxPolicy.version, 2);
  assert.equal(normalized.plannerUxPolicy.showNowNeedle, true);
  assert.equal(normalized.plannerUxPolicy.showNowNeedleInWeekView, true);
  assert.equal(normalized.plannerUxPolicy.showNowNeedleInDayView, true);

  const explicitCurrent = plugin.normalizeSettings({
    plannerUxPolicy: {
      version: 2,
      showNowNeedle: true,
      showNowNeedleInWeekView: false,
      showNowNeedleInDayView: true
    }
  });

  assert.equal(explicitCurrent.plannerUxPolicy.showNowNeedleInWeekView, false);
});

test("legacy starter settings normalize into the current standard workspace defaults", () => {
  const plugin = makePlugin();
  const legacy = {
    managedPaths: {
      entryNote: "Noria/Home.md",
      timelineSettings: "Noria/Timeline settings.md",
      templateLibrary: "Noria/Event library.md",
      importantDates: "Noria/Countdowns.md",
      habitRegistry: "Noria/Habits.md",
      projectRegistry: "Noria/Projects.md",
      inboxWorkflow: "Noria/Inbox workflow.md",
      inboxQueue: "Noria/Inbox queue.base",
      taskRegistry: "Noria/Tasks.md",
      inboxRoot: "Noria/Inbox",
      projectsRoot: "Noria/Projects",
      diaryRoot: "Noria/Diary",
      dailyTemplate: "Noria/Templates/Daily template.md",
      weeklyTemplate: "Noria/Templates/Weekly template.md",
      monthlyTemplate: "Noria/Templates/Monthly template.md",
      yearlyTemplate: "Noria/Templates/Yearly template.md"
    },
    onboarding: {
      profile: "starter",
      workspaceRoot: "Noria",
      initializedAt: "2026-05-05T00:00:00.000Z"
    },
    weather: {
      enabled: false,
      provider: "qweather-ip-fallback",
      qweatherSecretName: "noria.weather.qweatherKey",
      manualCity: "",
      cacheMinutes: 45
    },
    homeDashboard: {
      mocEntryPaths: ["Noria/MOC.md"],
      mocEntries: [{ path: "Noria/MOC.md", color: "" }]
    }
  };

  const normalized = plugin.normalizeSettings(legacy);

  assert.equal(normalized.onboarding.profile, "standard");
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.managedPaths, "entryNote"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.managedPaths, "taskRegistry"), false);
  assert.equal(normalized.managedPaths.inboxWorkflow, "Noria/Inbox workflow.md");
  assert.equal(normalized.managedPaths.inboxQueue, "Noria/Inbox queue.base");
  assert.equal(normalized.weather.enabled, false);
  assert.deepEqual(plain(normalized.homeDashboard.mocEntryPaths), ["Noria/Workflow·MOC.md", "Noria/Knowledge Base·MOC.md"]);
  assert.equal(normalized.homeDashboard.mocEntries[0].color, "#8b5cf6");
  assert.equal(normalized.homeDashboard.mocEntries[1].color, "#10b981");
  assert.equal(plugin.settingsInputNeedsCanonicalSave(legacy), true);
});

test("query scope settings default to managed tasks and all-vault notes", async () => {
  const plugin = makePlugin();
  const defaults = plugin.normalizeSettings({});

  assert.deepEqual(plain(defaults.performance.queryScopes.tasks), {
    mode: "managed",
    customRoots: []
  });
  assert.deepEqual(plain(defaults.performance.queryScopes.notes), {
    mode: "all",
    customRoots: []
  });

  plugin.settings = plugin.normalizeSettings({
    performance: {
      queryScopes: {
        tasks: {
          mode: "custom",
          customRoots: [
            "/06_Diary",
            "01_Projects\\Active",
            "F:\\Library\\Outside",
            "https://example.com",
            "06_Diary/"
          ]
        },
        notes: {
          mode: "custom",
          customRoots: ["03_Resources", "/03_Resources", "C:/Temp"]
        }
      }
    }
  });

  assert.deepEqual(plain(plugin.settings.performance.queryScopes.tasks), {
    mode: "custom",
    customRoots: ["06_Diary", "01_Projects/Active"]
  });
  assert.deepEqual(plain(plugin.settings.performance.queryScopes.notes), {
    mode: "custom",
    customRoots: ["03_Resources"]
  });
  assert.equal(typeof plugin.getQueryScopeUnsupportedEntries, "function");
  assert.ok(plugin.getQueryScopeUnsupportedEntries().some((item) => item.scopeId === "tasks" && item.path === "F:\\Library\\Outside"));
  assert.ok(plugin.getQueryScopeUnsupportedEntries().some((item) => item.scopeId === "notes" && item.path === "C:/Temp"));

  const status = await plugin.getSetupStatus();
  assert.ok(status.unsupported.some((item) => item.key === "queryScopes.tasks" && item.reason === "absolute-path"));
  assert.ok(status.unsupported.some((item) => item.key === "queryScopes.notes" && item.reason === "absolute-path"));
});

test("query scope helpers resolve managed, all, and custom native scan specs", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({
    managedPaths: {
      diaryRoot: "06_Diary",
      projectsRoot: "01_Projects",
      inboxRoot: "00_Inbox"
    },
    performance: {
      queryScopes: {
        notes: { mode: "custom", customRoots: ["03_Resources", "02_Areas"] }
      }
    }
  });

  assert.equal(typeof plugin.getScopeSpec, "function");
  const tasks = plugin.getScopeSpec("tasks");
  assert.equal(tasks.mode, "managed");
  assert.deepEqual(plain(tasks.roots), ["06_Diary", "01_Projects", "00_Inbox"]);
  assert.equal(tasks.query, '"06_Diary" or "01_Projects" or "00_Inbox"');
  assert.equal(tasks.isAllVault, false);

  const notes = plugin.getScopeSpec("notes");
  assert.equal(notes.mode, "custom");
  assert.deepEqual(plain(notes.roots), ["03_Resources", "02_Areas"]);
  assert.equal(notes.query, '"03_Resources" or "02_Areas"');

  plugin.settings = plugin.normalizeSettings({});
  const defaultNotes = plugin.getScopeSpec("notes");
  assert.equal(defaultNotes.mode, "all");
  assert.equal(defaultNotes.query, "");
  assert.equal(defaultNotes.isAllVault, true);
});

test("disabled modules filter command and ribbon specs after reload", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({
    features: {
      modules: {
        home: false,
        tasksBoard: false,
        taskTimeline: false,
        pomodoro: false,
        diaryStats: false,
        calendar: false
      }
    }
  });

  assert.equal(typeof plugin.getCoreCommandSpecs, "function");
  assert.equal(typeof plugin.getEnabledCoreCommandSpecs, "function");
  assert.equal(typeof plugin.getEnabledCoreRibbonSpecs, "function");

  assert.equal(plugin.getCoreCommandSpecs().some((spec) => spec.id === "open-review-center"), true);
  assert.equal(plugin.getEnabledCoreRibbonSpecs().some((spec) => spec.key === "noria:复盘中心"), false);
  const commandIds = plugin.getEnabledCoreCommandSpecs().map((spec) => spec.id);
  assert.deepEqual(plain(commandIds), ["architecture-health-check"]);
  assert.deepEqual(plain(plugin.getEnabledCoreRibbonSpecs().map((spec) => spec.key)), []);

  const allOn = makePlugin();
  allOn.settings = allOn.normalizeSettings({});
  assert.ok(allOn.getEnabledCoreCommandSpecs().some((spec) => spec.id === "open-home-tab"));
  assert.ok(allOn.getEnabledCoreCommandSpecs().some((spec) => spec.id === "open-review-center"));
  assert.ok(allOn.getEnabledCoreCommandSpecs().some((spec) => spec.id === "open-calendar"));
  assert.ok(allOn.getEnabledCoreRibbonSpecs().some((spec) => spec.key === "noria:home"));
  assert.ok(allOn.getEnabledCoreRibbonSpecs().some((spec) => spec.key === "noria:calendar"));
});

test("architecture health accepts built-in views embedded in the release bundle", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  const result = await plugin.runArchitectureHealthCheck({ notify: false, log: false });
  const viewChecks = result.checks.filter((item) => item.name.startsWith("built-in view available:"));

  assert.equal(viewChecks.length, 5);
  assert.equal(viewChecks.every((item) => item.ok), true);
  assert.equal(result.ok, true);
});

test("core ribbon specs use only Noria logical keys and approved icons", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  assert.deepEqual(plain(plugin.getEnabledCoreRibbonSpecs()), [
    {
      key: "noria:home",
      icon: "noria-home",
      fallbackIcon: "house",
      titleKey: "ribbon.home",
      action: "openDashboardHomeLeaf",
      moduleKey: "home"
    },
    {
      key: "noria:tasks",
      icon: "list-checks",
      titleKey: "ribbon.tasks",
      action: "openTasksBoardLeaf",
      moduleKey: "tasksBoard"
    },
    {
      key: "noria:task-timeline",
      icon: "chart-gantt",
      titleKey: "ribbon.timeline",
      action: "openTasksTimelineLeaf",
      moduleKey: "taskTimeline"
    },
    {
      key: "noria:calendar",
      icon: "calendar-days",
      titleKey: "ribbon.calendar",
      action: "openCalendarLeaf",
      moduleKey: "calendar"
    }
  ]);

  const source = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const ribbonStart = source.indexOf("const NORIA_RIBBON_SPECS");
  const ribbonEnd = source.indexOf("const NORIA_DEFAULT_REVIEW_SKILL_NAME", ribbonStart);
  assert.ok(ribbonStart >= 0 && ribbonEnd > ribbonStart);
  const ribbonBlock = source.slice(ribbonStart, ribbonEnd);
  assert.doesNotMatch(ribbonBlock, /calendar-check|calendar-clock|house-plus|ribbon\.review|reviewCenter/);
});

test("module registry centralizes views, commands, ribbons, and runtime controls", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");

  assert.match(main, /NORIA_MODULE_REGISTRY/);
  assert.equal(typeof plugin.getModuleRegistry, "function");
  const registry = plugin.getModuleRegistry();

  assert.equal(registry.home.viewType, "noria-dashboard-home");
  assert.ok(registry.home.commands.includes("open-home-tab"));
  assert.ok(registry.home.commands.includes("open-review-center"));
  assert.equal(registry.home.commands.includes("open-review-center-standalone"), false);
  assert.deepEqual(plain(registry.home.ribbons), ["noria:home"]);
  assert.ok(registry.home.runtimeControls.includes("home.reviewCenter"));
  assert.deepEqual(plain(registry.tasksBoard.ribbons), ["noria:tasks"]);
  assert.ok(registry.tasksBoard.runtimeControls.includes("tasksCalendar.pomodoroButtons"));
  assert.deepEqual(plain(registry.taskTimeline.ribbons), ["noria:task-timeline"]);
  assert.ok(registry.taskTimeline.runtimeControls.includes("timeline.pomodoroDock"));
  assert.equal(registry.calendar.viewType, "noria-calendar");
  assert.ok(registry.calendar.commands.includes("open-calendar"));
  assert.deepEqual(plain(registry.calendar.ribbons), ["noria:calendar"]);
  assert.ok(registry.calendar.runtimeControls.includes("calendar.month"));
  assert.equal(Object.prototype.hasOwnProperty.call(registry, "reviewCenter"), false);
});

test("review center command opens the Home workbench without a standalone ItemView", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const coreCommands = main.slice(main.indexOf("getCoreCommandSpecs()"), main.indexOf("getEnabledCoreCommandSpecs()", main.indexOf("getCoreCommandSpecs()")));
  const reviewHomeOpen = main.slice(main.indexOf("async openReviewCenterInHome("), main.indexOf("getLocalYmd(", main.indexOf("async openReviewCenterInHome(")));

  assert.match(coreCommands, /id:\s*"open-review-center"/);
  assert.match(coreCommands, /nameKey:\s*"commands\.openReview"/);
  assert.match(coreCommands, /moduleKey:\s*"home"/);
  assert.match(coreCommands, /openReviewCenterInHome\(\)/);
  assert.doesNotMatch(coreCommands, /(?:noria-)?open-review-center-standalone|openReviewCenterStandalone/);
  assert.match(reviewHomeOpen, /_pendingHomeReviewFocus/);
  assert.match(reviewHomeOpen, /openDashboardHomeLeaf\(\)/);
  assert.match(reviewHomeOpen, /__noriaOpenReviewFocusPanel/);
  assert.doesNotMatch(reviewHomeOpen, /VIEW_TYPE_NORIA_REVIEW_CENTER/);
  assert.doesNotMatch(main, /async openReviewCenterStandalone\(|async openReviewCenterLeaf\(/);
  assert.doesNotMatch(main, /class NoriaReviewCenterView|VIEW_TYPE_NORIA_REVIEW_CENTER/);
});

test("daily state writeback creates missing diary and ignores weather payloads", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({ managedPaths: { diaryRoot: "06_Diary" } });

  const result = await plugin.saveDailyStateForDate("2026-05-06", {
    mood: "稳定",
    energy: "4",
    focus: "基本专注",
    weather: "晴"
  });

  assert.equal(result.ok, true);
  assert.equal(result.path, "06_Diary/2026/2026-05-06.md");
  const written = plugin.__files.get("06_Diary/2026/2026-05-06.md")?.text || "";
  assert.match(written, /^mood:\s*稳定$/m);
  assert.match(written, /^energy:\s*4$/m);
  assert.match(written, /^focus:\s*基本专注$/m);
  assert.doesNotMatch(written, /^weather:\s*晴$/m);
});

test("daily state writeback preserves concurrent diary edits through vault.process", async () => {
  const diaryPath = "06_Diary/2026/2026-05-06.md";
  const plugin = makePlugin({
    files: {
      [diaryPath]: "# 2026-05-06\n\n## Notes\n\nExisting note.\n"
    }
  });
  plugin.settings = plugin.normalizeSettings({ managedPaths: { diaryRoot: "06_Diary" } });
  let processCalls = 0;
  plugin.app.vault.process = async (file, transform) => {
    processCalls += 1;
    file.text = `${String(file.text || "").trimEnd()}\n\nConcurrent note.\n`;
    file.text = String(transform(file.text));
    plugin.__files.set(file.path, file);
  };

  const result = await plugin.saveDailyStateForDate("2026-05-06", { mood: "稳定" }, { refresh: false });

  assert.equal(result.ok, true);
  assert.equal(processCalls, 1);
  const written = plugin.__files.get(diaryPath)?.text || "";
  assert.match(written, /Concurrent note\./);
  assert.match(written, /^mood:\s*稳定$/m);
});

test("daily state writeback can skip full home refresh for inline picker saves", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({ managedPaths: { diaryRoot: "06_Diary" } });
  const refreshes = [];
  plugin.requestNoriaRefresh = (...args) => {
    refreshes.push(args);
    return { ok: true };
  };

  await plugin.saveDailyStateForDate("2026-05-06", { mood: "稳定" }, { refresh: false });
  assert.deepEqual(refreshes, []);

  await plugin.saveDailyStateForDate("2026-05-06", { energy: "4" });
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0][0], "home");
  assert.equal(refreshes[0][1], "daily-state-save");
});

test("shared task status writeback follows the unique task after concurrent edits", async () => {
  const taskPath = "01_Projects/Alpha.md";
  const plugin = makePlugin({
    files: {
      [taskPath]: "# Alpha\n\n- [ ] Prepare report [due:: 2026-05-06]\n"
    }
  });
  plugin.settings = plugin.normalizeSettings({});
  let processCalls = 0;
  plugin.app.vault.process = async (file, transform) => {
    processCalls += 1;
    file.text = String(file.text || "").replace("# Alpha\n", "# Alpha\n\nConcurrent note.\n");
    file.text = String(transform(file.text));
    plugin.__files.set(file.path, file);
  };

  const result = await plugin.updateTaskCheckboxStatus({
    path: taskPath,
    line: 2,
    text: "Prepare report [due:: 2026-05-06]",
    done: true
  });

  assert.equal(result.ok, true);
  assert.equal(processCalls, 1);
  const written = plugin.__files.get(taskPath)?.text || "";
  assert.match(written, /Concurrent note\./);
  assert.match(written, /- \[x\] Prepare report \[due:: 2026-05-06\]/);
  const bridge = plugin.buildRuntimeBridgeConfig();
  assert.equal(typeof bridge.tasks?.updateStatus, "function");
});

test("shared task status writeback rejects ambiguous duplicate-title fallbacks", async () => {
  const taskPath = "01_Projects/Alpha.md";
  const original = "- [ ] Same task\n- [ ] Same task\n";
  const plugin = makePlugin({ files: { [taskPath]: original } });
  plugin.settings = plugin.normalizeSettings({});
  plugin.app.vault.process = async (file, transform) => {
    file.text = String(transform(file.text));
    plugin.__files.set(file.path, file);
  };

  const result = await plugin.updateTaskCheckboxStatus({
    path: taskPath,
    line: 0,
    text: "Same task",
    done: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "ambiguous-task");
  assert.equal(plugin.__files.get(taskPath)?.text, original);
});

test("periodic task views delegate checkbox writes to the runtime bridge", () => {
  const files = [
    "habitCheckin.js",
    "dailyOtherToday.js",
    "focusPanel.js",
    "monthlyOtherTasks.js",
    "weeklyOtherTasks.js"
  ];

  for (const file of files) {
    const source = fs.readFileSync(pluginPath("src", "runtime", "views", "periodic", file), "utf8");
    assert.match(source, /tasks\?\.updateStatus\?\.\(/, `${file} should use the shared task writer`);
    assert.doesNotMatch(source, /app\.vault\.modify\(/, `${file} should not overwrite task files directly`);
  }
});

test("runtime bridge exposes module flags and pomodoro disabled state", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({
    features: { modules: { tasksBoard: false, pomodoro: false } }
  });

  const bridge = plugin.buildRuntimeBridgeConfig();

  assert.equal(bridge.features.modules.tasksBoard, false);
  assert.equal(bridge.features.modules.taskTimeline, true);
  assert.equal(bridge.features.modules.pomodoro, false);
  assert.equal(bridge.pomodoroEnabled, false);
  assert.equal(bridge.appearance.density, "balanced");
  assert.deepEqual(plain(bridge.homeSettings.identity), {
    displayName: "",
    greetingName: "",
    avatarPath: "Noria/avatar.svg",
    quoteListPath: "Noria/Quotes.md"
  });
});

test("setup status reports missing seed notes and initialization creates only missing files", async () => {
  const plugin = makePlugin({
    externalPlugins: false,
    files: {
      "Z/Entry.md": "legacy entry"
    }
  });
  plugin.settings = plugin.normalizeSettings({
    managedPaths: {
      entryNote: "Z/Entry.md",
      timelineSettings: "Z/Timeline.md",
      templateLibrary: "Z/Templates.md",
      importantDates: "Z/Dates.md",
      habitRegistry: "Z/Habits.md",
      projectRegistry: "Z/Projects.md",
      inboxWorkflow: "Z/Inbox workflow.md",
      inboxQueue: "Z/Inbox queue.base",
      inboxRoot: "Inbox",
      projectsRoot: "Projects",
      diaryRoot: "Diary",
      dailyTemplate: "Z/Daily.md",
      weeklyTemplate: "Z/Weekly.md",
      monthlyTemplate: "Z/Monthly.md",
      yearlyTemplate: "Z/Yearly.md"
    }
  });
  const refreshes = [];
  plugin.requestNoriaRefresh = async (...args) => {
    refreshes.push(args);
    return { ok: true };
  };

  assert.equal(typeof plugin.getSetupStatus, "function");
  assert.equal(typeof plugin.initializeMissingManagedNotes, "function");

  const status = await plugin.getSetupStatus();
  assert.equal(status.dataRuntime.available, true);
  assert.equal(status.missing.some((item) => item.key === "entryNote"), false);
  assert.ok(status.missing.some((item) => item.key === "inboxWorkflow"));
  assert.ok(status.missing.some((item) => item.key === "inboxQueue"));
  assert.ok(status.missing.some((item) => item.key === "importantDates"));
  assert.equal(plugin.__created.length, 0, "status check must not write vault files");

  const result = await plugin.initializeMissingManagedNotes();

  assert.ok(result.created.some((item) => item.key === "importantDates"));
  assert.equal(result.created.some((item) => item.key === "taskRegistry"), false);
  assert.ok(result.created.some((item) => item.key === "todayDiary"));
  assert.ok(result.created.some((item) => item.key === "homeQuoteList"));
  assert.ok(result.created.some((item) => item.key === "homeAvatar"));
  assert.ok(result.created.some((item) => item.key === "inboxQueue"));
  assert.ok(result.created.some((item) => item.key === "inboxWorkflow"));
  assert.ok(result.created.filter((item) => item.key === "starterProject").length >= 2);
  assert.ok(result.created.filter((item) => item.key === "starterInboxNote").length >= 2);
  assert.ok(result.created.filter((item) => item.key === "starterMoc").length >= 2);
  assert.equal(plugin.__files.get("Z/Entry.md").text, "legacy entry");
  assert.equal(plugin.__files.has("Z/Dates.md"), true);
  assert.equal(plugin.__files.has("Z/Inbox workflow.md"), true);
  assert.equal(plugin.__files.has("Z/Inbox queue.base"), true);
  assert.match(plugin.__files.get("Z/Inbox queue.base").text, /views:\n\s+- type: table/);
  assert.equal(plugin.__files.has("Z/Tasks.md"), false);
  assert.match(plugin.__files.get("Z/Habits.md").text, /#habit/);
  assert.match(plugin.__files.get("Z/Habits.md").text, /#active/);
  assert.match(plugin.__files.get("Z/Habits.md").text, /## Active habits/);
  assert.match(plugin.__files.get("Z/Habits.md").text, /## Daily recurring task source/);
  assert.doesNotMatch(plugin.__files.get("Z/Habits.md").text, /打卡中的习惯|循环任务源/);
  assert.match(plugin.__files.get("Z/Projects.md").text, /## Active projects/);
  assert.match(plugin.__files.get("Z/Projects.md").text, /## Planned projects/);
  assert.doesNotMatch(plugin.__files.get("Z/Projects.md").text, /进行中的项目|计划中的项目/);
  assert.match(plugin.__files.get("Z/Projects.md").text, /\[\[Projects\//);
  assert.ok([...plugin.__files.keys()].filter((p) => p.startsWith("Projects/") && p.endsWith(".md")).length >= 2);
  assert.ok([...plugin.__files.keys()].filter((p) => p.startsWith("Inbox/") && p.endsWith(".md")).length >= 2);
  assert.equal(plugin.__files.has(plugin.getDiaryPathForDate(new Date())), true);
  assert.deepEqual(JSON.parse(plugin.__files.get(".obsidian/daily-notes.json").text), {
    folder: "Diary",
    format: "YYYY/YYYY-MM-DD",
    template: "Z/Daily"
  });
  assert.deepEqual(JSON.parse(plugin.__files.get(".obsidian/templates.json").text), {
    folder: "Z"
  });
  assert.equal(plugin.__files.has("Noria/Quotes.md"), true);
  assert.equal(plugin.__files.has("Noria/avatar.svg"), true);
  assert.equal(plugin.__files.has("Noria/Home.md"), false);
  assert.equal(plugin.settings.onboarding.initializedAt.length > 0, true);
  assert.equal(plugin.settings.weather.enabled, true, "first explicit initialization should enable weather");
  assert.deepEqual(plain(refreshes), [["reload", "seed:create", { immediate: true, reloadViews: true }]]);

  plugin.settings.weather.enabled = false;
  await plugin.initializeMissingManagedNotes();
  assert.equal(plugin.settings.weather.enabled, false, "later repairs must preserve the user's weather choice");
});

test("obsidian template config sync aligns daily notes and templates with managed paths", async () => {
  const plugin = makePlugin({
    files: {
      ".obsidian/daily-notes.json": JSON.stringify({
        autorun: true,
        folder: "06_Diary/2026",
        template: "02_Areas/知识库管理/Obsidian/Templates/Daily Template",
        format: "YYYY-MM-DD"
      }),
      ".obsidian/templates.json": JSON.stringify({
        folder: "02_Areas/知识库管理/Obsidian/Templates"
      })
    }
  });
  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "custom" },
    managedPaths: {
      diaryRoot: "06_Diary",
      dailyTemplate: "02_Areas/Templates/Daily Template.md"
    }
  });

  const before = await plugin.getObsidianTemplateConfigStatus();
  assert.equal(before.ok, false);
  assert.equal(before.dailyNotes.expected.folder, "06_Diary");
  assert.equal(before.dailyNotes.expected.format, "YYYY/YYYY-MM-DD");
  assert.equal(before.dailyNotes.expected.template, "02_Areas/Templates/Daily Template");
  assert.equal(before.templates.expected.folder, "02_Areas/Templates");

  const result = await plugin.syncObsidianTemplateConfigs();

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(plugin.__files.get(".obsidian/daily-notes.json").text), {
    autorun: true,
    folder: "06_Diary",
    template: "02_Areas/Templates/Daily Template",
    format: "YYYY/YYYY-MM-DD"
  });
  assert.deepEqual(JSON.parse(plugin.__files.get(".obsidian/templates.json").text), {
    folder: "02_Areas/Templates"
  });
  assert.equal((await plugin.getObsidianTemplateConfigStatus()).ok, true);
});

test("obsidian template and Daily Notes config follow a custom vault config directory", async () => {
  const plugin = makePlugin({
    configDir: ".obsidian-custom",
    files: {
      ".obsidian-custom/daily-notes.json": JSON.stringify({ folder: "Old", format: "YYYY-MM-DD" }),
      ".obsidian-custom/templates.json": JSON.stringify({ folder: "Old/Templates" })
    }
  });
  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "custom" },
    managedPaths: {
      diaryRoot: "Journal",
      dailyTemplate: "Noria/Templates/Daily.md"
    }
  });

  const result = await plugin.syncObsidianTemplateConfigs();
  const daily = await plugin.readDailyNotesPluginConfig();

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(plugin.__files.get(".obsidian-custom/daily-notes.json").text), {
    folder: "Journal",
    format: "YYYY/YYYY-MM-DD",
    template: "Noria/Templates/Daily"
  });
  assert.deepEqual(JSON.parse(plugin.__files.get(".obsidian-custom/templates.json").text), {
    folder: "Noria/Templates"
  });
  assert.deepEqual(plain(daily), {
    folder: "Journal",
    format: "YYYY/YYYY-MM-DD",
    template: "Noria/Templates/Daily"
  });
  assert.equal(plugin.__files.has(".obsidian/daily-notes.json"), false);
  assert.equal(plugin.__files.has(".obsidian/templates.json"), false);
});

test("custom workspace setup status ignores standard starter seed files", async () => {
  const files = {
    "Config/Timeline.md": "timeline",
    "Config/Events.md": "events",
    "Config/Countdowns.md": "dates",
    "Config/Habits.md": "habits",
    "Config/Projects.md": "projects",
    "Config/Inbox workflow.md": "workflow",
    "Config/Inbox queue.base": "queue",
    "Config/Daily.md": "daily",
    "Config/Weekly.md": "weekly",
    "Config/Monthly.md": "monthly",
    "Config/Yearly.md": "yearly",
    "Config/Quotes.md": "quotes",
    "Attachment/avatar.jpg": "avatar",
    "MOC/Knowledge.canvas": "{}"
  };
  const plugin = makePlugin({
    externalPlugins: false,
    files,
    folders: ["Diary", "Inbox", "Projects", "Config", "MOC", "Attachment"]
  });
  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "custom", workspaceRoot: "Noria" },
    managedPaths: {
      entryNote: "Config/Home.md",
      timelineSettings: "Config/Timeline.md",
      templateLibrary: "Config/Events.md",
      importantDates: "Config/Countdowns.md",
      habitRegistry: "Config/Habits.md",
      projectRegistry: "Config/Projects.md",
      inboxWorkflow: "Config/Inbox workflow.md",
      inboxQueue: "Config/Inbox queue.base",
      inboxRoot: "Inbox",
      projectsRoot: "Projects",
      diaryRoot: "Diary",
      dailyTemplate: "Config/Daily.md",
      weeklyTemplate: "Config/Weekly.md",
      monthlyTemplate: "Config/Monthly.md",
      yearlyTemplate: "Config/Yearly.md"
    },
    home: {
      identity: {
        quoteListPath: "Config/Quotes.md",
        avatarPath: "Attachment/avatar.jpg"
      }
    },
    homeDashboard: {
      mocEntryPaths: ["MOC/Knowledge.md"],
      mocEntries: [{ path: "MOC/Knowledge.md", color: "#10b981" }]
    }
  });

  const status = await plugin.getSetupStatus();

  assert.equal(status.missing.length, 0);
  assert.equal(status.canInitialize, false);
  assert.equal(status.seedPlan.some((item) => item.key === "starterProject"), false);
  assert.equal(status.seedPlan.some((item) => item.key === "starterInboxNote"), false);
  assert.equal(status.seedPlan.some((item) => item.key === "starterMoc"), false);
  assert.equal(status.seedPlan.some((item) => item.key === "inboxQueue" && item.action === "keep"), true);
  assert.equal(status.unsupported.some((item) => item.key === "homeAvatar"), false);
});

test("setup repair refreshes recognizable old starter defaults without overwriting user notes", async () => {
  const oldTaskSeed = "## Tasks\n\n- [ ] 熟悉 Noria 主页和任务看板 ![[2026-05-05]]\n- [ ] 整理一个项目入口 ![[2026-05-12]]\n- [ ] 完成第一次日复盘 ![[2026-05-05]]\n\n## Later\n\n- [ ] 规划下一个月度复盘 ![[2026-06-04]]\n";
  const userProject = "## 进行中的项目\n\n- [[我的真实项目]]\n";
  const plugin = makePlugin({
    externalPlugins: false,
    files: {
      "Noria/Tasks.md": oldTaskSeed,
      "Noria/Habits.md": "## 打卡中的习惯\n\n- [ ] 早间整理 10 分钟 #habit\n- [ ] 阅读或摘录 20 分钟 #habit\n- [ ] 睡前复盘 5 分钟 #habit\n\n## 暂停的习惯\n\n- 每日长跑\n\n## 已养成习惯\n\n- 每周整理 Inbox\n\n## 循环任务源（每日）\n\n- [ ] 检查今日任务 #habit\n",
      "Noria/MOC.md": "## MOC\n\n- [[Tasks]]：任务入口和暂存任务。\n- [[Projects]]：项目清单。\n- [[Habits]]：习惯打卡。\n- [[Countdowns]]：倒计时和重要日期。\n",
      "Noria/Projects.md": userProject
    },
    folders: ["Noria"]
  });
  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "standard", workspaceRoot: "Noria", initializedAt: "2026-05-05T00:00:00.000Z" },
    managedPaths: plugin.getStarterManagedPaths("Noria"),
    home: { identity: plugin.getStarterHomeIdentity("Noria") },
    homeDashboard: plugin.getStarterHomeDashboard("Noria")
  });

  const status = await plugin.getSetupStatus();
  assert.equal(status.canRepair, true);
  assert.ok(status.repairPlan.some((item) => item.key === "legacyTaskRegistry" && item.action === "delete"));

  const result = await plugin.initializeMissingManagedNotes();

  assert.ok(plugin.__deleted.includes("Noria/Tasks.md"));
  assert.match(plugin.__files.get("Noria/Habits.md").text, /#active/);
  assert.match(plugin.__files.get("Noria/Workflow·MOC.md").text, /## /);
  assert.equal(plugin.__files.get("Noria/Projects.md").text, userProject);
  assert.ok(result.repaired.some((item) => item.key === "legacyTaskRegistry"));
});

test("setup repair refreshes empty and legacy event libraries for any workspace profile", async () => {
  const legacyEventLibrary = [
    "## Event library",
    "",
    "| Name | Start | Duration | Tag |",
    "| --- | --- | --- | --- |",
    "| Deep work | 09:00 | 90 | #tl/focus |",
    "| Lunch break | 12:30 | 45 | #tl/break |",
    "| Evening review | 21:30 | 20 | #tl/review |",
    ""
  ].join("\n");
  const plugin = makePlugin({
    files: {
      "Config/Empty events.md": "",
      "Config/Legacy events.md": legacyEventLibrary
    },
    folders: ["Config"]
  });

  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "custom", initializedAt: "2026-05-05T00:00:00.000Z" },
    managedPaths: {
      templateLibrary: "Config/Empty events.md"
    }
  });

  const emptyStatus = await plugin.getSetupStatus();
  assert.ok(emptyStatus.repairPlan.some((item) => item.key === "templateLibrary" && item.action === "replace"));
  assert.equal(emptyStatus.canRepair, true);
  const emptyResult = await plugin.initializeMissingManagedNotes();
  assert.ok(emptyResult.repaired.some((item) => item.key === "templateLibrary"));
  assert.match(plugin.__files.get("Config/Empty events.md").text, /#tl\/template/);
  assert.match(plugin.__files.get("Config/Empty events.md").text, /\[default_tag:: #tl\/breakfast\]/);

  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "custom", initializedAt: "2026-05-05T00:00:00.000Z" },
    managedPaths: {
      templateLibrary: "Config/Legacy events.md"
    }
  });

  const legacyResult = await plugin.initializeMissingManagedNotes();
  assert.ok(legacyResult.repaired.some((item) => item.key === "templateLibrary"));
  assert.match(plugin.__files.get("Config/Legacy events.md").text, /#tl\/template/);
  assert.doesNotMatch(plugin.__files.get("Config/Legacy events.md").text, /\|\s*Name\s*\|\s*Start\s*\|\s*Duration\s*\|\s*Tag\s*\|/);
});

test("initialization moves missing legacy quote default back into the starter workspace", async () => {
  const plugin = makePlugin({ externalPlugins: false });
  plugin.settings = plugin.normalizeSettings({
    onboarding: { profile: "standard", workspaceRoot: "Noria" },
    home: {
      identity: {
        avatarPath: "",
        quoteListPath: "02_Areas/知识库管理/清单-名言.md"
      }
    }
  });

  const result = await plugin.initializeMissingManagedNotes();

  assert.equal(plugin.settings.home.identity.avatarPath, "Noria/avatar.svg");
  assert.equal(plugin.settings.home.identity.quoteListPath, "Noria/Quotes.md");
  assert.ok(result.defaultedSupportFields.includes("home.identity.avatarPath"));
  assert.ok(result.defaultedSupportFields.includes("home.identity.quoteListPath"));
  assert.equal(plugin.__files.has("Noria/avatar.svg"), true);
  assert.equal(plugin.__files.has("Noria/Quotes.md"), true);
  assert.equal(plugin.__files.has("02_Areas/知识库管理/清单-名言.md"), false);
});

test("setup status separates missing parent folders, absolute paths, and seed create plan", async () => {
  const plugin = makePlugin({
    externalPlugins: false,
    files: {
      "Z/Entry.md": "legacy entry"
    },
    folders: ["Z"]
  });
  plugin.settings = plugin.normalizeSettings({
    managedPaths: {
      entryNote: "Z/Entry.md",
      timelineSettings: "Z/Nested/Timeline.md",
      templateLibrary: "C:/external/Templates.md",
      importantDates: "Z/Dates.md",
      habitRegistry: "Z/Habits.md",
      projectRegistry: "Z/Projects.md"
    }
  });

  const status = await plugin.getSetupStatus();

  assert.ok(status.parentDirectories.some((item) => item.path === "Z/Nested" && item.exists === false));
  assert.ok(status.unsupported.some((item) => item.key === "templateLibrary" && item.reason === "absolute-path"));
  assert.ok(status.seedPlan.some((item) => item.key === "timelineSettings" && item.action === "create"));
  assert.equal(status.seedPlan.some((item) => item.key === "templateLibrary" && item.action === "create"), false);
  assert.equal(plugin.__created.length, 0);
});

test("settings IA moves ordinary settings out of Advanced", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.match(bodyOf(main, "renderOverviewTab"), /renderSetupWizard/);
  assert.match(bodyOf(main, "renderOverviewTab"), /renderOverviewDataSourcesSection/);
  assert.match(bodyOf(main, "renderOverviewTab"), /addSettingHeading\(containerEl,\s*"settings\.sections\.modules"\)/);
  assert.match(bodyOf(main, "renderOverviewTab"), /renderAdvancedDisclosure\(containerEl,\s*"settings\.modules\.featureSwitches",\s*"settings\.desc\.modules"/);
  assert.match(bodyOf(main, "renderOverviewTab"), /renderModuleSettings\(details,\s*\{\s*heading:\s*false\s*\}\)/);
  assert.match(bodyOf(main, "renderOverviewDataSourcesSection"), /renderManagedPathGroup/);
  assert.match(bodyOf(main, "renderHomeTab"), /settings\.weather\.enabled/);
  assert.match(bodyOf(main, "renderHomeDefaultSettings"), /settings\.home\.guideReviewCenterExpanded/);
  assert.match(bodyOf(main, "renderTasksTab"), /settings\.tasks\.includeTags/);
  assert.doesNotMatch(bodyOf(main, "renderTimelineTab"), /settings\.timeline\.pomodoroModule|settings\.features\.modules\.pomodoro/);
  assert.match(bodyOf(main, "renderModuleSettings"), /settings\.modules\.pomodoro/);
  assert.doesNotMatch(bodyOf(main, "renderCalendarTab"), /calendarEnabled|settings\.calendar\.enabled/);
  assert.match(main, /async openCalendarLeaf\(\)\s*\{\s*if \(!this\.isModuleEnabled\("calendar"\)\)/);
  assert.match(bodyOf(main, "renderAppearanceTab"), /renderAppearancePresetSettings/);
  for (const tab of ["renderHomeTab", "renderTasksTab", "renderTimelineTab"]) {
    assert.doesNotMatch(bodyOf(main, tab), /renderManagedPathStatusSummary/, tab);
  }

  const advanced = bodyOf(main, "renderAdvancedTab");
  for (const oldLabel of [
    "MOC entry paths",
    "Weather provider",
    "Timeline quick settings",
    "Task tag filter",
    "Runtime base directory",
    "Planner UX",
    "Month tag color map",
    "Raw visual tuning is in Advanced"
  ]) {
    assert.doesNotMatch(advanced, new RegExp(oldLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("overview module switches stay folded and expose stable row hooks", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const overview = bodyOf(main, "renderOverviewTab");
  const moduleSettings = bodyOf(main, "renderModuleSettings");
  const advancedDisclosure = bodyOf(main, "renderAdvancedDisclosure");

  assert.match(overview, /addSettingHeading\(containerEl,\s*"settings\.sections\.modules"\)/);
  assert.match(overview, /renderAdvancedDisclosure\(containerEl,\s*"settings\.modules\.featureSwitches",\s*"settings\.desc\.modules"/);
  assert.match(overview, /renderModuleSettings\(details,\s*\{\s*heading:\s*false\s*\}\)/);
  assert.match(overview, /className:\s*"noria-settings-feature-switches"/);
  assert.match(advancedDisclosure, /renderAdvancedDisclosure\(containerEl,\s*titleKey,\s*descKey,\s*renderContent,\s*options\s*=\s*\{\}\)/);
  assert.match(advancedDisclosure, /options\.className\s*\|\|\s*"noria-settings-diagnostics"/);
  assert.match(moduleSettings, /renderModuleSettings\(containerEl,\s*options\s*=\s*\{\}\)/);
  assert.match(moduleSettings, /if\s*\(options\.heading\s*!==\s*false\)/);
  assert.match(moduleSettings, /setting\.settingEl\?\.addClass\?\.\("noria-settings-module-row"\)/);
  assert.match(moduleSettings, /setting\.settingEl\?\.setAttr\?\.\("data-noria-module-key",\s*key\)/);
});

test("overview quick actions expose same-control action diagnostics", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const quickActions = bodyOf(main, "renderOverviewQuickActions");
  const decorateAction = bodyOf(main, "decorateSettingsActionButton");
  const setAction = bodyOf(main, "setSettingsActionButtonState");
  const runAction = bodyOf(main, "runSettingsActionButton");

  assert.match(decorateAction, /buttonEl/);
  assert.match(decorateAction, /noria-settings-action-button/);
  assert.match(decorateAction, /data-noria-action-source/);
  assert.match(decorateAction, /data-noria-action-kind/);
  assert.match(decorateAction, /data-noria-action-state",\s*"idle"/);
  assert.match(setAction, /data-noria-action-state",\s*state/);
  assert.match(setAction, /aria-busy/);
  assert.match(setAction, /data-noria-action-error/);
  assert.match(runAction, /setSettingsActionButtonState\(btn,\s*"pending"\)/);
  assert.match(runAction, /setSettingsActionButtonState\(btn,\s*state,\s*message\)/);
  assert.match(runAction, /setSettingsActionButtonState\(btn,\s*"failed",\s*message\)/);

  for (const kind of ["open-user-guide", "sync-obsidian-templates", "apply-missing-defaults", "replace-all-defaults"]) {
    assert.match(quickActions, new RegExp(`decorateSettingsActionButton\\(btn,\\s*"settings-overview",\\s*"${kind}"`));
  }
  assert.match(quickActions, /runSettingsActionButton\(btn,\s*\(\) => this\.plugin\.openUserGuide\(\)\)/);
  assert.match(quickActions, /runSettingsActionButton\(btn,\s*async \(\) => \{/);
});

test("settings polish exposes setup summary query preview and appearance token preview", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");

  assert.match(bodyOf(main, "renderSetupWizard"), /renderSetupWizardSummary/);
  assert.match(bodyOf(main, "renderSetupWizard"), /if \(!status\.canInitialize\) return;/);
  assert.match(bodyOf(main, "renderOverviewTab"), /renderSettingsControlCenter/);
  assert.match(bodyOf(main, "renderOverviewDataSourcesSection"), /renderManagedPathGroup/);
  assert.match(bodyOf(main, "renderQueryScopeSettings"), /renderQueryScopePreview/);
  assert.match(bodyOf(main, "renderAppearancePresetSettings"), /renderAppearancePreview/);
  assert.match(bodyOf(main, "renderAppearancePresetSettings"), /renderAppearanceTagColorSettings/);
  assert.match(main, /setAppearanceTagColor/);
  assert.match(bodyOf(main, "renderAdvancedTab"), /details/);
  assert.doesNotMatch(bodyOf(main, "renderAdvancedTab"), /实验面板|Advanced lab|Week\/day advanced lab/);

  for (const key of [
    "settings.setup.runtime",
    "settings.setup.seedPlan",
    "settings.setup.parentDirs",
    "settings.setup.unsupported",
    "settings.performance.scopePreview",
    "settings.appearance.invalidTagColor",
    "settings.appearance.previewDensity",
    "settings.appearance.previewAccent"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }
});

test("Maintenance tab keeps only actionable recovery and developer controls", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const maintenance = bodyOf(main, "renderAdvancedTab");

  for (const key of [
    "settings.sections.maintenanceTroubleshooting",
    "settings.sections.maintenanceBackup",
    "settings.sections.maintenanceDeveloper"
  ]) {
    assert.match(maintenance, new RegExp(JSON.stringify(key)));
  }
  assert.match(maintenance, /renderMaintenanceTroubleshooting/);
  assert.match(maintenance, /renderMaintenanceBackup/);
  assert.match(maintenance, /renderAdvancedDisclosure/);
  assert.doesNotMatch(maintenance, /renderPlannerVisualTuning|advancedDiagnostics|advancedRawTuning/);
  assert.doesNotMatch(maintenance, /buildRuntimeBridgeConfig\(\)\.runtimePaths|createEl\("pre"/);
});

test("appearance token map applies density accent status card and tag variables", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({
    appearance: {
      density: "compact",
      accentPreset: "forest",
      statusPalette: "highContrast",
      cardStrength: "strong",
      tagColorMap: {
        project: "#3b82f6",
        invalid: "not-a-color"
      }
    }
  });

  assert.equal(typeof plugin.getAppearanceTokenMap, "function");
  const tokens = plugin.getAppearanceTokenMap(plugin.settings.appearance);

  assert.equal(tokens["--noria-density-scale"], "0.92");
  assert.equal(tokens["--noria-accent"], "#22c55e");
  assert.equal(tokens["--noria-status-accent"], "#ef4444");
  assert.match(tokens["--noria-card-shadow"], /24px/);
  assert.equal(tokens["--noria-tag-project"], "#3b82f6");
  assert.equal(tokens["--noria-tag-invalid"], undefined);
});

test("phase2 i18n catalog covers settings, modules, onboarding, appearance, and empty states", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const plugin = makePlugin({ language: "zh-CN" });

  for (const key of [
    "settings.sections.setupWizard",
    "settings.sections.modules",
    "settings.modules.home",
    "settings.modules.tasksBoard",
    "settings.modules.taskTimeline",
    "settings.modules.pomodoro",
    "settings.modules.diaryStats",
    "settings.modules.reviewCenter",
    "settings.home.profile",
    "settings.home.displayName",
    "settings.home.greetingName",
    "settings.home.avatarPath",
    "settings.home.quoteListPath",
    "settings.home.guideReviewCenterExpanded",
    "settings.home.guideReviewCenterExpandedDesc",
    "settings.onboarding.initialize",
    "settings.onboarding.openWizard",
    "settings.reloadRequired",
    "settings.tasks.includeTags",
    "settings.timeline.pomodoroModule",
    "settings.appearance.density",
    "settings.appearance.accentPreset",
    "settings.appearance.statusPalette",
    "settings.appearance.cardStrength",
    "settings.appearance.tagColorMap",
    "settings.review.promptSkillName",
    "settings.review.promptNotePath",
    "settings.review.promptTemplate",
    "settings.review.defaultSkill",
    "modules.disabled.title",
    "modules.disabled.openSettings"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
    assert.notEqual(plugin.t(key), key, `${key} should be translated`);
  }
});

test("pomodoro module flag hides timeline attach entry points", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const timeline = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");

  assert.match(main, /isPomodoroModuleEnabled/);
  assert.match(main, /pomodoroEnabled/);
  assert.match(timeline, /noriaTlIsPomodoroEnabled/);
  assert.match(timeline, /shouldShowPomodoro\s*=\s*!!\(noriaTlIsPomodoroEnabled\(\)/);
  assert.match(timeline, /if \(!noriaTlIsPomodoroEnabled\(\)\) return;/);
});

test("review workbench and timeline ItemView chrome use locale catalog strings", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const slice = (startMarker, endMarker) => {
    const start = main.indexOf(startMarker);
    const end = main.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(start, -1, `${startMarker} should exist`);
    assert.notEqual(end, -1, `${endMarker} should exist`);
    return main.slice(start, end);
  };
  const timelineView = slice("class NoriaTaskTimelineView", "function noriaElementIsVisibleEnough");
  const reviewView = slice("class NoriaReviewCenterRenderer", "class NoriaSettingTab");

  for (const key of [
    "timeline.chrome.captureToDiary",
    "timeline.chrome.attachPomodoro",
    "timeline.inline.write",
    "timeline.error.loadFailed",
    "review.period.daily",
    "review.evidence.title",
    "review.llm.title",
    "review.final.title",
    "review.final.saveToDiary"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  for (const text of [
    "收集到今日日记",
    "拖动到任务卡片右侧以附着番茄钟",
    "快速写入今日日记",
    "写入中",
    "任务轴加载失败",
    "任务时间轴（空白基座）"
  ]) {
    assert.doesNotMatch(timelineView, new RegExp(text));
  }

  for (const text of [
    "复盘中心",
    "每日",
    "读取复盘证据",
    "今日证据",
    "生成分析",
    "最终归档",
    "保存到日记"
  ]) {
    assert.doesNotMatch(reviewView, new RegExp(text));
  }
});
