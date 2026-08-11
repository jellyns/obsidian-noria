const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");
const reviewCenterCore = require("../src/review-center-core.js");
const noriaIdentity = require("../src/noria-identity.js");
const settingsMaintenance = require("../src/settings-maintenance.js");

const pluginRoot = path.resolve(__dirname, "..");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function read(rel) {
  return fs.readFileSync(pluginPath(rel), "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] || "";
}

function loadPluginClass() {
  const code = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const module = { exports: {} };
  const context = {
    console,
    module,
    exports: module.exports,
    setTimeout() { return 1; },
    clearTimeout() {},
    require(id) {
      if (id === "obsidian") {
        return {
          Plugin: class {},
          PluginSettingTab: class {},
          ItemView: class {},
          Setting: class {},
          Notice: class {},
          setIcon() {},
          getLanguage() { return "en"; }
        };
      }
      if (id === "child_process") return {};
      if (id === "./generated/embedded-runtime-sources.js") {
        return { NORIA_EMBEDDED_RUNTIME_SOURCES: {}, NORIA_RUNTIME_BUILD_ID: "test" };
      }
      if (id === "./review-center-core.js") return reviewCenterCore;
      if (id === "./noria-identity.js") return noriaIdentity;
      if (id === "./settings-maintenance.js") return settingsMaintenance;
      throw new Error(`Unexpected require: ${id}`);
    },
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "main.js" });
  return module.exports.default || module.exports;
}

function loadRuntimeChart(rel) {
  const code = read(rel);
  const context = {
    console,
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: rel });
  return context.dashboardCore.components.charts;
}

const FLAT_HOME_WIDGET_IDS = [
  "identity",
  "metrics",
  "today-actions",
  "daily-advice",
  "today-tasks-card",
  "inbox-card",
  "countdown-card",
  "habit-history-card",
  "projects-card",
  "moc-strip",
  "review-focus",
  "trends-range",
  "note-trend-card",
  "task-trend-card",
  "habit-heatmap-card",
  "workload-heatmap-card",
  "tag-distribution-card",
  "daily-state-card"
];

test("home schema v3 exposes every visual card as a first-class root widget", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const defaults = plugin.normalizeSettings({});

  assert.deepEqual(plain(defaults.home.widgets.map((widget) => widget.id)), FLAT_HOME_WIDGET_IDS);
  assert.deepEqual(plain(defaults.home.widgets.map((widget) => widget.schemaVersion)), FLAT_HOME_WIDGET_IDS.map(() => 3));
  assert.equal(defaults.home.widgets.some((widget) => ["workbench", "guide", "trends"].includes(widget.id)), false);
  const dailyAdvice = defaults.home.widgets.find((widget) => widget.id === "daily-advice");
  assert.equal(dailyAdvice.type, "markdown");
  assert.equal(dailyAdvice.enabled, false);
  assert.equal(dailyAdvice.size, "full");
  assert.equal(dailyAdvice.title, "建议");
  assert.equal(dailyAdvice.source, "");
  assert.deepEqual(plain(dailyAdvice.props), {
    sourceMode: "daily-section",
    heading: "建议",
    renderMode: "compact"
  });
  assert.equal(defaults.home.widgets.some((widget) => widget.id === "focus-strip"), false);
  assert.deepEqual(plain(defaults.home.widgets.find((widget) => widget.id === "today-tasks-card").props.panels), ["tasks"]);
  assert.deepEqual(plain(defaults.home.widgets.find((widget) => widget.id === "inbox-card").props.panels), ["inbox"]);
  assert.deepEqual(plain(defaults.home.widgets.find((widget) => widget.id === "countdown-card").props.panels), ["countdown"]);
  assert.equal(defaults.home.widgets.find((widget) => widget.id === "review-focus").props.defaultExpanded, true);
  assert.equal(defaults.home.widgets.find((widget) => widget.id === "habit-heatmap-card").props.heatmapMode, "habit");
  assert.equal(defaults.home.widgets.find((widget) => widget.id === "workload-heatmap-card").props.heatmapMode, "workload");
  assert.ok(
    defaults.home.widgets.findIndex((widget) => widget.id === "habit-history-card")
      < defaults.home.widgets.findIndex((widget) => widget.id === "projects-card"),
    "the full habit card should sit above projects"
  );
});

test("home settings discard the retired focus strip and retain source-less daily-section cards", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const normalized = plugin.normalizeSettings({
    home: {
      widgets: [
        { id: "focus-strip", type: "builtin", enabled: true, order: 35, size: "full", source: "focus-strip", props: {} },
        {
          id: "project-advice",
          type: "markdown",
          enabled: true,
          order: 40,
          size: "wide",
          title: "项目建议",
          source: "",
          props: { sourceMode: "daily-section", heading: "项目建议", renderMode: "compact" }
        }
      ]
    }
  });

  assert.equal(normalized.home.widgets.some((widget) => widget.id === "focus-strip"), false);
  assert.deepEqual(plain(normalized.home.widgets.find((widget) => widget.id === "project-advice")), {
    id: "project-advice",
    type: "markdown",
    schemaVersion: 3,
    enabled: true,
    order: 40,
    size: "wide",
    title: "项目建议",
    source: "",
    props: { sourceMode: "daily-section", heading: "项目建议", renderMode: "compact" }
  });
});

test("home settings migrate only the retired default habit-card position above projects", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const legacy = plain(plugin.normalizeSettings({}));
  legacy.home.widgets.find((widget) => widget.id === "habit-history-card").order = 73;

  const migrated = plugin.normalizeSettings(legacy);
  assert.equal(migrated.home.widgets.find((widget) => widget.id === "habit-history-card").order, 53);
  assert.ok(
    migrated.home.widgets.findIndex((widget) => widget.id === "habit-history-card")
      < migrated.home.widgets.findIndex((widget) => widget.id === "projects-card")
  );

  legacy.home.widgets.find((widget) => widget.id === "habit-history-card").order = 17;
  const customized = plugin.normalizeSettings(legacy);
  assert.equal(customized.home.widgets.find((widget) => widget.id === "habit-history-card").order, 17);
});

test("home schema v3 expands legacy wrappers without losing groups, visibility, extensions, or idempotence", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const legacy = {
    home: {
      guidePanels: {
        inbox: false,
        projects: true,
        moc: false,
        reviewCenter: true,
        reviewCenterExpanded: false
      },
      widgets: [
        { id: "identity", type: "builtin", schemaVersion: 2, enabled: true, order: 10, size: "wide", source: "home-identity", props: {} },
        { id: "metrics", type: "builtin", schemaVersion: 2, enabled: true, order: 20, size: "wide", source: "overview-metrics", props: {} },
        { id: "today-actions", type: "builtin", schemaVersion: 2, enabled: true, order: 30, size: "full", source: "today-actions", props: {} },
        { id: "focus-strip", type: "builtin", schemaVersion: 2, enabled: true, order: 35, size: "full", source: "focus-strip", props: {} },
        {
          id: "workbench",
          type: "builtin",
          schemaVersion: 2,
          enabled: true,
          order: 50,
          size: "full",
          collapsed: true,
          source: "overview-columns",
          experimental: { owner: "legacy-workbench" },
          props: {
            leftPanels: ["tasks", "countdown"],
            middlePanels: [],
            rightPanels: ["inbox"],
            futureOption: "preserve-me"
          }
        },
        { id: "guide", type: "builtin", schemaVersion: 2, enabled: true, order: 60, size: "full", source: "guide-panels", props: {} },
        {
          id: "trends",
          type: "builtin",
          schemaVersion: 2,
          enabled: true,
          order: 70,
          size: "full",
          source: "trends-and-stats",
          props: {
            topBlocks: ["task-trend"],
            middleBlocks: ["heatmaps"],
            bottomBlocks: []
          }
        },
        {
          id: "custom-briefing",
          type: "markdown",
          schemaVersion: 7,
          enabled: false,
          order: 66,
          size: "wide",
          source: "Dashboard/Briefing.md",
          layout: { minWidth: 360 },
          experimental: { role: "briefing" },
          props: { mode: "briefing" }
        }
      ]
    }
  };

  const migrated = plugin.normalizeSettings(legacy);
  const widgets = migrated.home.widgets;
  assert.equal(widgets.some((widget) => ["workbench", "guide", "trends"].includes(widget.id)), false);
  assert.deepEqual(plain(widgets.find((widget) => widget.id === "today-tasks-card").props.panels), ["tasks", "countdown"]);
  assert.equal(widgets.find((widget) => widget.id === "today-tasks-card").collapsed, true);
  assert.deepEqual(plain(widgets.find((widget) => widget.id === "today-tasks-card").experimental), { owner: "legacy-workbench" });
  assert.equal(widgets.find((widget) => widget.id === "today-tasks-card").props.futureOption, "preserve-me");
  assert.deepEqual(plain(widgets.find((widget) => widget.id === "inbox-card").props.panels), ["inbox"]);
  assert.equal(widgets.some((widget) => widget.id === "countdown-card"), false);

  assert.equal(widgets.find((widget) => widget.id === "projects-card").enabled, true);
  assert.equal(widgets.find((widget) => widget.id === "moc-strip").enabled, false);
  assert.equal(widgets.find((widget) => widget.id === "review-focus").enabled, true);
  assert.equal(widgets.find((widget) => widget.id === "review-focus").props.defaultExpanded, false);

  assert.equal(widgets.find((widget) => widget.id === "task-trend-card").enabled, true);
  assert.equal(widgets.find((widget) => widget.id === "note-trend-card").enabled, false);
  assert.equal(widgets.find((widget) => widget.id === "habit-heatmap-card").enabled, true);
  assert.equal(widgets.find((widget) => widget.id === "workload-heatmap-card").enabled, true);
  assert.equal(widgets.find((widget) => widget.id === "daily-state-card").enabled, false);

  const custom = widgets.find((widget) => widget.id === "custom-briefing");
  assert.equal(custom.schemaVersion, 7);
  assert.deepEqual(plain(custom.layout), { minWidth: 360 });
  assert.deepEqual(plain(custom.experimental), { role: "briefing" });
  assert.deepEqual(plain(plugin.normalizeSettings(migrated).home.widgets), plain(widgets));
});

test("home schema v3 does not add a duplicate disabled card for a panel already owned by a migrated group", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const migrated = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "workbench",
          type: "builtin",
          schemaVersion: 2,
          enabled: true,
          order: 30,
          size: "full",
          source: "overview-columns",
          props: {}
        }
      ]
    }
  });

  assert.deepEqual(plain(migrated.home.widgets.find((widget) => widget.id === "inbox-card").props.panels), ["inbox"]);
  assert.equal(migrated.home.widgets.some((widget) => widget.id === "habit-today-card"), false);
  assert.deepEqual(plain(plugin.normalizeSettings(migrated).home.widgets), plain(migrated.home.widgets));
});

