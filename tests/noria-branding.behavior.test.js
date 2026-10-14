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

function read(rel) {
  return fs.readFileSync(pluginPath(rel), "utf8");
}

function loadPluginClass() {
  const code = read("main.js");
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
          Plugin: class {},
          PluginSettingTab: class {
            constructor(app, plugin) {
              this.app = app;
              this.plugin = plugin;
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
            return "en";
          }
        };
      }
      if (id === "child_process") return {};
      if (id === "crypto") return require("node:crypto");
      if (id === "./home-focus-defaults.js") return require("../src/home-focus-defaults.js");
      throw new Error(`Unexpected require: ${id}`);
    },
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "main.js" });
  return module.exports;
}

function makePlugin() {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.app = {
    workspace: {
      getLeavesOfType() {
        return [];
      },
      trigger() {},
      revealLeaf() {}
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
  return plugin;
}

test("manifest and package identify the plugin as Noria with canonical release metadata", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const pkg = JSON.parse(read("package.json"));

  assert.equal(manifest.id, "noria");
  assert.equal(manifest.name, "Noria");
  assert.equal(manifest.author, "Biao Zhou");
  assert.equal(manifest.authorUrl, "https://github.com/jellyns");
  assert.equal(manifest.description, "A configurable workbench for notes, knowledge, tasks, projects, habits, timelines, statistics, and reviews.");
  assert.equal(manifest.isDesktopOnly, true);
  assert.equal(pkg.name, "noria");
  assert.equal(pkg.repository?.type, "git");
  assert.equal(pkg.repository?.url, "git+https://github.com/jellyns/obsidian-noria.git");
  assert.equal(pkg.homepage, "https://github.com/jellyns/obsidian-noria#readme");
  assert.equal(manifest.version, pkg.version);
});

test("release commands do not reserve a default hotkey", () => {
  const plugin = makePlugin();
  const editTask = plugin.getCoreCommandSpecs().find((command) => command.id === "edit-task-under-cursor");

  assert.ok(editTask);
  assert.equal(Object.prototype.hasOwnProperty.call(editTask, "hotkeys"), false);
});

test("public command ids are semantic and rely on the Obsidian plugin namespace", () => {
  const plugin = makePlugin();
  const ids = Array.from(plugin.getCoreCommandSpecs(), (command) => command.id);

  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length, "command ids must remain unique");
  ids.forEach(id => assert.match(id, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/));
  ids.forEach((id) => assert.doesNotMatch(id, /^noria-/));
});

test("runtime bridge, commands, views, and CSS use the Noria namespace", () => {
  const main = read("src/main.js");
  const styles = read("styles.css");
  const taskCalendarCss = read("views/tasks-calendar/default.css");
  const runtimeCore = read("views/tasks-calendar/runtime-core.js");

  assert.match(main, /NORIA_SETTING_TABS/);
  assert.match(main, /VIEW_TYPE_NORIA_TASKS/);
  assert.match(main, /getNoriaLocale/);
  assert.match(main, /globalThis\.__noriaRuntimeBridge/);
  assert.match(main, /globalThis\.__noriaTasksCalendarApi/);
  assert.match(main, /noriaBridge/);
  assert.match(main, /"open-home-tab"/);
  assert.doesNotMatch(main, /"noria-open-home-tab"/);
  assert.match(main, /"noria-dashboard-home"/);
  assert.match(main, /"noria-weather-qweather-key"/);
  assert.match(main, /noria-view/);
  assert.match(styles, /--noria-surface-1\s*:/);
  assert.match(taskCalendarCss, /--noria-surface-1\s*:/);
  assert.match(runtimeCore, /noriaBridge\.t/);

  const retiredUpper = ["Z", "BOARD_"].join("");
  const retiredClass = ["Z", "Board"].join("");
  const retiredRuntime = ["__", "z", "Board"].join("");
  const retiredHyphenLower = ["z", "board"].join("-");
  const retiredHyphenTitle = ["Z", "board"].join("-");
  const retiredFlat = ["z", "board"].join("");
  const retiredToken = ["--", "zb", "-"].join("");
  assert.doesNotMatch(main, new RegExp(retiredUpper));
  assert.doesNotMatch(main, new RegExp("\\b" + retiredClass));
  assert.doesNotMatch(main, new RegExp("\\b" + retiredFlat, "i"));
  assert.doesNotMatch(main, new RegExp(retiredRuntime));
  assert.doesNotMatch(main, new RegExp(retiredHyphenLower));
  assert.doesNotMatch(main, new RegExp(retiredHyphenTitle));
  assert.doesNotMatch(styles, new RegExp(retiredToken));
  assert.doesNotMatch(taskCalendarCss, new RegExp(retiredToken));
});

