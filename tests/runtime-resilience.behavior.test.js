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

function loadPluginClass(options = {}) {
  const language = options.language || "en";
  const code = fs.readFileSync(pluginPath("main.js"), "utf8");
  const module = { exports: {} };
  const context = {
    console,
    module,
    exports: module.exports,
    setTimeout(fn) {
      if (typeof fn === "function") fn();
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
      if (id === "child_process") return {};
      throw new Error(`Unexpected require: ${id}`);
    },
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "main.js" });
  module.exports.__testContext = context;
  return module.exports;
}

function makePlugin(options = {}) {
  const Plugin = loadPluginClass(options);
  const plugin = new Plugin();
  plugin.app = {
    workspace: {
      trigger() {},
      getLeavesOfType() {
        return [];
      }
    },
    vault: {
      getAbstractFileByPath() {
        return { stat: { mtime: 1 } };
      }
    }
  };
  plugin.settings = plugin.normalizeSettings({});
  return plugin;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeElement(tag, text, opts, log) {
  const node = {
    tag,
    text: String(text || ""),
    cls: opts?.cls || "",
    attrs: {},
    children: [],
    classList: {
      add(...classes) {
        node.cls = [node.cls, ...classes].filter(Boolean).join(" ");
      }
    },
    createEl(childTag, childOpts = {}) {
      const child = makeElement(childTag, childOpts.text || "", childOpts, log);
      node.children.push(child);
      return child;
    },
    createDiv(childOpts = {}) {
      return node.createEl("div", childOpts);
    },
    setText(nextText) {
      node.text = String(nextText || "");
    },
    setAttr(name, value) {
      node.attrs[name] = String(value);
    },
    appendChild(child) {
      node.children.push(child);
    },
    createEl(childTag, options = {}) {
      return makeElement(childTag, options.text, options, node.children);
    },
    setAttribute(key, value) {
      node.attrs[key] = String(value);
    },
    setText(value) {
      node.text = String(value || "");
    }
  };
  log.push(node);
  return node;
}

test("runtime task scope helper reads managed Markdown task rows and applies safe defaults", async () => {
  const plugin = makePlugin();
  const files = [
    {
      path: "Noria/Diary/2026-05-03.md",
      text: [
        "- [ ] managed task",
        "- [x] completed task",
        "- [ ] open task"
      ].join("\n"),
      stat: { mtime: 1 }
    }
  ];
  plugin.filesForScope = (scopeId) => {
    assert.equal(scopeId, "tasks");
    return files;
  };
  plugin.app.vault.cachedRead = async (file) => String(file?.text || "");
  const bridge = plugin.buildRuntimeBridgeConfig();

  const rows = await bridge.runtime.tasksForScope("tasks");

  assert.equal(Array.isArray(rows), true);
  assert.deepEqual(plain(rows.map((task) => task.text)), ["managed task", "completed task", "open task"]);
  assert.deepEqual(plain(rows.map((task) => task.completed)), [false, true, false]);
  assert.equal(rows[0].path, "Noria/Diary/2026-05-03.md");
  assert.equal(rows[2].path, "Noria/Diary/2026-05-03.md");
});

test("native runtime view failures render a friendly Noria error card instead of throwing", async () => {
  const plugin = makePlugin();
  plugin.resolveNoriaViewPath = () => "views/periodic/broken-test.js";
  plugin.loadTextFromVault = async () => 'throw new Error("boom from test view");';
  const nodes = [];
  const host = {
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodes);
    }
  };

  const sourcePath = await plugin.runNoriaView("broken-test", {}, host);

  assert.equal(sourcePath, "views/periodic/broken-test.js");
  const card = nodes.find((node) => String(node.cls).includes("noria-runtime-error-card"));
  assert.ok(card, "expected a Noria runtime error card");
  assert.doesNotThrow(() => plain(card));
  const rendered = JSON.stringify(card);
  assert.match(rendered, /Unable to render this Noria block/);
  assert.match(rendered, /broken-test/);
  assert.match(rendered, /Show technical details/);
  assert.match(rendered, /boom from test view/);
});