test("flat Home cards reuse shared renderers through native root adapters", () => {
  const home = read("views/dashboard/home/view.js");
  const overview = read("views/dashboard/home/sections/overview-columns/view.js");
  const guide = read("views/dashboard/home/sections/guide-panels/view.js");
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");
  const heatmaps = read("views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js");

  for (const id of FLAT_HOME_WIDGET_IDS.slice(4)) {
    assert.match(home, new RegExp(`["']?${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*:`));
  }
  assert.match(home, /const HOME_WIDGET_SCHEMA_VERSION = 3/);
  assert.match(home, /shell:\s*"native"/);
  assert.match(home, /dashboard-home-widget-shell-native/);
  assert.doesNotMatch(home, /\bworkbench:\s*\{\s*path:/);
  assert.doesNotMatch(home, /\bguide:\s*\{\s*path:/);
  assert.doesNotMatch(home, /\btrends:\s*\{\s*path:/);

  assert.match(overview, /cardMode/);
  assert.match(overview, /props\.panels|props\?\.panels/);
  assert.match(overview, /dashboard-workbench-grid--card/);
  assert.match(guide, /sectionMode/);
  assert.match(guide, /defaultExpanded/);
  assert.match(trends, /renderMode\s*===\s*"range"/);
  assert.match(trends, /renderMode\s*===\s*"block"/);
  assert.match(trends, /getHomeTrendsRangeBus\(\)\.emit\(/);
  assert.match(heatmaps, /heatmapMode/);
  assert.match(heatmaps, /showHabit/);
  assert.match(heatmaps, /showWorkload/);
});

test("home schema v3 migration gives hidden lists and explicit child widgets precedence", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const migrated = plugin.normalizeSettings({
    features: { modules: { reviewCenter: false } },
    home: {
      widgets: [
        {
          id: "workbench",
          type: "builtin",
          schemaVersion: 2,
          enabled: true,
          order: 40,
          size: "full",
          layout: { span: 12, minWidth: 900 },
          source: "overview-columns",
          props: {
            leftPanels: ["tasks", "countdown"],
            middlePanels: ["inbox", "habit-today"],
            rightPanels: [],
            hiddenPanels: ["countdown", "habit-today"]
          }
        },
        { id: "guide", type: "builtin", schemaVersion: 2, enabled: true, order: 50, size: "full", source: "guide-panels", props: {} },
        {
          id: "trends",
          type: "builtin",
          schemaVersion: 2,
          enabled: true,
          order: 60,
          size: "full",
          source: "trends-and-stats",
          props: { topBlocks: ["note-trend", "task-trend"], middleBlocks: ["heatmaps"], hiddenBlocks: ["task-trend"] }
        },
        {
          id: "inbox-card",
          type: "builtin",
          schemaVersion: 3,
          enabled: false,
          order: 17,
          size: "small",
          source: "overview-columns",
          experimental: { explicit: true },
          props: { cardMode: true, panels: ["inbox"] }
        }
      ]
    }
  });
  const widgets = migrated.home.widgets;

  assert.deepEqual(plain(widgets.find((widget) => widget.id === "today-tasks-card").props.panels), ["tasks"]);
  assert.equal(widgets.find((widget) => widget.id === "countdown-card").enabled, false);
  assert.equal(widgets.find((widget) => widget.id === "today-tasks-card").layout, undefined);
  assert.equal(widgets.find((widget) => widget.id === "inbox-card").enabled, false);
  assert.equal(widgets.find((widget) => widget.id === "inbox-card").size, "small");
  assert.deepEqual(plain(widgets.find((widget) => widget.id === "inbox-card").experimental), { explicit: true });
  assert.equal(widgets.find((widget) => widget.id === "task-trend-card").enabled, false);
  assert.equal(widgets.find((widget) => widget.id === "note-trend-card").enabled, true);
  assert.equal(widgets.find((widget) => widget.id === "review-focus").enabled, false);
});

test("home settings normalize configurable dashboard widgets", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const defaults = plugin.normalizeSettings({});

  assert.deepEqual(plain(defaults.home.widgets.map((w) => w.id)), FLAT_HOME_WIDGET_IDS);
  assert.deepEqual(
    plain(defaults.home.widgets.map((w) => w.type)),
    FLAT_HOME_WIDGET_IDS.map((id) => id === "daily-advice" ? "markdown" : "builtin")
  );
  assert.deepEqual(plain(defaults.home.widgets.map((w) => w.schemaVersion)), FLAT_HOME_WIDGET_IDS.map(() => 3));
  assert.deepEqual(plain(defaults.home.trendsRange), { mode: "last30", start: "", end: "", yearGranularity: "week" });
  assert.equal(defaults.home.widgets.find((w) => w.id === "today-actions").size, "full");
  assert.equal(defaults.home.widgets.find((w) => w.id === "today-actions").source, "today-actions");
  assert.equal(defaults.home.widgets.find((w) => w.id === "daily-advice").size, "full");
  assert.equal(defaults.home.widgets.find((w) => w.id === "daily-advice").enabled, false);
  assert.equal(defaults.home.widgets.find((w) => w.id === "daily-advice").order, 40);
  assert.equal(defaults.home.widgets.find((w) => w.id === "trends-range").size, "full");
  assert.equal(defaults.home.widgets.find((w) => w.id === "trends-range").title, "");
  assert.equal(defaults.home.widgets.find((w) => w.id === "trends-range").titleKey, "runtime.home.facade.trends");
  assert.deepEqual(plain(defaults.home.widgets.find((w) => w.id === "trends-range").props), { renderMode: "range" });

  const legacyCollision = plugin.normalizeSettings({
    home: {
      widgets: [
        { id: "identity", type: "builtin", enabled: true, order: 10, size: "wide", source: "home-identity" },
        { id: "metrics", type: "builtin", enabled: true, order: 20, size: "wide", source: "overview-metrics" },
        { id: "today-actions", type: "builtin", enabled: true, order: 30, size: "full", source: "today-actions" },
        { id: "workbench", type: "builtin", enabled: true, order: 40, size: "full", source: "overview-columns" },
        { id: "focus-strip", type: "builtin", enabled: true, order: 40, size: "full", source: "focus-strip" },
        { id: "guide", type: "builtin", enabled: true, order: 60, size: "full", source: "guide-panels" },
        { id: "trends", type: "builtin", enabled: true, order: 70, size: "full", source: "trends-and-stats" }
      ]
    }
  });
  assert.equal(legacyCollision.home.widgets.some((w) => ["workbench", "guide", "trends"].includes(w.id)), false);
  assert.ok(legacyCollision.home.widgets.find((w) => w.id === "today-tasks-card"));
  assert.equal(legacyCollision.home.widgets.some((w) => w.id === "focus-strip"), false);
  assert.equal(legacyCollision.home.widgets.find((w) => w.id === "daily-advice").enabled, false);

  const custom = plugin.normalizeSettings({
    home: {
      widgets: [
        { id: "bad", type: "script", enabled: true, size: "huge" },
        { id: "notes", type: "markdown", enabled: false, order: 7, size: "wide", title: "Notes", source: "Dashboard/Notes.md" },
        { id: "custom-view", type: "view", enabled: true, order: 8, size: "small", source: ".obsidian/plugins/noria/custom/view" },
        {
          id: "actions",
          type: "action",
          enabled: true,
          order: 9,
          size: "medium",
          title: "Actions",
          schemaVersion: 0,
          layout: { span: 2, minWidth: 280 },
          capabilities: { opensCommands: true, opensFiles: true },
          experimental: { role: "ops-launcher" },
          props: {
            actions: [
              { label: "Open tasks", kind: "view", view: "tasks" }
            ]
          }
        },
        {
          id: "stats-strip",
          type: "stat",
          enabled: true,
          order: 11,
          size: "wide",
          title: "Stats strip",
          props: {
            metrics: [
              { id: "tasks.completed", label: "Done" },
              { id: "notes.created", label: "Notes" }
            ]
          }
        },
        {
          id: "base-queue",
          type: "base",
          enabled: true,
          order: 12,
          size: "wide",
          title: "Inbox queue",
          source: "02_Areas/Knowledge/Inbox queue.base",
          props: {
            description: "Open the shared Base queue instead of rebuilding a table DSL."
          }
        },
        {
          id: "reference-list",
          type: "list",
          enabled: true,
          order: 13,
          size: "medium",
          title: "Work lists",
          props: {
            entries: [
              { label: "Project list", path: "01_Projects/Project list.md" }
            ]
          }
        },
        {
          id: "briefing",
          type: "markdown",
          enabled: true,
          order: 14,
          size: "full",
          title: "Briefing",
          props: {
            sources: [
              { label: "Daily", path: "Dashboard/Daily.md" },
              { label: "Project", source: "Dashboard/Project.md" }
            ]
          }
        }
      ]
    }
  });

  assert.equal(custom.home.widgets.some((w) => w.id === "bad"), false);
  assert.equal(custom.home.widgets.find((w) => w.id === "notes").enabled, false);
  assert.equal(custom.home.widgets.find((w) => w.id === "notes").size, "wide");
  assert.equal(custom.home.widgets.find((w) => w.id === "custom-view").type, "view");
  assert.equal(custom.home.widgets.find((w) => w.id === "actions").type, "action");
  assert.equal(custom.home.widgets.find((w) => w.id === "actions").schemaVersion, 3);
  assert.equal(custom.home.widgets.find((w) => w.id === "actions").source, "");
  assert.deepEqual(plain(custom.home.widgets.find((w) => w.id === "actions").layout), { span: 2, minWidth: 280 });
  assert.deepEqual(plain(custom.home.widgets.find((w) => w.id === "actions").capabilities), { opensCommands: true, opensFiles: true });
  assert.deepEqual(plain(custom.home.widgets.find((w) => w.id === "actions").experimental), { role: "ops-launcher" });
  assert.deepEqual(plain(custom.home.widgets.find((w) => w.id === "actions").props.actions), [
    { label: "Open tasks", kind: "view", view: "tasks" }
  ]);
  assert.equal(custom.home.widgets.find((w) => w.id === "stats-strip").type, "stat");
  assert.equal(custom.home.widgets.find((w) => w.id === "stats-strip").schemaVersion, 3);
  assert.deepEqual(plain(custom.home.widgets.find((w) => w.id === "stats-strip").props.metrics), [
    { id: "tasks.completed", label: "Done" },
    { id: "notes.created", label: "Notes" }
  ]);
  assert.equal(custom.home.widgets.find((w) => w.id === "base-queue").type, "base");
  assert.equal(custom.home.widgets.find((w) => w.id === "base-queue").source, "02_Areas/Knowledge/Inbox queue.base");
  assert.equal(custom.home.widgets.find((w) => w.id === "base-queue").props.description, "Open the shared Base queue instead of rebuilding a table DSL.");
  assert.equal(custom.home.widgets.find((w) => w.id === "reference-list").type, "list");
  assert.deepEqual(plain(custom.home.widgets.find((w) => w.id === "reference-list").props.entries), [
    { label: "Project list", path: "01_Projects/Project list.md" }
  ]);
  assert.equal(custom.home.widgets.find((w) => w.id === "briefing").type, "markdown");
  assert.equal(custom.home.widgets.find((w) => w.id === "briefing").source, "");
  assert.deepEqual(plain(custom.home.widgets.find((w) => w.id === "briefing").props.sources), [
    { label: "Daily", path: "Dashboard/Daily.md" },
    { label: "Project", source: "Dashboard/Project.md" }
  ]);
});

test("home widget normalization deep-clones props and extension fields for schema compatibility", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const raw = {
    home: {
      widgets: [
        {
          id: "future-action",
          type: "action",
          schemaVersion: 3,
          enabled: true,
          order: 10,
          size: "medium",
          props: {
            actions: [
              { label: "Open project", kind: "file", path: "01_Projects/A.md" }
            ],
            metadata: { owner: "user" }
          },
          capabilities: {
            opensFiles: true,
            future: { commandPalette: true }
          }
        }
      ]
    }
  };

  const normalized = plugin.normalizeSettings(raw);
  const widget = normalized.home.widgets.find((w) => w.id === "future-action");
  assert.equal(widget.schemaVersion, 3);
  assert.deepEqual(plain(widget.capabilities.future), { commandPalette: true });

  widget.props.actions[0].label = "Mutated";
  widget.props.metadata.owner = "noria";
  widget.capabilities.future.commandPalette = false;

  assert.equal(raw.home.widgets[0].props.actions[0].label, "Open project");
  assert.equal(raw.home.widgets[0].props.metadata.owner, "user");
  assert.equal(raw.home.widgets[0].capabilities.future.commandPalette, true);
});

test("home trends range is a synced home setting instead of a local-only range", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      trendsRange: {
        mode: "custom",
        start: "2026-05-01",
        end: "2026-05-07",
        yearGranularity: "month"
      }
    }
  });

  assert.deepEqual(plain(plugin.settings.home.trendsRange), {
    mode: "custom",
    start: "2026-05-01",
    end: "2026-05-07",
    yearGranularity: "month"
  });

  const next = plugin.updateHomeTrendsRangeInSettings({
    mode: "year",
    start: "",
    end: "",
    yearGranularity: "week"
  });
  assert.deepEqual(plain(next), { mode: "year", start: "", end: "", yearGranularity: "week" });
  assert.deepEqual(plain(plugin.settings.home.trendsRange), plain(next));

  const invalid = plugin.updateHomeTrendsRangeInSettings({
    mode: "custom",
    start: "2026-05-40",
    end: "bad",
    yearGranularity: "quarter"
  });
  assert.deepEqual(plain(invalid), { mode: "last30", start: "", end: "", yearGranularity: "week" });
});

test("home daily-state range uses home settings before legacy localStorage", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      defaults: {
        dailyStateRangeDays: 60,
        rememberBlockSelections: true
      },
      dailyStateRange: {
        days: 90,
        endDate: "2026-06-30"
      }
    }
  });

  assert.deepEqual(plain(plugin.settings.home.dailyStateRange), {
    days: 90,
    endDate: "2026-06-30"
  });

  const next = plugin.updateHomeDailyStateRangeInSettings({
    days: 14,
    endDate: "2026-07-09"
  });
  assert.deepEqual(plain(next), { days: 14, endDate: "2026-07-09" });
  assert.deepEqual(plain(plugin.settings.home.dailyStateRange), plain(next));

  const invalid = plugin.updateHomeDailyStateRangeInSettings({
    days: 42,
    endDate: "bad"
  });
  assert.deepEqual(plain(invalid), { days: 60, endDate: "" });
});

test("daily-state block respects synced settings and rememberBlockSelections", () => {
  const dailyState = read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js");

  assert.match(dailyState, /getHomeDailyStateRange/);
  assert.match(dailyState, /saveHomeDailyStateRange/);
  assert.match(dailyState, /rememberBlockSelections\s*!==\s*false/);
  assert.match(dailyState, /homeSettings\?\.defaults\?\.dailyStateRangeDays/);
  assert.match(dailyState, /homeSettings\?\.dailyStateRange/);
  assert.match(dailyState, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(dailyState, /localStorage\.setItem\(STORAGE_KEY/);
});

test("home trends rerender releases block-local document listeners", () => {
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");
  const dailyState = read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js");

  assert.match(trends, /const activeBlockCleanups\s*=\s*new Set\(\)/);
  assert.match(trends, /function createTrendsBlockCleanupRegistry\(/);
  assert.match(trends, /registerCleanup:\s*blockCleanup\.add/);
  assert.match(trends, /runTrendsBlockCleanup\(slot\)/);
  assert.match(trends, /token\s*!==\s*renderToken\s*\|\|\s*trendsDisposed/);
  assert.match(trends, /input\?\.registerCleanup[\s\S]{0,160}cleanupAllTrendsBlocks/);

  assert.match(dailyState, /const onRangeMenuKeydown\s*=\s*\(ev\)\s*=>/);
  assert.match(dailyState, /const onStatePickerKeydown\s*=\s*\(ev\)\s*=>/);
  assert.match(dailyState, /document\.removeEventListener\("click",\s*closeRangeMenu\)/);
  assert.match(dailyState, /document\.removeEventListener\("keydown",\s*onRangeMenuKeydown\)/);
  assert.match(dailyState, /document\.removeEventListener\("click",\s*closeStatePicker\)/);
  assert.match(dailyState, /document\.removeEventListener\("keydown",\s*onStatePickerKeydown\)/);
  assert.match(dailyState, /input\?\.registerCleanup[\s\S]{0,160}cleanupDailyStateMenus/);
});

test("home widget manager can move widgets up and down without editing JSON", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});

  assert.equal(plugin.moveHomeWidgetInSettings("metrics", "down"), true);
  assert.deepEqual(plain(plugin.settings.home.widgets.map((w) => w.id)), ["identity", "today-actions", "metrics", ...FLAT_HOME_WIDGET_IDS.slice(3)]);
  assert.deepEqual(plain(plugin.settings.home.widgets.map((w) => w.order)), FLAT_HOME_WIDGET_IDS.map((_, index) => (index + 1) * 10));

  assert.equal(plugin.moveHomeWidgetInSettings("daily-state-card", "up"), true);
  assert.equal(plugin.settings.home.widgets.at(-2).id, "daily-state-card");
  assert.equal(plugin.settings.home.widgets.at(-1).id, "tag-distribution-card");
  assert.deepEqual(plain(plugin.settings.home.widgets.map((w) => w.order)), FLAT_HOME_WIDGET_IDS.map((_, index) => (index + 1) * 10));

  assert.equal(plugin.moveHomeWidgetInSettings("identity", "up"), false);
  assert.equal(plugin.moveHomeWidgetInSettings("tag-distribution-card", "down"), false);
  assert.equal(plugin.moveHomeWidgetInSettings("missing", "down"), false);
});

test("home widget manager can toggle visibility and resize widgets without editing JSON", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "project-stats",
          type: "stat",
          enabled: true,
          order: 60,
          size: "medium",
          title: "Project stats",
          layout: { span: 4 },
          props: { metrics: ["projects.active"] }
        }
      ]
    }
  });

  const hidden = plugin.updateHomeWidgetEnabledInSettings("project-stats", false);
  assert.equal(hidden.enabled, false);
  assert.equal(plugin.settings.home.widgets.find((w) => w.id === "project-stats").enabled, false);

  const shown = plugin.updateHomeWidgetEnabledInSettings("project-stats", true);
  assert.equal(shown.enabled, true);

  const collapsed = plugin.updateHomeWidgetCollapsedInSettings("project-stats", true);
  assert.equal(collapsed.collapsed, true);
  assert.equal(plugin.getHomeWidgetSettingDataset(collapsed, 0).collapsed, "true");

  const expanded = plugin.updateHomeWidgetCollapsedInSettings("project-stats", false);
  assert.equal(expanded.collapsed, false);
  assert.equal(plugin.getHomeWidgetSettingDataset(expanded, 0).collapsed, "false");

  const resized = plugin.updateHomeWidgetSizeInSettings("project-stats", "full");
  assert.equal(resized.size, "full");
  assert.deepEqual(plain(resized.layout), { span: 12, minWidth: 320 });

  const fallback = plugin.updateHomeWidgetSizeInSettings("project-stats", "giant");
  assert.equal(fallback.size, "medium");
  assert.deepEqual(plain(fallback.layout), { span: 4, minWidth: 280 });

  assert.equal(plugin.updateHomeWidgetEnabledInSettings("missing", false), null);
  assert.equal(plugin.updateHomeWidgetCollapsedInSettings("missing", true), null);
  assert.equal(plugin.updateHomeWidgetSizeInSettings("missing", "wide"), null);
});

test("home widget manager adjusts each Trends card directly without a nested block layout", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  const hidden = plugin.updateHomeWidgetEnabledInSettings("habit-heatmap-card", false);
  assert.equal(hidden.enabled, false);
  const resized = plugin.updateHomeWidgetSizeInSettings("task-trend-card", "full");
  assert.equal(resized.size, "full");
  assert.equal(resized.layout.span, 12);
  assert.equal(plugin.moveHomeWidgetInSettings("workload-heatmap-card", "up"), true);
  const ids = plugin.settings.home.widgets.map((widget) => widget.id);
  assert.ok(ids.indexOf("workload-heatmap-card") < ids.indexOf("habit-heatmap-card"));
  assert.equal(ids.includes("trends"), false);
});

test("home widget manager adjusts first-screen cards directly while preserving panel composition", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  assert.deepEqual(plain(plugin.settings.home.widgets.find((w) => w.id === "today-tasks-card").props.panels), ["tasks"]);
  assert.deepEqual(plain(plugin.settings.home.widgets.find((w) => w.id === "inbox-card").props.panels), ["inbox"]);
  assert.deepEqual(plain(plugin.settings.home.widgets.find((w) => w.id === "countdown-card").props.panels), ["countdown"]);

  assert.equal(plugin.moveHomeWidgetInSettings("countdown-card", "up"), true);
  assert.equal(plugin.updateHomeWidgetEnabledInSettings("inbox-card", false).enabled, false);
  assert.equal(plugin.updateHomeWidgetSizeInSettings("today-tasks-card", "wide").layout.span, 6);
  assert.deepEqual(plain(plugin.settings.home.widgets.find((w) => w.id === "inbox-card").props.panels), ["inbox"]);
  assert.equal(plugin.settings.home.widgets.some((w) => w.id === "workbench"), false);
});