test("user-visible runtime copy uses Noria", () => {
  const plugin = makePlugin();

  assert.equal(plugin.t("settings.title"), "Noria settings");
  assert.equal(plugin.t("settings.search.placeholder"), "Search Noria settings");
  assert.equal(plugin.t("commands.openCalendar"), "Open Calendar");
  assert.equal(plugin.t("ribbon.calendar"), "Calendar");
  assert.equal(plugin.t("views.calendar.title"), "Calendar");
  assert.match(plugin.t("notices.healthOk"), /^Noria\b/);
  assert.match(plugin.t("modules.disabled.desc"), /Settings > Noria/);

  plugin.getNoriaLocale = () => "zh";
  assert.equal(plugin.t("settings.title"), "Noria 设置");
  assert.equal(plugin.t("settings.search.placeholder"), "搜索 Noria 设置");
  assert.equal(plugin.t("commands.openCalendar"), "打开日历");
  assert.equal(plugin.t("ribbon.calendar"), "日历");
  assert.equal(plugin.t("views.calendar.title"), "日历");
  assert.match(plugin.t("notices.healthOk"), /^Noria/);
  assert.match(plugin.t("modules.disabled.desc"), /设置 > Noria/);

  const calendarView = read("views/calendar/view.js");
  assert.match(calendarView, /Calendar bridge is unavailable\./);
  assert.doesNotMatch(calendarView, /Noria Calendar bridge is unavailable\./);
});

test("runtime scratch state no longer uses retired zb prefixes", () => {
  const runtimeCore = read("views/tasks-calendar/runtime-core.js");
  const timelineTest = read("tests/tasks-timeline.behavior.test.js");

  assert.doesNotMatch(runtimeCore, /_zb[A-Za-z0-9_]+/);
  assert.doesNotMatch(timelineTest, /\^zb[0-9A-Za-z_-]+/);
});