test("native runtime view compile failures render a friendly error instead of escaping", async () => {
  const plugin = makePlugin();
  plugin.resolveNoriaViewPath = () => "views/periodic/broken-syntax.js";
  plugin.loadTextFromVault = async () => "if (";
  const nodes = [];
  const host = {
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodes);
    }
  };

  await assert.doesNotReject(() => plugin.runNoriaView("broken-syntax", {}, host));

  const rendered = JSON.stringify(nodes);
  assert.match(rendered, /Unable to render this Noria block/);
  assert.match(rendered, /broken-syntax/);
});

test("native runtime view blocks unsafe executable paths before source load", async () => {
  const plugin = makePlugin();
  const loaded = [];
  plugin.loadTextFromVault = async (pathText) => {
    loaded.push(String(pathText || ""));
    if (String(pathText || "").includes("Dashboard/evil")) {
      return 'ctx.paragraph("unsafe executed");';
    }
    return "";
  };
  const nodes = [];
  const host = {
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodes);
    }
  };

  const sourcePath = await plugin.runNoriaView("../Dashboard/evil", {}, host);

  assert.equal(loaded.some((pathText) => pathText.includes("Dashboard/evil")), false);
  assert.equal(sourcePath, "../Dashboard/evil");
  const rendered = JSON.stringify(nodes);
  assert.doesNotMatch(rendered, /unsafe executed/);
  assert.match(rendered, /Unable to render this Noria block/);
  assert.match(rendered, /blocked Noria view path: path-traversal/);
});

test("vault custom JavaScript views require an explicit trust opt-in", async () => {
  const plugin = makePlugin();
  const loaded = [];
  plugin.loadTextFromVault = async (pathText) => {
    loaded.push(String(pathText || ""));
    return 'ctx.paragraph("trusted custom view");';
  };
  const blockedNodes = [];
  const trustedNodes = [];
  const hostFor = (nodes) => ({
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodes);
    }
  });

  assert.equal(plugin.settings.security.allowCustomJsViews, false);
  assert.equal(plugin.buildRuntimeBridgeConfig().allowCustomJsViews, false);
  await plugin.runNoriaView("Custom/Noria/trusted", {}, hostFor(blockedNodes));
  assert.equal(loaded.length, 0, "disabled custom views must be blocked before source reads");
  assert.match(JSON.stringify(blockedNodes), /custom-js-disabled/);

  plugin.settings.security.allowCustomJsViews = true;
  assert.equal(plugin.buildRuntimeBridgeConfig().allowCustomJsViews, true);
  await plugin.runNoriaView("Custom/Noria/trusted", {}, hostFor(trustedNodes));
  assert.equal(loaded.length, 1);
  assert.match(JSON.stringify(trustedNodes), /trusted custom view/);
});

test("native runtime view source loading single-flights concurrent same-source views", async () => {
  const plugin = makePlugin();
  plugin.resolveNoriaViewPath = () => "views/periodic/shared-test";
  plugin.settings.performance.viewSourceCache = true;
  let sharedReadCount = 0;
  let releaseSharedSource = null;
  const sharedSource = new Promise((resolve) => {
    releaseSharedSource = resolve;
  });
  plugin.loadTextFromVault = async (pathText) => {
    if (String(pathText || "").endsWith("views/periodic/shared-test/view.js")) {
      sharedReadCount += 1;
      return sharedSource;
    }
    return "";
  };
  const nodesA = [];
  const nodesB = [];
  const hostA = {
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodesA);
    }
  };
  const hostB = {
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodesB);
    }
  };

  const first = plugin.runNoriaView("shared-test", {}, hostA);
  const second = plugin.runNoriaView("shared-test", {}, hostB);
  await new Promise((resolve) => setImmediate(resolve));
  const readsStartedBeforeSourceSettled = sharedReadCount;
  releaseSharedSource('ctx.paragraph("shared native view");');
  await Promise.all([first, second]);

  assert.equal(readsStartedBeforeSourceSettled, 1, "concurrent native views should share the pending source read");
  assert.match(JSON.stringify(nodesA), /shared native view/);
  assert.match(JSON.stringify(nodesB), /shared native view/);
});