test("first-screen workbench reuses one card adapter per root widget", () => {
  const main = read("src/main.js");
  const overview = read("views/dashboard/home/sections/overview-columns/view.js");

  assert.doesNotMatch(main, /if \(id === "workbench"[^}]+renderHomeWorkbenchPanelControls/);

  assert.match(overview, /getOverviewWorkbenchPanelLayout/);
  assert.match(overview, /renderOverviewPanelById/);
  assert.match(overview, /cardMode/);
  assert.match(overview, /props\.panels/);
  assert.match(overview, /dashboard-workbench-grid--card/);
  assert.match(overview, /leftPanels/);
  assert.match(overview, /middlePanels/);
  assert.match(overview, /rightPanels/);
  assert.match(overview, /hiddenPanels/);
  assert.match(overview, /data-noria-overview-panel-id/);
  assert.match(overview, /data-noria-overview-panel-group/);
  assert.match(overview, /function nextOverviewDeferredFrame/);
  assert.match(overview, /function hydrateOverviewPanels/);
  assert.match(overview, /data-noria-overview-panel-state/);
  assert.match(overview, /Promise\.all\(panelJobs\.map/);
  assert.doesNotMatch(overview, /await renderOverviewPanelById\(panelId,\s*panelMount/);
  assert.doesNotMatch(overview, /runWorkbenchView\(homeOverviewT\("runtime\.home\.overview\.tasksTitle"[\s\S]*runWorkbenchView\(homeOverviewT\("runtime\.home\.overview\.inboxTitle"[\s\S]*runWorkbenchView\(homeOverviewT\("runtime\.home\.overview\.habitsTitle"[\s\S]*runWorkbenchView\(homeOverviewT\("runtime\.home\.overview\.countdownTitle"/);
});

test("home widget manager can duplicate widgets without editing JSON", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "project-stats",
          type: "stat",
          enabled: false,
          order: 10,
          size: "wide",
          title: "Project stats",
          layout: { span: 6 },
          props: { metrics: ["projects.active", "projects.open"] }
        }
      ]
    }
  });

  const duplicated = plugin.duplicateHomeWidgetInSettings("project-stats");
  assert.equal(duplicated.id, "project-stats-copy");
  assert.equal(duplicated.type, "stat");
  assert.equal(duplicated.enabled, false);
  assert.equal(duplicated.order, 80);
  assert.equal(duplicated.title, "Project stats copy");
  assert.deepEqual(plain(duplicated.layout), { span: 6 });
  assert.deepEqual(plain(duplicated.props.metrics), ["projects.active", "projects.open"]);
  const duplicatedIds = plugin.settings.home.widgets.map((w) => w.id);
  assert.equal(duplicatedIds.at(-1), "project-stats-copy");
  assert.ok(FLAT_HOME_WIDGET_IDS.every((id) => duplicatedIds.includes(id)));
  assert.equal(duplicatedIds.some((id) => ["workbench", "guide", "trends"].includes(id)), false);

  const second = plugin.duplicateHomeWidgetInSettings("project-stats");
  assert.equal(second.id, "project-stats-copy-2");
  assert.equal(second.order, 90);
  assert.equal(plugin.duplicateHomeWidgetInSettings("missing"), null);
});

test("home widget duplication preserves future schema and extension fields", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "future-panel",
          type: "view",
          schemaVersion: 4,
          enabled: true,
          order: 10,
          size: "wide",
          title: "Future panel",
          source: "Dashboard/future-panel.js",
          layout: { span: 6, minWidth: 360, futureTrack: "hero" },
          capabilities: {
            opensFiles: true,
            future: { drawer: true }
          },
          props: {
            owner: "user",
            filters: [{ id: "active", value: true }]
          }
        }
      ]
    }
  });

  const duplicated = plugin.duplicateHomeWidgetInSettings("future-panel");
  assert.equal(duplicated.id, "future-panel-copy");
  assert.equal(duplicated.schemaVersion, 4);
  assert.deepEqual(plain(duplicated.capabilities), {
    opensFiles: true,
    future: { drawer: true }
  });
  assert.deepEqual(plain(duplicated.layout), { span: 6, minWidth: 360, futureTrack: "hero" });
  assert.deepEqual(plain(duplicated.props), {
    owner: "user",
    filters: [{ id: "active", value: true }]
  });
});

test("home widget reorder and profile presets preserve future custom widget fields", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        { id: "identity", type: "builtin", enabled: true, order: 10, size: "wide", source: "home-identity", props: {} },
        { id: "metrics", type: "builtin", enabled: true, order: 20, size: "wide", source: "overview-metrics", props: {} },
        {
          id: "future-actions",
          type: "action",
          schemaVersion: 5,
          enabled: true,
          order: 30,
          size: "medium",
          title: "Future actions",
          layout: { span: 3, minWidth: 260, futureTrack: "ops" },
          capabilities: { opensCommands: true, future: { pinned: true } },
          collapsed: true,
          props: {
            actions: [{ label: "Command", kind: "command", command: "app:open-command-palette" }],
            future: { drawer: "right" }
          }
        },
        { id: "today-actions", type: "builtin", enabled: true, order: 40, size: "full", source: "today-actions", props: {} }
      ]
    }
  });

  assert.equal(plugin.moveHomeWidgetInSettings("future-actions", "down"), true);
  let future = plugin.settings.home.widgets.find((w) => w.id === "future-actions");
  assert.equal(future.schemaVersion, 5);
  assert.equal(future.collapsed, true);
  assert.deepEqual(plain(future.layout), { span: 3, minWidth: 260, futureTrack: "ops" });
  assert.deepEqual(plain(future.capabilities), { opensCommands: true, future: { pinned: true } });
  assert.deepEqual(plain(future.props.future), { drawer: "right" });

  plugin.applyHomeProfilePresetToSettings("review");
  future = plugin.settings.home.widgets.find((w) => w.id === "future-actions");
  assert.equal(future.schemaVersion, 5);
  assert.equal(future.enabled, true);
  assert.equal(future.collapsed, true);
  assert.deepEqual(plain(future.layout), { span: 3, minWidth: 260, futureTrack: "ops" });
  assert.deepEqual(plain(future.capabilities), { opensCommands: true, future: { pinned: true } });
  assert.deepEqual(plain(future.props.actions), [
    { label: "Command", kind: "command", command: "app:open-command-palette" }
  ]);
});

test("home widget manager can remove custom widgets without editing JSON", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "project-stats",
          type: "stat",
          order: 60,
          size: "wide",
          title: "Project stats",
          props: { metrics: ["projects.active"] }
        },
        {
          id: "ops-panel",
          type: "action",
          order: 70,
          title: "Ops panel",
          props: { actions: [{ label: "Tasks", kind: "view", view: "tasks" }] }
        }
      ]
    }
  });

  assert.equal(plugin.removeHomeWidgetInSettings("identity"), false);
  assert.equal(plugin.removeHomeWidgetInSettings("missing"), false);
  assert.equal(plugin.removeHomeWidgetInSettings("project-stats"), true);

  assert.equal(plugin.settings.home.widgets.some((w) => w.id === "project-stats"), false);
  assert.equal(plugin.settings.home.widgets.some((w) => w.id === "ops-panel"), true);
  assert.deepEqual(
    plain(plugin.settings.home.widgets.map((w) => w.order)),
    plain(plugin.settings.home.widgets.map((_, index) => (index + 1) * 10))
  );
});

test("home widget manager summaries expose scan-friendly configuration facts", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();

  assert.equal(
    plugin.getHomeWidgetSettingSummary({
      id: "actions",
      type: "action",
      enabled: false,
      size: "medium",
      props: { actions: [{ label: "Tasks" }, { label: "Timeline" }] }
    }, 3),
    "Position 4 · action · Standard · Hidden · Actions 2"
  );

  assert.equal(
    plugin.getHomeWidgetSettingSummary({
      id: "project-stats",
      type: "stat",
      size: "wide",
      props: { metrics: ["projects.active", "projects.open", "projects.stale"] }
    }, 1),
    "Position 2 · stat · Wide · Shown · Metrics 3"
  );

  assert.equal(
    plugin.getHomeWidgetSettingSummary({
      id: "base-entry",
      type: "base",
      size: "wide",
      source: "02_Areas/知识库管理/Inbox queue.base"
    }, 0),
    "Position 1 · base · Wide · Shown · Source: 02_Areas/知识库管理/Inbox queue.base"
  );

  assert.equal(
    plugin.getHomeWidgetSettingSummary({
      id: "list-entry",
      type: "list",
      size: "medium",
      layout: { span: 5 },
      props: { entries: [{ label: "Projects" }, { label: "Habits" }] }
    }, 4),
    "Position 5 · list · Standard · Shown · Span 5/12 · Entries 2"
  );

  assert.equal(
    plugin.getHomeWidgetSettingSummary({
      id: "briefing",
      type: "markdown",
      size: "full",
      props: { sources: [{ path: "Dashboard/Daily.md" }, { path: "Dashboard/Project.md" }] }
    }, 5),
    "Position 6 · markdown · Full row · Shown · Sources 2"
  );

  assert.equal(
    plugin.getHomeWidgetSettingSummary({
      id: "review",
      type: "view",
      size: "full",
      source: "Noria/review-workbench.js",
      order: 42,
      collapsed: true,
      schemaVersion: 2
    }, 2),
    "Position 3 · view · Full row · Shown · Collapsed by default · Order 42 · Source: Noria/review-workbench.js"
  );

  assert.deepEqual(
    plain(plugin.getHomeWidgetSettingDataset({
      id: "review",
      type: "view",
      size: "full",
      source: "Noria/review-workbench.js",
      order: 42,
      collapsed: true,
      schemaVersion: 2,
      layout: { span: 8 }
    }, 2)),
    {
      id: "review",
      index: "3",
      type: "view",
      kind: "review",
      size: "full",
      enabled: "true",
      order: "42",
      collapsed: "true",
      "schema-version": "2",
      source: "Noria/review-workbench.js",
      span: "8"
    }
  );
});

test("home widget manager exposes readable layout labels instead of raw size codes", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const main = read("src/main.js");

  assert.equal(plugin.getHomeWidgetSizeLabel("small"), "Narrow");
  assert.equal(plugin.getHomeWidgetSizeLabel("medium"), "Standard");
  assert.equal(plugin.getHomeWidgetSizeLabel("wide"), "Wide");
  assert.equal(plugin.getHomeWidgetSizeLabel("full"), "Full row");
  assert.equal(plugin.getHomeWidgetSizeLabel("huge"), "Standard");
  assert.match(main, /settings\.home\.widgetSizeSmall/);
  assert.match(main, /settings\.home\.widgetSizeMedium/);
  assert.match(main, /settings\.home\.widgetSizeWide/);
  assert.match(main, /settings\.home\.widgetSizeFull/);
  assert.match(main, /dd\.addOption\(size,\s*this\.plugin\.getHomeWidgetSizeLabel\(size\)\)/);
  assert.doesNotMatch(main, /`size:\$\{size\}`/);
});

test("home widget manager can add action and stat presets without editing JSON", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});

  const action = plugin.addHomeWidgetPresetToSettings("action");
  assert.equal(action.type, "action");
  assert.equal(action.id, "actions");
  assert.equal(action.order, 80);
  assert.deepEqual(plain(action.props.actions.map((item) => item.view)), ["tasks", "calendar", "review"]);
  assert.equal(action.props.actions.some((item) => item.view === "timeline"), false);

  const stat = plugin.addHomeWidgetPresetToSettings("stat");
  assert.equal(stat.type, "stat");
  assert.equal(stat.id, "stats");
  assert.equal(stat.order, 90);
  assert.deepEqual(plain(stat.props.metrics), ["tasks.completed", "tasks.open", "projects.open", "habits.completionRate"]);

  const secondAction = plugin.addHomeWidgetPresetToSettings("action");
  assert.equal(secondAction.id, "actions-2");
  assert.equal(secondAction.order, 100);

  assert.equal(plugin.addHomeWidgetPresetToSettings("markdown"), null);
  assert.deepEqual(plain(plugin.settings.home.widgets.slice(-3).map((w) => w.id)), ["actions", "stats", "actions-2"]);
});

test("home widget manager can add action and stat variant presets", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    managedPaths: {
      inboxQueue: "02_Areas/知识库管理/Inbox queue.base",
      projectRegistry: "02_Areas/知识库管理/Projects.md",
      habitRegistry: "02_Areas/知识库管理/Habits.md"
    }
  });

  const vaultActions = plugin.addHomeWidgetPresetToSettings("action", { preset: "vault" });
  assert.equal(vaultActions.type, "action");
  assert.equal(vaultActions.title, "Vault workbench");
  assert.deepEqual(plain(vaultActions.props.actions.map((item) => item.kind)), ["file", "file", "file"]);
  assert.deepEqual(plain(vaultActions.props.actions.map((item) => item.path)), [
    "02_Areas/知识库管理/Inbox queue.base",
    "02_Areas/知识库管理/Projects.md",
    "02_Areas/知识库管理/Habits.md"
  ]);

  const projectStats = plugin.addHomeWidgetPresetToSettings("stat", { preset: "projects" });
  assert.equal(projectStats.title, "Project stats");
  assert.deepEqual(plain(projectStats.props.metrics), [
    "projects.active",
    "projects.open",
    "projects.completionRate",
    "projects.stale"
  ]);

  const vaultStats = plugin.addHomeWidgetPresetToSettings("stat", { preset: "vault" });
  assert.equal(vaultStats.title, "Vault health");
  assert.deepEqual(plain(vaultStats.props.metrics), [
    "vault.markdownFiles",
    "vault.missingTags",
    "vault.brokenLinks",
    "vault.tagCoverage"
  ]);

  const habitHeatmap = plugin.addHomeWidgetPresetToSettings("stat", { preset: "habit-heatmap" });
  assert.equal(habitHeatmap.title, "Habit heatmap");
  assert.equal(habitHeatmap.size, "wide");
  assert.deepEqual(plain(habitHeatmap.props), {
    presentation: "heatmap",
    domain: "habits",
    subject: ""
  });

  const workloadHeatmap = plugin.addHomeWidgetPresetToSettings("stat", { preset: "workload-heatmap" });
  assert.equal(workloadHeatmap.title, "Workload heatmap");
  assert.deepEqual(plain(workloadHeatmap.props), {
    presentation: "heatmap",
    domain: "workload",
    subject: ""
  });
});

test("home widget manager can add path-backed markdown base and list presets", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});

  const markdown = plugin.addHomeWidgetPresetToSettings("markdown", { source: "Dashboard/Notes.md" });
  assert.equal(markdown.type, "markdown");
  assert.equal(markdown.id, "markdown-note");
  assert.equal(markdown.source, "Dashboard/Notes.md");
  assert.equal(markdown.title, "Notes");

  const briefing = plugin.addHomeWidgetPresetToSettings("markdown", {
    preset: "briefing",
    source: "Dashboard/Daily.md; Dashboard/Project.md"
  });
  assert.equal(briefing.type, "markdown");
  assert.equal(briefing.id, "markdown-briefing");
  assert.equal(briefing.size, "full");
  assert.equal(briefing.title, "Briefing board");
  assert.equal(briefing.source, "Dashboard/Daily.md");
  assert.deepEqual(plain(briefing.props.sources), [
    { label: "Daily", path: "Dashboard/Daily.md" },
    { label: "Project", path: "Dashboard/Project.md" }
  ]);

  const labeledBriefing = plugin.addHomeWidgetPresetToSettings("markdown", {
    preset: "briefing",
    source: "每日简报 | 00_Inbox/daily-brief.md; 当前建议 | 00_Inbox/current-suggestions.md; 每周回顾 | 06_Diary/2026/weekly-review.md; 项目监控 | 00_Inbox/github-radar-latest.md"
  });
  assert.equal(labeledBriefing.type, "markdown");
  assert.equal(labeledBriefing.source, "00_Inbox/daily-brief.md");
  assert.deepEqual(plain(labeledBriefing.props.sources), [
    { label: "每日简报", path: "00_Inbox/daily-brief.md" },
    { label: "当前建议", path: "00_Inbox/current-suggestions.md" },
    { label: "每周回顾", path: "06_Diary/2026/weekly-review.md" },
    { label: "项目监控", path: "00_Inbox/github-radar-latest.md" }
  ]);

  const defaultBriefing = plugin.addHomeWidgetPresetToSettings("markdown", { preset: "briefing" });
  assert.equal(defaultBriefing.type, "markdown");
  assert.equal(defaultBriefing.id, "markdown-briefing-3");
  assert.equal(defaultBriefing.source, "00_Inbox/daily-brief.md");
  assert.equal(defaultBriefing.props.mode, "briefing");
  assert.deepEqual(plain(defaultBriefing.props.sources), [
    { label: "每日简报", path: "00_Inbox/daily-brief.md", role: "daily", maxAgeHours: 36 },
    { label: "当前建议", path: "00_Inbox/current-suggestions.md", role: "current", maxAgeHours: 72 },
    { label: "每周回顾", path: "00_Inbox/weekly-review.md", role: "weekly", maxAgeHours: 240 },
    { label: "项目监控", path: "00_Inbox/github-radar-latest.md", role: "project", maxAgeHours: 72 }
  ]);

  const base = plugin.addHomeWidgetPresetToSettings("base", { source: "02_Areas/Knowledge/Inbox queue.base" });
  assert.equal(base.type, "base");
  assert.equal(base.id, "base-entry");
  assert.equal(base.source, "02_Areas/Knowledge/Inbox queue.base");
  assert.equal(base.title, "Inbox queue");

  const list = plugin.addHomeWidgetPresetToSettings("list", { source: "01_Projects/Project list.md" });
  assert.equal(list.type, "list");
  assert.equal(list.id, "list-entry");
  assert.equal(list.source, "01_Projects/Project list.md");
  assert.equal(list.title, "Project list");

  assert.equal(plugin.addHomeWidgetPresetToSettings("base"), null);
  assert.deepEqual(plain(plugin.settings.home.widgets.slice(-6).map((w) => w.id)), ["markdown-note", "markdown-briefing", "markdown-briefing-2", "markdown-briefing-3", "base-entry", "list-entry"]);
});