test("fresh defaults use IPARA locations, secret, and review skill", () => {
  const plugin = makePlugin();

  const settings = plugin.normalizeSettings({});

  assert.equal(Object.prototype.hasOwnProperty.call(settings.managedPaths, "entryNote"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings, "viewNotePath"), false);
  assert.equal(settings.onboarding.workspaceRoot, "Noria");
  Object.values(settings.managedPaths).forEach((managedPath) => {
    assert.ok(!managedPath || /^(?:00_Inbox|01_Projects|02_Areas|06_Diary)(?:\/|$)/.test(managedPath));
  });
  assert.equal(settings.managedPaths.inboxWorkflow, undefined);
  assert.equal(settings.managedPaths.inboxQueue, "02_Areas/知识库管理/Inbox queue.base");
  assert.equal(settings.home.identity.avatarPath, "");
  assert.equal(settings.home.identity.quoteListPath, "");
  settings.homeDashboard.mocEntryPaths.forEach((mocPath) => {
    assert.match(mocPath, /^Noria\//);
  });
  assert.equal(Object.prototype.hasOwnProperty.call(settings.managedPaths, "reviewArtifactBase"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings, "runtimeFiles"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.reviewCenter, "artifactBasePath"), false);
  assert.equal(settings.weather.qweatherSecretName, "noria-weather-qweather-key");
  assert.equal(settings.reviewCenter.prompt.skillName, "noria-review");
});

test("fresh review skill installs under Noria paths with Noria copy", async () => {
  const plugin = makePlugin();
  const writes = [];
  plugin.loadTextFromVault = async () => "";
  plugin.writeTextToVault = async (skillPath, content) => {
    writes.push({ skillPath, content });
  };

  const result = await plugin.ensureDefaultReviewSkill();

  assert.equal(result.ok, true);
  assert.deepEqual(writes.map((entry) => entry.skillPath), [
    ".codex/skills/noria-review/SKILL.md",
    ".claude/skills/noria-review/SKILL.md"
  ]);
  writes.forEach(({ content }) => {
    assert.match(content, /^---\nname: noria-review\n/m);
    assert.match(content, /# Noria Review/);
    assert.match(content, /daily, weekly, monthly or yearly reflections from Noria/);
  });
});

test("fresh starter content and generated diagnostics use Noria copy", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  const english = [
    plugin.buildStarterProjectSeed({}, "setup"),
    plugin.getSupportSeedText("homeAvatar"),
    plugin.getManagedNoteSeed("importantDates"),
    plugin.getManagedNoteSeed("habitRegistry"),
    JSON.stringify(plugin.getStarterProjectDefinitions())
  ].join("\n");
  const retiredBrand = new RegExp(["ca", "dence"].join(""), "i");
  assert.match(english, /Active habits/);
  assert.match(english, /aria-label="Noria avatar"/);
  assert.match(english, /id="noriaAvatarFlow"/);
  assert.doesNotMatch(english, /<(?:rect|circle|text)\b/);
  assert.doesNotMatch(english, retiredBrand);

  plugin.getNoriaLocale = () => "zh";
  const chinese = [
    plugin.buildStarterProjectSeed({}, "setup"),
    plugin.getManagedNoteSeed("importantDates"),
    JSON.stringify(plugin.getStarterProjectDefinitions())
  ].join("\n");
  assert.match(chinese, /Noria/);
  assert.doesNotMatch(chinese, retiredBrand);
});

test("public docs contain no retired product name or stale internal references", () => {
  const publicFiles = [
    "README.md",
    "README.zh-CN.md",
    "docs/USER-GUIDE.md",
    "docs/zh-CN/USER-GUIDE.md",
    "docs/COMMUNITY.md",
    "docs/SUPPORT.md"
  ];
  const combined = publicFiles.map(read).join("\n");
  const retiredPattern = new RegExp(["Z", "board"].join("-") + "|" + ["z", "board"].join("-") + "|" + ["z", "board"].join(""), "i");

  assert.doesNotMatch(combined, retiredPattern);
  assert.doesNotMatch(combined, /Existing IPARA|reviewGeneration|docs\/local/);
  assert.match(combined, /AI|API/);
  assert.equal(fs.existsSync(pluginPath("docs", "Noria-UI-system.md")), false);
  assert.equal(fs.existsSync(pluginPath("docs", "archive", "2026-05-05-ui-system.md")), false);
  assert.equal(fs.existsSync(pluginPath("_archive", "2026-05-05-ui-system.md")), false);
  assert.equal(fs.existsSync(pluginPath("docs", ["Z", "board-UI-system.md"].join("-"))), false);
});

test("public docs disclose network, AI, telemetry, and custom view behavior", () => {
  const english = read("README.md");
  const chinese = read("README.zh-CN.md");
  const englishGuide = read("docs/USER-GUIDE.md");
  const chineseGuide = read("docs/zh-CN/USER-GUIDE.md");
  const weatherService = read("views/dashboard/core/utils/weather-service.js");

  assert.match(english, /## Privacy and disclosures/);
  assert.match(english, /weather services/i);
  assert.doesNotMatch(english, /clipboard/i);
  assert.match(english, /does not call an AI service/i);
  assert.match(english, /no telemetry/i);
  assert.match(english, /vault-relative JavaScript/i);
  assert.match(english, /disabled by default/i);
  assert.match(english, /Built-in Noria views do not require this permission/i);
  assert.doesNotMatch(english, /local Git/i);
  assert.doesNotMatch(english, /PowerShell/i);
  assert.match(chinese, /## 隐私与披露/);
  assert.match(chinese, /天气服务/);
  assert.doesNotMatch(chinese, /剪贴板/);
  assert.match(chinese, /不会调用 AI 服务/);
  assert.match(chinese, /不包含遥测/);
  assert.match(chinese, /库内相对路径 JavaScript/);
  assert.match(chinese, /默认关闭/);
  assert.match(chinese, /Noria 内建视图不需要此权限/);
  assert.doesNotMatch(chinese, /本机 Git/);
  assert.doesNotMatch(chinese, /PowerShell/);
  assert.doesNotMatch(weatherService, /http:\/\//i);
  assert.match(weatherService, /https:\/\/ipwho\.is\//i);
  assert.doesNotMatch(englishGuide, /default hotkey is `Ctrl\+T`/i);
  assert.doesNotMatch(chineseGuide, /默认快捷键是 `Ctrl\+T`/);
});