test("custom runtime view cache follows adapter mtime when the source is not indexed", async () => {
  const plugin = makePlugin();
  plugin.resolveNoriaViewPath = () => "Custom/Noria/demo";
  plugin.settings.performance.viewSourceCache = true;
  plugin.settings.security.allowCustomJsViews = true;
  let version = 1;
  let mtime = 100;
  let readCount = 0;
  plugin.app.vault.getAbstractFileByPath = () => null;
  plugin.app.vault.adapter = {
    async stat() {
      return { type: "file", mtime };
    }
  };
  plugin.loadTextFromVault = async (pathText) => {
    if (!String(pathText || "").endsWith("Custom/Noria/demo/view.js")) return "";
    readCount += 1;
    return `ctx.paragraph("custom-v${version}");`;
  };
  const firstNodes = [];
  const secondNodes = [];
  const hostFor = (nodes) => ({
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodes);
    }
  });

  await plugin.runNoriaView("Custom/Noria/demo", {}, hostFor(firstNodes));
  version = 2;
  mtime = 200;
  await plugin.runNoriaView("Custom/Noria/demo", {}, hostFor(secondNodes));

  assert.equal(readCount, 2, "a changed adapter mtime should invalidate the source cache");
  assert.match(JSON.stringify(firstNodes), /custom-v1/);
  assert.match(JSON.stringify(secondNodes), /custom-v2/);
});

test("custom runtime view without mtime is reread after the previous execution", async () => {
  const plugin = makePlugin();
  plugin.resolveNoriaViewPath = () => "Custom/Noria/no-mtime";
  plugin.settings.performance.viewSourceCache = true;
  plugin.settings.security.allowCustomJsViews = true;
  let version = 1;
  let readCount = 0;
  plugin.app.vault.getAbstractFileByPath = () => null;
  plugin.app.vault.adapter = {};
  plugin.loadTextFromVault = async (pathText) => {
    if (!String(pathText || "").endsWith("Custom/Noria/no-mtime/view.js")) return "";
    readCount += 1;
    return `ctx.paragraph("no-mtime-v${version}");`;
  };
  const hostFor = (nodes) => ({
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodes);
    }
  });
  const firstNodes = [];
  const secondNodes = [];

  await plugin.runNoriaView("Custom/Noria/no-mtime", {}, hostFor(firstNodes));
  version = 2;
  await plugin.runNoriaView("Custom/Noria/no-mtime", {}, hostFor(secondNodes));

  assert.equal(readCount, 2, "unknown-mtime custom sources must not persist across completed executions");
  assert.match(JSON.stringify(firstNodes), /no-mtime-v1/);
  assert.match(JSON.stringify(secondNodes), /no-mtime-v2/);
});

test("runtime source read failures render one error state and can retry", async () => {
  const plugin = makePlugin();
  plugin.resolveNoriaViewPath = () => "Custom/Noria/retry-read";
  plugin.settings.performance.viewSourceCache = true;
  plugin.settings.security.allowCustomJsViews = true;
  plugin.app.vault.getAbstractFileByPath = () => null;
  plugin.app.vault.adapter = { async stat() { return { type: "file", mtime: 100 }; } };
  let readCount = 0;
  plugin.loadTextFromVault = async (pathText) => {
    if (!String(pathText || "").endsWith("Custom/Noria/retry-read/view.js")) return "";
    readCount += 1;
    if (readCount === 1) throw new Error("temporary read failure");
    return 'ctx.paragraph("retry recovered");';
  };
  const firstNodes = [];
  const secondNodes = [];
  const hostFor = (nodes) => ({
    createEl(tag, opts = {}) {
      return makeElement(tag, opts.text, opts, nodes);
    }
  });

  await assert.doesNotReject(() => plugin.runNoriaView("Custom/Noria/retry-read", {}, hostFor(firstNodes)));
  await assert.doesNotReject(() => plugin.runNoriaView("Custom/Noria/retry-read", {}, hostFor(secondNodes)));

  assert.equal(readCount, 2, "a failed source read must not poison the pending or source cache");
  assert.match(JSON.stringify(firstNodes), /Unable to render this Noria block/);
  assert.match(JSON.stringify(firstNodes), /temporary read failure/);
  assert.match(JSON.stringify(secondNodes), /retry recovered/);
});