test("home widget manager can add a configurable daily-note section card", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});

  const advice = plugin.addHomeWidgetPresetToSettings("markdown", {
    preset: "daily-section",
    heading: "项目建议"
  });

  assert.equal(advice.type, "markdown");
  assert.equal(advice.id, "daily-section");
  assert.equal(advice.size, "full");
  assert.equal(advice.title, "项目建议");
  assert.equal(advice.source, "");
  assert.deepEqual(plain(advice.props), {
    sourceMode: "daily-section",
    heading: "项目建议",
    renderMode: "compact"
  });
});

test("home profile-lite presets reshape built-in widgets without dropping custom widgets", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      guidePanels: {
        inbox: true,
        projects: true,
        moc: true,
        reviewCenter: true,
        reviewCenterExpanded: true
      },
      widgets: [
        { id: "identity", type: "builtin", enabled: true, order: 90, size: "small", source: "home-identity", props: {} },
        { id: "metrics", type: "builtin", enabled: false, order: 80, size: "small", source: "overview-metrics", props: {} },
        { id: "guide", type: "builtin", enabled: true, order: 60, size: "full", source: "guide-panels", collapsed: true, props: {} },
        { id: "trends", type: "builtin", enabled: true, order: 70, size: "full", source: "trends-and-stats", collapsed: true, props: {} },
        {
          id: "custom-lab",
          type: "view",
          enabled: true,
          order: 333,
          size: "wide",
          title: "Custom lab",
          source: "Dashboard/custom-lab.js",
          props: { owner: "user" }
        }
      ]
    }
  });

  const result = plugin.applyHomeProfilePresetToSettings("research");
  assert.equal(result.id, "research");
  assert.equal(plugin.settings.home.profilePreset, "research");

  const widgets = plugin.settings.home.widgets;
  const byId = Object.fromEntries(widgets.map((widget) => [widget.id, widget]));
  assert.equal(byId.identity.enabled, true);
  assert.equal(byId.identity.order, 10);
  assert.equal(byId.identity.size, "wide");
  assert.equal(byId.metrics.enabled, true);
  assert.equal(byId["today-actions"].enabled, true);
  assert.equal(byId["daily-advice"].enabled, false);
  for (const widgetId of ["today-tasks-card", "inbox-card", "countdown-card", "projects-card", "moc-strip", ...FLAT_HOME_WIDGET_IDS.slice(11)]) {
    assert.equal(byId[widgetId].enabled, true, `${widgetId} should be enabled in research`);
    assert.equal(byId[widgetId].collapsed, false);
  }
  assert.equal(byId["review-focus"].enabled, false);
  assert.equal(byId["review-focus"].props.defaultExpanded, false);
  assert.deepEqual(plain(plugin.settings.home.guidePanels), {
    inbox: false,
    projects: true,
    moc: true,
    reviewCenter: false,
    reviewCenterExpanded: false
  });

  assert.equal(byId["custom-lab"].type, "view");
  assert.equal(byId["custom-lab"].source, "Dashboard/custom-lab.js");
  assert.deepEqual(plain(byId["custom-lab"].props), { owner: "user" });

  const briefing = widgets.find((widget) => widget.type === "markdown" && widget.props?.mode === "briefing");
  assert.ok(briefing, "research profile should add one default briefing widget when missing");
  assert.equal(briefing.id, "markdown-briefing");
  assert.equal(briefing.enabled, true);
  assert.equal(briefing.order, 60);
  assert.deepEqual(plain(briefing.props.sources), [
    { label: "每日简报", path: "00_Inbox/daily-brief.md", role: "daily", maxAgeHours: 36 },
    { label: "当前建议", path: "00_Inbox/current-suggestions.md", role: "current", maxAgeHours: 72 },
    { label: "每周回顾", path: "00_Inbox/weekly-review.md", role: "weekly", maxAgeHours: 240 },
    { label: "项目监控", path: "00_Inbox/github-radar-latest.md", role: "project", maxAgeHours: 72 }
  ]);

  plugin.applyHomeProfilePresetToSettings("review");
  const reviewById = Object.fromEntries(plugin.settings.home.widgets.map((widget) => [widget.id, widget]));
  assert.equal(plugin.settings.home.profilePreset, "review");
  assert.equal(reviewById["projects-card"].enabled, false);
  assert.equal(reviewById["moc-strip"].enabled, false);
  assert.equal(reviewById["review-focus"].enabled, true, "review profile should keep the same-leaf Review Focus surface available");
  assert.equal(reviewById["review-focus"].collapsed, false);
  assert.equal(reviewById["review-focus"].props.defaultExpanded, true);
  for (const widgetId of FLAT_HOME_WIDGET_IDS.slice(11)) assert.equal(reviewById[widgetId].enabled, true);
  assert.deepEqual(plain(plugin.settings.home.guidePanels), {
    inbox: false,
    projects: false,
    moc: false,
    reviewCenter: true,
    reviewCenterExpanded: true
  });
});

test("home profile-lite presets are conservative and do not duplicate existing briefing widgets", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "markdown-briefing",
          type: "markdown",
          enabled: false,
          order: 140,
          size: "full",
          title: "My briefing",
          source: "Dashboard/Daily.md",
          props: {
            mode: "briefing",
            sources: [{ label: "Daily", path: "Dashboard/Daily.md", role: "daily" }]
          }
        }
      ]
    }
  });

  plugin.applyHomeProfilePresetToSettings("review");
  plugin.applyHomeProfilePresetToSettings("review");
  const briefings = plugin.settings.home.widgets.filter((widget) => widget.type === "markdown" && widget.props?.mode === "briefing");
  assert.equal(briefings.length, 1);
  assert.equal(briefings[0].title, "My briefing");
  assert.equal(briefings[0].enabled, true);
  assert.equal(briefings[0].order, 60);

  plugin.applyHomeProfilePresetToSettings("minimal");
  const byId = Object.fromEntries(plugin.settings.home.widgets.map((widget) => [widget.id, widget]));
  assert.equal(plugin.settings.home.profilePreset, "minimal");
  assert.equal(byId.identity.enabled, true);
  assert.equal(byId.metrics.enabled, true);
  assert.equal(byId["today-actions"].enabled, true);
  assert.equal(byId["daily-advice"].enabled, false);
  for (const widgetId of ["today-tasks-card", "inbox-card", "countdown-card", "projects-card", "moc-strip", "review-focus", ...FLAT_HOME_WIDGET_IDS.slice(11)]) {
    assert.equal(byId[widgetId].enabled, false, `${widgetId} should be disabled in minimal`);
  }
  assert.equal(byId["markdown-briefing"].enabled, false);
  assert.deepEqual(plain(plugin.settings.home.guidePanels), {
    inbox: false,
    projects: false,
    moc: false,
    reviewCenter: false,
    reviewCenterExpanded: false
  });
});

test("home widget manager can edit markdown briefing sources without JSON", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "briefing",
          type: "markdown",
          enabled: true,
          order: 80,
          size: "full",
          title: "Briefing",
          source: "Dashboard/Daily.md",
          props: {
            mode: "briefing",
            sources: [
              { label: "Daily", path: "Dashboard/Daily.md" },
              { label: "Project", source: "Dashboard/Project.md" }
            ]
          }
        }
      ]
    }
  });

  const original = plugin.settings.home.widgets.find((widget) => widget.id === "briefing");
  assert.equal(
    plugin.formatHomeMarkdownWidgetSourceLines(original),
    "Daily | Dashboard/Daily.md\nProject | Dashboard/Project.md"
  );

  const updated = plugin.updateHomeMarkdownWidgetSourcesInSettings(
    "briefing",
    "每日简报 | 00_Inbox/daily-brief.md\n项目监控 | 00_Inbox/github-radar-latest.md"
  );
  assert.equal(updated.source, "00_Inbox/daily-brief.md");
  assert.equal(updated.props.mode, "briefing");
  assert.deepEqual(plain(updated.props.sources), [
    { label: "每日简报", path: "00_Inbox/daily-brief.md" },
    { label: "项目监控", path: "00_Inbox/github-radar-latest.md" }
  ]);

  const single = plugin.updateHomeMarkdownWidgetSourcesInSettings("briefing", "00_Inbox/current-suggestions.md");
  assert.equal(single.source, "00_Inbox/current-suggestions.md");
  assert.equal(single.props.mode, undefined);
  assert.equal(single.props.sources, undefined);
  assert.equal(plugin.formatHomeMarkdownWidgetSourceLines(single), "current-suggestions | 00_Inbox/current-suggestions.md");

  const titled = plugin.updateHomeWidgetTitleInSettings("briefing", "External briefings");
  assert.equal(titled.title, "External briefings");
  assert.equal(plugin.updateHomeMarkdownWidgetSourcesInSettings("briefing", ""), null);
  assert.equal(plugin.updateHomeMarkdownWidgetSourcesInSettings("missing", "Dashboard/Daily.md"), null);
});

test("home widget markdown source editor preserves optional role and freshness columns", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    home: {
      widgets: [
        {
          id: "briefing",
          type: "markdown",
          enabled: true,
          order: 80,
          size: "full",
          title: "Briefing",
          source: "Dashboard/Daily.md",
          props: {
            mode: "briefing",
            sources: [
              { label: "Daily", path: "Dashboard/Daily.md", role: "daily", maxAgeHours: 36 },
              { label: "Project", path: "Dashboard/Project.md", role: "project", freshHours: "7d" }
            ]
          }
        }
      ]
    }
  });

  const original = plugin.settings.home.widgets.find((widget) => widget.id === "briefing");
  assert.equal(
    plugin.formatHomeMarkdownWidgetSourceLines(original),
    "Daily | Dashboard/Daily.md | daily | 36\nProject | Dashboard/Project.md | project | 168"
  );

  const updated = plugin.updateHomeMarkdownWidgetSourcesInSettings(
    "briefing",
    "每日简报 | 00_Inbox/daily-brief.md | daily | 36h\n周复盘 | 00_Inbox/weekly-review.md | weekly | 10d"
  );
  assert.equal(updated.source, "00_Inbox/daily-brief.md");
  assert.equal(updated.props.mode, "briefing");
  assert.deepEqual(plain(updated.props.sources), [
    { label: "每日简报", path: "00_Inbox/daily-brief.md", role: "daily", maxAgeHours: 36 },
    { label: "周复盘", path: "00_Inbox/weekly-review.md", role: "weekly", maxAgeHours: 240 }
  ]);

  const singleWithMeta = plugin.updateHomeMarkdownWidgetSourcesInSettings(
    "briefing",
    "当前建议 | 00_Inbox/current-suggestions.md | current | 72"
  );
  assert.equal(singleWithMeta.source, "00_Inbox/current-suggestions.md");
  assert.equal(singleWithMeta.props.mode, "briefing");
  assert.deepEqual(plain(singleWithMeta.props.sources), [
    { label: "当前建议", path: "00_Inbox/current-suggestions.md", role: "current", maxAgeHours: 72 }
  ]);
});

test("home widget source suggestions filter markdown and base files by preset type", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  let markdownScans = 0;
  let baseScans = 0;
  plugin.filesUnderRoots = (_roots, extensions) => {
    if (extensions.includes(".base")) {
      baseScans += 1;
      return [{ path: "02_Areas/Knowledge/Inbox queue.base" }];
    }
    markdownScans += 1;
    return [
      { path: "Dashboard/Notes.md" },
      { path: "01_Projects/Project list.md" },
      { path: "06_Diary/2026/2026-06-08.md" }
    ];
  };

  assert.deepEqual(plain(plugin.getHomeWidgetSourceSuggestionPaths("markdown", "dash")), ["Dashboard/Notes.md"]);
  assert.deepEqual(plain(plugin.getHomeWidgetSourceSuggestionPaths("list", "project")), ["01_Projects/Project list.md"]);
  assert.deepEqual(plain(plugin.getHomeWidgetSourceSuggestionPaths("base", "inbox")), ["02_Areas/Knowledge/Inbox queue.base"]);
  assert.deepEqual(plain(plugin.getHomeWidgetSourceSuggestionPaths("action", "dash")), []);
  assert.equal(markdownScans, 1);
  assert.equal(baseScans, 1);

  assert.deepEqual(plain(plugin.getHomeWidgetSourceSuggestionPaths("markdown", "notes")), ["Dashboard/Notes.md"]);
  assert.deepEqual(plain(plugin.getHomeWidgetSourceSuggestionPaths("list", "diary")), ["06_Diary/2026/2026-06-08.md"]);
  assert.deepEqual(plain(plugin.getHomeWidgetSourceSuggestionPaths("base", "queue")), ["02_Areas/Knowledge/Inbox queue.base"]);
  assert.equal(markdownScans, 1);
  assert.equal(baseScans, 1);
});

test("home widget add preset setting uses a wide stacked layout", () => {
  const main = read("src/main.js");

  assert.match(main, /noria-home-widget-add-setting/);
  assert.match(main, /noria-home-widget-add-controls/);
  assert.match(main, /addPresetSetting\.settingEl\.style\.display\s*=\s*"block"/);
  assert.match(main, /addPresetSetting\.settingEl\.style\.alignItems\s*=\s*"stretch"/);
  assert.match(main, /addPresetSetting\.settingEl\.style\.flexDirection\s*=\s*"column"/);
  assert.match(main, /addPresetSetting\.infoEl\.style\.maxWidth\s*=\s*"none"/);
  assert.match(main, /addPresetSetting\.controlEl\.style\.width\s*=\s*"100%"/);
  assert.match(main, /addPresetSetting\.controlEl\.style\.marginInlineStart\s*=\s*"0"/);
  assert.match(main, /class NoriaHomeWidgetSourceSuggest extends obsidian\.AbstractInputSuggest/);
  assert.match(main, /getHomeWidgetSourceSuggestionPaths\(getType\(\),\s*query\)/);
  assert.match(main, /attachHomeWidgetSourceSuggest\(inputEl,\s*\(\)\s*=>\s*isDailySectionWidgetPreset\(\)\s*\?\s*""\s*:\s*widgetPresetType\)/);
  assert.match(main, /widgetPresetVariant/);
  assert.match(main, /settings\.home\.widgetPresetVariant/);
  assert.match(main, /settings\.home\.widgetStatPresetVault/);
  assert.match(main, /settings\.home\.widgetActionPresetVault/);
  assert.match(main, /settings\.home\.widgetMarkdownPresetBriefing/);
  assert.match(main, /settings\.home\.widgetMarkdownPresetDailySection/);
  assert.match(main, /let variantDropdown = null/);
  assert.match(main, /const renderPresetVariantOptions = \(\) =>/);
  assert.match(main, /variantDropdown\.selectEl\.innerHTML = ""/);
  assert.match(main, /renderPresetVariantOptions\(\);/);
  assert.match(main, /let sourceTextInput = null/);
  assert.match(main, /const isPathBackedWidgetPreset = \(\) =>/);
  assert.match(main, /const isDailySectionWidgetPreset = \(\) =>/);
  assert.match(main, /const renderPresetSourceInput = \(\) =>/);
  assert.match(main, /sourceTextInput\.inputEl\.disabled = !usesPresetTextInput\(\)/);
  assert.match(main, /noria-home-widget-editor/);
  assert.match(main, /formatHomeMarkdownWidgetSourceLines\(widget\)/);
  assert.match(main, /updateHomeMarkdownWidgetSourcesInSettings\(id,/);
  assert.match(main, /updateHomeWidgetTitleInSettings\(id,/);
  assert.match(main, /settings\.home\.widgetEditorMarkdown/);
  assert.match(main, /settings\.home\.widgetEditorSources/);
  assert.match(main, /settings\.home\.widgetSectionHeading/);
});

test("home widget manager exposes one low-noise profile preset apply control", () => {
  const main = read("src/main.js");

  assert.match(main, /settings\.home\.widgetProfilePreset/);
  assert.match(main, /settings\.home\.widgetProfilePresetDesc/);
  assert.match(main, /NORIA_HOME_PROFILE_PRESET_IDS\.forEach/);
  assert.match(main, /applyHomeProfilePresetToSettings\(homeProfilePreset\)/);
  assert.match(main, /requestNoriaRefresh\("home",\s*"settings:home-widget-profile"/);
  assert.match(main, /decorateSettingsActionButton\(btn,\s*"settings-home",\s*"apply-profile-preset",\s*homeProfilePreset\)/);
  assert.match(main, /runSettingsActionButton\(btn,\s*async \(\) => \{/);
  assert.match(main, /return \{ ok: false, error: "profile-preset-not-applied" \}/);
  assert.doesNotMatch(main, /settings\.home\.widgetProfileMinimal[\s\S]{0,240}addButton[\s\S]{0,240}settings\.home\.widgetProfileExecution/);
});

test("home widget shells expose quiet settings and original-place collapse actions", () => {
  const home = read("views/dashboard/home/view.js");
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");
  const main = read("src/main.js");
  const overlayActions = cssBlock(bootstrap, ".dashboard-home-widget-shell-actions--overlay");

  assert.match(home, /function createHomeWidgetShellActions/);
  assert.match(home, /data-noria-widget-shell-action/);
  assert.match(home, /homeBridge\.runtime\?\.openHomeWidgetSettings/);
  assert.match(home, /homeBridge\.runtime\?\.setHomeWidgetCollapsed/);
  assert.match(home, /dashboard-home-widget-shell-actions--overlay/);
  assert.match(home, /createHomeWidgetShellActions\(widget,\s*shell/);
  assert.match(main, /openHomeWidgetSettings\(widgetId\)/);
  assert.match(main, /setHomeWidgetCollapsed\(widgetId,\s*collapsed\)/);

  assert.match(bootstrap, /\.dashboard-home-widget-shell-actions/);
  assert.match(overlayActions, /top:\s*0/);
  assert.match(overlayActions, /right:\s*8px/);
  assert.match(overlayActions, /left:\s*auto/);
  assert.match(overlayActions, /transform:\s*translateY\(calc\(-100% \+ 1px\)\)/);
  assert.doesNotMatch(overlayActions, /translateY\(calc\(-100% -/);
  assert.match(bootstrap, /\.dashboard-home-widget-shell:hover\s+\.dashboard-home-widget-shell-actions/);
  assert.match(bootstrap, /\.dashboard-home-widget-shell:focus-within\s+\.dashboard-home-widget-shell-actions/);
  assert.match(bootstrap, /\[data-noria-widget-collapsed="true"\][\s\S]*\.dashboard-home-widget-shell-actions/);
  assert.match(bootstrap, /\.dashboard-home-widget-shell-action:focus-visible/);
  assert.doesNotMatch(bootstrap, /dashboard-home-widget-shell-native\s*\{[\s\S]{0,180}padding-top:\s*34px/);
});

test("habit card names keep the shared MOC entry typography", () => {
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");
  const habitName = cssBlock(bootstrap, ".dashboard-home-root .dashboard-home-trends-habit-history .dashboard-habit-21-name .dashboard-task-title");

  assert.match(habitName, /font-size:\s*var\(--dash-moc-entry-font-size\)/);
  assert.match(habitName, /line-height:\s*var\(--dash-moc-entry-line-height\)/);
  assert.match(habitName, /font-weight:\s*var\(--dash-moc-entry-font-weight\)/);
});

test("stat widgets can render shared habit or workload heatmap presentations", () => {
  const home = read("views/dashboard/home/view.js");

  assert.match(home, /function renderHomeStatHeatmap/);
  assert.match(home, /props\.presentation\s*===\s*["']heatmap["']/);
  assert.match(home, /domains\.habits\.items/);
  assert.match(home, /renderYearHeatmapCalendar/);
  assert.match(home, /data-noria-heatmap-subject/);
});

test("Home layout edit mode stays transient and exposes reversible schema-safe controls", () => {
  const home = read("views/dashboard/home/view.js");
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");
  const lucide = read("views/dashboard/core/utils/dashboard-lucide-inline.js");
  const main = read("src/main.js");

  assert.match(home, /data-noria-home-edit-mode/);
  assert.match(home, /function renderHomeLayoutEditBar/);
  assert.match(home, /data-noria-home-layout-edit-toggle/);
  assert.match(home, /runtime\.home\.layoutEdit\.open/);
  assert.match(home, /homeBridge\.runtime\?\.setHomeEditMode/);
  assert.match(home, /homeBridge\.runtime\?\.editHomeWidget/);
  assert.match(home, /normalizeWidgetList\(homeBridge\.homeSettings\?\.widgets,\s*\{ includeDisabled: homeEditMode \}\)/);
  assert.match(home, /if \(homeEditMode\) renderHomeLayoutEditBar/);
  assert.match(home, /shouldUseHomeHeroStrip\(identity,\s*metrics,\s*\{ editMode: homeEditMode \}\)/);
  assert.match(home, /data-noria-widget-enabled/);
  assert.match(home, /dashboard-home-widget-shell-hidden/);
  assert.match(home, /data-noria-widget-edit-action/);
  assert.match(home, /data-noria-widget-edit-size/);

  assert.match(main, /homeEditMode:\s*this\._homeEditMode === true/);
  assert.match(main, /setHomeEditMode\(enabled\)/);
  assert.match(main, /editHomeWidget\(request = \{\}\)/);
  assert.match(main, /moveHomeWidgetInSettings\(id,\s*direction\)/);
  assert.match(main, /updateHomeWidgetSizeInSettings\(id,\s*value\)/);
  assert.match(main, /updateHomeWidgetEnabledInSettings\(id,\s*value === true\)/);

  assert.match(bootstrap, /\[data-noria-home-edit-mode="true"\]\s+\.dashboard-home-widget-shell-actions/);
  assert.match(bootstrap, /\[data-noria-home-edit-mode="true"\]\s+\.dashboard-home-widget-shell\.dashboard-callout-notitle/);
  assert.match(bootstrap, /\.dashboard-home-layout-edit-bar/);
  assert.match(bootstrap, /\.dashboard-home-widget-shell-hidden/);
  assert.match(bootstrap, /container-name:\s*noria-home\s*;/);
  assert.match(bootstrap, /@container noria-home \(max-width:\s*900px\)/);
  assert.match(lucide, /"settings-2"\s*:/);
  assert.match(lucide, /"eye-off"\s*:/);
  assert.match(lucide, /eye\s*:/);
  assert.match(lucide, /"chevron-up"\s*:/);
  assert.match(lucide, /"chevron-down"\s*:/);
});

test("home widget manager targets a requested row and omits duplicate for builtins", () => {
  const main = read("src/main.js");

  assert.match(main, /_settingsHomeWidgetFocusId/);
  assert.match(main, /data-noria-widget-target/);
  assert.match(main, /is-noria-widget-target/);
  assert.match(main, /scrollIntoView\?\.\(\{ block: "center"/);
  assert.match(main, /querySelectorAll\?\.\("\.noria-home-widget-manager-row"\)/);
  assert.match(main, /setTimeout\(\(\) => \{[\s\S]*_settingsHomeWidgetFocusId = ""/);
  assert.match(main, /if \(!isDefaultWidget\)\s*\{[\s\S]*decorateHomeWidgetManagerControl\(btn\.buttonEl,\s*"duplicate"/);
});

test("home widget manager exposes Trends block controls outside the JSON editor", () => {
  const main = read("src/main.js");

  assert.match(main, /settings\.home\.trendsBlocks/);
  assert.match(main, /settings\.home\.trendsBlocksDesc/);
  assert.match(main, /renderHomeTrendsBlockControls/);
  assert.match(main, /getHomeTrendsBlockLayout/);
  assert.match(main, /updateHomeTrendsBlockGroupInSettings/);
  assert.match(main, /moveHomeTrendsBlockInSettings/);
  assert.match(main, /data-noria-trends-block-id/);
  assert.match(main, /data-noria-trends-block-control/);
  assert.match(main, /settings:home-trends-blocks/);
  assert.match(main, /row\.settingEl\?\.addClass\?\.\("noria-home-trends-block-row"\)/);
  assert.match(main, /setDesc\(this\.t\(groupLabelKeys\[group\]\)\)/);
  assert.doesNotMatch(main, /setDesc\(`\$\{this\.t\(groupLabelKeys\[group\]\)\} · \$\{blockId\}`\)/);
  assert.doesNotMatch(main, /noria-home-trends-block-card/);
});

test("home runtime receives default widget metadata from the plugin bridge", () => {
  const home = read("views/dashboard/home/view.js");
  const main = read("src/main.js");

  assert.match(main, /homeWidgetDefaults:\s*JSON\.parse\(JSON\.stringify\(NORIA_DEFAULT_HOME_WIDGETS\)\)/);
  assert.match(home, /const HOME_WIDGET_DEFAULT_SOURCE = homeBridge\.homeWidgetDefaults \|\| homeBridge\.homeSettings\?\.widgets \|\| \[\]/);
  assert.match(home, /const DEFAULT_HOME_WIDGETS = cloneHomeWidgetDefaults\(HOME_WIDGET_DEFAULT_SOURCE\)/);
  assert.doesNotMatch(home, /const DEFAULT_HOME_WIDGETS = \[/);
});

test("home facade renders widgets through registry and supports markdown or view custom widgets", () => {
  const home = read("views/dashboard/home/view.js");
  const main = read("src/main.js");

  assert.match(home, /HOME_WIDGET_REGISTRY/);
  assert.match(home, /renderConfiguredWidgets/);
  assert.match(home, /renderMarkdownWidget/);
  assert.match(home, /renderCustomViewWidget/);
  assert.match(home, /homeBridge\.allowCustomJsViews !== true/);
  assert.match(main, /allowCustomJsViews:\s*this\.settings\.security\?\.allowCustomJsViews === true/);
  assert.match(main, /settings\.advanced\.allowCustomViews/);
  assert.match(home, /renderActionWidget/);
  assert.match(home, /renderTodayActionStrip/);
  assert.match(home, /getHomeDailySectionSource/);
  assert.match(home, /extractHomeMarkdownH2Section/);
  assert.match(home, /renderStatWidget/);
  assert.match(home, /renderEntryWidget/);
  assert.match(home, /function homeActionBoolean/);
  assert.match(home, /const openFirst = homeActionBoolean\(props\.openFirst\)/);
  assert.match(home, /data-noria-markdown-open-default/);
  assert.match(home, /item\.open = homeActionBoolean\(source\.open\) \|\| \(openFirst && index === 0\)/);
  assert.doesNotMatch(home, /props\.openFirst !== false/);
  assert.match(home, /getHomeWidgetSpan/);
  assert.match(home, /shouldUseHomeHeroStrip/);
  assert.match(home, /HOME_STAT_METRIC_REGISTRY/);
  assert.match(home, /HOME_WIDGET_SCHEMA_VERSION/);
  assert.match(home, /HOME_WIDGET_DEFAULT_SOURCE/);
  assert.match(home, /copyWidgetExtensionFields/);
  assert.match(home, /homeSettings\?\.widgets/);
  assert.match(main, /NORIA_HOME_WIDGET_SCHEMA_VERSION/);
  assert.match(main, /migrateHomeWidget/);
  assert.match(main, /copyHomeWidgetExtensionFields/);
  assert.match(main, /settings\.home\.widgets/);
  assert.match(main, /id:\s*"today-actions"[\s\S]*order:\s*30/);
  assert.match(main, /id:\s*"daily-advice"[\s\S]*sourceMode:\s*"daily-section"/);
  assert.match(main, /runtime\.home\.todayActions\.capture/);
  assert.match(main, /settings\.home\.widgetsManager/);
  assert.match(main, /moveHomeWidgetInSettings/);
  assert.match(main, /addHomeWidgetPresetToSettings/);
  assert.match(main, /settings\.home\.widgetAddPreset/);
  assert.match(main, /settings\.home\.widgetAddAction/);
  assert.match(main, /settings\.home\.widgetAddStat/);
  assert.match(main, /settings\.home\.widgetAddMarkdown/);
  assert.match(main, /settings\.home\.widgetAddBase/);
  assert.match(main, /settings\.home\.widgetAddList/);
  assert.match(main, /settings\.home\.widgetSourcePath/);
  assert.match(main, /settings\.home\.widgetMoveUp/);
  assert.match(main, /settings\.home\.widgetMoveDown/);
  assert.match(main, /settings\.home\.widgetVisible/);
  assert.match(main, /settings\.home\.widgetCollapsed/);
  assert.match(main, /updateHomeWidgetCollapsedInSettings/);
  assert.match(main, /settings:home-widgets-collapsed/);
  assert.match(main, /settings\.home\.widgetDuplicate/);
  assert.match(main, /settings\.home\.widgetRemove/);
  assert.match(main, /settings\.home\.widgetRemoveConfirm/);
  assert.match(main, /getHomeWidgetSettingSummary\(widget,\s*index\)/);
  assert.match(main, /duplicateHomeWidgetInSettings/);
  assert.match(main, /removeHomeWidgetInSettings/);
  assert.match(main, /noria-home-widget-manager-row/);
  assert.match(main, /getHomeWidgetSettingDataset\(widget,\s*index\)/);
  assert.match(main, /data-noria-widget-id/);
  assert.match(main, /data-noria-widget-type/);
  assert.match(main, /data-noria-widget-kind/);
  assert.match(main, /data-noria-widget-order/);
  assert.match(main, /data-noria-widget-source/);
  assert.match(main, /data-noria-widget-schema-version/);
  assert.match(main, /data-noria-widget-collapsed/);
  assert.match(main, /data-noria-widget-enabled/);
  assert.match(main, /decorateHomeWidgetManagerControl/);
  assert.match(main, /data-noria-widget-control/);
  assert.match(main, /"visibility"/);
  assert.match(main, /"collapsed"/);
  assert.match(main, /"move-up"/);
  assert.match(main, /"move-down"/);
  assert.match(main, /"duplicate"/);
  assert.match(main, /"remove"/);
  assert.match(main, /"size"/);
  assert.doesNotMatch(main, /noria-home-widget-button-rail/);
  assert.match(home, /function applyHomeWidgetCollapsedState/);
  assert.match(home, /data-noria-widget-collapsed/);
  assert.match(home, /dashboard-home-widget-collapsed-label/);
  assert.match(home, /shell\.content\.hidden = true/);
  assert.match(home, /if \(widget\.collapsed === true\) continue/);
  assert.match(home, /function getHomeWidgetShellDataset/);
  assert.match(home, /function applyHomeWidgetShellDataset/);
  assert.match(home, /data-noria-widget-order/);
  assert.match(home, /data-noria-widget-source/);
  assert.match(home, /data-noria-widget-schema-version/);
  assert.match(home, /data-noria-widget-title/);
});

test("Home keeps the capture workbench independent from optional daily-section cards", () => {
  const home = read("views/dashboard/home/view.js");
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(home, /renderTodayActionStrip/);
  assert.match(home, /sourceMode[\s\S]{0,120}"daily-section"/);
  assert.match(home, /applyHomeWidgetRenderResult/);
  assert.doesNotMatch(home, /dashboard-home-today-flow/);
  assert.doesNotMatch(home, /dashboard-home-focus/);
  assert.doesNotMatch(bootstrap, /dashboard-home-today-flow/);
  assert.doesNotMatch(bootstrap, /dashboard-home-focus/);
});

test("home widget layout CSS maps spans onto a responsive dashboard grid", () => {
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(bootstrap, /\.dashboard-home-root\s*\{[\s\S]*display:\s*grid/);
  assert.match(bootstrap, /\.dashboard-home-root\s*\{[\s\S]*grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(bootstrap, /\.dashboard-home-root\s*>\s*\[data-noria-widget-span="1"\]/);
  assert.match(bootstrap, /\.dashboard-home-root\s*>\s*\[data-noria-widget-span="12"\]/);
  assert.match(bootstrap, /@media\s*\(max-width:\s*900px\)[\s\S]*\.dashboard-home-root\s*>\s*\[data-noria-widget-span\]/);
});

test("home responsive layout follows the pane container instead of the app viewport", () => {
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(bootstrap, /@container noria-home \(max-width:\s*1180px\)[\s\S]*\.dashboard-hero-strip__metrics\s*>\s*\.dashboard-metrics-host--hero[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(bootstrap, /@container noria-home \(max-width:\s*900px\)[\s\S]*\.dashboard-hero-strip__inner\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(bootstrap, /@container noria-home \(max-width:\s*860px\)[\s\S]*\.dashboard-home-today-actions\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(bootstrap, /@container noria-home \(max-width:\s*520px\)[\s\S]*\.dashboard-home-today-capture-modes\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
});

test("narrow home identity keeps temperature range and humidity visible", () => {
  const identity = read("views/dashboard/home/sections/home-identity/view.js");
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(identity, /const lineText\s*=\s*\[[\s\S]*currentTemp[\s\S]*tempRangeText[\s\S]*humidity[\s\S]*\.join\(" · "\)/);
  assert.match(bootstrap, /@container noria-home \(max-width:\s*420px\)[\s\S]*\.dashboard-hero-strip__welcome-top \.dashboard-identity-avatar-wrap\s*\{[\s\S]*max-width:\s*4rem/);
  assert.match(bootstrap, /@container noria-home \(max-width:\s*420px\)[\s\S]*\.dashboard-hero-weather-inline__line\[data-noria-weather-state="ready"\]\s*\{[\s\S]*white-space:\s*normal[\s\S]*text-overflow:\s*clip/);
});

test("280px home cards keep dense tools from crushing the card title", () => {
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(
    bootstrap,
    /@container noria-home \(max-width:\s*340px\)\s*\{\s*\.dashboard-home-root \.dashboard-workbench-panel__head\s*\{[^}]*flex-wrap:\s*wrap[^}]*\}\s*\.dashboard-home-root \.dashboard-workbench-panel__title\s*\{[^}]*flex:\s*1 0 100%[^}]*white-space:\s*nowrap[^}]*\}\s*\.dashboard-home-root \.dashboard-workbench-panel__tools\s*\{[^}]*margin-left:\s*auto[^}]*\}\s*\}/
  );
});

test("home lazy sections defer heavy rendering until after the first workbench paint", () => {
  const home = read("views/dashboard/home/view.js");
  const frameStart = home.indexOf("function nextHomeDeferredFrame");
  const lazyStart = home.indexOf("async function renderLazySection");
  const lazyEnd = home.indexOf("function hideHomeInlineTitle", lazyStart);
  assert.ok(frameStart > 0, "home facade should expose a first-paint deferral helper");
  assert.ok(lazyStart > 0 && lazyEnd > lazyStart, "renderLazySection body should be found");
  const lazyBlock = home.slice(lazyStart, lazyEnd);

  assert.match(lazyBlock, /data-noria-home-deferred",\s*"queued"/);
  assert.match(lazyBlock, /await nextHomeDeferredFrame\(\)/);
  assert.match(lazyBlock, /void task/);
  assert.doesNotMatch(lazyBlock, /await renderSection\(path,\s*stableMount,\s*options\);\s*\n\s*\}/);
});

test("home widget manager setting rows have scan-friendly visual styling", () => {
  const styles = read("styles.css");
  const rowBlock = cssBlock(styles, ".noria-home-widget-manager-row");
  const statBlock = cssBlock(styles, '.noria-home-widget-manager-row[data-noria-widget-type="stat"]');
  const actionBlock = cssBlock(styles, '.noria-home-widget-manager-row[data-noria-widget-type="action"]');
  const controlButtonBlock = cssBlock(
    styles,
    ":is(.noria-home-widget-manager-row, .noria-moc-entry-row, .noria-inbox-workflow-status-row, .noria-inbox-workflow-view-row) .setting-item-control button:not(.mod-cta):not(.mod-warning)"
  );

  assert.match(styles, /\.noria-home-widget-manager-row/);
  assert.match(styles, /\.noria-home-widget-manager-row\[data-noria-widget-enabled="false"\]/);
  assert.match(styles, /\.noria-home-widget-manager-row\[data-noria-widget-type="stat"\]/);
  assert.match(styles, /\.noria-home-widget-manager-row\s+\.setting-item-description/);
  assert.match(styles, /\.noria-home-widget-editor/);
  assert.match(styles, /\.noria-home-widget-editor\s*>\s*summary/);
  assert.match(styles, /\.noria-home-widget-editor-source/);
  assert.match(styles, /\.noria-home-widget-editor\.noria-home-trends-block-controls\[open\]/);
  assert.match(styles, /\.noria-home-widget-editor\.noria-home-workbench-panel-controls\[open\]/);
  assert.match(styles, /\.noria-home-workbench-panel-row/);
  assert.match(styles, /\.noria-home-trends-block-row/);

  assert.ok(rowBlock, "widget rows should have a scoped visual contract");
  assert.match(rowBlock, /border-top:\s*1px solid/);
  assert.match(rowBlock, /border-left:\s*0/);
  assert.match(rowBlock, /border-right:\s*0/);
  assert.match(rowBlock, /border-radius:\s*0/);
  assert.match(rowBlock, /background:\s*transparent/);
  assert.match(rowBlock, /box-shadow:\s*none/);
  assert.doesNotMatch(statBlock, /border-color:\s*color-mix/);
  assert.doesNotMatch(actionBlock, /border-color:\s*color-mix/);
  assert.ok(controlButtonBlock, "widget, MOC, and Inbox row controls should share one quiet tool contract");
  assert.match(controlButtonBlock, /border:\s*0/);
  assert.match(controlButtonBlock, /background:\s*transparent/);
  assert.match(controlButtonBlock, /box-shadow:\s*none/);
});

test("MOC ordering actions reuse the home widget manager icon-control contract", () => {
  const main = read("src/main.js");
  const styles = read("styles.css");
  const sharedControlSelector = ":is(.noria-home-widget-manager-row, .noria-moc-entry-row, .noria-inbox-workflow-status-row, .noria-inbox-workflow-view-row) .setting-item-control button:not(.mod-cta):not(.mod-warning)";
  const managerControlBlock = cssBlock(styles, sharedControlSelector);
  const managerIconBlock = cssBlock(styles, `${sharedControlSelector} svg`);
  const mocRowControlBlock = cssBlock(styles, ".noria-moc-entry-row .setting-item-control");
  const mocRowInputBlock = cssBlock(styles, '.noria-moc-entry-row .setting-item-control input[type="text"]');
  const mocManagerSource = main.slice(
    main.indexOf("renderMocEntrySettings(containerEl)"),
    main.indexOf("renderHomeTab(containerEl)")
  );
  const widgetManagerSource = main.slice(
    main.indexOf("renderHomeDefaultSettings(containerEl)"),
    main.indexOf("renderInboxWorkflowSettings(containerEl)")
  );

  assert.ok(managerControlBlock, "manager icon controls should have one shared button contract");
  assert.match(managerControlBlock, /width:\s*28px/);
  assert.match(managerControlBlock, /height:\s*28px/);
  assert.match(managerControlBlock, /border-radius:\s*6px/);
  assert.match(managerControlBlock, /background:\s*transparent/);
  assert.match(managerControlBlock, /box-shadow:\s*none/);
  assert.match(managerControlBlock, /--icon-size:\s*16px/);
  assert.match(managerControlBlock, /--icon-stroke:\s*2/);
  assert.match(managerIconBlock, /width:\s*16px/);
  assert.match(managerIconBlock, /height:\s*16px/);
  assert.match(managerIconBlock, /flex:\s*0\s+0\s+16px/);
  assert.match(mocRowControlBlock, /flex-wrap:\s*nowrap/);
  assert.match(mocRowControlBlock, /min-width:\s*0/);
  assert.match(mocRowInputBlock, /flex:\s*1\s+1/);
  assert.match(mocRowInputBlock, /min-width:\s*120px/);

  assert.match(widgetManagerSource, /decorateSettingsManagerIconButton/);
  assert.equal(
    (mocManagerSource.match(/decorateSettingsManagerIconButton/g) || []).length,
    3,
    "MOC move-up, move-down, and remove should use the shared icon control"
  );
  assert.doesNotMatch(
    styles,
    /\.noria-moc-entry-row \.setting-item-control button\s*\{/,
    "MOC row actions should not keep a competing local button contract"
  );
  assert.doesNotMatch(
    styles,
    /\.noria-home-widget-manager-row \.setting-item-control button:not\(\.mod-cta\):not\(\.mod-warning\)\s*\{/,
    "Home widget actions should not keep a competing local button contract"
  );
});

test("home workbench panel controls share the quiet sub-list styling", () => {
  const styles = read("styles.css");
  const editorBlock = cssBlock(styles, ".noria-home-widget-editor.noria-home-workbench-panel-controls[open]");
  const rowBlock = cssBlock(styles, ".noria-home-workbench-panel-row");
  const rowNameBlock = cssBlock(styles, ".noria-home-workbench-panel-row .setting-item-name");
  const rowControlBlock = cssBlock(styles, ".noria-home-workbench-panel-row .setting-item-control");
  const buttonBlock = cssBlock(styles, ".noria-home-workbench-panel-row .setting-item-control button:not(.mod-cta):not(.mod-warning)");
  const selectBlock = cssBlock(styles, ".noria-home-workbench-panel-row .setting-item-control select");

  assert.ok(editorBlock, "workbench panel controls should have their own scoped sub-list style");
  assert.match(editorBlock, /margin:\s*0 0 8px 10px/);
  assert.match(editorBlock, /border:\s*0/);
  assert.match(editorBlock, /border-left:\s*1px solid/);
  assert.match(editorBlock, /background:\s*transparent/);
  assert.match(editorBlock, /box-shadow:\s*none/);

  assert.ok(rowBlock, "workbench panel rows should be compact setting rows");
  assert.match(rowBlock, /min-height:\s*32px/);
  assert.match(rowBlock, /border:\s*0/);
  assert.match(rowNameBlock, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(rowNameBlock, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
  assert.match(rowControlBlock, /gap:\s*4px/);
  assert.match(rowControlBlock, /min-width:\s*min\(100%,\s*280px\)/);
  assert.match(buttonBlock, /width:\s*26px/);
  assert.match(buttonBlock, /background:\s*transparent/);
  assert.match(buttonBlock, /box-shadow:\s*none/);
  assert.match(selectBlock, /height:\s*26px/);
});

test("home settings typography uses shared Noria setting tokens", () => {
  const styles = read("styles.css");
  const rowNameBlock = cssBlock(styles, ".noria-home-widget-manager-row .setting-item-name");
  const rowDescriptionBlock = cssBlock(styles, ".noria-home-widget-manager-row .setting-item-description");
  const summaryBlock = cssBlock(styles, ".noria-home-widget-editor > summary");
  const nestedDescriptionBlock = cssBlock(styles, ".noria-home-widget-editor.noria-home-workbench-panel-controls .setting-item-description");
  const nestedRowNameBlock = cssBlock(styles, ".noria-home-workbench-panel-row .setting-item-name");

  assert.match(styles, /--noria-settings-caption-font-size:\s*11px/);
  assert.match(styles, /--noria-settings-caption-line-height:\s*1\.45/);
  assert.match(styles, /--noria-settings-label-font-size:\s*12px/);
  assert.match(styles, /--noria-settings-label-weight:\s*650/);
  assert.match(styles, /--noria-settings-row-title-weight:\s*680/);

  assert.match(rowNameBlock, /font-weight:\s*var\(--noria-settings-row-title-weight,\s*680\)/);
  assert.match(rowDescriptionBlock, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
  assert.match(rowDescriptionBlock, /line-height:\s*var\(--noria-settings-caption-line-height,\s*1\.45\)/);
  assert.match(summaryBlock, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
  assert.match(summaryBlock, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
  assert.match(nestedDescriptionBlock, /font-size:\s*var\(--noria-settings-caption-font-size,\s*11px\)/);
  assert.match(nestedRowNameBlock, /font-size:\s*var\(--noria-settings-label-font-size,\s*12px\)/);
  assert.match(nestedRowNameBlock, /font-weight:\s*var\(--noria-settings-label-weight,\s*650\)/);
});

test("home configurable widget surfaces use tokenized visual classes", () => {
  const home = read("views/dashboard/home/view.js");
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(home, /dashboard-home-widget-shell/);
  assert.match(home, /data-noria-widget-type/);
  assert.match(home, /data-noria-widget-kind/);
  assert.doesNotMatch(home, /dashboard-home-stat-widget[\s\S]{0,220}style\.cssText\s*=\s*"display:grid/);
  assert.doesNotMatch(home, /dashboard-home-action-widget[\s\S]{0,220}style\.cssText\s*=\s*"display:flex/);
  assert.doesNotMatch(home, /dashboard-home-entry-widget[\s\S]{0,220}style\.cssText\s*=\s*"display:flex/);

  assert.match(bootstrap, /--dash-widget-bg/);
  assert.match(bootstrap, /--dash-widget-accent/);
  assert.match(bootstrap, /\.dashboard-home-root\s+\.dashboard-home-widget-shell/);
  assert.match(bootstrap, /\.dashboard-home-root\s+\.dashboard-home-widget-shell\[data-noria-widget-type="stat"\]/);
  assert.match(bootstrap, /\.dashboard-home-root\s+\.dashboard-home-widget-shell\[data-noria-widget-collapsed="true"\]/);
  assert.match(bootstrap, /\.dashboard-home-widget-collapsed-label/);
  assert.match(bootstrap, /\.dashboard-home-stat-widget/);
  assert.match(bootstrap, /\.dashboard-home-stat-card/);
  assert.match(bootstrap, /\.dashboard-home-action-button:not\(:disabled\):hover/);
  assert.match(bootstrap, /\.dashboard-home-today-actions\s*\{[\s\S]*grid-template-columns:\s*minmax\(18rem,\s*1fr\)\s*max-content/);
  assert.match(bootstrap, /\.dashboard-home-today-capture-input\s*\{[\s\S]*box-shadow:\s*none\s*;/);
  assert.match(bootstrap, /\.dashboard-home-today-action-button\s*\{[\s\S]*background:\s*transparent\s*;/);
  assert.doesNotMatch(bootstrap, /\.dashboard-home-focus/);
  assert.match(bootstrap, /@media\s*\(max-width:\s*860px\)[\s\S]*\.dashboard-home-today-actions\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(bootstrap, /\.dashboard-home-entry-row/);
  assert.match(bootstrap, /\.dashboard-home-markdown-widget/);
  assert.match(bootstrap, /\.dashboard-home-markdown-briefing/);
  assert.match(bootstrap, /\.dashboard-home-markdown-briefing-overview/);
  assert.match(bootstrap, /\.dashboard-home-markdown-briefing-overview-fact/);
  assert.match(bootstrap, /\.dashboard-home-markdown-briefing-item/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-facts/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-excerpt/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-action-hint/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-section-trail/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-role/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-updated/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-freshness/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-size/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-action-count/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-state/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-state\[data-noria-markdown-source-state="failed"\]/);
  assert.match(bootstrap, /\.dashboard-home-markdown-source-open/);
  const briefingBlock = bootstrap.match(/\.dashboard-home-markdown-briefing\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const overviewBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-overview\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const overviewFactBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-overview-fact\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const summaryBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-summary\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const metaBlock = bootstrap.match(/\.dashboard-home-markdown-source-meta\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const pathBlock = bootstrap.match(/\.dashboard-home-markdown-source-path\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(briefingBlock, "markdown briefing block should exist");
  assert.ok(overviewBlock, "markdown briefing overview block should exist");
  assert.ok(overviewFactBlock, "markdown briefing overview fact block should exist");
  assert.ok(summaryBlock, "markdown briefing summary block should exist");
  assert.ok(metaBlock, "markdown source meta block should exist");
  assert.ok(pathBlock, "markdown source path block should exist");
  assert.match(briefingBlock, /container-type:\s*inline-size/);
  assert.match(overviewBlock, /display:\s*inline-flex/);
  assert.match(overviewBlock, /flex-wrap:\s*wrap/);
  assert.match(overviewBlock, /color:\s*var\(--dash-widget-muted\)/);
  assert.doesNotMatch(overviewBlock, /border:|background:|box-shadow:/);
  assert.match(overviewFactBlock, /white-space:\s*nowrap/);
  assert.doesNotMatch(overviewFactBlock, /border:|background:|box-shadow:/);
  assert.match(summaryBlock, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*min\(34%,\s*32rem\)\)/);
  assert.doesNotMatch(summaryBlock, /max-content/);
  assert.match(metaBlock, /flex-wrap:\s*wrap/);
  assert.match(pathBlock, /max-width:\s*min\(18rem,\s*100%\)/);
  assert.match(pathBlock, /flex:\s*1\s+1\s+10rem/);
  assert.match(bootstrap, /@container\s*\(max-width:\s*720px\)[\s\S]*\.dashboard-home-markdown-briefing-summary\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  const factsBlock = bootstrap.match(/\.dashboard-home-markdown-source-facts\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const roleBlock = bootstrap.match(/\.dashboard-home-markdown-source-role\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const freshnessBlock = bootstrap.match(/\.dashboard-home-markdown-source-freshness\[data-noria-markdown-source-freshness="stale"\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(factsBlock, "markdown source facts block should exist");
  assert.ok(roleBlock, "markdown source role block should exist");
  assert.ok(freshnessBlock, "markdown source freshness state block should exist");
  assert.match(factsBlock, /display:\s*inline-flex/);
  assert.match(factsBlock, /color:\s*var\(--dash-widget-muted\)/);
  assert.doesNotMatch(factsBlock, /border:/);
  assert.doesNotMatch(factsBlock, /background:/);
  assert.match(roleBlock, /text-transform:\s*uppercase/);
  assert.doesNotMatch(roleBlock, /border:|background:|box-shadow:/);
  assert.doesNotMatch(freshnessBlock, /border:|background:|box-shadow:/);
  const excerptBlock = bootstrap.match(/\.dashboard-home-markdown-source-excerpt\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const actionHintBlock = bootstrap.match(/\.dashboard-home-markdown-source-action-hint\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const sectionTrailBlock = bootstrap.match(/\.dashboard-home-markdown-source-section-trail\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(excerptBlock, "markdown source excerpt block should exist");
  assert.ok(actionHintBlock, "markdown source action hint block should exist");
  assert.ok(sectionTrailBlock, "markdown source section trail block should exist");
  assert.match(excerptBlock, /flex-basis:\s*100%/);
  assert.match(excerptBlock, /color:\s*var\(--dash-widget-muted\)/);
  assert.match(excerptBlock, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(excerptBlock, /border:/);
  assert.doesNotMatch(excerptBlock, /background:/);
  assert.doesNotMatch(excerptBlock, /box-shadow:/);
  assert.match(actionHintBlock, /flex-basis:\s*100%/);
  assert.match(actionHintBlock, /color:\s*color-mix/);
  assert.doesNotMatch(actionHintBlock, /cursor:\s*pointer/);
  assert.match(actionHintBlock, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(actionHintBlock, /border:/);
  assert.doesNotMatch(actionHintBlock, /background:/);
  assert.doesNotMatch(actionHintBlock, /box-shadow:/);
  const actionableHintBlock = bootstrap.match(/\.dashboard-home-markdown-source-action-hint\[data-noria-action-kind\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(actionableHintBlock, "only source-backed markdown action hints should look clickable");
  assert.match(actionableHintBlock, /cursor:\s*pointer/);
  assert.doesNotMatch(actionableHintBlock, /border:|background:|box-shadow:/);
  const actionHintPendingBlock = bootstrap.match(/\.dashboard-home-markdown-source-action-hint\[data-noria-action-state="pending"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  const actionHintFailedBlock = bootstrap.match(/\.dashboard-home-markdown-source-action-hint\[data-noria-action-state="failed"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(actionHintPendingBlock, "markdown action hint pending state should stay low-noise");
  assert.ok(actionHintFailedBlock, "markdown action hint failed state should stay low-noise");
  assert.doesNotMatch(`${actionHintPendingBlock}\n${actionHintFailedBlock}`, /border:|background:|box-shadow:/);
  assert.match(sectionTrailBlock, /flex-basis:\s*100%/);
  assert.match(sectionTrailBlock, /color:\s*color-mix/);
  assert.doesNotMatch(sectionTrailBlock, /cursor:\s*pointer/);
  assert.match(sectionTrailBlock, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(sectionTrailBlock, /border:/);
  assert.doesNotMatch(sectionTrailBlock, /background:/);
  assert.doesNotMatch(sectionTrailBlock, /box-shadow:/);
  const actionableTrailBlock = bootstrap.match(/\.dashboard-home-markdown-source-section-trail\[data-noria-action-kind\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(actionableTrailBlock, "only source-backed markdown section trails should look clickable");
  assert.match(actionableTrailBlock, /cursor:\s*pointer/);
  assert.doesNotMatch(actionableTrailBlock, /border:|background:|box-shadow:/);
  const sectionTrailPendingBlock = bootstrap.match(/\.dashboard-home-markdown-source-section-trail\[data-noria-action-state="pending"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  const sectionTrailFailedBlock = bootstrap.match(/\.dashboard-home-markdown-source-section-trail\[data-noria-action-state="failed"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(sectionTrailPendingBlock, "markdown section trail pending state should stay low-noise");
  assert.ok(sectionTrailFailedBlock, "markdown section trail failed state should stay low-noise");
  assert.doesNotMatch(`${sectionTrailPendingBlock}\n${sectionTrailFailedBlock}`, /border:|background:|box-shadow:/);
  assert.match(bootstrap, /\.theme-dark\s+\.dashboard-home-root\s+\.dashboard-home-widget-shell/);
});

test("home markdown briefing overview exposes one priority source cue without action chrome", () => {
  const home = read("views/dashboard/home/view.js");
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(home, /createHomeMarkdownBriefingPriority/);
  assert.match(home, /updateHomeMarkdownBriefingSourcePriority/);
  assert.match(home, /data-noria-markdown-briefing-priority-path/);
  assert.match(home, /data-noria-markdown-briefing-priority-label/);
  assert.match(home, /data-noria-markdown-briefing-priority-state/);
  assert.match(home, /data-noria-markdown-briefing-priority-reason/);
  assert.match(home, /data-noria-markdown-briefing-priority-line/);
  assert.match(home, /data-noria-markdown-source-priority-rank/);
  assert.match(home, /data-noria-markdown-source-priority-reason/);
  assert.match(home, /data-noria-action-source",\s*"home-markdown-briefing-priority"/);
  assert.match(home, /open-markdown-action-source/);
  assert.match(home, /data-noria-action-target-line/);
  assert.match(home, /setAttribute\?\.\("role",\s*"button"\)/);
  assert.match(home, /setAttribute\?\.\("tabindex",\s*"0"\)/);
  assert.match(home, /openHomeActionFile\(priority\.path/);
  assert.match(home, /event\?\.key\s*===\s*"Enter"/);
  assert.match(home, /event\?\.key\s*===\s*"\s"/);
  assert.match(home, /runtime\.home\.markdown\.prioritySource/);
  assert.match(home, /priorityReason\s*[:=]\s*"failed"/);
  assert.match(home, /priorityReason\s*[:=]\s*"stale"/);
  assert.match(home, /priorityReason\s*[:=]\s*"action"/);
  assert.doesNotMatch(home, /dashboard-home-markdown-briefing-priority[\s\S]{0,260}createEl\("button"/);

  assert.match(bootstrap, /\.dashboard-home-markdown-briefing-priority/);
  const priorityBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-priority\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(priorityBlock, "markdown briefing priority block should exist");
  assert.match(priorityBlock, /max-width:\s*100%/);
  assert.match(priorityBlock, /text-overflow:\s*ellipsis/);
  assert.match(priorityBlock, /color:\s*color-mix/);
  assert.doesNotMatch(priorityBlock, /border:|background:|box-shadow:/);

  const priorityPendingBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-priority\[data-noria-action-state="pending"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  const sourceOpenFailedBlock = bootstrap.match(/\.dashboard-home-markdown-source-open\[data-noria-action-state="failed"\][\s\S]*?\n\s{4}\}/)?.[0] || "";
  assert.ok(priorityPendingBlock, "markdown briefing priority pending state should stay low-noise");
  assert.ok(sourceOpenFailedBlock, "markdown briefing source open failed state should stay low-noise");
  assert.match(priorityPendingBlock, /color:\s*var\(--dash-widget-accent\)/);
  assert.match(priorityPendingBlock, /opacity:\s*\.78/);
  assert.match(sourceOpenFailedBlock, /color:\s*var\(--text-error\)/);
  assert.doesNotMatch(`${priorityPendingBlock}\n${sourceOpenFailedBlock}`, /border:|background:|box-shadow:/);
});

test("home markdown briefing action lanes stay compact without card chrome", () => {
  const home = read("views/dashboard/home/view.js");
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(home, /dashboard-home-markdown-briefing-action-workbench/);
  assert.match(home, /dashboard-home-markdown-briefing-action-lane/);
  assert.match(home, /data-noria-markdown-briefing-workbench/);
  assert.match(home, /data-noria-markdown-briefing-action-lane/);
  assert.match(home, /runtime\.home\.markdown\.actionLaneToday/);
  assert.doesNotMatch(home, /dashboard-home-markdown-briefing-action-workbench[\s\S]{0,420}createEl\("button"/);

  const workbenchBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-action-workbench\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const laneBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-action-lane\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const laneLabelBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-action-lane-label\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const laneItemsBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-action-lane-items\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(workbenchBlock, "markdown briefing action workbench block should exist");
  assert.ok(laneBlock, "markdown briefing action lane block should exist");
  assert.ok(laneLabelBlock, "markdown briefing action lane label block should exist");
  assert.ok(laneItemsBlock, "markdown briefing action lane items block should exist");
  assert.match(workbenchBlock, /display:\s*grid/);
  assert.match(laneBlock, /grid-template-columns:\s*max-content\s+minmax\(0,\s*1fr\)/);
  assert.match(laneItemsBlock, /flex-wrap:\s*wrap/);
  assert.match(laneLabelBlock, /color:\s*var\(--dash-widget-muted\)/);
  assert.doesNotMatch(`${workbenchBlock}\n${laneBlock}\n${laneLabelBlock}\n${laneItemsBlock}`, /border:|background:|box-shadow:/);
});

test("home markdown briefing source provenance stays secondary after action lanes", () => {
  const bootstrap = read("views/dashboard/home/sections/bootstrap-style/view.js");

  const itemBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-item\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const openItemBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-item\[open\]\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const summaryBlock = bootstrap.match(/\.dashboard-home-markdown-briefing-summary\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(itemBlock, "markdown briefing source item block should exist");
  assert.ok(openItemBlock, "markdown briefing open source item block should exist");
  assert.ok(summaryBlock, "markdown briefing summary block should exist");
  assert.match(itemBlock, /border-top:\s*1px\s+solid/);
  assert.match(itemBlock, /background:\s*transparent/);
  assert.match(itemBlock, /border-radius:\s*0/);
  assert.match(openItemBlock, /background:\s*transparent/);
  assert.doesNotMatch(`${itemBlock}\n${openItemBlock}`, /box-shadow:/);
  assert.doesNotMatch(`${itemBlock}\n${openItemBlock}`, /(^|\n)\s*border:\s*1px/);
  for (const radius of `${itemBlock}\n${openItemBlock}`.matchAll(/border-radius:\s*([^;\n]+)/g)) {
    assert.equal(radius[1].trim(), "0");
  }
  assert.doesNotMatch(summaryBlock, /background:|box-shadow:/);
});

test("trend widgets default to full dashboard stats with one global range", () => {
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");
  const noteTrend = read("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js");
  const taskTrend = read("views/dashboard/home/sections/trends-and-stats/blocks/task-trend/view.js");
  const dailyState = read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js");
  const heatmaps = read("views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js");
  const tagDistribution = read("views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution/view.js");

  assert.match(trends, /DEFAULT_TOP_BLOCKS\s*=\s*\["note-trend",\s*"task-trend"\]/);
  assert.match(trends, /DEFAULT_MIDDLE_BLOCKS\s*=\s*\["habit-history",\s*"heatmaps"\]/);
  assert.match(trends, /DEFAULT_BOTTOM_BLOCKS\s*=\s*\["tag-distribution",\s*"daily-state"\]/);
  assert.match(trends, /createStatsRangeController/);
  assert.match(trends, /RANGE_STORAGE_KEY\s*=\s*"noria\.home\.trends\.range\.v2"/);
  assert.match(trends, /mode:\s*"last30"/);
  assert.match(trends, /runtime\.home\.trends\.rangeLast30/);
  assert.match(trends, /getHomeSnapshot/);
  assert.match(trends, /preset:\s*"home"/);
  assert.match(trends, /dataService/);
  assert.match(noteTrend, /statsSnapshot/);
  assert.match(taskTrend, /statsSnapshot/);
  assert.match(taskTrend, /tasks\?\.completion\?\.series/);
  assert.match(taskTrend, /tasks\?\.completion\?\.activityTotal/);
  assert.doesNotMatch(taskTrend, /tasks\?\.series/);
  assert.match(heatmaps, /statsSnapshot/);
  assert.match(tagDistribution, /statsSnapshot/);
  assert.match(dailyState, /statsSnapshot/);
  assert.doesNotMatch(noteTrend, /statsService/);
  assert.doesNotMatch(taskTrend, /statsService/);
  assert.match(taskTrend, /runtime\.home\.trends\.taskTrendTitle/);
  assert.match(taskTrend, /undatedCompleted/);
  assert.match(taskTrend, /noria-task-trend-axis-stat/);
  assert.match(taskTrend, /smoothPath/);
  assert.doesNotMatch(taskTrend, /renderDualAxis/);
  assert.match(read("views/dashboard/periodic-stats/impl-legacy/view.js"), /tasks\?\.completion\?\.series/);
  assert.doesNotMatch(dailyState, /dashboard-daily-state-summary/);
  assert.match(dailyState, /usingGlobalRange/);
  assert.match(dailyState, /validDays/);
  assert.match(dailyState, /averageEnergy/);
});

test("home trends heatmaps reads diary word counts in bounded parallel after task pass", () => {
  const heatmaps = read("views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js");
  const diaryLoopStart = heatmaps.indexOf("for (const p of diaryPages)");
  const noteCountStart = heatmaps.indexOf("const noteCountMap", diaryLoopStart);
  assert.ok(diaryLoopStart > 0 && noteCountStart > diaryLoopStart, "heatmap diary loop should be present before note count collection");
  const diaryLoopBlock = heatmaps.slice(diaryLoopStart, noteCountStart);

  assert.match(heatmaps, /async function runHeatmapDiaryReadQueue/);
  assert.match(heatmaps, /Math\.min\(limit,\s*queue\.length\)/);
  assert.match(heatmaps, /const heatmapDiaryWordReads\s*=\s*\[\]/);
  assert.match(heatmaps, /heatmapDiaryWordReads\.push\(async \(\) =>/);
  assert.match(heatmaps, /heatmapDiaryWordReads\.push\(async \(\) => \{\s*try \{\s*const c = await ctx\.io\.load\(p\.file\.path\)/);
  assert.match(heatmaps, /await runHeatmapDiaryReadQueue\(heatmapDiaryWordReads\)/);
  assert.doesNotMatch(diaryLoopBlock, /\n\s{2}try\s*\{\s*\n\s{4}const c = await ctx\.io\.load\(p\.file\.path\)/);
});

test("home note creation surfaces prefer semantic created metadata before file ctime", () => {
  const sources = [
    read("views/dashboard/home/sections/overview-metrics/view.js"),
    read("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js"),
    read("views/dashboard/home/sections/trends-and-stats/blocks/heatmaps/view.js"),
    read("views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution/view.js")
  ];
  for (const source of sources) {
    assert.match(source, /page\?\.created\s*\|\|\s*page\?\.file\?\.ctime/);
  }
});

test("home note trend fallback reads diary words in bounded parallel", () => {
  const noteTrend = read("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js");
  const cacheMissStart = noteTrend.indexOf("if (noteTrendCache.key === noteTrendCacheKey");
  const cacheWriteStart = noteTrend.indexOf("noteTrendCache.key = noteTrendCacheKey", cacheMissStart);
  assert.ok(cacheMissStart > 0 && cacheWriteStart > cacheMissStart, "note trend cache miss branch should precede cache write");
  const cacheMissBlock = noteTrend.slice(cacheMissStart, cacheWriteStart);

  assert.match(noteTrend, /async function runNoteTrendDiaryReadQueue/);
  assert.match(noteTrend, /Math\.min\(limit,\s*queue\.length\)/);
  assert.match(noteTrend, /const noteTrendDiaryWordReads\s*=\s*\[\]/);
  assert.match(noteTrend, /noteTrendDiaryWordReads\.push\(async \(\) =>/);
  assert.match(noteTrend, /await runNoteTrendDiaryReadQueue\(noteTrendDiaryWordReads\)/);
  assert.doesNotMatch(cacheMissBlock, /await Promise\.all\(\s*diaryPages\.map/);
});

test("home daily state fallback reads diary state in bounded parallel before merging", () => {
  const dailyState = read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js");
  const loadStart = dailyState.indexOf("async function loadWindowState(dayList)");
  const loadEnd = dailyState.indexOf("return stateMap;", loadStart);
  assert.ok(loadStart > 0 && loadEnd > loadStart, "daily-state window loader should return state map after loading rows");
  const loadBlock = dailyState.slice(loadStart, loadEnd);

  assert.match(dailyState, /async function runDailyStateDiaryReadQueue/);
  assert.match(dailyState, /Math\.min\(limit,\s*queue\.length\)/);
  assert.match(loadBlock, /const dailyStateDiaryReadJobs\s*=\s*\[\]/);
  assert.match(loadBlock, /const dailyStateDiaryRows\s*=\s*\[\]/);
  assert.match(loadBlock, /dailyStateDiaryReadJobs\.push\(async \(\) =>/);
  assert.match(loadBlock, /await runDailyStateDiaryReadQueue\(dailyStateDiaryReadJobs\)/);
  assert.match(loadBlock, /for \(const row of dailyStateDiaryRows\)/);
  assert.ok(
    loadBlock.indexOf("await runDailyStateDiaryReadQueue(dailyStateDiaryReadJobs)") <
      loadBlock.indexOf("for (const row of dailyStateDiaryRows)"),
    "daily-state should merge rows only after queued reads complete"
  );
  assert.doesNotMatch(loadBlock, /await Promise\.all\(\s*toPlainArray\(diaryPages\)\.map/);
});

test("periodic stats legacy fallback reads diary contents in bounded parallel before aggregation", () => {
  const legacyStats = read("views/dashboard/periodic-stats/impl-legacy/view.js");
  const loopStart = legacyStats.indexOf("for (const p of pages)");
  const cacheWriteStart = legacyStats.indexOf("cacheState[cacheKey]", loopStart);
  assert.ok(loopStart > 0 && cacheWriteStart > loopStart, "legacy stats fallback page loop should precede cache write");
  const loopBlock = legacyStats.slice(loopStart, cacheWriteStart);

  assert.match(legacyStats, /async function runPeriodicStatsDiaryReadQueue/);
  assert.match(legacyStats, /Math\.min\(limit,\s*queue\.length\)/);
  assert.match(legacyStats, /const periodicStatsDiaryReadJobs\s*=\s*\[\]/);
  assert.match(legacyStats, /const periodicStatsDiaryRows\s*=\s*\[\]/);
  assert.match(loopBlock, /periodicStatsDiaryReadJobs\.push\(async \(\) =>/);
  assert.match(legacyStats, /await runPeriodicStatsDiaryReadQueue\(periodicStatsDiaryReadJobs\)/);
  assert.match(legacyStats, /for \(const row of periodicStatsDiaryRows\)/);
  assert.ok(
    legacyStats.indexOf("await runPeriodicStatsDiaryReadQueue(periodicStatsDiaryReadJobs)") <
      legacyStats.indexOf("for (const row of periodicStatsDiaryRows)"),
    "legacy stats should aggregate diary rows only after queued reads complete"
  );
  assert.doesNotMatch(
    loopBlock,
    /\n\s{4}let content = "";\s*\n\s{4}try\s*\{\s*\n\s{6}content = String\(await ctx\.io\.load\(p\.file\.path\)/
  );
});

test("home trends preserves the full habit history surface outside the overview strip", () => {
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");
  const overviewColumns = read("views/dashboard/home/sections/overview-columns/view.js");

  assert.doesNotMatch(overviewColumns, /dashboard-overview-habit-context/);
  assert.match(trends, /DEFAULT_MIDDLE_BLOCKS\s*=\s*\["habit-history",\s*"heatmaps"\]/);
  assert.match(trends, /BLOCK_VIEW_PATHS\s*=\s*\{[\s\S]*"habit-history":\s*"\.obsidian\/plugins\/noria\/views\/periodic\/dashboardHabitWeek"/);
  assert.match(trends, /createHabitHistoryShell/);
  assert.match(trends, /dashboard-home-trends-habit-history/);
  assert.match(trends, /actionsHost:\s*habitShell\.actionsHost/);
  assert.doesNotMatch(trends, /dashboard-overview-habit-context/);
});

test("home trends range controls render in the widget title and update locally", () => {
  const home = read("views/dashboard/home/view.js");
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");

  assert.match(home, /dashboard-home-widget-title-actions/);
  assert.match(home, /titleActionsHost/);
  assert.match(trends, /input\?\.controlsHost/);
  assert.match(trends, /renderTrendsContent/);
  assert.match(trends, /renderToken/);
  assert.match(trends, /contentHost/);
  assert.match(trends, /createTrendsLayout/);
  assert.match(trends, /renderBlockIntoSlot/);
  assert.match(trends, /preserveScrollAnchor/);
  assert.match(trends, /data-noria-trends-slot/);
  assert.match(trends, /dashboard-home-trends-block-stage/);
  assert.match(trends, /dashboard-home-trends-date-field/);
  assert.match(trends, /dashboard-home-trends-range-button/);
  assert.match(trends, /dashboard-heatmap-mode-button/);
  assert.match(trends, /button\.style\.fontWeight = active \? "720" : "650"/);
  assert.match(trends, /min-height:28px;height:28px/);
  assert.match(trends, /font-size:13px/);
  assert.match(trends, /createDateField/);
  assert.match(trends, /type\s*=\s*"date"/);
  assert.doesNotMatch(trends, /clearElement\(contentHost\)/);
  assert.doesNotMatch(trends, /inputEl\.style\.cssText\s*=\s*"width:118px/);
  assert.doesNotMatch(trends, /requestHomeRefresh/);
  assert.doesNotMatch(trends, /requestRefresh\?\.\(\s*["']home["']/);
});

test("home trends custom range restore prefers synced settings before legacy localStorage", () => {
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");
  const readCustomStart = trends.indexOf("function readSavedCustomRange");
  const readCustomEnd = trends.indexOf("function clearElement", readCustomStart);
  assert.ok(readCustomStart > 0 && readCustomEnd > readCustomStart, "readSavedCustomRange should be present");
  const readCustomBlock = trends.slice(readCustomStart, readCustomEnd);

  assert.match(readCustomBlock, /noriaTrendsBridge\?\.homeSettings\?\.trendsRange/);
  assert.match(readCustomBlock, /noriaTrendsBridge\?\.getHomeTrendsRange/);
  assert.match(readCustomBlock, /mode\s*===\s*"custom"/);
  assert.match(readCustomBlock, /localStorage\.getItem\(RANGE_STORAGE_KEY\)/);
  assert.ok(
    readCustomBlock.indexOf("homeSettings?.trendsRange") < readCustomBlock.indexOf("localStorage.getItem"),
    "synced settings should be consulted before legacy localStorage"
  );
});

test("home trends custom view runner cache is scoped by runtime build", () => {
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");
  const start = trends.indexOf("function getCachedViewRunner");
  const end = trends.indexOf("async function runCustomViewByPath", start);
  assert.ok(start > 0 && end > start, "getCachedViewRunner should be present");
  const block = trends.slice(start, end);

  assert.match(block, /runtimeBuildId/);
  assert.match(block, /__noriaHomeTrendsRunCacheBuildId/);
  assert.match(block, /__noriaHomeTrendsRunCache\s*=\s*new Map\(\)/);
  assert.ok(
    block.indexOf("__noriaHomeTrendsRunCacheBuildId") < block.indexOf("const cache = g.__noriaHomeTrendsRunCache"),
    "build id should be checked before the trends runner cache is used"
  );
});

test("home trends custom view source cache single-flights by runtime build", () => {
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");

  assert.match(trends, /function getTrendsViewSourceState/);
  assert.match(trends, /__noriaHomeTrendsSourceState/);
  assert.match(trends, /sourceTextCache:\s*new Map\(\)/);
  assert.match(trends, /sourceTextPending:\s*new Map\(\)/);
  assert.match(trends, /runtimeBuildId/);
  assert.match(trends, /async function loadCachedViewSource/);
  assert.match(trends, /perf\.viewSourceCache\s*===\s*false/);
  assert.match(trends, /sourceTextPending\.has/);
  assert.match(trends, /sourceTextPending\.set/);
  assert.match(trends, /sourceTextCache\.set/);
  assert.match(trends, /sourceTextPending\.delete/);
  assert.match(trends, /await loadCachedViewSource\(candidate\)/);
});

test("home trends only resolves fixed built-in block ids into executable view paths", () => {
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");

  assert.match(trends, /const ALLOWED_BLOCK_IDS = new Set\(\[/);
  for (const blockId of ["note-trend", "task-trend", "habit-history", "heatmaps", "tag-distribution", "daily-state"]) {
    assert.match(trends, new RegExp(`"${blockId}"`));
  }
  assert.match(trends, /function normalizeBlockId\(value\)/);
  assert.match(trends, /ALLOWED_BLOCK_IDS\.has\(normalized\)/);
  assert.doesNotMatch(trends, /blocks\/\$\{name\}/);
});

test("home stats visuals use taller trend charts, compact balanced donut, and aligned heatmap month labels", () => {
  const noteTrend = read("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js");
  const taskTrend = read("views/dashboard/home/sections/trends-and-stats/blocks/task-trend/view.js");
  const tagDistribution = read("views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution/view.js");
  const dailyState = read("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js");
  const donut = read("views/dashboard/core/components/charts/leader-donut-chart.js");
  const heatmap = read("views/dashboard/core/components/charts/year-heatmap-calendar.js");
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");

  assert.match(noteTrend, /min-height:232px/);
  assert.match(taskTrend, /min-height:232px/);
  assert.match(noteTrend, /chartH\s*=\s*Math\.max\(232/);
  assert.match(taskTrend, /chartH\s*=\s*Math\.max\(232/);
  assert.match(trends, /align-items:stretch/);
  assert.match(tagDistribution, /labelBalance:\s*"balanced"/);
  assert.match(tagDistribution, /height:\s*218/);
  assert.match(tagDistribution, /height:100%/);
  assert.match(tagDistribution, /box-sizing:border-box/);
  assert.match(dailyState, /height:100%/);
  assert.match(dailyState, /box-sizing:border-box/);
  assert.doesNotMatch(dailyState, /margin-bottom:8px/);
  assert.match(donut, /function balanceLabelSides/);
  assert.match(donut, /labelBalance/);
  assert.match(heatmap, /function monthStartColumn/);
  assert.match(heatmap, /alignMonthLabel/);
  assert.match(heatmap, /monthStartColumn,\s*layoutSpec/);
});

test("home habit history uses MOC-entry typography and native cards stretch naturally by row", () => {
  const styles = read("views/dashboard/home/sections/bootstrap-style/view.js");
  const trends = read("views/dashboard/home/sections/trends-and-stats/view.js");

  assert.match(
    styles,
    /--dash-moc-entry-font-size:\s*\.84em;/
  );
  assert.match(
    styles,
    /dashboard-home-trends-habit-history[\s\S]{0,760}font-size:\s*var\(--dash-moc-entry-font-size\);/
  );
  assert.match(
    styles,
    /dashboard-moc-chip[\s\S]{0,700}font-size:\s*var\(--dash-moc-entry-font-size\);/
  );
  assert.match(styles, /\.dashboard-home-root\s*\{[\s\S]*align-items:\s*stretch/);
  assert.match(
    styles,
    /\.dashboard-home-root\s*>\s*\.dashboard-home-widget-shell-native:not\(\[data-noria-widget-collapsed="true"\]\)\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/
  );
  assert.match(
    styles,
    /\.dashboard-home-root\s*>\s*\.dashboard-home-widget-shell-native:not\(\[data-noria-widget-collapsed="true"\]\)\s*>\s*\.dashboard-home-widget-native-content\s*\{[\s\S]*flex:\s*1 1 auto;/
  );
  assert.match(
    trends,
    /contentHost\.style\.cssText\s*=\s*renderMode\s*===\s*"block"[\s\S]{0,260}height:100%;[\s\S]{0,120}flex-direction:column;/
  );
});

test("shared chart helpers balance donut label counts and align month labels to week columns", () => {
  const donut = loadRuntimeChart("views/dashboard/core/components/charts/leader-donut-chart.js").leaderDonutChart._test;
  const heatmap = loadRuntimeChart("views/dashboard/core/components/charts/year-heatmap-calendar.js").yearHeatmapCalendar._test;

  const labels = Array.from({ length: 5 }, (_, index) => ({
    isRight: false,
    sideConfidence: index / 10,
    slice: { pct: 0.1 + index / 100 }
  }));
  const balanced = donut.balanceLabelSides(labels, "balanced");
  const right = balanced.filter((label) => label.isRight).length;
  const left = balanced.length - right;
  assert.ok(Math.abs(right - left) <= 1);
  assert.equal(donut.balanceLabelSides(labels, "natural").filter((label) => label.isRight).length, 0);

  assert.equal(heatmap.monthStartColumn(2026, 0, 1), 1);
  assert.equal(heatmap.monthStartColumn(2026, 1, 1), 5);
  assert.equal(heatmap.monthStartColumn(2026, 11, 1), 49);

  for (const width of [210, 250, 320]) {
    const spec = heatmap.layoutSpec(width, 53, false);
    const gridWidth = spec.cell * 53 + spec.gap * 52;
    assert.ok(gridWidth <= width, `continuous heatmap should fit a ${width}px card without clipping`);
  }
});

test("periodic stats and diary templates no longer embed weekly habit matrix or periodic blocks", () => {
  const periodicFacade = read("views/dashboard/periodic-stats/view.js");
  const periodicLegacy = read("views/dashboard/periodic-stats/impl-legacy/view.js");
  const main = read("src/main.js");
  const templateLibrary = read("config/template-library.md");

  assert.doesNotMatch(periodicFacade, /habit-week-matrix/);
  assert.doesNotMatch(periodicLegacy, /renderWeeklyHabitBoard|weeklyHabitMatrix/);
  assert.doesNotMatch(templateLibrary, /periodicStats/);
  assert.doesNotMatch(templateLibrary, /###\s*(周统计|月统计|年统计)/);
  assert.doesNotMatch(main, /###\s*(?:周统计|月统计|年统计)[\s\S]{0,180}periodicStats/);
  assert.doesNotMatch(main, /###\s*(?:Weekly stats|Monthly stats|Yearly stats)[\s\S]{0,220}periodicStats/);
});