test("runtime globals stay owned by the newest plugin instance across same-build reload", () => {
  const Plugin = loadPluginClass();
  const runtimeGlobal = Plugin.__testContext;
  const createPlugin = () => {
    const plugin = new Plugin();
    plugin.app = {
      workspace: {
        trigger() {},
        getLeavesOfType() { return []; }
      },
      vault: {
        configDir: ".obsidian",
        getAbstractFileByPath() { return null; }
      }
    };
    plugin.settings = plugin.normalizeSettings({});
    return plugin;
  };
  const first = createPlugin();
  const second = createPlugin();

  first.syncRuntimeBridgeConfig();
  const firstOwner = runtimeGlobal.__noriaRuntimeOwnerToken;
  runtimeGlobal.__noriaHomeRuntimeLoaded = { stale: true };
  second.syncRuntimeBridgeConfig();
  const secondOwner = runtimeGlobal.__noriaRuntimeOwnerToken;
  const secondBridge = runtimeGlobal.__noriaRuntimeBridge;
  const secondView = runtimeGlobal.noriaView;

  assert.notEqual(firstOwner, secondOwner, "each plugin instance should publish a distinct runtime owner");
  assert.equal(runtimeGlobal.__noriaHomeRuntimeLoaded, undefined, "same-build takeover should clear stale module state");
  first.onunload();
  assert.equal(runtimeGlobal.__noriaRuntimeBridge, secondBridge, "old instance unload must preserve the new bridge");
  assert.equal(runtimeGlobal.noriaView, secondView, "old instance unload must preserve the new global view runner");

  second.onunload();
  assert.equal(runtimeGlobal.__noriaRuntimeOwnerToken, undefined);
  assert.equal(runtimeGlobal.__noriaRuntimeBridge, undefined);
  assert.equal(runtimeGlobal.__noriaRuntimeBuildId, undefined);
  assert.equal(runtimeGlobal.__noriaEmbeddedSources, undefined);
  assert.equal(runtimeGlobal.noriaView, undefined);
});

test("tasks calendar startup loads core and ui sources in parallel but executes core first", () => {
  const runtime = fs.readFileSync(pluginPath("views/tasks-calendar/runtime.js"), "utf8");

  assert.match(runtime, /Promise\.all\(\s*\[/);
  assert.match(runtime, /loadText\(RUNTIME_CORE_PATH\)/);
  assert.match(runtime, /loadText\(RUNTIME_UI_COMPONENTS_PATH\)/);
  assert.ok(
    runtime.indexOf("loadText(RUNTIME_CORE_PATH)") < runtime.indexOf("loadText(RUNTIME_UI_COMPONENTS_PATH)"),
    "core source read should be scheduled before ui source read"
  );
  assert.ok(
    runtime.indexOf("const runRuntimeCore") < runtime.indexOf("const runRuntimeUiComponents"),
    "runtime-core should still execute before optional ui components"
  );
});

test("tasks calendar outer view starts css and runtime source loading in parallel", () => {
  const view = fs.readFileSync(pluginPath("views/tasks-calendar/view.js"), "utf8");

  assert.match(view, /async function loadCustomViewSource/);
  assert.match(view, /async function runCustomViewSource/);
  assert.match(view, /const runtimeViewSourcePromise\s*=\s*loadCustomViewSource\(resolvedRuntimeViewPath\)/);
  assert.match(view, /const cssTextPromise\s*=/);
  assert.match(view, /Promise\.all\(\s*\[\s*runtimeViewSourcePromise,\s*cssTextPromise\s*\]\s*\)/);
  assert.match(view, /await runCustomViewSource\(runtimeViewSourceResult,\s*payload\)/);
});
