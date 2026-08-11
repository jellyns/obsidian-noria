const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.resolve(__dirname, "..");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function sourcePath(rel) {
  const normalized = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const runtimePath = path.join(pluginRoot, "src", "runtime", normalized);
  return fs.existsSync(runtimePath) ? runtimePath : path.join(pluginRoot, normalized);
}

function readSource(rel) {
  return fs.readFileSync(sourcePath(rel), "utf8");
}

function loadHabitTaskStatus(app, scheduleRefresh = () => {}) {
  const source = readSource("views/periodic/dashboardHabitWeek.js");
  const start = source.indexOf("const markTaskStatus = async");
  const end = source.indexOf("\n\nconst contentRaw", start);
  assert.ok(start >= 0 && end > start, "expected habit task status helper");
  const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new Function("app", "scheduleRefresh", "escapeRegExp", `${source.slice(start, end)}; return markTaskStatus;`)(
    app,
    scheduleRefresh,
    escapeRegExp
  );
}

function loadHabitFileEnsurer(app, ensureParentFolder = async () => {}) {
  const source = readSource("views/periodic/dashboardHabitWeek.js");
  const start = source.indexOf("const ensureHabitFileWithSeed = async");
  const end = source.indexOf("\nconst insertLineIntoTodayTasks", start);
  assert.ok(start >= 0 && end > start, "expected habit file create helper");
  return new Function("app", "ensureParentFolder", `${source.slice(start, end)}; return ensureHabitFileWithSeed;`)(
    app,
    ensureParentFolder
  );
}

function loadTodayTaskStatus(app) {
  const source = readSource("views/periodic/dashboardTodayTasks.js");
  const start = source.indexOf("const markTaskStatus = async");
  const end = source.indexOf("\n\nconst anchorInRange", start);
  assert.ok(start >= 0 && end > start, "expected Today tasks status helper");
  const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new Function("app", "escapeRegExp", `${source.slice(start, end)}; return markTaskStatus;`)(app, escapeRegExp);
}

function createFakeElement(tagName = "div", opts = {}) {
  const el = {
    tagName,
    children: [],
    textContent: opts.text || "",
    innerHTML: "",
    style: {
      cssText: "",
      setProperty(name, value) {
        this[name] = value;
      },
      removeProperty(name) {
        delete this[name];
      }
    },
    classList: {
      values: new Set(),
      add(...names) {
        names.filter(Boolean).forEach((name) => this.values.add(String(name)));
      },
      remove(...names) {
        names.filter(Boolean).forEach((name) => this.values.delete(String(name)));
      },
      toggle(name, force) {
        if (force === false) {
          this.values.delete(String(name));
          return false;
        }
        this.values.add(String(name));
        return true;
      },
      contains(name) {
        return this.values.has(String(name));
      }
    },
    attrs: {},
    listeners: {},
    addClass(...names) {
      this.classList.add(...names);
      return this;
    },
    removeClass(...names) {
      this.classList.remove(...names);
      return this;
    },
    setAttr(name, value) {
      this.attrs[name] = value;
      this[name] = value;
      return this;
    },
    setAttribute(name, value) {
      return this.setAttr(name, value);
    },
    createDiv(arg = {}) {
      const child = createFakeElement("div", typeof arg === "object" ? arg : {});
      child.parentElement = this;
      if (typeof arg === "string") child.classList.add(arg);
      if (arg && typeof arg === "object") {
        if (arg.cls) child.classList.add(arg.cls);
        if (arg.text) child.textContent = arg.text;
      }
      this.children.push(child);
      return child;
    },
    createEl(tag, arg = {}) {
      const child = createFakeElement(tag, typeof arg === "object" ? arg : {});
      child.parentElement = this;
      if (arg && typeof arg === "object") {
        if (arg.cls) child.classList.add(arg.cls);
        if (arg.text) child.textContent = arg.text;
      }
      this.children.push(child);
      return child;
    },
    appendChild(child) {
      if (child && typeof child === "object") child.parentElement = this;
      this.children.push(child);
      return child;
    },
    append(...children) {
      children.forEach((child) => {
        if (child && typeof child === "object") child.parentElement = this;
      });
      this.children.push(...children);
    },
    empty() {
      this.children = [];
      this.textContent = "";
      this.innerHTML = "";
    },
    setText(text) {
      this.textContent = String(text || "");
    },
    addEventListener(type, handler) {
      const key = String(type || "");
      if (!this.listeners[key]) this.listeners[key] = [];
      if (typeof handler === "function") this.listeners[key].push(handler);
    },
    removeEventListener(type, handler) {
      const key = String(type || "");
      this.listeners[key] = (this.listeners[key] || []).filter((fn) => fn !== handler);
    },
    async dispatchEvent(event) {
      const evt = event && typeof event === "object" ? event : { type: String(event || "") };
      const handlers = this.listeners[String(evt.type || "")] || [];
      for (const handler of handlers) await handler.call(this, evt);
      return true;
    },
    click() {
      return this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
    },
    remove() {},
    querySelector() {
      return null;
    },
    closest() {
      return null;
    }
  };
  return el;
}

function flattenElements(el) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    out.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(el);
  return out;
}

async function flushQueuedTimers(queue, rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    const jobs = queue.splice(0);
    if (!jobs.length) {
      await Promise.resolve();
      continue;
    }
    for (const job of jobs) {
      if (typeof job.fn === "function") job.fn();
    }
    await Promise.resolve();
    await Promise.resolve();
  }
}

async function runRuntimeSource(rel, { input = {}, app = {}, ctx = null, ctxFallback = {}, globals = {} } = {}) {
  const source = readSource(rel);
  const previous = new Map();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, globalThis[key]);
    globalThis[key] = value;
  }
  try {
    const runner = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", source);
    const result = await runner(
      ctx || ctxFallback,
      input,
      app,
      globals.window || globalThis.window || {},
      globals.window || globalThis.window || {},
      globals.document || globalThis.document || {},
      globalThis
    );
    await new Promise((resolve) => setImmediate(resolve));
    return result;
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

function extractBlock(source, marker, nextMarker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} should exist`);
  const end = nextMarker
    ? source.indexOf(nextMarker, start + marker.length)
    : source.indexOf("\n];", start + marker.length);
  assert.notEqual(end, -1, `${marker} block should close`);
  return source.slice(start, end);
}

function extractMainMethod(methodName, nextMethodName) {
  const source = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const marker = `${methodName}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${methodName} should exist`);
  const end = source.indexOf(`\n  ${nextMethodName}(`, start + marker.length);
  assert.notEqual(end, -1, `${methodName} should end before ${nextMethodName}`);
  return source.slice(start, end).trim();
}

test("runtime source lives under src/runtime while embedded keys stay release compatible", () => {
  for (const dir of ["views", "core", "config"]) {
    assert.equal(fs.existsSync(path.join(pluginRoot, dir)), false, `${dir}/ should not remain at plugin root`);
    assert.equal(fs.existsSync(path.join(pluginRoot, "src", "runtime", dir)), true, `src/runtime/${dir}/ should exist`);
  }

  const buildScript = fs.readFileSync(path.join(pluginRoot, "scripts", "build-embedded-runtime.mjs"), "utf8");
  assert.match(buildScript, /src["']?,\s*["']runtime/);
  assert.match(buildScript, /toEmbeddedKey/);
  assert.match(buildScript, /NORIA_RUNTIME_BUILD_ID/);

  const generated = fs.readFileSync(path.join(pluginRoot, "src", "generated", "embedded-runtime-sources.js"), "utf8");
  assert.match(generated, /"views\/tasks-calendar\/runtime-core\.js"/);
  assert.doesNotMatch(generated, /"core\/runtime-host\.js"/);
  assert.match(generated, /"config\/timeline-settings\.md"/);
  assert.match(generated, /NORIA_RUNTIME_BUILD_ID/);

  const main = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  assert.match(main, /NORIA_RUNTIME_BUILD_ID/);
  assert.match(main, /runtimeBuildId/);
});

test("embedded runtime app wrapper preserves prototype vault and adapter APIs", async () => {
  const methodSource = extractMainMethod("createEmbeddedRuntimeApp", "resolveNoriaViewPath");
  const PluginClass = new Function(
    "noriaReadEmbeddedSource",
    "noriaRuntimeSourceFallbackPath",
    `return class TestPlugin {
      ${methodSource}
      async loadTextFromVault(pathText) { return "fallback:" + pathText; }
    };`
  )(
    (pathText) => String(pathText || "").includes("views/embedded.js") ? "embedded-source" : "",
    (pathText) => String(pathText || "").startsWith("views/") ? `src/runtime/${pathText}` : ""
  );
  const plugin = new PluginClass();

  class TestAdapter {
    async read(pathText) {
      return `adapter-read:${pathText}`;
    }
    async exists(pathText) {
      return pathText === "src/runtime/views/missing.js";
    }
    async stat(pathText) {
      return { path: pathText, type: "file" };
    }
    getResourcePath(pathText) {
      return `resource:${pathText}`;
    }
    async readBinary(pathText) {
      return new Uint8Array([1, 2, 3]).buffer;
    }
  }
  class TestVault {
    constructor() {
      this.adapter = new TestAdapter();
    }
    getAbstractFileByPath(pathText) {
      return pathText === "note.md" ? { path: pathText } : null;
    }
    getMarkdownFiles() {
      return [{ path: "01_Projects/demo/task.md" }];
    }
    getFiles() {
      return [{ path: "99_Attachment/avatar.jpg" }];
    }
    getResourcePath(file) {
      return `vault-resource:${file.path}`;
    }
    async readBinary(file) {
      return new Uint8Array([4, 5, 6]).buffer;
    }
    async read(file) {
      return `vault-read:${file.path}`;
    }
    async cachedRead(file) {
      return `cached:${file.path}`;
    }
  }
  class TestApp {
    constructor() {
      this.vault = new TestVault();
    }
  }

  const wrapped = plugin.createEmbeddedRuntimeApp(new TestApp());
  assert.equal(await wrapped.vault.adapter.read("views/embedded.js"), "embedded-source");
  assert.equal(await wrapped.vault.adapter.read("views/missing.js"), "adapter-read:src/runtime/views/missing.js");
  assert.equal(wrapped.vault.adapter.getResourcePath("99_Attachment/avatar.jpg"), "resource:99_Attachment/avatar.jpg");
  assert.equal((await wrapped.vault.adapter.readBinary("99_Attachment/avatar.jpg")).byteLength, 3);
  assert.equal(wrapped.vault.getResourcePath({ path: "99_Attachment/avatar.jpg" }), "vault-resource:99_Attachment/avatar.jpg");
  assert.equal((await wrapped.vault.readBinary({ path: "99_Attachment/avatar.jpg" })).byteLength, 3);
  assert.deepEqual(wrapped.vault.getMarkdownFiles().map((file) => file.path), ["01_Projects/demo/task.md"]);
  assert.deepEqual(wrapped.vault.getFiles().map((file) => file.path), ["99_Attachment/avatar.jpg"]);
  assert.equal(await wrapped.vault.read({ path: "note.md" }), "vault-read:note.md");
  assert.equal(await wrapped.vault.cachedRead({ path: "note.md" }), "cached:note.md");
});

test("home facade invalidates cached child view sources when runtime build id changes", async () => {
  const mount = createFakeElement();
  const head = createFakeElement("head");
  const staleIdentityKey = ".obsidian/plugins/noria/views/dashboard/home/sections/home-identity.js";
  const sourceCache = new Map([
    [staleIdentityKey, "input.mount.createDiv({ text: 'old identity source' });"]
  ]);
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) {
      return "globalThis.__noriaHomeTestBootstrap = 'fresh';";
    }
    if (normalized.endsWith("home-identity.js")) {
      return "input.mount.createDiv({ text: 'new identity source' });";
    }
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "new-build",
        performance: { viewSourceCache: true, homeLazySections: false },
        homeWidgetDefaults: [
          {
            id: "identity",
            type: "builtin",
            enabled: true,
            order: 10,
            size: "wide",
            source: "home-identity",
            props: {}
          }
        ],
        t(key, params = {}) {
          return params.path ? `${key}:${params.path}` : key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      __noriaHomeViewSourceTextCache: sourceCache,
      __noriaHomeViewSourceTextCacheBuildId: "old-build",
      __noriaHomeViewRunCache: new Map(),
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /new identity source/);
  assert.doesNotMatch(text, /old identity source/);
});

test("home facade records widget render and source IO performance baseline", async () => {
  const previousLast = globalThis.__noriaHomePerformanceLast;
  const previousCurrent = globalThis.__noriaHomePerformanceCurrent;
  const mount = createFakeElement();
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) {
      return "input.mount.createDiv({ text: 'bootstrap' });";
    }
    if (normalized.endsWith("custom-view.js")) {
      return "input.mount.createDiv({ text: 'custom view' });";
    }
    return "";
  };
  try {
    delete globalThis.__noriaHomePerformanceLast;
    delete globalThis.__noriaHomePerformanceCurrent;
    await runRuntimeSource("views/dashboard/home/view.js", {
      input: {
        mount,
        noriaBridge: {
          runtimeBuildId: "perf-build",
          allowCustomJsViews: true,
          performance: { viewSourceCache: false, homeLazySections: false },
          homeSettings: {
            widgets: [
              { id: "notes", type: "markdown", enabled: true, order: 10, size: "medium", source: "Dashboard/Note.md" },
              { id: "custom", type: "view", enabled: true, order: 20, size: "medium", source: "Dashboard/custom-view" }
            ]
          },
          t(key, params = {}) {
            return params.path ? `${key}:${params.path}` : key;
          }
        }
      },
      ctxFallback: {
        io: { load: loadSource },
        container: mount,
        paragraph() {}
      },
      app: {
        vault: {
          adapter: {
            async read(pathText) {
              return String(pathText || "").endsWith("Dashboard/Note.md") ? "adapter note" : "";
            }
          }
        }
      },
      globals: {
        window: { moment: {} },
        document: {
          getElementById: () => null,
          createElement: (tag) => createFakeElement(tag),
          head: createFakeElement("head")
        }
      }
    });

    const baseline = globalThis.__noriaHomePerformanceLast;
    assert.equal(baseline?.type, "home-dashboard");
    assert.equal(baseline.buildId, "perf-build");
    assert.equal(baseline.status, "ok");
    assert.ok(baseline.totalMs >= 0);
    assert.ok(baseline.io.ctxLoad > 0);
    assert.ok(baseline.io.adapterRead > 0);
    assert.equal(baseline.sections.some((item) => String(item.id).includes("bootstrap-style")), false);
    assert.deepEqual(baseline.widgets.map((item) => item.id), ["markdown:notes", "view:custom"]);
    assert.equal(globalThis.__noriaHomePerformanceCurrent, undefined);
  } finally {
    if (previousLast === undefined) delete globalThis.__noriaHomePerformanceLast;
    else globalThis.__noriaHomePerformanceLast = previousLast;
    if (previousCurrent === undefined) delete globalThis.__noriaHomePerformanceCurrent;
    else globalThis.__noriaHomePerformanceCurrent = previousCurrent;
  }
});

test("home view widget source loading single-flights concurrent same-source widgets", async () => {
  const keys = [
    "__noriaHomeViewSourceTextCache",
    "__noriaHomeViewSourceTextCacheBuildId",
    "__noriaHomeViewSourceTextPending",
    "__noriaHomeViewSourceTextPendingBuildId",
    "__noriaHomeViewRunCache",
    "__noriaHomeViewRunCacheBuildId"
  ];
  const previous = new Map(keys.map((key) => [key, globalThis[key]]));
  const mount = createFakeElement();
  let sharedReadCount = 0;
  let releaseSharedSource = null;
  const sharedSource = new Promise((resolve) => {
    releaseSharedSource = resolve;
  });
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const lower = normalized.toLowerCase();
    if (normalized.endsWith("bootstrap-style.js")) {
      return "input.mount.createDiv({ text: 'bootstrap' });";
    }
    if (lower.endsWith("dashboard/shared-view.js")) {
      sharedReadCount += 1;
      return sharedSource;
    }
    return "";
  };
  try {
    for (const key of keys) delete globalThis[key];
    const runPromise = runRuntimeSource("views/dashboard/home/view.js", {
      input: {
        mount,
        noriaBridge: {
          runtimeBuildId: "home-view-source-single-flight-build",
          allowCustomJsViews: true,
          performance: { viewSourceCache: true, homeLazySections: false },
          homeSettings: {
            widgets: [
              { id: "shared-a", type: "view", enabled: true, order: 10, size: "medium", source: "Dashboard/shared-view" },
              { id: "shared-b", type: "view", enabled: true, order: 20, size: "medium", source: "Dashboard/shared-view" }
            ]
          },
          t(key, params = {}) {
            return params.path ? `${key}:${params.path}` : key;
          }
        }
      },
      ctxFallback: {
        io: { load: loadSource },
        container: mount,
        paragraph() {}
      },
      app: {
        vault: {
          adapter: { read: loadSource }
        }
      },
      globals: {
        window: { moment: {} },
        document: {
          getElementById: () => null,
          createElement: (tag) => createFakeElement(tag),
          head: createFakeElement("head")
        }
      }
    });
    await new Promise((resolve) => setImmediate(resolve));
    const readsStartedBeforeSourceSettled = sharedReadCount;
    releaseSharedSource("input.mount.createDiv({ text: 'shared custom view' });");
    await runPromise;
    assert.equal(readsStartedBeforeSourceSettled, 1, "concurrent same-source view widgets should share the pending source read");
    const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
    assert.equal((text.match(/shared custom view/g) || []).length, 2);
    assert.ok(globalThis.__noriaHomeViewSourceTextCache instanceof Map);
  } finally {
    for (const key of keys) {
      if (previous.get(key) === undefined) delete globalThis[key];
      else globalThis[key] = previous.get(key);
    }
  }
});

test("home core boot reads missing core files in parallel while preserving eval order", async () => {
  const keys = [
    "__noria_home_core_boot_v1",
    "__noriaHomeCoreBootBuildId",
    "__noriaHomeViewSourceTextCache",
    "__noriaHomeViewSourceTextCacheBuildId",
    "__noriaHomeViewSourceTextPending",
    "__noriaHomeViewSourceTextPendingBuildId",
    "dashboardCore",
    "__noriaManagerUiKit"
  ];
  const previous = new Map(keys.map((key) => [key, globalThis[key]]));
  const previousOrder = globalThis.__noriaTestCoreBootOrder;
  const mount = createFakeElement();
  const started = [];
  let releaseTheme = null;
  let releaseLucide = null;
  const themeSource = new Promise((resolve) => {
    releaseTheme = resolve;
  });
  const lucideSource = new Promise((resolve) => {
    releaseLucide = resolve;
  });
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("dashboard-theme.js")) {
      started.push("theme");
      return themeSource;
    }
    if (normalized.endsWith("dashboard-lucide-inline.js")) {
      started.push("lucide");
      return lucideSource;
    }
    if (normalized.endsWith("bootstrap-style.js")) {
      return "input.mount.createDiv({ text: 'bootstrap' });";
    }
    if (normalized === "Dashboard/Note.md") return "note";
    return "";
  };

  try {
    for (const key of keys) delete globalThis[key];
    globalThis.__noriaTestCoreBootOrder = [];
    const runPromise = runRuntimeSource("views/dashboard/home/view.js", {
      input: {
        mount,
        noriaBridge: {
          runtimeBuildId: "home-core-boot-parallel-build",
          performance: { viewSourceCache: false, homeLazySections: false },
          homeSettings: {
            widgets: [
              { id: "note", type: "markdown", enabled: true, order: 10, size: "medium", source: "Dashboard/Note.md" }
            ]
          },
          t(key, params = {}) {
            return params.path ? `${key}:${params.path}` : key;
          }
        }
      },
      ctxFallback: {
        io: { load: loadSource },
        container: mount,
        paragraph() {}
      },
      app: {
        vault: {
          adapter: { read: loadSource }
        }
      },
      globals: {
        window: { moment: {} },
        document: {
          getElementById: () => null,
          createElement: (tag) => createFakeElement(tag),
          head: createFakeElement("head")
        }
      }
    });
    await new Promise((resolve) => setImmediate(resolve));
    const startedBeforeAnySourceSettled = started.slice();
    releaseTheme("globalThis.__noriaTestCoreBootOrder.push('theme');");
    await new Promise((resolve) => setImmediate(resolve));
    if (typeof releaseLucide === "function") {
      releaseLucide("globalThis.__noriaTestCoreBootOrder.push('lucide');");
    }
    await runPromise;

    assert.deepEqual(
      startedBeforeAnySourceSettled,
      ["theme", "lucide"],
      "core boot should start missing core source reads before waiting for the first source"
    );
    assert.deepEqual(globalThis.__noriaTestCoreBootOrder, ["theme", "lucide"]);
  } finally {
    try { if (typeof releaseTheme === "function") releaseTheme(""); } catch (_) {}
    try { if (typeof releaseLucide === "function") releaseLucide(""); } catch (_) {}
    if (previousOrder === undefined) delete globalThis.__noriaTestCoreBootOrder;
    else globalThis.__noriaTestCoreBootOrder = previousOrder;
    for (const key of keys) {
      if (previous.get(key) === undefined) delete globalThis[key];
      else globalThis[key] = previous.get(key);
    }
  }
});

test("periodic stats core boot reads missing core files in parallel and scopes caches by build", async () => {
  const keys = [
    "__noria_periodic_stats_core_boot_v1",
    "__noria_periodic_stats_core_boot_build_v1",
    "__noria_periodic_stats_view_run_cache_v1",
    "__noria_periodic_stats_view_run_cache_build_v1",
    "dashboardCore",
    "__noriaTestPeriodicStatsCoreBootOrder"
  ];
  const previous = new Map(keys.map((key) => [key, globalThis[key]]));
  const mount = createFakeElement();
  const started = [];
  let releaseTheme = null;
  let releaseDateRange = null;
  const themeSource = new Promise((resolve) => {
    releaseTheme = resolve;
  });
  const dateRangeSource = new Promise((resolve) => {
    releaseDateRange = resolve;
  });
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("dashboard-theme.js")) {
      started.push("theme");
      return themeSource;
    }
    if (normalized.endsWith("date-range.js")) {
      started.push("date-range");
      return dateRangeSource;
    }
    if (normalized.endsWith("periodic-stats/impl-legacy/view.js")) {
      return "input.mount.createDiv({ text: 'legacy stats rendered' });";
    }
    return "";
  };

  try {
    for (const key of keys) delete globalThis[key];
    globalThis.__noriaTestPeriodicStatsCoreBootOrder = [];
    const runPromise = runRuntimeSource("views/dashboard/periodic-stats/view.js", {
      input: {
        mount,
        noriaBridge: {
          runtimeBuildId: "periodic-stats-core-parallel-build",
          t(key, params = {}) {
            return params.message ? `${key}:${params.message}` : key;
          }
        }
      },
      ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
      app: {
        vault: {
          adapter: { read: loadSource }
        }
      },
      globals: {
        window: { moment: {} },
        document: {
          getElementById: () => null,
          createElement: (tag) => createFakeElement(tag),
          head: createFakeElement("head")
        }
      }
    });
    await new Promise((resolve) => setImmediate(resolve));
    const startedBeforeAnySourceSettled = started.slice();
    releaseTheme("globalThis.__noriaTestPeriodicStatsCoreBootOrder.push('theme');");
    await new Promise((resolve) => setImmediate(resolve));
    if (typeof releaseDateRange === "function") {
      releaseDateRange("globalThis.__noriaTestPeriodicStatsCoreBootOrder.push('date-range');");
    }
    await runPromise;

    assert.deepEqual(
      startedBeforeAnySourceSettled,
      ["theme", "date-range"],
      "periodic stats core boot should start missing core source reads before waiting for the first source"
    );
    assert.deepEqual(globalThis.__noriaTestPeriodicStatsCoreBootOrder, ["theme", "date-range"]);
    assert.equal(globalThis.__noria_periodic_stats_core_boot_build_v1, "periodic-stats-core-parallel-build");
    assert.equal(globalThis.__noria_periodic_stats_view_run_cache_build_v1, "periodic-stats-core-parallel-build");
    const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
    assert.match(text, /legacy stats rendered/);
  } finally {
    try { if (typeof releaseTheme === "function") releaseTheme(""); } catch (_) {}
    try { if (typeof releaseDateRange === "function") releaseDateRange(""); } catch (_) {}
    for (const key of keys) {
      if (previous.get(key) === undefined) delete globalThis[key];
      else globalThis[key] = previous.get(key);
    }
  }
});

test("periodic stats fallback scripts compile in the runtime AsyncFunction boundary", async () => {
  const cases = [
    {
      path: "views/dashboard/periodic-stats/impl-legacy/fallbacks/charts.js",
      factory: "dashboardPeriodicStatsFallbackChartsFactory"
    },
    {
      path: "views/dashboard/periodic-stats/impl-legacy/fallbacks/boards.js",
      factory: "dashboardPeriodicStatsFallbackBoardsFactory"
    }
  ];

  for (const entry of cases) {
    const runtimeGlobal = {};
    const run = new AsyncFunction(
      "ctx",
      "input",
      "app",
      "moment",
      "window",
      "document",
      "globalThis",
      readSource(entry.path)
    );
    await run({}, {}, {}, {}, {}, {}, runtimeGlobal);
    assert.equal(typeof runtimeGlobal[entry.factory], "function", `${entry.path} should register its fallback factory`);
  }
});

test("periodic stats consumes the normalized notes trend series from data service", async () => {
  const source = readSource("views/dashboard/periodic-stats/impl-legacy/view.js");
  const start = source.indexOf("async function collectMetrics(dates)");
  const end = source.indexOf("\nfunction buildDailySeries", start);
  assert.ok(start >= 0 && end > start, "expected periodic stats metrics collector");

  const runtimeGlobal = {
    dashboardCore: {
      data: {
        dataService: {
          createDataService() {
            return {
              async getSnapshot() {
                return {
                  domains: {
                    notes: {
                      trend: {
                        series: [
                          { key: "2026-08-01", notes: 2, words: 310 },
                          { key: "2026-08-02", notes: 1, words: 180 }
                        ]
                      }
                    },
                    tasks: {
                      completion: {
                        series: [
                          { key: "2026-08-01", planned: 3, done: 2 },
                          { key: "2026-08-02", planned: 1, done: 1 }
                        ]
                      }
                    },
                    dailyState: {
                      series: [
                        { key: "2026-08-01", energy: 4, focus: 3, weather: "晴", mood: "稳定" },
                        { key: "2026-08-02", energy: 5, focus: 4, weather: "多云", mood: "很好" }
                      ]
                    }
                  }
                };
              }
            };
          }
        }
      }
    }
  };
  const loadCollector = new AsyncFunction(
    "globalThis",
    "bridge",
    "ctx",
    "app",
    "window",
    "resolvedScope",
    `${source.slice(start, end)}; return collectMetrics;`
  );
  const collectMetrics = await loadCollector(runtimeGlobal, {}, {}, {}, { moment: {} }, "monthly");
  const metrics = await collectMetrics(["2026-08-01", "2026-08-02"]);

  assert.deepEqual(metrics["2026-08-01"], {
    notes: 2,
    words: 310,
    taskTotal: 3,
    taskDone: 2,
    weather: "晴",
    mood: "稳定",
    energy: 4,
    focus: "3"
  });
  assert.deepEqual(metrics["2026-08-02"], {
    notes: 1,
    words: 180,
    taskTotal: 1,
    taskDone: 1,
    weather: "多云",
    mood: "很好",
    energy: 5,
    focus: "4"
  });
});

test("periodic stats core boot skips retired unused metrics adapters", () => {
  const source = readSource("views/dashboard/periodic-stats/view.js");
  const coreStart = source.indexOf("const coreFiles = [");
  const coreEnd = source.indexOf("];", coreStart);
  assert.ok(coreStart >= 0 && coreEnd > coreStart, "periodic stats coreFiles should be declared");
  const coreBlock = source.slice(coreStart, coreEnd);

  assert.match(coreBlock, /core\/data\/data-service\.js/);
  assert.match(coreBlock, /core\/utils\/habit-parsing\.js/);
  assert.doesNotMatch(coreBlock, /core\/data\/diary-metrics-adapter\.js/);
  assert.doesNotMatch(coreBlock, /core\/data\/habit-registry-adapter\.js/);
});

test("legacy GDD recap compatibility loader single-flights daily recap source by build", async () => {
  const key = "__noria_gdd_recap_compat_v1";
  const previous = globalThis[key];
  const mountA = createFakeElement();
  const mountB = createFakeElement();
  let dailyRecapReadCount = 0;
  let releaseDailyRecapSource = null;
  const dailyRecapSource = new Promise((resolve) => {
    releaseDailyRecapSource = resolve;
  });
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("views/periodic/dashboardDailyRecap.js")) {
      dailyRecapReadCount += 1;
      return dailyRecapSource;
    }
    return "";
  };
  const makeRun = (mount) => runRuntimeSource("views/periodic/dashboardGddRecap.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "gdd-recap-compat-build",
        t(keyText, params = {}) {
          return params.path ? `${keyText}:${params.path}` : keyText;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  try {
    delete globalThis[key];
    const runA = makeRun(mountA);
    const runB = makeRun(mountB);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      dailyRecapReadCount,
      1,
      "concurrent legacy GDD recap instances should share the pending DailyRecap source read"
    );
    releaseDailyRecapSource("input.mount.createDiv({ text: 'daily recap compat rendered' });");
    await Promise.all([runA, runB]);

    const textA = flattenElements(mountA).map((el) => el.textContent).filter(Boolean).join(" ");
    const textB = flattenElements(mountB).map((el) => el.textContent).filter(Boolean).join(" ");
    assert.match(textA, /daily recap compat rendered/);
    assert.match(textB, /daily recap compat rendered/);
    assert.equal(globalThis[key]?.runtimeBuildId, "gdd-recap-compat-build");
    assert.equal(globalThis[key]?.status, "ready");
    assert.equal(typeof globalThis[key]?.runner, "function");
  } finally {
    try { if (typeof releaseDailyRecapSource === "function") releaseDailyRecapSource(""); } catch (_) {}
    if (previous === undefined) delete globalThis[key];
    else globalThis[key] = previous;
  }
});

test("home view widgets isolate unsafe executable sources without loading them", async () => {
  const previousLast = globalThis.__noriaHomeViewExecutionLast;
  const mount = createFakeElement();
  const requested = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    requested.push(normalized);
    if (normalized.endsWith("bootstrap-style.js")) {
      return "input.mount.createDiv({ text: 'bootstrap' });";
    }
    if (normalized.includes("Dashboard/evil")) {
      return "input.mount.createDiv({ text: 'unsafe executed' });";
    }
    return "";
  };

  try {
    delete globalThis.__noriaHomeViewExecutionLast;
    await runRuntimeSource("views/dashboard/home/view.js", {
      input: {
        mount,
        noriaBridge: {
          runtimeBuildId: "view-policy-build",
          performance: { viewSourceCache: false, homeLazySections: false },
          homeSettings: {
            widgets: [
              { id: "unsafe", type: "view", enabled: true, order: 10, size: "medium", source: "../Dashboard/evil" }
            ]
          },
          t(key, params = {}) {
            return params.message ? `${key}:${params.message}` : key;
          }
        }
      },
      ctxFallback: {
        io: { load: loadSource },
        container: mount,
        paragraph() {}
      },
      app: {
        vault: {
          adapter: { read: loadSource }
        }
      },
      globals: {
        window: { moment: {} },
        document: {
          getElementById: () => null,
          createElement: (tag) => createFakeElement(tag),
          head: createFakeElement("head")
        }
      }
    });

    const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
    assert.doesNotMatch(text, /unsafe executed/);
    assert.match(text, /runtime\.home\.facade\.widgetFailed/);
    assert.equal(requested.some((item) => item.includes("Dashboard/evil")), false);
    assert.equal(globalThis.__noriaHomeViewExecutionLast?.allowed, false);
    assert.equal(globalThis.__noriaHomeViewExecutionLast?.reason, "path-traversal");
  } finally {
    if (previousLast === undefined) delete globalThis.__noriaHomeViewExecutionLast;
    else globalThis.__noriaHomeViewExecutionLast = previousLast;
  }
});

test("home markdown widget uses MarkdownRenderer and unloads prior child components on rerender", async () => {
  const mount = createFakeElement();
  const renders = [];
  const loads = [];
  const unloads = [];
  let nextComponentId = 0;
  class TestComponent {
    constructor() {
      this.id = ++nextComponentId;
    }
    load() {
      loads.push(this.id);
      this.loaded = true;
    }
    unload() {
      unloads.push(this.id);
    }
  }
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Note.md") return "## Render me\n\n[[Linked note]]";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath, component) {
      renders.push({ markdown, sourcePath, componentId: component?.id, loaded: component?.loaded === true });
      el.createDiv({ text: `rendered:${sourcePath}` });
    }
  };
  const runtimeInput = {
    mount,
    noriaBridge: {
      runtimeBuildId: "markdown-renderer-build",
      performance: { viewSourceCache: false, homeLazySections: false },
      homeSettings: {
        widgets: [
          { id: "notes", type: "markdown", enabled: true, order: 10, size: "medium", source: "Dashboard/Note.md" }
        ]
      },
      t(key, params = {}) {
        return params.path ? `${key}:${params.path}` : key;
      }
    }
  };
  const runtimeEnv = {
    input: runtimeInput,
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer, Component: TestComponent },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", runtimeEnv);
  assert.equal(renders.length, 1);
  assert.equal(renders[0].markdown, "## Render me\n\n[[Linked note]]");
  assert.equal(renders[0].sourcePath, "Dashboard/Note.md");
  assert.equal(renders[0].loaded, true);
  assert.deepEqual(loads, [1]);
  assert.deepEqual(unloads, []);
  const markdownBodies = flattenElements(mount).filter((el) => el.classList?.contains?.("dashboard-home-markdown-widget"));
  assert.ok(markdownBodies.some((el) => el.classList.contains("markdown-preview-view")));
  const renderedText = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(renderedText, /rendered:Dashboard\/Note\.md/);

  await runRuntimeSource("views/dashboard/home/view.js", runtimeEnv);
  assert.equal(renders.length, 2);
  assert.deepEqual(unloads, [1]);
  assert.deepEqual(loads, [1, 2]);
});

test("home daily-section markdown card resolves the managed diary and renders only the requested h2 body", async () => {
  const mount = createFakeElement();
  const reads = [];
  const renders = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    reads.push(normalized);
    if (normalized === "06_Diary/2026/2026-08-10.md") {
      return "## 待办\n\n- [ ] 不应显示\n\n## 建议\n\n- 合并两项重复工作。\n- 先确认当前发布边界。\n\n## 复盘\n\n不应显示";
    }
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "daily-section-ready-build",
        today: "2026-08-10",
        paths: { diaryRoot: "06_Diary" },
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "daily-advice",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              title: "建议",
              source: "",
              props: { sourceMode: "daily-section", heading: "建议", renderMode: "compact" }
            }
          ]
        },
        t(key) { return key; }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: { vault: { adapter: { read: loadSource } } },
    globals: {
      obsidian: {
        MarkdownRenderer: {
          async render(_app, markdown, el, sourcePath) {
            renders.push({ markdown, sourcePath });
            el.createDiv({ text: markdown });
          }
        }
      },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.deepEqual(reads.filter((pathText) => pathText.startsWith("06_Diary/")), ["06_Diary/2026/2026-08-10.md"]);
  assert.deepEqual(renders, [{
    markdown: "- 合并两项重复工作。\n- 先确认当前发布边界。",
    sourcePath: "06_Diary/2026/2026-08-10.md"
  }]);
  const shell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "daily-advice");
  assert.ok(shell);
  assert.notEqual(shell.hidden, true);
  assert.equal(shell.attrs["data-noria-widget-state"], "ready");
});

test("home daily-section card removes its normal shell when the requested section is absent", async () => {
  const mount = createFakeElement();
  let renderCount = 0;
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "06_Diary/2026/2026-08-10.md") return "## 待办\n\n- [ ] 今日任务\n\n## 复盘\n\n内容";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "daily-section-empty-build",
        today: "2026-08-10",
        paths: { diaryRoot: "06_Diary" },
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [{
            id: "daily-advice",
            type: "markdown",
            enabled: true,
            order: 10,
            size: "full",
            title: "建议",
            source: "",
            props: { sourceMode: "daily-section", heading: "建议", renderMode: "compact" }
          }]
        },
        t(key) { return key; }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: { vault: { adapter: { read: loadSource } } },
    globals: {
      obsidian: { MarkdownRenderer: { async render() { renderCount += 1; } } },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const shell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "daily-advice");
  assert.ok(shell);
  assert.equal(shell.hidden, true);
  assert.equal(shell.attrs["aria-hidden"], "true");
  assert.equal(shell.attrs["data-noria-widget-state"], "empty");
  assert.equal(renderCount, 0);
});

test("home edit mode keeps the disabled daily-section card visible as a configuration placeholder", async () => {
  const mount = createFakeElement();
  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "daily-section-edit-build",
        homeEditMode: true,
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [{
            id: "daily-advice",
            type: "markdown",
            enabled: false,
            order: 10,
            size: "full",
            title: "建议",
            source: "",
            props: { sourceMode: "daily-section", heading: "建议", renderMode: "compact" }
          }]
        },
        runtime: {
          editHomeWidget() { return { ok: true }; },
          openHomeWidgetSettings() { return { ok: true }; }
        },
        t(key) { return key; }
      }
    },
    ctxFallback: { io: { load: async () => "" }, container: mount, paragraph() {} },
    app: { vault: { adapter: { read: async () => "" } } },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const shell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "daily-advice");
  assert.ok(shell);
  assert.notEqual(shell.hidden, true);
  assert.equal(shell.attrs["data-noria-widget-enabled"], "false");
  assert.ok(flattenElements(shell).some((el) => el.attrs?.["data-noria-widget-edit-action"] === "show"));
});

test("home markdown widget renders multiple source notes as a briefing group", async () => {
  const mount = createFakeElement();
  const renders = [];
  const opened = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") return "## Daily brief\n\n- item";
    if (normalized === "Dashboard/Project.md") return "## Project monitor\n\n- risk";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      renders.push({ markdown, sourcePath });
      el.createDiv({ text: `rendered:${sourcePath}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              title: "Briefing",
              props: {
                sources: [
                  { label: "Daily", path: "Dashboard/Daily.md" },
                  { label: "Project", source: "Dashboard/Project.md", description: "External project monitor" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.count) return `${key}:${params.count}`;
          return params.path ? `${key}:${params.path}` : key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      workspace: {
        openLinkText(pathText) {
          opened.push(pathText);
        }
      },
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const groups = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing"));
  const overviews = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-overview"));
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.equal(groups.length, 1);
  assert.equal(overviews.length, 1);
  assert.equal(items.length, 2);
  assert.equal(groups[0].attrs["data-noria-markdown-open-default"], "manual");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-state"], "ready");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-total"], "2");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-ready"], "2");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-failed"], "0");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-actions"], "2");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-state"], "ready");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-total"], "2");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-ready"], "2");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-actions"], "2");
  const overviewFacts = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-overview-fact"));
  assert.deepEqual(overviewFacts.map((el) => el.attrs["data-noria-markdown-briefing-fact"]), []);
  assert.deepEqual(items.map((item) => item.open === true), [false, false]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-index"]), ["0", "1"]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-path"]), ["Dashboard/Daily.md", "Dashboard/Project.md"]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-label"]), ["Daily", "Project"]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-open"]), ["false", "false"]);
  assert.match(items[0].attrs["data-noria-markdown-source-id"], /^daily-/);
  assert.match(items[1].attrs["data-noria-markdown-source-id"], /^project-/);
  assert.deepEqual(renders.map((item) => item.sourcePath), ["Dashboard/Daily.md", "Dashboard/Project.md"]);
  assert.match(all.map((el) => el.textContent).filter(Boolean).join(" "), /Daily/);
  assert.match(all.map((el) => el.textContent).filter(Boolean).join(" "), /External project monitor/);

  const openButtons = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-open"));
  assert.equal(openButtons.length, 2);
  assert.deepEqual(openButtons.map((button) => button.attrs["data-noria-markdown-source-action"]), ["open", "open"]);
  assert.deepEqual(openButtons.map((button) => button.attrs["data-noria-markdown-source-path"]), ["Dashboard/Daily.md", "Dashboard/Project.md"]);
  assert.deepEqual(openButtons.map((button) => button.attrs["data-noria-action-kind"]), ["file", "file"]);
  assert.deepEqual(openButtons.map((button) => button.attrs["data-noria-action-target"]), ["Dashboard/Daily.md", "Dashboard/Project.md"]);
  assert.deepEqual(openButtons.map((button) => button.attrs["data-noria-action-source"]), ["home-markdown-briefing", "home-markdown-briefing"]);
  assert.deepEqual(openButtons.map((button) => button.attrs["data-noria-action-state"]), ["idle", "idle"]);
  const priorityCues = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-priority"));
  assert.equal(priorityCues.length, 0, "action lanes should replace the duplicate overview priority cue");
  const candidates = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-candidate"));
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].attrs["data-noria-action-kind"], "open-markdown-action-source");
  assert.equal(candidates[0].attrs["data-noria-action-target-path"], "Dashboard/Daily.md");
  assert.equal(candidates[0].attrs["data-noria-action-target-line"], "3");
  await candidates[0].click();
  assert.equal(candidates[0].attrs["data-noria-action-state"], "ok");
  await openButtons[1].click();
  assert.equal(openButtons[1].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(opened, ["Dashboard/Daily", "Dashboard/Project"]);
});

test("home markdown briefing starts source reads in parallel while preserving source order", async () => {
  const mount = createFakeElement();
  const started = [];
  let releaseDaily = null;
  let releaseProject = null;
  const dailySource = new Promise((resolve) => {
    releaseDaily = resolve;
  });
  const projectSource = new Promise((resolve) => {
    releaseProject = resolve;
  });
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") {
      started.push("daily");
      return dailySource;
    }
    if (normalized === "Dashboard/Project.md") {
      started.push("project");
      return projectSource;
    }
    return "";
  };

  const runPromise = runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-parallel-source-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              title: "Briefing",
              props: {
                sources: [
                  { label: "Daily", path: "Dashboard/Daily.md" },
                  { label: "Project", path: "Dashboard/Project.md" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.message) return `${key}:${params.message}`;
          return params.path ? `${key}:${params.path}` : key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  const startedBeforeAnySourceSettled = started.slice();
  releaseDaily("## Daily\n\n- daily action");
  await new Promise((resolve) => setImmediate(resolve));
  if (typeof releaseProject === "function") releaseProject("## Project\n\n- project action");
  await runPromise;

  assert.deepEqual(
    startedBeforeAnySourceSettled,
    ["daily", "project"],
    "briefing should start all source reads before waiting for the first source"
  );
  const items = flattenElements(mount).filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-path"]), [
    "Dashboard/Daily.md",
    "Dashboard/Project.md"
  ]);
});

test("home markdown briefing source handoff reports open failures on the same source control", async () => {
  const mount = createFakeElement();
  const notices = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") return "## Daily brief\n\nContext only";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-open-failure-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              title: "Briefing",
              props: {
                sources: [
                  { label: "Daily", path: "Dashboard/Daily.md" }
                ]
              }
            }
          ]
        },
        runtime: {
          notice(key, params = {}) {
            notices.push({ key, params });
          }
        },
        t(key, params = {}) {
          return params.count ? `${key}:${params.count}` : key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      workspace: {
        openLinkText() {
          throw new Error("source open unavailable");
        }
      },
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const openButton = all.find((el) => el.classList?.contains?.("dashboard-home-markdown-source-open"));
  const priorityCue = all.find((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-priority"));
  assert.ok(openButton, "source row should expose an open source control");
  assert.ok(priorityCue, "overview should expose the same source as a priority cue");
  assert.equal(openButton.attrs["data-noria-action-state"], "idle");
  assert.equal(priorityCue.attrs["data-noria-action-state"], "idle");

  await openButton.click();
  assert.equal(openButton.attrs["data-noria-action-state"], "failed");
  assert.match(openButton.attrs["data-noria-action-error"], /source open unavailable/);

  await priorityCue.click();
  assert.equal(priorityCue.attrs["data-noria-action-state"], "failed");
  assert.match(priorityCue.attrs["data-noria-action-error"], /source open unavailable/);

  assert.deepEqual(notices, [
    {
      key: "runtime.home.action.failed",
      params: { label: "Daily", message: "source open unavailable" }
    },
    {
      key: "runtime.home.action.failed",
      params: { label: "Daily", message: "source open unavailable" }
    }
  ]);
});

test("home markdown briefing action candidate opens the first action line when available", async () => {
  const mount = createFakeElement();
  const opened = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") return "## Daily brief\n\n- [ ] Review external recommendation\n- keep context";
    return "";
  };
  const leaf = {
    view: {
      setEphemeralState(state) {
        opened.push({ state });
      },
      editor: {
        setCursor(cursor) {
          opened.push({ cursor });
        },
        scrollIntoView(range) {
          opened.push({ range });
        }
      }
    },
    async openFile(file, options) {
      opened.push({ file: file.path, options });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-priority-line-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              title: "Briefing",
              props: {
                sources: [
                  { label: "Daily", path: "Dashboard/Daily.md", role: "daily" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.label || params.reason) return `${key}:${params.label || ""}:${params.reason || ""}`;
          return params.count ? `${key}:${params.count}` : key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      workspace: {
        getLeaf() {
          return leaf;
        },
        revealLeaf() {
          opened.push({ reveal: true });
        }
      },
      vault: {
        getAbstractFileByPath(pathText) {
          return { path: pathText };
        },
        adapter: { read: loadSource }
      }
    },
    globals: {
      obsidian: {
        MarkdownRenderer: {
          async render(_app, markdown, el, sourcePath) {
            el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
          }
        }
      },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const priorityCues = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-priority"));
  assert.equal(priorityCues.length, 0, "action candidate should replace the duplicate priority cue");
  const candidates = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-candidate"));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].attrs["data-noria-markdown-briefing-action-priority-reason"], "action");
  assert.equal(candidates[0].attrs["data-noria-action-kind"], "open-markdown-action-source");
  assert.equal(candidates[0].attrs["data-noria-action-target-path"], "Dashboard/Daily.md");
  assert.equal(candidates[0].attrs["data-noria-action-target-line"], "3");

  await candidates[0].click();
  assert.equal(candidates[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(opened[0], { file: "Dashboard/Daily.md", options: { active: true } });
  assert.deepEqual(opened[1], { reveal: true });
  assert.deepEqual(opened[2], { state: { line: 2 } });
  assert.deepEqual(opened[3], { cursor: { line: 2, ch: 0 } });
});

test("home markdown briefing only expands sources with explicit open flags", async () => {
  const mount = createFakeElement();
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") return "## Daily";
    if (normalized === "Dashboard/Project.md") return "## Project";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-open-flags-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                openFirst: "true",
                sources: [
                  { label: "Daily", path: "Dashboard/Daily.md" },
                  { label: "Project", path: "Dashboard/Project.md", open: "true" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          return params.message ? `${key}:${params.message}` : key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: { adapter: { read: loadSource } }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const groups = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing"));
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.equal(groups[0].attrs["data-noria-markdown-open-default"], "first");
  assert.deepEqual(items.map((item) => item.open === true), [true, true]);
});

test("home markdown briefing sources expose ready empty and failed states in summaries", async () => {
  const mount = createFakeElement();
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Ready.md") return "## Ready\n\n- signal";
    if (normalized === "Dashboard/Empty.md") return "   \n";
    if (normalized === "Dashboard/Missing.md") throw new Error("file missing");
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-states-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "Ready", path: "Dashboard/Ready.md" },
                  { label: "Empty", path: "Dashboard/Empty.md" },
                  { label: "Missing", path: "Dashboard/Missing.md" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          return params.message ? `${key}:${params.message}` : key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: { adapter: { read: loadSource } }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const groups = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing"));
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-state"]), ["ready", "empty", "failed"]);
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-state"], "failed");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-ready"], "1");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-empty"], "1");
  assert.equal(groups[0].attrs["data-noria-markdown-briefing-failed"], "1");

  const overviewFacts = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-overview-fact"));
  assert.deepEqual(overviewFacts.map((el) => el.attrs["data-noria-markdown-briefing-fact"]), ["sources", "ready", "failed"]);

  const stateChips = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-state"));
  assert.deepEqual(stateChips.map((chip) => chip.attrs["data-noria-markdown-source-state"]), ["ready", "empty", "failed"]);
  assert.deepEqual(stateChips.map((chip) => chip.textContent), [
    "runtime.home.markdown.sourceReady",
    "runtime.home.markdown.sourceEmpty",
    "runtime.home.markdown.loadFailed:file missing"
  ]);
});

test("home markdown briefing source summaries expose freshness and size facts", async () => {
  const mount = createFakeElement();
  const freshMtime = new Date(2026, 5, 12, 6, 30).getTime();
  const emptyMtime = new Date(2026, 5, 10, 2, 5).getTime();
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Fresh.md") return "## Fresh\n\n- alpha beta";
    if (normalized === "Dashboard/Empty.md") return "   \n";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-facts-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "Fresh", path: "Dashboard/Fresh.md" },
                  { label: "Empty", path: "Dashboard/Empty.md" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.date) return `${key}:${params.date}`;
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          if (pathText === "Dashboard/Fresh.md") return { stat: { mtime: freshMtime } };
          if (pathText === "Dashboard/Empty.md") return { stat: { mtime: emptyMtime } };
          return null;
        },
        adapter: { read: loadSource }
      }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-mtime"]), [
    String(freshMtime),
    String(emptyMtime)
  ]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-words"]), ["3", "0"]);

  const factRows = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-facts"));
  assert.equal(factRows.length, 2);
  const updated = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-updated"));
  const sizes = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-size"));
  assert.deepEqual(updated.map((el) => el.textContent), [
    "runtime.home.markdown.sourceUpdated:06-12 06:30",
    "runtime.home.markdown.sourceUpdated:06-10 02:05"
  ]);
  assert.deepEqual(sizes.map((el) => el.textContent), [
    "runtime.home.markdown.sourceWords:3",
    "runtime.home.markdown.sourceWords:0"
  ]);
});

test("home markdown briefing source summaries expose source roles and staleness", async () => {
  const mount = createFakeElement();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const dailyMtime = Date.now() - 6 * hour;
  const weeklyMtime = Date.now() - 14 * day;
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") return "## Daily\n\n- one thing";
    if (normalized === "Dashboard/Weekly.md") return "## Weekly\n\n- stale thing";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-role-freshness-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "每日简报", path: "Dashboard/Daily.md", role: "daily" },
                  { label: "周回顾", path: "Dashboard/Weekly.md", role: "weekly", maxAgeHours: 24 }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.date) return `${key}:${params.date}`;
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          if (pathText === "Dashboard/Daily.md") return { stat: { mtime: dailyMtime } };
          if (pathText === "Dashboard/Weekly.md") return { stat: { mtime: weeklyMtime } };
          return null;
        },
        adapter: { read: loadSource }
      }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-role"]), ["daily", "weekly"]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-fresh-hours"]), ["36", "24"]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-freshness"]), ["fresh", "stale"]);

  const roles = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-role"));
  assert.deepEqual(roles.map((el) => el.textContent), [
    "runtime.home.markdown.roleDaily",
    "runtime.home.markdown.roleWeekly"
  ]);

  const freshness = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-freshness"));
  assert.deepEqual(freshness.map((el) => el.attrs["data-noria-markdown-source-freshness"]), ["fresh", "stale"]);
  assert.deepEqual(freshness.map((el) => el.textContent), [
    "runtime.home.markdown.sourceFresh",
    "runtime.home.markdown.sourceStale"
  ]);
});

test("home markdown briefing source summaries expose local markdown excerpts", async () => {
  const mount = createFakeElement();
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") {
      return [
        "---",
        "tags: [brief]",
        "---",
        "# 每日简报",
        "",
        "- 第一优先：推进 Noria Home 简报摘要",
        "- 第二条：继续复盘中心 polish"
      ].join("\n");
    }
    if (normalized === "Dashboard/Advice.md") {
      return [
        "> [!tip] 当前建议",
        "",
        "围绕 [[博士中期考核|中期考核]] 先收敛任务入口，再处理 [项目监控](https://example.com)。",
        "",
        "```",
        "console.log('ignore me')",
        "```"
      ].join("\n");
    }
    if (normalized === "Dashboard/Empty.md") return "   \n";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-excerpt-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "每日简报", path: "Dashboard/Daily.md" },
                  { label: "当前建议", path: "Dashboard/Advice.md" },
                  { label: "空来源", path: "Dashboard/Empty.md" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: { adapter: { read: loadSource } }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-excerpt"] || ""), [
    "第一优先：推进 Noria Home 简报摘要",
    "围绕 中期考核 先收敛任务入口，再处理 项目监控。",
    ""
  ]);

  const excerpts = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-excerpt"));
  assert.equal(excerpts.length, 3);
  assert.deepEqual(excerpts.map((el) => el.textContent), [
    "第一优先：推进 Noria Home 简报摘要",
    "围绕 中期考核 先收敛任务入口，再处理 项目监控。",
    ""
  ]);
  assert.equal(excerpts[2].attrs.hidden, "true");
});

test("home markdown briefing source summaries keep source action hint diagnostics from markdown", async () => {
  const mount = createFakeElement();
  const openedFiles = [];
  const cursors = [];
  const ephemeralStates = [];
  const scrolls = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") {
      return [
        "## Daily",
        "",
        "今日要先处理复盘中心反馈。",
        "- [ ] 推进 Home 简报行动层",
        "- [x] 已完成的旧任务不要显示",
        "- [ ] 整理项目监控入口"
      ].join("\n");
    }
    if (normalized === "Dashboard/Advice.md") {
      return [
        "建议：先收敛任务入口，再处理视觉细节。",
        "- 补充可执行项目"
      ].join("\n");
    }
    if (normalized === "Dashboard/Empty.md") return "   \n";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-action-hints-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "每日简报", path: "Dashboard/Daily.md", role: "daily" },
                  { label: "当前建议", path: "Dashboard/Advice.md", role: "current" },
                  { label: "空来源", path: "Dashboard/Empty.md", role: "project" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.text) return `${key}:${params.text}`;
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource },
        getAbstractFileByPath(pathText) {
          const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
          return normalized ? { path: normalized, extension: "md" } : null;
        }
      },
      workspace: {
        getLeaf() {
          return {
            view: {
              setEphemeralState(state) {
                ephemeralStates.push(state);
              },
              editor: {
                setCursor(pos) {
                  cursors.push(pos);
                },
                scrollIntoView(range, center) {
                  scrolls.push({ range, center });
                }
              }
            },
            async openFile(file, options) {
              openedFiles.push({ file, options });
            }
          };
        },
        revealLeaf() {}
      }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-action-count"]), ["2", "2", "0"]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-action"] || ""), [
    "推进 Home 简报行动层",
    "建议：先收敛任务入口，再处理视觉细节。",
    ""
  ]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-action-line"] || ""), [
    "4",
    "1",
    ""
  ]);

  const actionHints = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-action-hint"));
  assert.equal(actionHints.length, 3);
  assert.equal(actionHints[0].attrs.role, "button");
  assert.equal(actionHints[0].attrs.tabindex, "0");
  assert.equal(actionHints[0].attrs["data-noria-action-source"], "home-markdown-briefing-action");
  assert.equal(actionHints[0].attrs["data-noria-action-kind"], "open-markdown-action-source");
  assert.equal(actionHints[0].attrs["data-noria-action-target-path"], "Dashboard/Daily.md");
  assert.equal(actionHints[0].attrs["data-noria-action-target-line"], "4");
  assert.equal(actionHints[0].attrs["data-noria-action-state"], "idle");
  assert.deepEqual(actionHints.map((el) => el.textContent), [
    "runtime.home.markdown.sourceActionHint:推进 Home 简报行动层",
    "",
    ""
  ]);
  assert.equal(actionHints[0].attrs.hidden, "true", "source action hint should stay diagnostic when action lanes exist");
  assert.equal(actionHints[1].attrs.hidden, "true", "duplicate action/excerpt should not add a second visible summary line");
  assert.equal(actionHints[2].attrs.hidden, "true");
  assert.equal(actionHints[0].attrs["data-noria-markdown-source-action-visibility"], "workbench");
  const actionCandidates = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-candidate"));
  assert.equal(actionCandidates[0].attrs["data-noria-action-target-path"], "Dashboard/Daily.md");
  assert.equal(actionCandidates[0].attrs["data-noria-action-target-line"], "4");
  await actionCandidates[0].click();
  assert.equal(actionCandidates[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(openedFiles, [
    { file: { path: "Dashboard/Daily.md", extension: "md" }, options: { active: true } }
  ]);
  assert.deepEqual(ephemeralStates, [{ line: 3 }]);
  assert.deepEqual(cursors, [{ line: 3, ch: 0 }]);
  assert.equal(scrolls.length, 1);

  const actionFacts = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-action-count"));
  assert.deepEqual(actionFacts.map((el) => el.textContent), [
    "runtime.home.markdown.sourceActions:2",
    "runtime.home.markdown.sourceActions:2"
  ]);
  assert.deepEqual(actionFacts.map((el) => el.attrs["data-noria-markdown-source-action-count"]), ["2", "2"]);
});

test("home markdown briefing overview exposes source-backed action candidates across sources", async () => {
  const mount = createFakeElement();
  const openedFiles = [];
  const cursors = [];
  const ephemeralStates = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") {
      return [
        "## Daily",
        "",
        "今日要先处理复盘中心反馈。",
        "- [ ] 推进 Home 简报行动层",
        "- [ ] 整理项目监控入口"
      ].join("\n");
    }
    if (normalized === "Dashboard/Advice.md") {
      return [
        "建议：先收敛任务入口，再处理视觉细节。",
        "- 补充可执行项目"
      ].join("\n");
    }
    if (normalized === "Dashboard/Weekly.md") return "## Weekly\n\n复盘完成。";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-overview-actions-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "每日简报", path: "Dashboard/Daily.md", role: "daily" },
                  { label: "当前建议", path: "Dashboard/Advice.md", role: "current" },
                  { label: "每周回顾", path: "Dashboard/Weekly.md", role: "weekly" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.label || params.text) return `${key}:${params.label || ""}:${params.text || ""}`;
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource },
        getAbstractFileByPath(pathText) {
          const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
          return normalized ? { path: normalized, extension: "md" } : null;
        }
      },
      workspace: {
        getLeaf() {
          return {
            view: {
              setEphemeralState(state) {
                ephemeralStates.push(state);
              },
              editor: {
                setCursor(pos) {
                  cursors.push(pos);
                },
                scrollIntoView() {}
              }
            },
            async openFile(file, options) {
              openedFiles.push({ file, options });
            }
          };
        },
        revealLeaf() {}
      }
    },
    globals: {
      obsidian: {
        MarkdownRenderer: {
          async render(_app, markdown, el, sourcePath) {
            el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
          }
        }
      },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const list = all.find((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-list"));
  assert.ok(list, "briefing overview should expose an action candidate list");
  assert.equal(list.attrs["data-noria-markdown-briefing-action-count"], "2");

  const candidates = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-candidate"));
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((el) => el.tagName), ["span", "span"]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-markdown-briefing-action-rank"]), ["1", "2"]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-markdown-briefing-action-source-label"]), ["每日简报", "当前建议"]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-action-source"]), [
    "home-markdown-briefing-overview-action",
    "home-markdown-briefing-overview-action"
  ]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-action-kind"]), [
    "open-markdown-action-source",
    "open-markdown-action-source"
  ]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-action-target-path"]), [
    "Dashboard/Daily.md",
    "Dashboard/Advice.md"
  ]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-action-target-line"]), ["4", "1"]);
  assert.match(candidates[0].textContent, /推进 Home 简报行动层/);
  assert.match(candidates[1].textContent, /先收敛任务入口/);

  await candidates[1].click();
  assert.equal(candidates[1].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(openedFiles, [
    { file: { path: "Dashboard/Advice.md", extension: "md" }, options: { active: true } }
  ]);
  assert.deepEqual(ephemeralStates, [{ line: 0 }]);
  assert.deepEqual(cursors, [{ line: 0, ch: 0 }]);
});

test("home markdown briefing overview ranks stale action candidates before source order", async () => {
  const mount = createFakeElement();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const freshMtime = Date.now() - 2 * hour;
  const staleMtime = Date.now() - 12 * day;
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") return "## Daily\n\n- [ ] 处理今日例行";
    if (normalized === "Dashboard/Weekly.md") return "## Weekly\n\n- [ ] 补齐周回顾阻塞项";
    if (normalized === "Dashboard/Advice.md") return "建议：先同步当前建议";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-ranked-actions-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "每日简报", path: "Dashboard/Daily.md", role: "daily" },
                  { label: "每周回顾", path: "Dashboard/Weekly.md", role: "weekly", maxAgeHours: 24 },
                  { label: "当前建议", path: "Dashboard/Advice.md", role: "current" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.label || params.text) return `${key}:${params.label || ""}:${params.text || ""}`;
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource },
        getAbstractFileByPath(pathText) {
          if (pathText === "Dashboard/Daily.md") return { path: pathText, extension: "md", stat: { mtime: freshMtime } };
          if (pathText === "Dashboard/Weekly.md") return { path: pathText, extension: "md", stat: { mtime: staleMtime } };
          if (pathText === "Dashboard/Advice.md") return { path: pathText, extension: "md", stat: { mtime: freshMtime } };
          return null;
        }
      },
      workspace: { getLeaf() { return { async openFile() {}, view: {} }; }, revealLeaf() {} }
    },
    globals: {
      obsidian: {
        MarkdownRenderer: {
          async render(_app, markdown, el, sourcePath) {
            el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
          }
        }
      },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const candidates = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-candidate"));
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-markdown-briefing-action-source-label"]), [
    "每周回顾",
    "每日简报",
    "当前建议"
  ]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-markdown-briefing-action-priority-reason"]), [
    "stale",
    "action",
    "action"
  ]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-markdown-briefing-action-rank"]), ["1", "2", "3"]);
});

test("home markdown briefing overview groups candidates into source-backed action lanes", async () => {
  const mount = createFakeElement();
  const openedFiles = [];
  const cursors = [];
  const ephemeralStates = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") return "## Daily\n\n- [ ] 推进今日简报行动层";
    if (normalized === "Dashboard/Advice.md") return "需要确认：是否保留来源详情";
    if (normalized === "Dashboard/Project.md") return "## Project\n\n- [ ] 监控 WENO 项目风险";
    if (normalized === "Dashboard/Weekly.md") return "## Weekly\n\n- 整理周回顾材料";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-action-lanes-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "每日简报", path: "Dashboard/Daily.md", role: "daily" },
                  { label: "当前建议", path: "Dashboard/Advice.md", role: "current" },
                  { label: "项目监控", path: "Dashboard/Project.md", role: "project" },
                  { label: "每周回顾", path: "Dashboard/Weekly.md", role: "weekly" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.label || params.text) return `${key}:${params.label || ""}:${params.text || ""}`;
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource },
        getAbstractFileByPath(pathText) {
          const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
          return normalized ? { path: normalized, extension: "md" } : null;
        }
      },
      workspace: {
        getLeaf() {
          return {
            view: {
              setEphemeralState(state) {
                ephemeralStates.push(state);
              },
              editor: {
                setCursor(pos) {
                  cursors.push(pos);
                },
                scrollIntoView() {}
              }
            },
            async openFile(file, options) {
              openedFiles.push({ file, options });
            }
          };
        },
        revealLeaf() {}
      }
    },
    globals: {
      obsidian: {
        MarkdownRenderer: {
          async render(_app, markdown, el, sourcePath) {
            el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
          }
        }
      },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const overviews = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-overview"));
  const workbench = all.find((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-workbench"));
  assert.ok(workbench, "briefing overview should lead with an action-first workbench");
  assert.equal(workbench.attrs["data-noria-markdown-briefing-workbench"], "action-first");
  assert.equal(workbench.attrs["data-noria-markdown-briefing-action-count"], "4");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-total"], "4");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-ready"], "4");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-actions"], "4");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-priority-path"], "Dashboard/Daily.md");
  assert.equal(overviews[0].attrs["data-noria-markdown-briefing-priority-line"], "3");

  const overviewFacts = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-overview-fact"));
  assert.deepEqual(overviewFacts.map((el) => el.attrs["data-noria-markdown-briefing-fact"]), []);
  const priorityCues = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-priority"));
  assert.equal(priorityCues.length, 0, "action lanes should carry source handoff without a duplicate priority cue");
  const sourceActionHints = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-action-hint"));
  assert.equal(sourceActionHints.length, 4);
  assert.deepEqual(
    sourceActionHints.map((el) => el.attrs.hidden),
    ["true", "true", "true", "true"],
    "source row action hints should not duplicate action lanes in the visible layer"
  );
  assert.equal(sourceActionHints[0].attrs["data-noria-action-kind"], "open-markdown-action-source");
  assert.equal(sourceActionHints[0].attrs["data-noria-action-target-path"], "Dashboard/Daily.md");
  assert.equal(sourceActionHints[0].attrs["data-noria-action-target-line"], "3");

  const lanes = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-lane"));
  assert.deepEqual(lanes.map((el) => el.attrs["data-noria-markdown-briefing-action-lane"]), [
    "today",
    "confirm",
    "monitor",
    "later"
  ]);
  assert.deepEqual(lanes.map((el) => el.attrs["data-noria-markdown-briefing-action-lane-count"]), [
    "1",
    "1",
    "1",
    "1"
  ]);

  const candidates = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-action-candidate"));
  assert.equal(candidates.length, 4);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-markdown-briefing-action-lane"]), [
    "today",
    "confirm",
    "monitor",
    "later"
  ]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-markdown-briefing-action-source-label"]), [
    "每日简报",
    "当前建议",
    "项目监控",
    "每周回顾"
  ]);
  assert.deepEqual(candidates.map((el) => el.attrs["data-noria-action-target-path"]), [
    "Dashboard/Daily.md",
    "Dashboard/Advice.md",
    "Dashboard/Project.md",
    "Dashboard/Weekly.md"
  ]);

  await candidates[2].click();
  assert.equal(candidates[2].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(openedFiles, [
    { file: { path: "Dashboard/Project.md", extension: "md" }, options: { active: true } }
  ]);
  assert.deepEqual(ephemeralStates, [{ line: 2 }]);
  assert.deepEqual(cursors, [{ line: 2, ch: 0 }]);
});

test("home markdown briefing source summaries expose section trails", async () => {
  const mount = createFakeElement();
  const openedFiles = [];
  const cursors = [];
  const ephemeralStates = [];
  const scrolls = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Daily.md") {
      return [
        "---",
        "tags: [brief]",
        "---",
        "# 每日简报",
        "",
        "## 今日重点",
        "",
        "推进 Noria 外部简报结构索引。",
        "",
        "## 风险",
        "",
        "- 主页过度卡片化。",
        "",
        "```",
        "## 不应读取",
        "```",
        "",
        "### 下一步",
        "",
        "- [ ] 增加小节轨迹"
      ].join("\n");
    }
    if (normalized === "Dashboard/Empty.md") return "   \n";
    return "";
  };
  const markdownRenderer = {
    async render(_app, markdown, el, sourcePath) {
      el.createDiv({ text: `rendered:${sourcePath}:${markdown.length}` });
    }
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-briefing-sections-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "briefing",
              type: "markdown",
              enabled: true,
              order: 10,
              size: "full",
              props: {
                sources: [
                  { label: "每日简报", path: "Dashboard/Daily.md", role: "daily" },
                  { label: "空来源", path: "Dashboard/Empty.md", role: "project" }
                ]
              }
            }
          ]
        },
        t(key, params = {}) {
          if (params.text) return `${key}:${params.text}`;
          if (params.count) return `${key}:${params.count}`;
          return key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource },
        getAbstractFileByPath(pathText) {
          const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
          return normalized ? { path: normalized, extension: "md" } : null;
        }
      },
      workspace: {
        getLeaf() {
          return {
            view: {
              setEphemeralState(state) {
                ephemeralStates.push(state);
              },
              editor: {
                setCursor(pos) {
                  cursors.push(pos);
                },
                scrollIntoView(range, center) {
                  scrolls.push({ range, center });
                }
              }
            },
            async openFile(file, options) {
              openedFiles.push({ file, options });
            }
          };
        },
        revealLeaf() {}
      }
    },
    globals: {
      obsidian: { MarkdownRenderer: markdownRenderer },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  const items = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-briefing-item"));
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-section-count"]), ["3", "0"]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-sections"] || ""), [
    "今日重点 / 风险 / 下一步",
    ""
  ]);
  assert.deepEqual(items.map((item) => item.attrs["data-noria-markdown-source-primary-section"] || ""), [
    "今日重点",
    ""
  ]);
  assert.equal(items[0].attrs["data-noria-markdown-source-primary-section-line"], "6");

  const trails = all.filter((el) => el.classList?.contains?.("dashboard-home-markdown-source-section-trail"));
  assert.equal(trails.length, 2);
  assert.deepEqual(trails.map((el) => el.textContent), [
    "runtime.home.markdown.sourceSectionTrail:今日重点 / 风险 / 下一步",
    ""
  ]);
  assert.equal(trails[0].attrs.hidden, undefined);
  assert.equal(trails[1].attrs.hidden, "true");
  assert.equal(trails[0].attrs.role, "button");
  assert.equal(trails[0].attrs.tabindex, "0");
  assert.equal(trails[0].attrs["data-noria-action-source"], "home-markdown-briefing-section");
  assert.equal(trails[0].attrs["data-noria-action-kind"], "open-markdown-section-source");
  assert.equal(trails[0].attrs["data-noria-action-target-path"], "Dashboard/Daily.md");
  assert.equal(trails[0].attrs["data-noria-action-target-line"], "6");
  assert.equal(trails[0].attrs["data-noria-action-state"], "idle");
  await trails[0].click();
  assert.equal(trails[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(openedFiles, [
    { file: { path: "Dashboard/Daily.md", extension: "md" }, options: { active: true } }
  ]);
  assert.deepEqual(ephemeralStates, [{ line: 5 }]);
  assert.deepEqual(cursors, [{ line: 5, ch: 0 }]);
  assert.equal(scrolls.length, 1);
});

test("home single-source markdown distinguishes missing and empty sources with recovery actions", async () => {
  const missingMount = createFakeElement();
  const configuredWidgets = [];
  const missingSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Missing.md") throw new Error("file missing");
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount: missingMount,
      noriaBridge: {
        runtimeBuildId: "markdown-single-missing-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            { id: "notes", type: "markdown", enabled: true, order: 10, size: "medium", source: "Dashboard/Missing.md" }
          ]
        },
        runtime: {
          openHomeWidgetSettings(widgetId) {
            configuredWidgets.push(widgetId);
          }
        },
        t(key, params = {}) {
          return params.message ? `${key}:${params.message}` : key;
        }
      }
    },
    ctxFallback: { io: { load: missingSource }, container: missingMount, paragraph() {} },
    app: {
      vault: { adapter: { read: missingSource } }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const missingElements = flattenElements(missingMount);
  const missingState = missingElements.find((el) => el.classList?.contains?.("dashboard-home-markdown-single-state"));
  const configureButton = missingElements.find((el) => el.classList?.contains?.("dashboard-home-markdown-single-state-action"));
  assert.equal(missingState?.attrs["data-noria-markdown-source-state"], "failed");
  assert.match(missingState?.textContent || "", /runtime\.home\.markdown\.loadFailed:file missing/);
  assert.equal(configureButton?.textContent, "runtime.home.markdown.configure");
  assert.equal(configureButton?.attrs["data-noria-markdown-source-action"], "configure");
  await configureButton?.click();
  assert.deepEqual(configuredWidgets, ["notes"]);

  const emptyMount = createFakeElement();
  const openedLinks = [];
  const emptySource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Empty.md") return "   \n";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount: emptyMount,
      noriaBridge: {
        runtimeBuildId: "markdown-single-empty-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            { id: "notes", type: "markdown", enabled: true, order: 10, size: "medium", source: "Dashboard/Empty.md" }
          ]
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: { io: { load: emptySource }, container: emptyMount, paragraph() {} },
    app: {
      vault: { adapter: { read: emptySource } },
      workspace: {
        openLinkText(path, sourcePath, newLeaf) {
          openedLinks.push({ path, sourcePath, newLeaf });
        }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const emptyElements = flattenElements(emptyMount);
  const emptyState = emptyElements.find((el) => el.classList?.contains?.("dashboard-home-markdown-single-state"));
  const openButton = emptyElements.find((el) => el.classList?.contains?.("dashboard-home-markdown-single-state-action"));
  assert.equal(emptyState?.attrs["data-noria-markdown-source-state"], "empty");
  assert.match(emptyState?.textContent || "", /runtime\.home\.markdown\.sourceEmpty/);
  assert.equal(openButton?.textContent, "runtime.home.markdown.open");
  assert.equal(openButton?.attrs["data-noria-markdown-source-action"], "open");
  await openButton?.click();
  assert.deepEqual(openedLinks, [{ path: "Dashboard/Empty", sourcePath: "", newLeaf: false }]);
});

test("home markdown widget falls back to plain text when MarkdownRenderer fails", async () => {
  const mount = createFakeElement();
  const unloads = [];
  class TestComponent {
    load() {}
    unload() {
      unloads.push("unloaded");
    }
  }
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized === "Dashboard/Note.md") return "## Raw fallback\n\n- item";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "markdown-fallback-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            { id: "notes", type: "markdown", enabled: true, order: 10, size: "medium", source: "Dashboard/Note.md" }
          ]
        },
        t(key, params = {}) {
          if (params.message) return `${key}:${params.message}`;
          return params.path ? `${key}:${params.path}` : key;
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      obsidian: {
        Component: TestComponent,
        MarkdownRenderer: {
          async render() {
            throw new Error("renderer failed");
          }
        }
      },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /## Raw fallback/);
  assert.match(text, /- item/);
  const fallbackState = flattenElements(mount).find((el) => el.classList?.contains?.("dashboard-home-markdown-single-state"));
  assert.equal(fallbackState?.attrs["data-noria-markdown-source-state"], "failed");
  assert.match(fallbackState?.textContent || "", /runtime\.home\.markdown\.loadFailed:renderer failed/);
  assert.deepEqual(unloads, ["unloaded"]);
});

test("home markdown widget resolves Obsidian API through a guarded window reference", () => {
  const source = readSource("views/dashboard/home/view.js");
  const start = source.indexOf("async function renderMarkdownContent");
  const end = source.indexOf("async function renderMarkdownWidget", start);
  assert.notEqual(start, -1, "renderMarkdownContent should exist");
  assert.notEqual(end, -1, "renderMarkdownContent should be bounded");
  const block = source.slice(start, end);
  assert.match(block, /const windowRef = \(typeof window !== "undefined"\) \? window : \{\};/);
  assert.doesNotMatch(block, /window\?\.(obsidian|require|MarkdownRenderer|Component)/);
});

test("home facade renders action widgets and routes clicks to commands or notes", async () => {
  const mount = createFakeElement();
  const commandIds = [];
  const links = [];
  const captures = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
        noriaBridge: {
          runtimeBuildId: "action-widget-build",
          pluginId: "noria",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "ops",
              type: "action",
              enabled: true,
              order: 10,
              size: "wide",
              title: "Ops",
              props: {
                actions: [
                  { label: "Tasks", kind: "view", view: "tasks" },
                  { label: "Open ops note", kind: "file", path: "Dashboard/Ops.md", newLeaf: true },
                  {
                    id: "capture-inbox",
                    label: "Capture dashboard idea",
                    kind: "quickCapture",
                    target: "diary-inbox",
                    text: "整理 Noria Home Dashboard 操作台"
                  },
                  { label: "External", kind: "command", commandId: "third-party:do-work" }
                ]
              }
            }
          ]
        },
        quickCapture: {
          async append(request = {}) {
            captures.push({ ...request });
            return { ok: true, path: "Noria/Diary/2026/2026-06-08.md" };
          }
        },
        t(key, params = {}) {
          return params.path ? `${key}:${params.path}` : key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      commands: {
        async executeCommandById(id) {
          commandIds.push(id);
        }
      },
      workspace: {
        async openLinkText(pathText, sourcePath, newLeaf) {
          links.push({ pathText, sourcePath, newLeaf });
        }
      },
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const buttons = flattenElements(mount).filter((el) => el.tagName === "button");
  assert.deepEqual(buttons.map((button) => button.textContent), ["Tasks", "Open ops note", "Capture dashboard idea", "External"]);
  const actionShell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "ops");
  assert.ok(actionShell?.classList?.contains?.("dashboard-home-widget-shell"));
  assert.equal(actionShell.attrs["data-noria-widget-type"], "action");
  assert.deepEqual(buttons.map((button) => button.attrs?.["data-noria-widget-kind"]), ["view", "file", "quickcapture", "command"]);
  assert.ok(buttons.every((button) => !String(button.style.cssText || "").includes("background:var(--background-primary)")));

  await buttons[0].click();
  await buttons[1].click();
  await buttons[2].click();
  await buttons[3].click();

  assert.deepEqual(commandIds, ["noria:open-tasks-plugin-tab", "third-party:do-work"]);
  assert.deepEqual(links, [{ pathText: "Dashboard/Ops", sourcePath: "", newLeaf: true }]);
  assert.deepEqual(captures, [
    {
      actionId: "capture-inbox",
      source: "home-action",
      target: "diary-inbox",
      text: "整理 Noria Home Dashboard 操作台"
    }
  ]);
});

test("home facade renders today action strip as a compact daily workbench", async () => {
  const mount = createFakeElement();
  const commandIds = [];
  const captures = [];
  const reviewRequests = [];
  const dailyRequests = [];
  const dayBoardRequests = [];
  const calendarRequests = [];
  const notices = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "today-actions-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "today-actions",
              type: "builtin",
              enabled: true,
              order: 10,
              size: "full",
              title: ""
            }
          ]
        },
        quickCapture: {
          async append(request = {}) {
            captures.push({ ...request });
            return { ok: true, path: "06_Diary/2026/2026-06-09.md" };
          }
        },
        runtime: {
          notice(key, params = {}) {
            notices.push({ key, params });
          }
        },
        async openReviewCenter(request = {}) {
          reviewRequests.push({ ...request });
        },
        async openDailyNote(request = {}) {
          dailyRequests.push({ ...request });
        },
        async openTaskBoardDay(date) {
          dayBoardRequests.push(date || "");
        },
        async openCalendar(request = {}) {
          calendarRequests.push({ ...request });
        },
        t(key, params = {}) {
          return params.path ? `${key}:${params.path}` : key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      commands: {
        async executeCommandById(id) {
          commandIds.push(id);
        }
      },
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const strip = flattenElements(mount).find((el) => el.classList?.contains?.("dashboard-home-today-actions"));
  assert.ok(strip, "today action strip should render inside Home");
  const shell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "today-actions");
  assert.ok(shell?.classList?.contains?.("dashboard-home-widget-shell"));
  assert.equal(shell.attrs["data-noria-widget-type"], "builtin");

  const input = flattenElements(mount).find((el) => el.tagName === "textarea" && el.classList?.contains?.("dashboard-home-today-capture-input"));
  assert.ok(input, "today action strip should expose a quick capture input");
  assert.equal(input.attrs["aria-label"], "runtime.home.todayActions.capturePlaceholder");

  const modeButtons = flattenElements(mount).filter((el) => el.tagName === "button" && el.classList?.contains?.("dashboard-home-today-capture-mode"));
  assert.deepEqual(modeButtons.map((button) => button.textContent), [
    "runtime.home.todayActions.captureModeInbox",
    "runtime.home.todayActions.captureModeTask"
  ]);
  assert.equal(modeButtons[0].attrs["aria-pressed"], "true");
  assert.equal(modeButtons[1].attrs["aria-pressed"], "false");

  const submitButton = flattenElements(mount).find((el) => el.tagName === "button" && el.attrs?.["data-noria-capture-submit"] === "1");
  assert.ok(submitButton, "today capture should expose one submit button");
  assert.equal(submitButton.textContent, "runtime.home.todayActions.capture");
  assert.equal(submitButton.disabled, true, "capture starts disabled until text is entered");
  assert.equal(submitButton.attrs["data-noria-action-id"], "today-action-capture");
  assert.equal(submitButton.attrs["data-noria-action-kind"], "quickcapture");
  assert.equal(submitButton.attrs["data-noria-action-target"], "diary-inbox");
  const actionButtons = flattenElements(mount).filter((el) => el.tagName === "button" && el.classList?.contains?.("dashboard-home-today-action-button"));
  assert.deepEqual(actionButtons.map((button) => button.textContent), [
    "runtime.home.todayActions.openDaily",
    "runtime.home.todayActions.todayBoard",
    "runtime.home.todayActions.calendar",
    "runtime.home.todayActions.review"
  ]);
  assert.deepEqual(actionButtons.map((button) => button.attrs["data-noria-action-kind"]), ["view", "view", "view", "view"]);
  assert.deepEqual(actionButtons.map((button) => button.attrs["data-noria-action-target"]), ["daily", "day", "calendar", "review"]);
  assert.deepEqual(actionButtons.map((button) => button.attrs["data-noria-action-command"]), [
    "open-daily-note",
    "open-today-day-board",
    "open-calendar",
    "open-review-center"
  ]);
  assert.deepEqual(actionButtons.map((button) => button.attrs["data-noria-action-source"]), [
    "home-today-actions",
    "home-today-actions",
    "home-today-actions",
    "home-today-actions"
  ]);
  assert.deepEqual(actionButtons.map((button) => button.attrs["data-noria-action-state"]), ["idle", "idle", "idle", "idle"]);
  assert.equal(submitButton.attrs["data-noria-action-state"], "idle");

  input.value = "记录一个新的主页操作台想法";
  await input.dispatchEvent({ type: "input" });
  assert.equal(submitButton.disabled, false);
  await submitButton.click();

  input.value = "Enter 直接捕获";
  await input.dispatchEvent({ type: "input" });
  let enterPrevented = false;
  await input.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {
      enterPrevented = true;
    }
  });
  assert.equal(enterPrevented, true, "plain Enter submits one-line capture");

  input.value = "Shift Enter 保留多行";
  await input.dispatchEvent({ type: "input" });
  let shiftPrevented = false;
  await input.dispatchEvent({
    type: "keydown",
    key: "Enter",
    shiftKey: true,
    preventDefault() {
      shiftPrevented = true;
    }
  });
  assert.equal(shiftPrevented, false, "Shift+Enter should remain available for multiline capture");

  input.value = "中文输入法候选";
  await input.dispatchEvent({ type: "input" });
  let composingPrevented = false;
  await input.dispatchEvent({
    type: "keydown",
    key: "Enter",
    isComposing: true,
    preventDefault() {
      composingPrevented = true;
    }
  });
  assert.equal(composingPrevented, false, "IME composing Enter should not submit capture");
  assert.equal(input.value, "中文输入法候选");

  await modeButtons[1].click();
  assert.equal(modeButtons[0].attrs["aria-pressed"], "false");
  assert.equal(modeButtons[1].attrs["aria-pressed"], "true");
  assert.equal(input.attrs["aria-label"], "runtime.home.todayActions.taskPlaceholder");
  assert.equal(input.placeholder, "runtime.home.todayActions.taskPlaceholder");
  assert.equal(submitButton.textContent, "runtime.home.todayActions.addTask");
  assert.equal(submitButton.attrs["data-noria-action-id"], "today-action-task");
  assert.equal(submitButton.attrs["data-noria-action-target"], "today-task");

  input.value = "把捕获直接变成今日任务";
  await input.dispatchEvent({ type: "input" });
  let taskEnterPrevented = false;
  await input.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {
      taskEnterPrevented = true;
    }
  });
  assert.equal(taskEnterPrevented, true, "task mode also submits with plain Enter");
  input.value = "";
  await input.dispatchEvent({ type: "input" });

  await actionButtons[0].click();
  await actionButtons[1].click();
  await actionButtons[2].click();
  await actionButtons[3].click();
  assert.deepEqual(actionButtons.map((button) => button.attrs["data-noria-action-state"]), ["ok", "ok", "ok", "ok"]);

  assert.deepEqual(captures, [
    {
      actionId: "today-action-capture",
      source: "home-action",
      target: "diary-inbox",
      text: "记录一个新的主页操作台想法"
    },
    {
      actionId: "today-action-capture",
      source: "home-action",
      target: "diary-inbox",
      text: "Enter 直接捕获"
    },
    {
      actionId: "today-action-task",
      source: "home-action",
      target: "today-task",
      text: "把捕获直接变成今日任务"
    }
  ]);
  assert.equal(input.value, "");
  assert.equal(submitButton.disabled, true);
  assert.deepEqual(commandIds, []);
  assert.deepEqual(dailyRequests, [{ source: "home-today-actions" }]);
  assert.deepEqual(dayBoardRequests, [""]);
  assert.deepEqual(calendarRequests, [{ source: "home-today-actions" }]);
  assert.deepEqual(reviewRequests, [{ source: "home-today-actions" }]);
  assert.deepEqual(notices, [
    {
      key: "runtime.home.action.captured",
      params: { path: "06_Diary/2026/2026-06-09.md" }
    },
    {
      key: "runtime.home.action.captured",
      params: { path: "06_Diary/2026/2026-06-09.md" }
    },
    {
      key: "runtime.home.action.captured",
      params: { path: "06_Diary/2026/2026-06-09.md" }
    }
  ]);
});

test("home today action strip reports failed daily commands without silent buttons", async () => {
  const mount = createFakeElement();
  const notices = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "today-actions-failure-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "today-actions",
              type: "builtin",
              enabled: true,
              order: 10,
              size: "full",
              title: "",
              props: {
                actions: [
                  { id: "daily-note", labelKey: "runtime.home.todayActions.openDaily", kind: "view", view: "daily", source: "home-today-actions" }
                ]
              }
            }
          ]
        },
        runtime: {
          notice(key, params = {}) {
            notices.push({ key, params });
          }
        },
        async openDailyNote() {
          throw new Error("daily unavailable");
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const actionButtons = flattenElements(mount).filter((el) => el.tagName === "button" && el.classList?.contains?.("dashboard-home-today-action-button"));
  assert.equal(actionButtons.length, 1);
  assert.equal(actionButtons[0].attrs["data-noria-action-state"], "idle");
  const warnCalls = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnCalls.push(args);
  try {
    await actionButtons[0].click();
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(actionButtons[0].attrs["data-noria-action-state"], "failed");
  assert.match(actionButtons[0].attrs["data-noria-action-error"], /daily unavailable/);
  assert.equal(warnCalls.length, 1);
  assert.deepEqual(notices, [
    {
      key: "runtime.home.action.failed",
      params: {
        label: "runtime.home.todayActions.openDaily",
        message: "daily unavailable"
      }
    }
  ]);
});

test("home keeps a recovery entry when the today action strip is hidden", async () => {
  const mount = createFakeElement();
  const editModeRequests = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "layout-recovery-entry-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "today-actions",
              type: "builtin",
              enabled: false,
              order: 10,
              size: "full",
              title: ""
            }
          ]
        },
        t(key) {
          return key;
        },
        runtime: {
          async setHomeEditMode(enabled) {
            editModeRequests.push(enabled);
            return { ok: true, enabled };
          }
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: mount, paragraph() {} },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const all = flattenElements(mount);
  assert.equal(all.filter((el) => el.classList?.contains?.("dashboard-home-today-actions")).length, 0);
  const recoveryEntries = all.filter((el) => el.classList?.contains?.("dashboard-home-layout-recovery-entry"));
  assert.equal(recoveryEntries.length, 1);
  assert.equal(recoveryEntries[0].attrs["data-noria-home-layout-recovery"], "true");
  const openButtons = all.filter((el) => el.attrs?.["data-noria-home-layout-edit-toggle"] === "open");
  assert.equal(openButtons.length, 1);
  await openButtons[0].click();
  assert.deepEqual(editModeRequests, [true]);
});

test("home today action strip suppresses legacy timeline actions and keeps daily commands direct", async () => {
  const mount = createFakeElement();
  const dailyRequests = [];
  const reviewRequests = [];
  const timelineRequests = [];
  const commandIds = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "today-action-strip-no-timeline",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "today-actions",
              type: "builtin",
              enabled: true,
              order: 10,
              size: "full",
              title: "",
              props: {
                actions: [
                  { id: "legacy-timeline", labelKey: "runtime.home.todayActions.timeline", kind: "view", view: "timeline", source: "legacy-json" },
                  { id: "daily-note", labelKey: "runtime.home.todayActions.openDaily", kind: "command", commandId: "open-daily-note", source: "home-today-actions" },
                  { id: "review", labelKey: "runtime.home.todayActions.review", kind: "view", view: "review", source: "home-today-actions" }
                ]
              }
            }
          ]
        },
        t(key) {
          return key;
        },
        async openDailyNote(request = {}) {
          dailyRequests.push({ ...request });
        },
        async openReviewCenter(request = {}) {
          reviewRequests.push({ ...request });
        },
        async openTasksTimeline(request = {}) {
          timelineRequests.push({ ...request });
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      commands: {
        async executeCommandById(id) {
          commandIds.push(id);
        }
      },
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const actionButtons = flattenElements(mount).filter((el) => el.tagName === "button" && el.classList?.contains?.("dashboard-home-today-action-button"));
  assert.deepEqual(actionButtons.map((button) => button.textContent), [
    "runtime.home.todayActions.openDaily",
    "runtime.home.todayActions.review"
  ]);
  assert.equal(
    flattenElements(mount).find((el) => el.textContent === "runtime.home.todayActions.timeline"),
    undefined,
    "timeline is task context, not a duplicated today action"
  );

  await actionButtons[0].click();
  await actionButtons[1].click();

  assert.deepEqual(dailyRequests, [{ source: "home-today-actions" }]);
  assert.deepEqual(reviewRequests, [{ source: "home-today-actions" }]);
  assert.deepEqual(timelineRequests, []);
  assert.deepEqual(commandIds, []);
});

test("home facade renders base and list widgets as file entry launchers", async () => {
  const mount = createFakeElement();
  const links = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "entry-widget-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "queues",
              type: "base",
              enabled: true,
              order: 10,
              size: "wide",
              title: "Queues",
              source: "02_Areas/Knowledge/Inbox queue.base",
              props: {
                description: "Open Base views already owned by the vault.",
                entries: [
                  { label: "Inbox queue", path: "02_Areas/Knowledge/Inbox queue.base", description: "Triage and file captured notes." },
                  { label: "Project list", path: "01_Projects/Project list.md", kind: "note", newLeaf: true }
                ]
              }
            }
          ]
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      workspace: {
        async openLinkText(pathText, sourcePath, newLeaf) {
          links.push({ pathText, sourcePath, newLeaf });
        }
      },
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const entryWidgets = flattenElements(mount).filter((el) => el.classList?.contains?.("dashboard-home-entry-widget"));
  assert.equal(entryWidgets.length, 1);
  const entryShell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "queues");
  assert.ok(entryShell?.classList?.contains?.("dashboard-home-widget-shell"));
  assert.equal(entryShell.attrs["data-noria-widget-type"], "base");
  const buttons = flattenElements(mount).filter((el) => el.tagName === "button" && el.classList?.contains?.("dashboard-home-entry-button"));
  assert.deepEqual(buttons.map((button) => button.textContent), ["Inbox queue", "Project list"]);
  assert.ok(buttons.every((button) => !String(button.style.cssText || "").includes("background:var(--background-secondary)")));
  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Open Base views already owned by the vault/);
  assert.match(text, /Triage and file captured notes/);
  assert.match(text, /02_Areas\/Knowledge\/Inbox queue\.base/);

  await buttons[0].click();
  await buttons[1].click();

  assert.deepEqual(links, [
    { pathText: "02_Areas/Knowledge/Inbox queue.base", sourcePath: "", newLeaf: false },
    { pathText: "01_Projects/Project list", sourcePath: "", newLeaf: true }
  ]);
});

test("home facade maps widget layout spans and lets customized hero widgets split into the grid", async () => {
  const mount = createFakeElement();
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized.endsWith("home-identity.js")) return "input.mount.createDiv({ text: 'identity body' });";
    if (normalized.endsWith("overview-metrics.js")) return "input.mount.createDiv({ text: 'metrics body' });";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "layout-grid-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            { id: "identity", type: "builtin", enabled: true, order: 10, size: "wide", layout: { span: 4 } },
            { id: "metrics", type: "builtin", enabled: true, order: 20, size: "wide", layout: { span: 8 }, props: { metricsLayout: "hero" } },
            {
              id: "ops",
              type: "action",
              enabled: true,
              order: 30,
              size: "small",
              title: "Ops",
              layout: { span: 2 },
              props: { actions: [] }
            }
          ]
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  const heroStrips = flattenElements(mount).filter((el) => el.classList?.contains?.("dashboard-hero-strip"));
  assert.equal(heroStrips.length, 0);
  const shells = flattenElements(mount).filter((el) => el.attrs?.["data-noria-widget-id"]);
  const byId = Object.fromEntries(shells.map((el) => [el.attrs["data-noria-widget-id"], el]));
  assert.equal(byId.identity.attrs["data-noria-widget-span"], "4");
  assert.equal(byId.identity.style["--noria-home-widget-span"], "4");
  assert.equal(byId.identity.style.gridColumn, "span 4");
  assert.equal(byId.metrics.attrs["data-noria-widget-span"], "8");
  assert.equal(byId.metrics.style["--noria-home-widget-span"], "8");
  assert.equal(byId.metrics.style.gridColumn, "span 8");
  assert.equal(byId.ops.attrs["data-noria-widget-span"], "2");
  assert.equal(byId.ops.style["--noria-home-widget-span"], "2");
  assert.equal(byId.ops.style.gridColumn, "span 2");
});

test("home hero follows widget order and only pairs adjacent identity and metrics cards", async () => {
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized.endsWith("home-identity.js")) return "input.mount.createDiv({ text: 'identity body' });";
    if (normalized.endsWith("overview-metrics.js")) return "input.mount.createDiv({ text: 'metrics body' });";
    return "";
  };
  const renderDirectOrder = async (widgets, buildId) => {
    const mount = createFakeElement();
    await runRuntimeSource("views/dashboard/home/view.js", {
      input: {
        mount,
        noriaBridge: {
          runtimeBuildId: buildId,
          performance: { viewSourceCache: false, homeLazySections: false },
          homeSettings: { widgets },
          t(key) {
            return key;
          }
        }
      },
      ctxFallback: {
        io: { load: loadSource },
        container: mount,
        paragraph() {}
      },
      app: {
        vault: {
          adapter: { read: loadSource }
        }
      },
      globals: {
        window: { moment: {} },
        document: {
          getElementById: () => null,
          createElement: (tag) => createFakeElement(tag),
          head: createFakeElement("head")
        }
      }
    });
    const root = mount.children.find((el) => el.classList?.contains?.("dashboard-home-root"));
    assert.ok(root, "home root should be rendered");
    return root.children.map((el) => {
      if (el.classList?.contains?.("dashboard-hero-strip")) return "identity+metrics";
      return el.attrs?.["data-noria-widget-id"] || "";
    }).filter(Boolean);
  };
  const identity = { id: "identity", type: "builtin", enabled: true, order: 20, size: "wide", props: {} };
  const metrics = { id: "metrics", type: "builtin", enabled: true, order: 30, size: "wide", props: { metricsLayout: "hero" } };
  const ops = { id: "ops", type: "action", enabled: true, order: 10, size: "wide", title: "Ops", props: { actions: [] } };

  assert.deepEqual(
    await renderDirectOrder([identity, metrics, ops], "hero-ordered-build"),
    ["ops", "identity+metrics"]
  );
  assert.deepEqual(
    await renderDirectOrder([
      { ...identity, order: 10 },
      { ...ops, order: 20 },
      { ...metrics, order: 30 }
    ], "hero-split-build"),
    ["identity", "ops", "metrics"]
  );
});

test("home hero starts identity and metrics rendering without serializing first paint", async () => {
  const mount = createFakeElement();
  const events = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized.endsWith("home-identity.js")) {
      events.push("identity-start");
      return new Promise((resolve) => {
        setTimeout(() => {
          events.push("identity-resolve");
          resolve("input.mount.createDiv({ text: 'identity body' });");
        }, 20);
      });
    }
    if (normalized.endsWith("overview-metrics.js")) {
      events.push("metrics-start");
      return "input.mount.createDiv({ text: 'metrics body' });";
    }
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "hero-parallel-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            { id: "identity", type: "builtin", enabled: true, order: 10, size: "wide", source: "home-identity", props: {} },
            { id: "metrics", type: "builtin", enabled: true, order: 20, size: "wide", source: "overview-metrics", props: { metricsLayout: "hero" } }
          ]
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.deepEqual(events, ["identity-start", "metrics-start", "identity-resolve"]);
});

test("home project card hydrates after first paint instead of blocking the accepted workbench", async () => {
  const mount = createFakeElement();
  const timers = [];
  const requested = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    requested.push(normalized);
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized.includes("guide-panels")) {
      return "input.mount.createDiv({ text: 'guide panel body' });";
    }
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "guide-deferred-build",
        performance: { viewSourceCache: false },
        homeSettings: {
          widgets: [
            { id: "projects-card", type: "builtin", enabled: true, order: 10, size: "full", source: "guide-panels", props: { sectionMode: "projects" } }
          ]
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.equal(
    requested.some((pathText) => pathText.includes("guide-panels")),
    false,
    "Guide source should not be requested before deferred hydration runs"
  );
  const guideShell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "projects-card");
  assert.ok(guideShell, "Project shell should still keep its configured place on Home");
  const deferredSlot = flattenElements(guideShell).find((el) => el.classList?.contains?.("dashboard-home-deferred-slot"));
  assert.equal(deferredSlot?.attrs?.["data-noria-home-deferred"], "queued");

  await flushQueuedTimers(timers, 4);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    requested.some((pathText) => pathText.includes("guide-panels")),
    true,
    "Guide source should hydrate after the deferred frame"
  );
  assert.match(
    flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" "),
    /guide panel body/,
    JSON.stringify(globalThis.__noriaHomeViewExecutionLast || null)
  );
});

test("home deferred hydration survives a requestAnimationFrame callback dropped during reload", async () => {
  const mount = createFakeElement();
  const timers = [];
  const requested = [];
  let rafCalls = 0;
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    requested.push(normalized);
    if (normalized.endsWith("bootstrap-style.js")) return "";
    if (normalized.includes("guide-panels")) return "input.mount.createDiv({ text: 'recovered guide panel' });";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "guide-dropped-frame-build",
        performance: { viewSourceCache: false },
        homeSettings: {
          widgets: [
            { id: "projects-card", type: "builtin", enabled: true, order: 10, size: "full", source: "guide-panels", props: { sectionMode: "projects" } }
          ]
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      window: {
        moment: {},
        requestAnimationFrame() {
          rafCalls += 1;
          return rafCalls;
        }
      },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.equal(rafCalls > 0, true);
  assert.equal(requested.some((pathText) => pathText.includes("guide-panels")), false);
  await flushQueuedTimers(timers, 4);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requested.some((pathText) => pathText.includes("guide-panels")), true);
  assert.match(flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" "), /recovered guide panel/);
});

test("home facade renders stat widgets from the shared data snapshot", async () => {
  const mount = createFakeElement();
  const snapshotRequests = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "stat-widget-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "weekly-stats",
              type: "stat",
              enabled: true,
              order: 10,
              size: "wide",
              title: "Weekly stats",
              props: {
                range: { mode: "custom", start: "2026-06-01", end: "2026-06-07" },
                metrics: [
                  { id: "tasks.completed", label: "Done" },
                  { id: "tasks.open", label: "Open" },
                  { id: "tasks.completionRate", label: "Rate" },
                  { id: "notes.created", label: "Notes" }
                ]
              }
            }
          ]
        },
        data: {
          async getSnapshot(request = {}, context = {}) {
            snapshotRequests.push({ request: JSON.parse(JSON.stringify(request)), hasCtx: !!context.ctx });
            return {
              range: { start: "2026-06-01", end: "2026-06-07" },
              domains: {
                tasks: { completion: { completed: 7, open: 3, completionRate: 70 } },
                notes: { trend: { totalCreated: 12, totalDiaryWords: 3400 } }
              }
            };
          }
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.deepEqual(snapshotRequests, [
    {
      request: {
        preset: "home",
        range: { mode: "custom", start: "2026-06-01", end: "2026-06-07" },
        granularity: ""
      },
      hasCtx: true
    }
  ]);

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Weekly stats/);
  assert.match(text, /Done/);
  assert.match(text, /7/);
  assert.match(text, /Open/);
  assert.match(text, /3/);
  assert.match(text, /Rate/);
  assert.match(text, /70%/);
  assert.match(text, /Notes/);
  assert.match(text, /12/);
  const statShell = flattenElements(mount).find((el) => el.attrs?.["data-noria-widget-id"] === "weekly-stats");
  assert.ok(statShell?.classList?.contains?.("dashboard-home-widget-shell"));
  assert.equal(statShell.attrs["data-noria-widget-type"], "stat");
  const statCards = flattenElements(mount).filter((el) => el.classList?.contains?.("dashboard-home-stat-card"));
  assert.equal(statCards.length, 4);
  assert.ok(statCards.every((card) => !String(card.style.cssText || "").includes("background:var(--background-primary)")));
});

test("home facade stat widgets request inbox domain for inbox metrics", async () => {
  const mount = createFakeElement();
  const snapshotRequests = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "stat-inbox-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "inbox-stats",
              type: "stat",
              enabled: true,
              order: 10,
              size: "medium",
              title: "Inbox stats",
              props: {
                metrics: [
                  { id: "inbox.total", label: "Inbox" }
                ]
              }
            }
          ]
        },
        data: {
          async getSnapshot(request = {}, context = {}) {
            snapshotRequests.push({ request: JSON.parse(JSON.stringify(request)), hasCtx: !!context.ctx });
            return {
              domains: {
                inbox: { summary: { total: 5 } }
              }
            };
          }
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.deepEqual(snapshotRequests, [
    {
      request: {
        preset: "home",
        range: { mode: "homeCurrent" },
        granularity: "",
        include: ["notes", "tasks", "dailyState", "habits", "workload", "inbox"]
      },
      hasCtx: true
    }
  ]);

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Inbox stats/);
  assert.match(text, /Inbox/);
  assert.match(text, /5/);
});

test("home facade stat widgets request projects domain for project metrics", async () => {
  const mount = createFakeElement();
  const snapshotRequests = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "stat-projects-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "project-stats",
              type: "stat",
              enabled: true,
              order: 10,
              size: "medium",
              title: "Project stats",
              props: {
                metrics: [
                  { id: "projects.active", label: "Active projects" },
                  { id: "projects.open", label: "Open project tasks" }
                ]
              }
            }
          ]
        },
        data: {
          async getSnapshot(request = {}, context = {}) {
            snapshotRequests.push({ request: JSON.parse(JSON.stringify(request)), hasCtx: !!context.ctx });
            return {
              domains: {
                projects: { summary: { activeCount: 4, taskOpen: 9 } }
              }
            };
          }
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.deepEqual(snapshotRequests, [
    {
      request: {
        preset: "home",
        range: { mode: "homeCurrent" },
        granularity: "",
        include: ["notes", "tasks", "dailyState", "habits", "workload", "projects"]
      },
      hasCtx: true
    }
  ]);

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Project stats/);
  assert.match(text, /Active projects/);
  assert.match(text, /4/);
  assert.match(text, /Open project tasks/);
  assert.match(text, /9/);
});

test("home facade stat widgets request habits domain for habit metrics", async () => {
  const mount = createFakeElement();
  const snapshotRequests = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "stat-habits-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "habit-stats",
              type: "stat",
              enabled: true,
              order: 10,
              size: "medium",
              title: "Habit stats",
              props: {
                metrics: [
                  { id: "habits.completionRate", label: "Habit completion" },
                  { id: "habits.streak", label: "Habit streak" }
                ]
              }
            }
          ]
        },
        data: {
          async getSnapshot(request = {}, context = {}) {
            snapshotRequests.push({ request: JSON.parse(JSON.stringify(request)), hasCtx: !!context.ctx });
            return {
              domains: {
                habits: { summary: { completionRate: 66.7, currentStreak: 3 } }
              }
            };
          }
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.deepEqual(snapshotRequests, [
    {
      request: {
        preset: "home",
        range: { mode: "homeCurrent" },
        granularity: "",
        include: ["notes", "tasks", "dailyState", "habits", "workload"]
      },
      hasCtx: true
    }
  ]);

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Habit stats/);
  assert.match(text, /Habit completion/);
  assert.match(text, /66.7%/);
  assert.match(text, /Habit streak/);
  assert.match(text, /3/);
});

test("home facade stat widgets request vault health domain for vault metrics", async () => {
  const mount = createFakeElement();
  const snapshotRequests = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) return "";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      mount,
      noriaBridge: {
        runtimeBuildId: "stat-vault-health-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            {
              id: "vault-health-stats",
              type: "stat",
              enabled: true,
              order: 10,
              size: "medium",
              title: "Vault health",
              props: {
                metrics: [
                  { id: "vault.missingTags", label: "Missing tags" },
                  { id: "vault.brokenLinks", label: "Broken links" },
                  { id: "vault.tagCoverage", label: "Tag coverage" }
                ]
              }
            }
          ]
        },
        data: {
          async getSnapshot(request = {}, context = {}) {
            snapshotRequests.push({ request: JSON.parse(JSON.stringify(request)), hasCtx: !!context.ctx });
            return {
              domains: {
                vaultHealth: { summary: { missingTags: 1, brokenLinks: 2, tagCoverage: 75 } }
              }
            };
          }
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: loadSource },
      container: mount,
      paragraph() {}
    },
    app: {
      vault: {
        adapter: { read: loadSource }
      }
    },
    globals: {
      window: { moment: {} },
      document: {
        getElementById: () => null,
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.deepEqual(snapshotRequests, [
    {
      request: {
        preset: "home",
        range: { mode: "homeCurrent" },
        granularity: "",
        include: ["notes", "tasks", "dailyState", "habits", "workload", "vaultHealth"]
      },
      hasCtx: true
    }
  ]);

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Vault health/);
  assert.match(text, /Missing tags/);
  assert.match(text, /1/);
  assert.match(text, /Broken links/);
  assert.match(text, /2/);
  assert.match(text, /Tag coverage/);
  assert.match(text, /75%/);
});

test("home facade accumulates bounded performance samples with percentile summary", async () => {
  const keys = [
    "__noriaHomePerformanceLast",
    "__noriaHomePerformanceCurrent",
    "__noriaHomePerformanceSamples",
    "__noriaHomePerformanceSummary",
    "__noriaHomeViewSourceTextCache",
    "__noriaHomeViewSourceTextCacheBuildId",
    "__noriaHomeViewSourceTextPending",
    "__noriaHomeViewSourceTextPendingBuildId",
    "__noriaHomeViewRunCache",
    "__noriaHomeViewRunCacheBuildId"
  ];
  const previous = new Map(keys.map((key) => [key, globalThis[key]]));
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.endsWith("bootstrap-style.js")) {
      return "input.mount.createDiv({ text: 'bootstrap' });";
    }
    if (normalized.endsWith("custom-view.js")) {
      return "input.mount.createDiv({ text: 'custom view' });";
    }
    return "";
  };
  try {
    for (const key of keys) delete globalThis[key];
    let now = 0;
    const fakePerformance = {
      now() {
        now += 11;
        return now;
      }
    };
    for (let i = 0; i < 3; i += 1) {
      const mount = createFakeElement();
      await runRuntimeSource("views/dashboard/home/view.js", {
        input: {
          mount,
          noriaBridge: {
            runtimeBuildId: "perf-samples-build",
            allowCustomJsViews: true,
            performance: {
              homeLazySections: false,
              homeDashboardBaselineSampleLimit: 2
            },
            homeSettings: {
              widgets: [
                { id: "notes", type: "markdown", enabled: true, order: 10, size: "medium", source: "Dashboard/Note.md" },
                { id: "custom", type: "view", enabled: true, order: 20, size: "medium", source: "Dashboard/custom-view" }
              ]
            },
            t(key, params = {}) {
              return params.path ? `${key}:${params.path}` : key;
            }
          }
        },
        ctxFallback: {
          io: { load: loadSource },
          container: mount,
          paragraph() {}
        },
        app: {
          vault: {
            adapter: {
              async read(pathText) {
                return String(pathText || "").endsWith("Dashboard/Note.md") ? "sample note" : "";
              }
            }
          }
        },
        globals: {
          window: { moment: {} },
          document: {
            getElementById: () => null,
            createElement: (tag) => createFakeElement(tag),
            head: createFakeElement("head")
          }
        },
        globals: {
          performance: fakePerformance
        }
      });
    }

    const samples = globalThis.__noriaHomePerformanceSamples;
    const summary = globalThis.__noriaHomePerformanceSummary;
    assert.equal(samples.length, 2);
    assert.equal(samples.every((sample) => sample.buildId === "perf-samples-build"), true);
    assert.equal(summary.type, "home-dashboard-summary");
    assert.equal(summary.buildId, "perf-samples-build");
    assert.equal(summary.sampleCount, 2);
    assert.ok(summary.total.p50Ms >= 0);
    assert.ok(summary.total.p95Ms >= summary.total.p50Ms);
    assert.ok(summary.hot.count >= 1);
    assert.equal(summary.last.status, globalThis.__noriaHomePerformanceLast.status);
    assert.equal(summary.last.totalMs, globalThis.__noriaHomePerformanceLast.totalMs);
    assert.ok(summary.io.avgCacheHit >= 0);
    assert.ok(Array.isArray(summary.slowest.widgets));
    assert.ok(Array.isArray(summary.slowest.sections));
    assert.ok(summary.slowest.widgets.some((entry) => entry.id === "markdown:notes"));
    assert.ok(summary.slowest.widgets.some((entry) => entry.id === "view:custom"));
    assert.equal(summary.slowest.sections.some((entry) => String(entry.id).includes("bootstrap-style")), false);
    assert.ok(summary.slowest.widgets.every((entry) => entry.count >= 1 && entry.avgMs >= 0 && entry.p95Ms >= 0 && entry.maxMs >= 0));
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test("home runtime cache clearing drops shared dashboard core boot globals", () => {
  const mainSource = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const start = mainSource.indexOf("\n  clearNoriaHomeRuntimeCaches(");
  assert.notEqual(start, -1, "clearNoriaHomeRuntimeCaches method should exist");
  const end = mainSource.indexOf("\n  getNoriaLocale(", start + 1);
  assert.notEqual(end, -1, "clearNoriaHomeRuntimeCaches method should end before getNoriaLocale");
  const methodSource = mainSource.slice(start, end).trim();
  const PluginClass = new Function(`return class TestPlugin { ${methodSource} };`);
  const plugin = new (PluginClass())();
  const keys = [
    "__noriaHomeViewSourceTextCache",
    "__noriaHomeViewSourceTextCacheBuildId",
    "__noriaHomeViewSourceTextPending",
    "__noriaHomeViewSourceTextPendingBuildId",
    "__noriaHomeViewRunCache",
    "__noriaHomeViewRunCacheBuildId",
    "__noriaHomeViewCacheBuildId",
    "__noriaHomeViewExecutionLast",
    "__noriaViewExecutionLast",
    "__noriaHomeRuntimeLoaded",
    "__noriaHomeRefreshBus",
    "__noriaHomeTrendsRangeBus",
    "__noriaHomeTrendsSourceState",
    "__noriaHomeTrendsRunCache",
    "__noriaHomeTrendsRunCacheBuildId",
    "__noria_home_trends_chart_core_boot_v1",
    "__noria_home_trends_chart_core_boot_build_v1",
    "__noria_periodic_stats_core_boot_v1",
    "__noria_periodic_stats_core_boot_build_v1",
    "__noria_periodic_stats_view_run_cache_v1",
    "__noria_periodic_stats_view_run_cache_build_v1",
    "__noriaPeriodicStatusServiceLoadState",
    "__noriaWeatherServiceLoadError",
    "__noria_data_service_cache_v1",
    "__noria_home_note_trend_cache_v1",
    "__noria_home_overview_metrics_cache_v1",
    "__noria_periodic_stats_metrics_cache_v1",
    "__noriaTaskCalendarAdapterLoadState",
    "__noriaTaskCalendarUi",
    "__noriaTasksCalendarApi",
    "__noriaTaskTimelineModules",
    "__noriaTaskTimelineSourceCache",
    "__noriaTaskTimelineSourceCacheBuildId",
    "__noria_home_core_boot_v1",
    "__noriaHomeCoreBootBuildId",
    "__noriaManagerUiKit",
    "dashboardCore"
  ];
  const previous = new Map(keys.map((key) => [key, globalThis[key]]));
  try {
    for (const key of keys) globalThis[key] = { stale: true };
    globalThis.__noriaHomeViewSourceTextCache = new Map();
    globalThis.__noriaHomeViewSourceTextCacheBuildId = "old-build";
    globalThis.__noriaHomeViewSourceTextPending = new Map();
    globalThis.__noriaHomeViewSourceTextPendingBuildId = "old-build";
    globalThis.__noriaHomeViewRunCache = new Map();
    globalThis.__noriaHomeViewRunCacheBuildId = "old-build";
    globalThis.__noriaHomeViewCacheBuildId = "old-build";
    globalThis.__noriaHomeViewExecutionLast = { stale: true };
    globalThis.__noriaViewExecutionLast = { stale: true };
    globalThis.__noria_home_core_boot_v1 = { buildId: "old-build", loaded: new Set(["old-theme"]) };
    globalThis.__noriaHomeCoreBootBuildId = "old-build";
    globalThis.__noriaManagerUiKit = { stale: true };
    globalThis.dashboardCore = { theme: { home: { overview: { stale: true } } } };

    plugin.clearNoriaHomeRuntimeCaches();

    for (const key of keys) {
      assert.equal(globalThis[key], undefined, `${key} should be cleared`);
    }
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test("home item view invokes runtime widget cleanup before rerender and close", () => {
  const mainSource = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const start = mainSource.indexOf("class NoriaHomeView");
  const end = mainSource.indexOf("class NoriaStatsView", start);
  assert.notEqual(start, -1, "NoriaHomeView should exist");
  assert.notEqual(end, -1, "NoriaHomeView block should end before stats view");
  const homeClass = mainSource.slice(start, end);

  assert.match(homeClass, /this\.hostEl\?\.__noriaHomeCleanup\?\.\(\)/);
  assert.match(homeClass, /this\.containerEl\.empty\(\)/);
  assert.match(homeClass, /async onClose\(\)[\s\S]*this\.hostEl\?\.__noriaHomeCleanup\?\.\(\)/);
});

test("task board item view disposes the mounted runtime before rerender and close", () => {
  const mainSource = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const start = mainSource.indexOf("class NoriaTasksView");
  const end = mainSource.indexOf("class NoriaTaskTimelineView", start);
  assert.notEqual(start, -1, "NoriaTasksView should exist");
  assert.notEqual(end, -1, "NoriaTasksView block should end before task timeline view");
  const tasksClass = mainSource.slice(start, end);

  assert.match(tasksClass, /cleanupNoriaTasksRuntime\(rootOverride = null\)/);
  assert.match(tasksClass, /\.tasksCalendar/);
  assert.match(tasksClass, /__noriaTasksCalendarCleanup/);
  assert.match(tasksClass, /async reload\(\)[\s\S]*this\.cleanupNoriaTasksRuntime\(\)[\s\S]*this\.containerEl\.empty\(\)/);
  assert.match(tasksClass, /async onOpen\(\)[\s\S]*this\.cleanupNoriaTasksRuntime\(\)[\s\S]*this\.containerEl\.empty\(\)/);
  assert.match(tasksClass, /async onClose\(\)[\s\S]*this\.cleanupNoriaTasksRuntime\(\)/);
});

test("task board runtime cleanup releases persistent resources and is idempotent", () => {
  const runtime = readSource("views/tasks-calendar/runtime-core.js");

  assert.match(runtime, /rootNode\.__noriaTasksCalendarCleanup\s*=\s*cleanupTasksCalendarRuntime/);
  assert.match(runtime, /function cleanupTasksCalendarRuntime\(\)/);
  assert.match(runtime, /tcRuntimeDisposed/);
  assert.match(runtime, /clearStartupTaskRecoveryTimers\(\)/);
  assert.match(runtime, /clearFreshTaskInvalidationEvent\(\)/);
  assert.match(runtime, /clearTasksCalendarWakeHydration\(\)/);
  assert.match(runtime, /tcVisibleIo\.disconnect\(\)/);
  assert.match(runtime, /tcCellMo\.disconnect\(\)/);
  assert.match(runtime, /tcMonthLayoutRo\.disconnect\(\)/);
  assert.match(runtime, /unbindPlannerChromeNowNeedleListeners\(\)/);
  assert.match(runtime, /clearInterval\(rootNode\._noriaNowNeedleTimer\)/);
  assert.match(runtime, /cancelAnimationFrame\(weekLanesFinalizeRaf\)/);
  assert.match(runtime, /cancelAnimationFrame\(overlapRelayoutRaf\)/);
  assert.match(runtime, /cancelAnimationFrame\(monthCompactTimeSyncRaf\)/);
});

test("home core boot state is scoped by runtime build id", () => {
  const homeFacade = readSource("views/dashboard/home/view.js");

  assert.match(homeFacade, /CORE_BOOT_BUILD_KEY/);
  assert.match(homeFacade, /__noriaHomeCoreBootBuildId/);
  assert.match(homeFacade, /buildId:\s*homeRuntimeBuildId/);
  assert.match(homeFacade, /delete g\.dashboardCore/);
  assert.match(homeFacade, /delete g\.__noriaManagerUiKit/);
});

test("home core boot leaves trend-only chart components to the lazy Trends surface", () => {
  const homeFacade = readSource("views/dashboard/home/view.js");
  const trendsView = readSource("views/dashboard/home/sections/trends-and-stats/view.js");
  const coreStart = homeFacade.indexOf("const coreFiles = [");
  const coreEnd = homeFacade.indexOf("];", coreStart);
  assert.ok(coreStart >= 0 && coreEnd > coreStart, "Home coreFiles should be declared");
  const homeCoreBlock = homeFacade.slice(coreStart, coreEnd);

  for (const trendOnlyPath of [
    "chart-palette.js",
    "dual-axis-svg-chart.js",
    "strip-heat-series.js",
    "stacked-distribution-bar.js",
    "leader-donut-chart.js",
    "year-heatmap-calendar.js",
    "chart-adapter.js"
  ]) {
    assert.doesNotMatch(homeCoreBlock, new RegExp(trendOnlyPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(trendsView, /TRENDS_CHART_CORE_FILES/);
  assert.match(trendsView, /chart-palette\.js/);
  assert.match(trendsView, /leader-donut-chart\.js/);
  assert.match(trendsView, /year-heatmap-calendar\.js/);
  assert.match(trendsView, /const\s+chartCoreReady\s*=\s*ensureTrendsChartCoreLoaded\(\)/);
  assert.match(trendsView, /await\s+chartCoreReady/);
});

test("home bootstrap style replaces stale style tags for new runtime builds", async () => {
  const staleStyle = createFakeElement("style");
  staleStyle.id = "dashboard-compact-spacing";
  staleStyle.textContent = "old css";
  staleStyle.setAttr("data-noria-runtime-build-id", "old-build");

  await runRuntimeSource("views/dashboard/home/sections/bootstrap-style/view.js", {
    input: {
      noriaBridge: { runtimeBuildId: "new-build" }
    },
    ctxFallback: { container: createFakeElement() },
    app: {},
    globals: {
      window: {},
      document: {
        getElementById(id) {
          return id === "dashboard-compact-spacing" ? staleStyle : null;
        },
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.match(staleStyle.textContent, /--moc-chip-fill/);
  assert.equal(staleStyle.attrs["data-noria-runtime-build-id"], "new-build");
});

test("home facade skips heavy bootstrap style source when current style sentinel exists", async () => {
  const existingStyle = createFakeElement("style");
  existingStyle.id = "dashboard-compact-spacing";
  existingStyle.textContent = ":root{--dash-radius:12px}.dashboard-countdown-hero-days-v2{}";
  existingStyle.setAttr("data-noria-runtime-build-id", "style-sentinel-build");
  const requested = [];
  const loadSource = async (pathText) => {
    const normalized = String(pathText || "").replace(/\\/g, "/").replace(/^\/+/, "");
    requested.push(normalized);
    if (normalized.includes("/bootstrap-style")) {
      throw new Error("bootstrap style source should not be loaded when current style exists");
    }
    if (normalized.endsWith("home-identity.js")) return "input.mount.createDiv({ text: 'identity' });";
    if (normalized.endsWith("overview-metrics.js")) return "input.mount.createDiv({ text: 'metrics' });";
    return "";
  };

  await runRuntimeSource("views/dashboard/home/view.js", {
    input: {
      noriaBridge: {
        runtimeBuildId: "style-sentinel-build",
        performance: { viewSourceCache: false, homeLazySections: false },
        homeSettings: {
          widgets: [
            { id: "identity", type: "builtin", enabled: true, order: 10, size: "wide", source: "home-identity" },
            { id: "metrics", type: "builtin", enabled: true, order: 20, size: "wide", source: "overview-metrics" }
          ]
        }
      }
    },
    ctxFallback: { io: { load: loadSource }, container: createFakeElement(), paragraph() {} },
    app: { vault: { adapter: { read: loadSource } } },
    globals: {
      window: {},
      document: {
        getElementById(id) {
          return id === "dashboard-compact-spacing" ? existingStyle : null;
        },
        createElement: (tag) => createFakeElement(tag),
        head: createFakeElement("head")
      }
    }
  });

  assert.equal(requested.some((item) => item.includes("/bootstrap-style")), false);
});

test("home dashboard CSS ships in the plugin stylesheet instead of blocking Home render", () => {
  const home = readSource("views/dashboard/home/view.js");
  const styles = readSource("styles.css");
  const ensureBlock = home.match(/async function ensureHomeBootstrapStyle\(\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(styles, /NORIA_HOME_DASHBOARD_CSS_START/);
  assert.match(styles, /--dash-radius:\s*12px/);
  assert.match(styles, /dashboard-countdown-hero-days-v2/);
  assert.doesNotMatch(ensureBlock, /renderSection\([^\n]*bootstrap-style/);
});

test("home metric cards keep solid surfaces but use bright accent numbers", () => {
  const theme = readSource("views/dashboard/core/theme/dashboard-theme.js");
  const overviewMetrics = readSource("views/dashboard/home/sections/overview-metrics/view.js");

  assert.doesNotMatch(theme, /metricsCardShadow(?:Hero)?:\s*"[^"]*rgba\(30,\s*(?:58|64),\s*138/);
  assert.doesNotMatch(theme, /metricsCardShadow(?:Hero)?:\s*"[^"]*rgba\(30,\s*64,\s*175/);

  for (const block of [
    extractBlock(theme, "metricCardStylesHero: [", "metricCardStyles: ["),
    extractBlock(overviewMetrics, "const defaultHeroMetricStyles = [")
  ]) {
    assert.match(block, /background:\s*"var\(--dash-surface-raised/);
    assert.doesNotMatch(block, /background:\s*"[^"]*--noria-module-/);
    assert.doesNotMatch(block, /rgba\(30,\s*(?:58|64),\s*138/);
    assert.doesNotMatch(block, /rgba\(30,\s*64,\s*175/);
    assert.doesNotMatch(block, /(?:linear|radial)-gradient/i);
    assert.doesNotMatch(block, /accent:\s*"color-mix\(in srgb,\s*var\(--text-normal\)/);
    assert.match(block, /accent:\s*"var\(--noria-module-home/);
    assert.match(block, /accent:\s*"var\(--noria-module-tasks/);
  }
});

test("home overview word metric caches file lengths by path and mtime", () => {
  const overviewMetrics = readSource("views/dashboard/home/sections/overview-metrics/view.js");

  assert.match(overviewMetrics, /metricsCache\.byPath/);
  assert.match(overviewMetrics, /cached\.mtime === mtime/);
  assert.match(overviewMetrics, /delete metricsCache\.byPath\[pathText\]/);
  assert.doesNotMatch(overviewMetrics, /metricsCache\.key === metricsCacheKey/);
});

test("home overview word metric reads uncached files in bounded parallel", () => {
  const overviewMetrics = readSource("views/dashboard/home/sections/overview-metrics/view.js");
  const metricLoopStart = overviewMetrics.indexOf("for (const p of metricPages)");
  const cleanupStart = overviewMetrics.indexOf("for (const pathText of Object.keys(metricsCache.byPath))", metricLoopStart);
  assert.ok(metricLoopStart > 0 && cleanupStart > metricLoopStart, "overview metric file loop should precede cache cleanup");
  const metricLoopBlock = overviewMetrics.slice(metricLoopStart, cleanupStart);

  assert.match(overviewMetrics, /async function runOverviewMetricReadQueue/);
  assert.match(overviewMetrics, /Math\.min\(limit,\s*queue\.length\)/);
  assert.match(overviewMetrics, /const overviewMetricReadJobs\s*=\s*\[\]/);
  assert.match(metricLoopBlock, /overviewMetricReadJobs\.push\(async \(\) =>/);
  assert.match(overviewMetrics, /await runOverviewMetricReadQueue\(overviewMetricReadJobs\)/);
  assert.doesNotMatch(metricLoopBlock, /\n\s{2}let length = 0;\s*\n\s{2}try\s*\{\s*\n\s{4}const c = await ctx\.io\.load\(pathText\)/);
});

test("home decorative first-screen surfaces do not use inline background gradients", () => {
  const files = [
    "views/dashboard/home/sections/overview-columns/view.js",
    "views/dashboard/home/sections/guide-panels/view.js",
    "views/dashboard/home/sections/moc-chips/view.js"
  ];

  for (const rel of files) {
    const source = readSource(rel);
    assert.doesNotMatch(source, /background:\s*(?:linear|radial)-gradient/i, rel);
  }
});

test("home identity resolves vault avatars robustly and falls back on image load errors", () => {
  const identity = readSource("views/dashboard/home/sections/home-identity/view.js");

  assert.match(identity, /resolveAvatarResource/);
  assert.match(identity, /getFirstLinkpathDest/);
  assert.match(identity, /99_Attachment\/\$\{base\.split\("\/"\)\.pop\(\)\}/);
  assert.match(identity, /img\.onerror\s*=/);
  assert.match(identity, /__noriaHomeAvatarLastError/);
  assert.match(identity, /renderAvatarFallback/);
});

test("home identity avatar resolver falls back when Obsidian resourcePath is unavailable", async () => {
  const avatarPath = "99_Attachment/乙辛Zmod31头像.jpg";
  const avatarFile = { path: avatarPath, name: "乙辛Zmod31头像.jpg", extension: "jpg" };
  const mount = createFakeElement();

  await runRuntimeSource("views/dashboard/home/sections/home-identity/view.js", {
    input: {
      mount,
      noriaBridge: {
        homeSettings: {
          identity: {
            displayName: "乙辛",
            avatarPath,
            quoteListPath: "02_Areas/知识库管理/Quotes.md"
          }
        },
        t(key, params = {}) {
          if (key === "runtime.home.identity.welcome") return `${params.name}, 欢迎您！`;
          if (key === "runtime.home.identity.avatarAlt") return `${params.name} avatar`;
          if (key === "runtime.home.identity.quoteFallback") return "fallback quote";
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async () => "- quote" },
      container: createFakeElement()
    },
    app: {
      metadataCache: {
        getFirstLinkpathDest: () => null
      },
      vault: {
        getAbstractFileByPath(pathText) {
          return pathText === avatarPath ? avatarFile : null;
        },
        getResourcePath() {
          return "";
        },
        adapter: {
          readBinary: async () => new Uint8Array([255, 216, 255, 217]).buffer
        }
      }
    },
    globals: {
      dashboardCore: { theme: { home: { overview: { identity: {} } } } },
      window: { obsidian: null },
      document: { createElement: (tag) => createFakeElement(tag) }
    }
  });

  const images = flattenElements(mount).filter((el) => el.tagName === "img");
  assert.equal(images.length, 1);
  assert.match(images[0].src || images[0].attrs.src || "", /^data:image\/jpeg;base64,/);
});

test("home identity tries the binary avatar source when the first resource URL fails to load", async () => {
  const avatarPath = "99_Attachment/乙辛Zmod31头像.jpg";
  const avatarFile = { path: avatarPath, name: "乙辛Zmod31头像.jpg", extension: "jpg" };
  const mount = createFakeElement();
  let readBinaryCalls = 0;

  await runRuntimeSource("views/dashboard/home/sections/home-identity/view.js", {
    input: {
      mount,
      noriaBridge: {
        homeSettings: {
          identity: {
            displayName: "乙辛",
            avatarPath,
            quoteListPath: "02_Areas/知识库管理/Quotes.md"
          }
        },
        t(key, params = {}) {
          if (key === "runtime.home.identity.welcome") return `${params.name}, 欢迎您！`;
          if (key === "runtime.home.identity.avatarAlt") return `${params.name} avatar`;
          if (key === "runtime.home.identity.quoteFallback") return "fallback quote";
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async () => "- quote" },
      container: createFakeElement()
    },
    app: {
      metadataCache: {
        getFirstLinkpathDest: () => null
      },
      vault: {
        getAbstractFileByPath(pathText) {
          return pathText === avatarPath ? avatarFile : null;
        },
        getResourcePath() {
          return "app://local-resource/avatar";
        },
        readBinary: async () => {
          readBinaryCalls += 1;
          return new Uint8Array([255, 216, 255, 217]).buffer;
        },
        adapter: {}
      }
    },
    globals: {
      dashboardCore: { theme: { home: { overview: { identity: {} } } } },
      window: { obsidian: null },
      document: { createElement: (tag) => createFakeElement(tag) }
    }
  });

  let images = flattenElements(mount).filter((el) => el.tagName === "img");
  assert.equal(images.length, 1);
  assert.equal(images[0].src || images[0].attrs.src || "", "app://local-resource/avatar");
  assert.equal(typeof images[0].onerror, "function");
  assert.equal(readBinaryCalls, 0, "resource URL path should not eagerly read avatar binary fallback");

  await images[0].onerror({ type: "error" });
  await new Promise((resolve) => setImmediate(resolve));

  images = flattenElements(mount).filter((el) => el.tagName === "img");
  const fallbackInitials = flattenElements(mount).filter((el) => el.classList.contains("dashboard-identity-avatar"));
  assert.equal(images.length, 1);
  assert.match(images[0].src || images[0].attrs.src || "", /^data:image\/jpeg;base64,/);
  assert.equal(fallbackInitials.length, 0);
  assert.equal(readBinaryCalls, 1, "binary fallback should be read only after the resource URL fails");
  assert.equal(globalThis.__noriaHomeAvatarLastError?.failedCandidate?.kind, "vault-resource");
  assert.equal(globalThis.__noriaHomeAvatarLastError?.state, "retrying");
});

test("home identity records loaded avatar diagnostics after a source succeeds", async () => {
  const avatarPath = "99_Attachment/乙辛Zmod31头像.jpg";
  const avatarFile = { path: avatarPath, name: "乙辛Zmod31头像.jpg", extension: "jpg" };
  const mount = createFakeElement();

  delete globalThis.__noriaHomeAvatarLastError;
  await runRuntimeSource("views/dashboard/home/sections/home-identity/view.js", {
    input: {
      mount,
      noriaBridge: {
        homeSettings: {
          identity: {
            displayName: "乙辛",
            avatarPath,
            quoteListPath: "02_Areas/知识库管理/Quotes.md"
          }
        },
        t(key, params = {}) {
          if (key === "runtime.home.identity.welcome") return `${params.name}, 欢迎您！`;
          if (key === "runtime.home.identity.avatarAlt") return `${params.name} avatar`;
          if (key === "runtime.home.identity.quoteFallback") return "fallback quote";
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async () => "- quote" },
      container: createFakeElement()
    },
    app: {
      metadataCache: {
        getFirstLinkpathDest: () => null
      },
      vault: {
        getAbstractFileByPath(pathText) {
          return pathText === avatarPath ? avatarFile : null;
        },
        getResourcePath() {
          return "app://local-resource/avatar";
        },
        adapter: {}
      }
    },
    globals: {
      dashboardCore: { theme: { home: { overview: { identity: {} } } } },
      window: { obsidian: null },
      document: { createElement: (tag) => createFakeElement(tag) }
    }
  });

  const images = flattenElements(mount).filter((el) => el.tagName === "img");
  assert.equal(images.length, 1);
  assert.equal(typeof images[0].onload, "function");
  images[0].onload();
  assert.equal(globalThis.__noriaHomeAvatarLastError?.state, "loaded");
  assert.equal(globalThis.__noriaHomeAvatarLastError?.sourceKind, "vault-resource");
  delete globalThis.__noriaHomeAvatarLastError;
});

test("home identity schedules weather hydration after first paint", () => {
  const homeIdentity = readSource("views/dashboard/home/sections/home-identity/view.js");
  const weatherBlock = homeIdentity.slice(
    homeIdentity.indexOf("const runtimeWeather = globalThis.__noriaRuntimeBridge?.weather || {};"),
    homeIdentity.indexOf("// 摘录区改为放置在概览四卡区域")
  );

  assert.match(homeIdentity, /function nextHomeWeatherFrame\(\)/);
  assert.match(homeIdentity, /requestAnimationFrame/);
  assert.match(weatherBlock, /setWeatherState\("scheduled"\)/);
  assert.match(weatherBlock, /await nextHomeWeatherFrame\(\)/);
  assert.match(weatherBlock, /void scheduleHomeWeatherHydration\(\)\.catch/);
  assert.doesNotMatch(weatherBlock, /const service = await ensureWeatherService\(\);\s*if \(!service/);
  assert.doesNotMatch(weatherBlock, /await renderWeather\(\);\s*const refreshMs/);
});

test("home identity weather service loading shares build-bound pending state", () => {
  const homeIdentity = readSource("views/dashboard/home/sections/home-identity/view.js");
  const serviceBlock = homeIdentity.slice(
    homeIdentity.indexOf("async function ensureWeatherService()"),
    homeIdentity.indexOf("function nextHomeWeatherFrame()")
  );

  assert.match(homeIdentity, /HOME_IDENTITY_RUNTIME_BUILD_ID/);
  assert.match(homeIdentity, /__noriaPeriodicStatusServiceLoadState/);
  assert.match(homeIdentity, /recordHomeIdentityWeatherServiceLoad/);
  assert.match(serviceBlock, /state\.pending/);
  assert.match(serviceBlock, /return state\.pending/);
  assert.match(serviceBlock, /status:\s*"loading"/);
  assert.doesNotMatch(serviceBlock, /const p = .*weather-service\.js/);
  assert.doesNotMatch(serviceBlock, /const code = await loadText\(p\)/);
});

test("home identity weather line shows current temperature and range without adding a card", async () => {
  const mount = createFakeElement();
  const weatherPayload = {
    city: "北京",
    mappedWeather: "晴",
    currentTemp: "24",
    tempMin: "18",
    tempMax: "29",
    humidity: "57",
    ip: "1.2.3.4",
    source: "qweather"
  };
  const intervals = [];
  const timers = [];

  await runRuntimeSource("views/dashboard/home/sections/home-identity/view.js", {
    input: {
      mount,
      noriaBridge: {
        homeSettings: {
          identity: {
            displayName: "乙辛",
            avatarPath: "",
            quoteListPath: ""
          }
        },
        t(key, params = {}) {
          if (key === "runtime.home.identity.welcome") return `${params.name}, 欢迎您！`;
          if (key === "runtime.home.identity.avatarAlt") return `${params.name} avatar`;
          if (key === "runtime.home.identity.quoteFallback") return "fallback quote";
          if (key === "runtime.home.weather.loading") return "天气信息加载中...";
          if (key === "runtime.home.weather.autoLocation") return "自动定位";
          if (key === "runtime.home.weather.humidity") return `湿度 ${params.value}%`;
          if (key === "runtime.home.weather.unavailableShort") return "天气信息暂不可用";
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async () => "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath: () => null,
        getResourcePath: () => ""
      },
      metadataCache: {
        getFirstLinkpathDest: () => null
      }
    },
    globals: {
      __noriaRuntimeBridge: {
        weather: { enabled: true, autoWriteDaily: false, cacheMinutes: 5 }
      },
      dashboardCore: {
        theme: { home: { overview: { identity: {} } } },
        utils: {
          weatherService: {
            getWeatherForDate: async () => weatherPayload,
            getWeatherForHome: async () => weatherPayload
          }
        }
      },
      setInterval: (fn, ms) => {
        intervals.push({ fn, ms });
        return intervals.length;
      },
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearInterval: () => {},
      window: { obsidian: null, requestAnimationFrame: () => 1 },
      document: { createElement: (tag) => createFakeElement(tag) }
    }
  });

  const weatherLines = flattenElements(mount).filter((el) => el.classList.contains("dashboard-hero-weather-inline__line"));
  assert.equal(weatherLines.length, 1);
  const line = weatherLines[0];
  assert.equal(line.attrs["data-noria-weather-state"], "scheduled");
  await flushQueuedTimers(timers);
  assert.match(line.textContent, /北京/);
  assert.match(line.textContent, /24℃/);
  assert.match(line.textContent, /18[~–]29℃/);
  assert.match(line.textContent, /湿度 57%/);
  assert.doesNotMatch(line.textContent, /IP 1\.2\.3\.4/);
  assert.equal(line.attrs["data-noria-weather-current-temp"], "24");
  assert.equal(line.attrs["data-noria-weather-temp-min"], "18");
  assert.equal(line.attrs["data-noria-weather-temp-max"], "29");
  assert.equal(line.attrs["data-noria-weather-ip"], "1.2.3.4");
  assert.equal(line.attrs["data-noria-weather-source"], "qweather");
  assert.equal(
    flattenElements(mount).filter((el) => el.classList.contains("dashboard-hero-weather")).length,
    0
  );
});

test("home identity weather failure stays low priority while preserving diagnostics", async () => {
  const mount = createFakeElement();
  const timers = [];
  let weatherCalls = 0;

  await runRuntimeSource("views/dashboard/home/sections/home-identity/view.js", {
    input: {
      mount,
      noriaBridge: {
        homeSettings: {
          identity: {
            displayName: "乙辛",
            avatarPath: "",
            quoteListPath: ""
          }
        },
        t(key, params = {}) {
          if (key === "runtime.home.identity.welcome") return `${params.name}, 欢迎您！`;
          if (key === "runtime.home.identity.avatarAlt") return `${params.name} avatar`;
          if (key === "runtime.home.identity.quoteFallback") return "fallback quote";
          if (key === "runtime.home.weather.loading") return "天气信息加载中...";
          if (key === "runtime.home.weather.unavailableShort") return "天气信息暂不可用";
          if (key === "runtime.home.weather.requestFailed") return "天气请求失败";
          if (key === "runtime.home.weather.humidity") return `湿度 ${params.value}%`;
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async () => "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath: () => null,
        getResourcePath: () => ""
      },
      metadataCache: {
        getFirstLinkpathDest: () => null
      }
    },
    globals: {
      __noriaRuntimeBridge: {
        weather: { enabled: true, autoWriteDaily: false, cacheMinutes: 5 }
      },
      dashboardCore: {
        theme: { home: { overview: { identity: {} } } },
        utils: {
          weatherService: {
            getWeatherForDate: async () => {
              weatherCalls += 1;
              throw new Error("QWeather timeout");
            },
            getWeatherForHome: async () => {
              throw new Error("QWeather timeout");
            }
          }
        }
      },
      setInterval: () => 1,
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearInterval: () => {},
      window: { obsidian: null },
      document: { createElement: (tag) => createFakeElement(tag) }
    }
  });

  const weatherLines = flattenElements(mount).filter((el) => el.classList.contains("dashboard-hero-weather-inline__line"));
  assert.equal(weatherLines.length, 1);
  const line = weatherLines[0];
  assert.equal(line.attrs["data-noria-weather-state"], "scheduled");
  await flushQueuedTimers(timers);
  assert.equal(weatherCalls, 2, "initial weather failure should trigger one bounded retry");
  assert.equal(line.textContent, "天气信息暂不可用");
  assert.equal(line.attrs["data-noria-weather-state"], "failed");
  assert.match(line.attrs["data-noria-weather-error"], /QWeather timeout/);
  assert.match(line.title || "", /QWeather timeout/);
  assert.doesNotMatch(line.textContent, /失败|错误|timeout/i);
  assert.equal(
    flattenElements(mount).filter((el) => el.classList.contains("dashboard-hero-weather")).length,
    0
  );
});

test("weather service exposes realtime temperature separately from daily range", () => {
  const weather = readSource("views/dashboard/core/utils/weather-service.js");

  assert.match(weather, /function getQweatherNow/);
  assert.match(weather, /\/v7\/weather\/now/);
  assert.match(weather, /currentTemp:\s*norm\(n\.temp\)/);
  assert.match(weather, /currentTemp,\s*\n\s*tempMin:/);
});

test("weather diary writeback preserves concurrent edits through vault.process", async () => {
  const source = readSource("views/dashboard/core/utils/weather-service.js");
  const diaryPath = "06_Diary/2026/2026-07-15.md";
  const file = { path: diaryPath, text: "# 2026-07-15\n\nExisting note.\n" };
  let processCalls = 0;
  let modifyCalls = 0;
  const sandbox = {
    __noriaRuntimeBridge: { paths: { diaryRoot: "06_Diary" } },
    dashboardCore: {
      utils: {
        diaryDayBlocks: {
          parseDailyStateFromBody() {
            return {};
          },
          upsertDailyStateSection(text, state) {
            return `${String(text || "").trimEnd()}\n\nweather:: ${state.weather}\nweather_city:: ${state.weather_city}\n`;
          }
        }
      }
    }
  };
  const app = {
    vault: {
      getAbstractFileByPath(pathText) {
        return pathText === diaryPath ? file : null;
      },
      async read(target) {
        return target.text;
      },
      async process(target, transform) {
        processCalls += 1;
        target.text = `${String(target.text || "").trimEnd()}\n\nConcurrent note.\n`;
        target.text = String(transform(target.text));
      },
      async modify(target, text) {
        modifyCalls += 1;
        target.text = String(text || "");
      },
      adapter: {
        async exists(pathText) {
          return pathText === diaryPath;
        }
      }
    }
  };
  const runner = new AsyncFunction(
    "ctx", "input", "app", "moment", "window", "document", "globalThis", "fetch",
    `${source}\nreturn await globalThis.dashboardCore.utils.weatherService.readWriteDailyWeather("2026-07-15", "晴", { filePath: "${diaryPath}", forceOverwrite: true, payload: { statusText: "晴", tempMin: "22", tempMax: "31", city: "北京", source: "test" } });`
  );

  const result = await runner({}, {}, app, null, {}, {}, sandbox, async () => ({ text: async () => "{}" }));

  assert.equal(result.ok, true);
  assert.equal(processCalls, 1);
  assert.equal(modifyCalls, 0);
  assert.match(file.text, /Concurrent note\./);
  assert.match(file.text, /weather:: 晴/);
});

test("periodic status selector uses one transactional writer per state change", () => {
  const source = readSource("views/periodic/statusSelector.js");
  const start = source.indexOf("const setField = async");
  const end = source.indexOf("const row =", start);
  assert.ok(start >= 0 && end > start);
  const setField = source.slice(start, end);

  assert.match(setField, /saveDailyStateForDate/);
  assert.doesNotMatch(setField, /app\.vault\.modify/);
  assert.doesNotMatch(source, /await setField\("weather"/);
});

test("weather service keeps current temperature and daily range in the metric wttr fallback", async () => {
  const source = readSource("views/dashboard/core/utils/weather-service.js");
  const sandbox = {};
  const requests = [];
  const fetchStub = async (url) => {
    const requestUrl = String(url || "");
    requests.push(requestUrl);
    const payload = requestUrl.includes("wttr.in")
      ? {
          current_condition: [{
            temp_C: "26",
            temp_F: "79",
            humidity: "94",
            weatherCode: "116",
            weatherDesc: [{ value: "Partly cloudy" }]
          }],
          weather: [{ mintempC: "22", maxtempC: "31" }],
          nearest_area: [{ areaName: [{ value: "北京" }] }]
        }
      : { ip: "1.2.3.4", city: "北京", latitude: 39.9, longitude: 116.4 };
    return { text: async () => JSON.stringify(payload) };
  };
  const runner = new AsyncFunction(
    "ctx",
    "input",
    "app",
    "moment",
    "window",
    "document",
    "globalThis",
    "fetch",
    `${source}\nreturn await globalThis.dashboardCore.utils.weatherService.getWeatherForHome(input.weather);`
  );

  const result = await runner(
    {},
    { weather: { enabled: true, provider: "wttr-only", manualCity: "北京", cacheMinutes: 5 } },
    {},
    null,
    { require: () => null },
    {},
    sandbox,
    fetchStub
  );

  assert.equal(result.currentTemp, "26");
  assert.equal(result.tempMin, "22");
  assert.equal(result.tempMax, "31");
  assert.equal(result.humidity, "94");
  assert.equal(result.source, "wttr");
  assert.ok(requests.some((url) => /wttr\.in\/.+format=j1/.test(url)));
  assert.ok(requests.some((url) => /(?:\?|&)m(?:&|$)/.test(url)));
});

test("weather service uses Open-Meteo before wttr when the QWeather account host is unavailable", async () => {
  const source = readSource("views/dashboard/core/utils/weather-service.js");
  const sandbox = {};
  const requests = [];
  const fetchStub = async (url) => {
    const requestUrl = String(url || "");
    requests.push(requestUrl);
    let payload;
    if (requestUrl.includes("geocoding-api.open-meteo.com")) {
      payload = { results: [{ name: "北京", latitude: 39.9, longitude: 116.4 }] };
    } else if (requestUrl.includes("api.open-meteo.com/v1/forecast")) {
      payload = {
        current: { temperature_2m: 26.4, relative_humidity_2m: 57, weather_code: 2 },
        daily: { temperature_2m_min: [22.1], temperature_2m_max: [31.2] }
      };
    } else {
      throw new Error(`unexpected weather request: ${requestUrl}`);
    }
    return { text: async () => JSON.stringify(payload) };
  };
  const runner = new AsyncFunction(
    "ctx", "input", "app", "moment", "window", "document", "globalThis", "fetch",
    `${source}\nreturn await globalThis.dashboardCore.utils.weatherService.getWeatherForHome(input.weather);`
  );

  const result = await runner(
    {},
    { weather: { enabled: true, provider: "qweather-ip-fallback", qweatherKey: "secret", qweatherApiHost: "", manualCity: "北京", cacheMinutes: 5 } },
    {}, null, { require: () => null }, {}, sandbox, fetchStub
  );

  assert.equal(result.source, "open-meteo");
  assert.equal(result.currentTemp, "26");
  assert.equal(result.tempMin, "22");
  assert.equal(result.tempMax, "31");
  assert.equal(result.humidity, "57");
  assert.ok(requests.some((url) => url.includes("api.open-meteo.com/v1/forecast")));
  assert.equal(requests.some((url) => /qweather|wttr\.in/i.test(url)), false);
});

test("weather service localizes Open-Meteo city lookup from the Noria locale", async () => {
  const source = readSource("views/dashboard/core/utils/weather-service.js");
  const runForLocale = async (locale) => {
    const requests = [];
    const fetchStub = async (url) => {
      const requestUrl = String(url || "");
      requests.push(requestUrl);
      const payload = requestUrl.includes("geocoding-api.open-meteo.com")
        ? { results: [{ name: locale === "zh" ? "柏林" : "Berlin", latitude: 52.52, longitude: 13.405 }] }
        : {
            current: { temperature_2m: 26, relative_humidity_2m: 40, weather_code: 2 },
            daily: { temperature_2m_min: [15], temperature_2m_max: [27] }
          };
      return { text: async () => JSON.stringify(payload) };
    };
    const sandbox = {};
    const runner = new AsyncFunction(
      "ctx", "input", "app", "moment", "window", "document", "globalThis", "fetch",
      `${source}\nreturn await globalThis.dashboardCore.utils.weatherService.getWeatherForHome(input.weather);`
    );
    const result = await runner(
      {},
      { weather: { enabled: true, provider: "open-meteo", manualCity: "Berlin", locale, cacheMinutes: 5 } },
      {}, null, { require: () => null }, {}, sandbox, fetchStub
    );
    return { result, requests };
  };

  const english = await runForLocale("en");
  const chinese = await runForLocale("zh");

  assert.equal(english.result.city, "Berlin");
  assert.ok(english.requests.some((url) => /language=en(?:&|$)/.test(url)));
  assert.equal(chinese.result.city, "柏林");
  assert.ok(chinese.requests.some((url) => /language=zh(?:&|$)/.test(url)));
});

test("weather service uses the account-specific QWeather host and header authentication", async () => {
  const source = readSource("views/dashboard/core/utils/weather-service.js");
  const sandbox = {};
  const requests = [];
  const fetchStub = async (url, options = {}) => {
    const request = { url: String(url || ""), headers: options.headers || {} };
    requests.push(request);
    let payload = { code: "200" };
    if (request.url.includes("/geo/v2/city/lookup")) {
      payload.location = [{ id: "101010100", name: "北京" }];
    } else if (request.url.includes("/v7/weather/3d")) {
      payload.daily = [{ textDay: "多云", iconDay: "102", tempMin: "22", tempMax: "31", humidity: "56" }];
    } else if (request.url.includes("/v7/weather/now")) {
      payload.now = { text: "多云", icon: "102", temp: "26", humidity: "57" };
    } else if (request.url.includes("/v7/air/now")) {
      payload.now = { aqi: "42", category: "优" };
    } else {
      throw new Error(`unexpected QWeather request: ${request.url}`);
    }
    return { text: async () => JSON.stringify(payload) };
  };
  const runner = new AsyncFunction(
    "ctx", "input", "app", "moment", "window", "document", "globalThis", "fetch",
    `${source}\nreturn await globalThis.dashboardCore.utils.weatherService.getWeatherForHome(input.weather);`
  );

  const result = await runner(
    {},
    { weather: { enabled: true, provider: "qweather-ip-fallback", qweatherKey: "secret", qweatherApiHost: "weather.example.com", manualCity: "北京", cacheMinutes: 5 } },
    {}, null, { require: () => null }, {}, sandbox, fetchStub
  );

  assert.equal(result.source, "qweather");
  assert.equal(result.currentTemp, "26");
  assert.equal(result.tempMin, "22");
  assert.equal(result.tempMax, "31");
  assert.ok(requests.length >= 4);
  requests.forEach((request) => {
    assert.match(request.url, /^https:\/\/weather\.example\.com\//);
    assert.doesNotMatch(request.url, /[?&]key=/);
    assert.equal(request.headers["X-QW-Api-Key"], "secret");
  });
});

test("periodic status selector single-flights weather service loading", async () => {
  const source = readSource("views/periodic/statusSelector.js");
  const runner = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", source);
  const weatherPath = ".obsidian/plugins/noria/views/dashboard/core/utils/weather-service.js";
  const blocksPath = ".obsidian/plugins/noria/views/dashboard/core/utils/diary-day-blocks.js";
  let weatherLoadCount = 0;
  let releaseWeatherSource = null;
  const weatherSourcePromise = new Promise((resolve) => {
    releaseWeatherSource = resolve;
  });
  const waitForFirstWeatherRead = new Promise((resolve) => {
    const originalResolve = releaseWeatherSource;
    releaseWeatherSource = (value) => originalResolve(value);
    globalThis.__noriaTestFirstWeatherRead = resolve;
  });
  const makeCtx = () => {
    const mount = createFakeElement();
    return {
      mount,
      current: () => ({ file: { path: "06_Diary/2026-07-09.md" } }),
      el: (tag, text, opts = {}) => {
        const el = createFakeElement(tag, opts);
        if (text) el.textContent = text;
        if (opts?.cls) el.classList.add(opts.cls);
        mount.appendChild(el);
        return el;
      },
      io: {
        load: async (p) => {
          if (p === blocksPath) {
            return `
              globalThis.dashboardCore = globalThis.dashboardCore || {};
              globalThis.dashboardCore.utils = globalThis.dashboardCore.utils || {};
              globalThis.dashboardCore.utils.diaryDayBlocks = {
                parseDailyStateFromBody: () => ({}),
                pickField: (a, b) => a || b || "",
                upsertDailyStateSection: (text) => text
              };
            `;
          }
          if (p === weatherPath) {
            weatherLoadCount += 1;
            if (weatherLoadCount === 1 && typeof globalThis.__noriaTestFirstWeatherRead === "function") {
              globalThis.__noriaTestFirstWeatherRead();
            }
            return weatherSourcePromise;
          }
          return "";
        }
      }
    };
  };
  const app = {
    vault: {
      getAbstractFileByPath: (p) => ({ path: p }),
      read: async () => "",
      modify: async () => {},
      adapter: {
        read: async () => ""
      }
    }
  };
  const previous = {
    dashboardCore: globalThis.dashboardCore,
    bridge: globalThis.__noriaRuntimeBridge,
    state: globalThis.__noriaPeriodicStatusServiceLoadState,
    evalCount: globalThis.__noriaTestWeatherEvalCount,
    firstRead: globalThis.__noriaTestFirstWeatherRead,
    weatherError: globalThis.__noriaWeatherServiceLoadError
  };
  try {
    delete globalThis.__noriaPeriodicStatusServiceLoadState;
    delete globalThis.__noriaWeatherServiceLoadError;
    globalThis.__noriaTestWeatherEvalCount = 0;
    globalThis.dashboardCore = { utils: {} };
    globalThis.__noriaRuntimeBridge = {
      runtimeBuildId: "periodic-status-weather-build",
      weather: { enabled: true }
    };
    const doc = {
      head: createFakeElement("head"),
      createElement: (tag) => createFakeElement(tag),
      getElementById: () => null
    };
    const runOne = (ctx) => runner(ctx, { noriaBridge: globalThis.__noriaRuntimeBridge }, app, {}, {}, doc, globalThis);
    await Promise.all([runOne(makeCtx()), runOne(makeCtx())]);
    await waitForFirstWeatherRead;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(weatherLoadCount, 1, "concurrent selectors should share one pending weather-service load");
    releaseWeatherSource(`
      globalThis.__noriaTestWeatherEvalCount = (globalThis.__noriaTestWeatherEvalCount || 0) + 1;
      globalThis.dashboardCore = globalThis.dashboardCore || {};
      globalThis.dashboardCore.utils = globalThis.dashboardCore.utils || {};
      globalThis.dashboardCore.utils.weatherService = {
        parseDateFromPath: () => "2026-07-09",
        getWeatherForDate: async () => ({
          mappedWeather: "晴",
          currentTemp: "24",
          tempMin: "18",
          tempMax: "29",
          humidity: "57",
          source: "test"
        })
      };
    `);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(globalThis.__noriaTestWeatherEvalCount, 1);
    assert.equal(globalThis.__noriaPeriodicStatusServiceLoadState?.weather?.status, "ready");
    assert.equal(globalThis.__noriaPeriodicStatusServiceLoadState?.weather?.runtimeBuildId, "periodic-status-weather-build");
  } finally {
    if (previous.dashboardCore === undefined) delete globalThis.dashboardCore;
    else globalThis.dashboardCore = previous.dashboardCore;
    if (previous.bridge === undefined) delete globalThis.__noriaRuntimeBridge;
    else globalThis.__noriaRuntimeBridge = previous.bridge;
    if (previous.state === undefined) delete globalThis.__noriaPeriodicStatusServiceLoadState;
    else globalThis.__noriaPeriodicStatusServiceLoadState = previous.state;
    if (previous.evalCount === undefined) delete globalThis.__noriaTestWeatherEvalCount;
    else globalThis.__noriaTestWeatherEvalCount = previous.evalCount;
    if (previous.firstRead === undefined) delete globalThis.__noriaTestFirstWeatherRead;
    else globalThis.__noriaTestFirstWeatherRead = previous.firstRead;
    if (previous.weatherError === undefined) delete globalThis.__noriaWeatherServiceLoadError;
    else globalThis.__noriaWeatherServiceLoadError = previous.weatherError;
  }
});

test("periodic status selector single-flights diary day block loading", async () => {
  const source = readSource("views/periodic/statusSelector.js");
  const runner = new AsyncFunction("ctx", "input", "app", "moment", "window", "document", "globalThis", source);
  const blocksPath = ".obsidian/plugins/noria/views/dashboard/core/utils/diary-day-blocks.js";
  let blocksLoadCount = 0;
  let releaseBlocksSource = null;
  const blocksSourcePromise = new Promise((resolve) => {
    releaseBlocksSource = resolve;
  });
  const waitForFirstBlocksRead = new Promise((resolve) => {
    globalThis.__noriaTestFirstBlocksRead = resolve;
  });
  const makeCtx = () => {
    const mount = createFakeElement();
    return {
      mount,
      current: () => ({ file: { path: "06_Diary/2026-07-09.md" } }),
      el: (tag, text, opts = {}) => {
        const el = createFakeElement(tag, opts);
        if (text) el.textContent = text;
        if (opts?.cls) el.classList.add(opts.cls);
        mount.appendChild(el);
        return el;
      },
      io: {
        load: async (p) => {
          if (p === blocksPath) {
            blocksLoadCount += 1;
            if (blocksLoadCount === 1 && typeof globalThis.__noriaTestFirstBlocksRead === "function") {
              globalThis.__noriaTestFirstBlocksRead();
            }
            return blocksSourcePromise;
          }
          return "";
        }
      }
    };
  };
  const app = {
    vault: {
      getAbstractFileByPath: (p) => ({ path: p }),
      read: async () => "",
      modify: async () => {},
      adapter: {
        read: async () => ""
      }
    }
  };
  const previous = {
    dashboardCore: globalThis.dashboardCore,
    bridge: globalThis.__noriaRuntimeBridge,
    state: globalThis.__noriaPeriodicStatusServiceLoadState,
    evalCount: globalThis.__noriaTestBlocksEvalCount,
    firstRead: globalThis.__noriaTestFirstBlocksRead,
    weatherError: globalThis.__noriaWeatherServiceLoadError
  };
  try {
    delete globalThis.__noriaPeriodicStatusServiceLoadState;
    delete globalThis.__noriaWeatherServiceLoadError;
    globalThis.__noriaTestBlocksEvalCount = 0;
    globalThis.dashboardCore = {
      utils: {
        weatherService: {
          parseDateFromPath: () => "2026-07-09",
          getWeatherForDate: async () => ({ mappedWeather: "晴", source: "test" })
        }
      }
    };
    globalThis.__noriaRuntimeBridge = {
      runtimeBuildId: "periodic-status-blocks-build",
      weather: { enabled: true }
    };
    const doc = {
      head: createFakeElement("head"),
      createElement: (tag) => createFakeElement(tag),
      getElementById: () => null
    };
    const runOne = (ctx) => runner(ctx, { noriaBridge: globalThis.__noriaRuntimeBridge }, app, {}, {}, doc, globalThis);
    await Promise.all([runOne(makeCtx()), runOne(makeCtx())]);
    await waitForFirstBlocksRead;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(blocksLoadCount, 1, "concurrent selectors should share one pending diary-day-blocks load");
    releaseBlocksSource(`
      globalThis.__noriaTestBlocksEvalCount = (globalThis.__noriaTestBlocksEvalCount || 0) + 1;
      globalThis.dashboardCore = globalThis.dashboardCore || {};
      globalThis.dashboardCore.utils = globalThis.dashboardCore.utils || {};
      globalThis.dashboardCore.utils.diaryDayBlocks = {
        parseDailyStateFromBody: () => ({}),
        pickField: (a, b) => a || b || "",
        upsertDailyStateSection: (text) => text
      };
    `);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(globalThis.__noriaTestBlocksEvalCount, 1);
    assert.equal(globalThis.__noriaPeriodicStatusServiceLoadState?.diaryDayBlocks?.status, "ready");
    assert.equal(globalThis.__noriaPeriodicStatusServiceLoadState?.diaryDayBlocks?.runtimeBuildId, "periodic-status-blocks-build");
  } finally {
    if (previous.dashboardCore === undefined) delete globalThis.dashboardCore;
    else globalThis.dashboardCore = previous.dashboardCore;
    if (previous.bridge === undefined) delete globalThis.__noriaRuntimeBridge;
    else globalThis.__noriaRuntimeBridge = previous.bridge;
    if (previous.state === undefined) delete globalThis.__noriaPeriodicStatusServiceLoadState;
    else globalThis.__noriaPeriodicStatusServiceLoadState = previous.state;
    if (previous.evalCount === undefined) delete globalThis.__noriaTestBlocksEvalCount;
    else globalThis.__noriaTestBlocksEvalCount = previous.evalCount;
    if (previous.firstRead === undefined) delete globalThis.__noriaTestFirstBlocksRead;
    else globalThis.__noriaTestFirstBlocksRead = previous.firstRead;
    if (previous.weatherError === undefined) delete globalThis.__noriaWeatherServiceLoadError;
    else globalThis.__noriaWeatherServiceLoadError = previous.weatherError;
  }
});

test("home overview columns isolate child view failures", () => {
  const overviewColumns = readSource("views/dashboard/home/sections/overview-columns/view.js");

  assert.match(overviewColumns, /runWorkbenchView/);
  assert.match(overviewColumns, /runtime\.home\.overview\.sectionLoadFailed/);
  assert.match(overviewColumns, /dashboard-overview-section-error/);
  assert.match(overviewColumns, /openTasksBoard/);
  assert.match(overviewColumns, /bridge\.pluginId/);
  assert.match(overviewColumns, /open-tasks-plugin-tab/);
  assert.doesNotMatch(overviewColumns, /noria:noria-open-tasks-plugin-tab/);
  assert.doesNotMatch(overviewColumns, /openFilePath\("任务看板\.md"\)/);
  assert.doesNotMatch(
    overviewColumns,
    /await runCustomViewByPath\("\.obsidian\/plugins\/noria\/views\/periodic\/dashboardHabitWeek"[\s\S]*await runCustomViewByPath\("\.obsidian\/plugins\/noria\/views\/periodic\/dashboardCountdown"/
  );
});

test("home overview and guide child view loaders share build-bound source and runner caches", () => {
  const overviewColumns = readSource("views/dashboard/home/sections/overview-columns/view.js");
  const guidePanels = readSource("views/dashboard/home/sections/guide-panels/view.js");
  const sources = [overviewColumns, guidePanels].join("\n");

  assert.match(sources, /__noriaHomeChildViewLoaderV1/);
  assert.match(sources, /getHomeChildViewLoaderState/);
  assert.match(sources, /loadHomeChildViewSource/);
  assert.match(sources, /getHomeChildViewRunner/);
  assert.match(sources, /sourceTextPending/);
  assert.match(sources, /runnerCache/);
  assert.match(sources, /runtimeBuildId/);
  assert.match(overviewColumns, /const sourceCode = await loadHomeChildViewSource\(candidate\)/);
  assert.match(guidePanels, /const sourceCode = await loadHomeChildViewSource\(candidate\)/);
  assert.match(overviewColumns, /const run = getHomeChildViewRunner\(sourcePath,\s*loadedSourceCode\)/);
  assert.match(guidePanels, /const run = getHomeChildViewRunner\(sourcePath,\s*loadedSourceCode\)/);
});

test("home overview keeps Inbox as a focused second workbench column", () => {
  const overviewColumns = readSource("views/dashboard/home/sections/overview-columns/view.js");

  assert.match(overviewColumns, /DEFAULT_WORKBENCH_PANELS\s*=\s*\{[\s\S]*leftPanels:\s*\["tasks"\][\s\S]*middlePanels:\s*\["inbox"\][\s\S]*rightPanels:\s*\["countdown"\]/);
  assert.match(overviewColumns, /function getOverviewWorkbenchPanelLayout/);
  assert.match(overviewColumns, /WORKBENCH_PANEL_GROUPS\s*=\s*\[[\s\S]*\["middle",\s*"middlePanels"\]/);
  assert.match(overviewColumns, /inbox:\s*\{[\s\S]*titleKey:\s*"runtime\.home\.overview\.inboxTitle"[\s\S]*dashboardGuideInbox/);
  assert.doesNotMatch(overviewColumns, /"habit-today":\s*\{/);
  assert.match(overviewColumns, /panelIds\.includes\("inbox"\)[\s\S]*wrap\.card\.addClass\("dashboard-guide-inbox"\)/);
  assert.match(overviewColumns, /dashboard-overview-inbox-mount/);
  assert.doesNotMatch(overviewColumns, /dashboard-overview-habit-context/);
  assert.match(overviewColumns, /data-noria-overview-panel-group/);
  assert.doesNotMatch(overviewColumns, /dashboardHabitWeek", \{[^\n]*actionsHost:/);
});

test("home overview Inbox toolbar uses managed paths instead of old vault-specific files", () => {
  const guidePanels = readSource("views/dashboard/home/sections/guide-panels/view.js");
  const overviewColumns = readSource("views/dashboard/home/sections/overview-columns/view.js");

  assert.match(overviewColumns, /inboxWorkflowPath/);
  assert.match(overviewColumns, /inboxQueuePath/);
  assert.match(overviewColumns, /newInboxScratch/);
  assert.match(overviewColumns, /panelIds\.includes\("inbox"\)[\s\S]*openInboxWorkflow/);
  assert.match(overviewColumns, /panelIds\.includes\("inbox"\)[\s\S]*openInboxQueue/);
  assert.match(overviewColumns, /panelIds\.includes\("inbox"\)[\s\S]*newInboxScratch/);
  assert.doesNotMatch(guidePanels, /entryNotePath/);
  assert.doesNotMatch(guidePanels, /打开 Inbox 工作流/);
  assert.doesNotMatch(guidePanels, /02_Areas\/知识库管理\/知识库治理\.md/);
  assert.doesNotMatch(guidePanels, /02_Areas\/知识库管理\/Inbox队列\.base/);
});

test("home overview workbench toolbar actions expose observable action states", () => {
  const overviewColumns = readSource("views/dashboard/home/sections/overview-columns/view.js");

  assert.match(overviewColumns, /function setWorkbenchToolbarActionState/);
  assert.match(overviewColumns, /data-noria-action-source",\s*"home-workbench-toolbar"/);
  assert.match(overviewColumns, /data-noria-action-kind/);
  assert.match(overviewColumns, /setWorkbenchToolbarActionState\(control,\s*"idle"/);
  assert.match(overviewColumns, /setWorkbenchToolbarActionState\(control,\s*"pending"/);
  assert.match(overviewColumns, /setWorkbenchToolbarActionState\(control,\s*"ok"/);
  assert.match(overviewColumns, /setWorkbenchToolbarActionState\(control,\s*"failed"/);
  assert.match(overviewColumns, /data-noria-action-error/);
  assert.match(overviewColumns, /return openFilePath\(inboxWorkflowPath\)/);
  assert.match(overviewColumns, /return openFilePath\(inboxQueuePath\)/);
  assert.match(overviewColumns, /addIconBtn\(tool,\s*"library"[\s\S]*"open-inbox-workflow"/);
  assert.match(overviewColumns, /addIconBtn\(tool,\s*"clipboard-list"[\s\S]*"open-inbox-queue"/);
  assert.match(overviewColumns, /addToolbarPlusBtn\(tool[\s\S]*"new-inbox-scratch"/);
});

test("guide panels retire duplicate Inbox because the primary Inbox owns its actions", () => {
  const guidePanels = readSource("views/dashboard/home/sections/guide-panels/view.js");
  const overviewColumns = readSource("views/dashboard/home/sections/overview-columns/view.js");

  assert.match(overviewColumns, /dashboardGuideInbox/);
  assert.doesNotMatch(guidePanels, /showGuideInbox/);
  assert.doesNotMatch(guidePanels, /dashboardGuideInbox/);
  assert.doesNotMatch(guidePanels, /inboxPanel/);
  assert.match(guidePanels, /\[projectPanel\.card\]\.filter\(Boolean\)/);
});

test("home guide toolbar actions expose observable action states", () => {
  const guidePanels = readSource("views/dashboard/home/sections/guide-panels/view.js");

  assert.match(guidePanels, /function setGuideToolbarActionState/);
  assert.match(guidePanels, /function bindGuideToolbarAction/);
  assert.match(guidePanels, /data-noria-action-source",\s*"home-guide-toolbar"/);
  assert.match(guidePanels, /data-noria-action-kind/);
  assert.match(guidePanels, /setGuideToolbarActionState\(control,\s*"idle"/);
  assert.match(guidePanels, /setGuideToolbarActionState\(control,\s*"pending"/);
  assert.match(guidePanels, /setGuideToolbarActionState\(control,\s*"ok"/);
  assert.match(guidePanels, /setGuideToolbarActionState\(control,\s*"failed"/);
  assert.match(guidePanels, /data-noria-action-error/);
  assert.match(guidePanels, /addIconBtn\(tool,\s*"folder-kanban"[\s\S]*"open-project-registry"/);
  assert.match(guidePanels, /addGuidePrimaryAddBtn\(tool[\s\S]*"manage-projects"/);
});

test("project guide builds project rows through a bounded queue", () => {
  const projects = readSource("views/periodic/dashboardGuideProjects.js");
  const buildStart = projects.indexOf("const projectBuildRows");
  const debugStart = projects.indexOf("projectDebug.projectCount", buildStart);
  assert.ok(buildStart > 0 && debugStart > buildStart, "project guide should build project rows before debug count");
  const buildBlock = projects.slice(buildStart, debugStart);

  assert.match(projects, /async function runProjectGuideBuildQueue/);
  assert.match(projects, /Math\.min\(limit,\s*queue\.length\)/);
  assert.match(buildBlock, /const projectBuildRows\s*=\s*\[\]/);
  assert.match(buildBlock, /const projectBuildJobs\s*=\s*\[\]/);
  assert.match(buildBlock, /projectBuildJobs\.push\(async \(\) =>/);
  assert.match(buildBlock, /await runProjectGuideBuildQueue\(projectBuildJobs\)/);
  assert.doesNotMatch(projects, /await Promise\.all\(projects\s*\n\s*\.filter/);
});

test("empty habits countdowns and active projects render explicit empty states", () => {
  const habits = readSource("views/periodic/dashboardHabitWeek.js");
  const countdown = readSource("views/periodic/dashboardCountdown.js");
  const projects = readSource("views/periodic/dashboardGuideProjects.js");
  const main = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");

  for (const key of [
    "runtime.habits.noActiveAction",
    "runtime.habits.initializeRegistry",
    "runtime.countdown.noneAction",
    "runtime.periodic.projects.emptyActiveProjectTasks"
  ]) {
    assert.match(main, new RegExp(JSON.stringify(key)));
  }

  assert.match(habits, /runtime\.habits\.noActiveAction/);
  assert.match(habits, /openFilePath\(targetPath\)/);
  assert.match(countdown, /runtime\.countdown\.noneAction/);
  assert.match(countdown, /openCountdownManagePanel/);
  assert.match(projects, /runtime\.periodic\.projects\.emptyActiveProjectTasks/);
  assert.match(projects, /proj\.stage === "active"/);
});

test("habit missing-registry empty state creates and opens a real registry", async () => {
  const habitPath = "02_Areas/知识库管理/Habits.md";
  const mount = createFakeElement();
  const files = new Map();
  const openedFiles = [];
  const refreshes = [];
  let createdText = "";

  await runRuntimeSource("views/periodic/dashboardHabitWeek.js", {
    input: {
      mount,
      actionsHost: createFakeElement(),
      noriaBridge: {
        locale: "zh-CN",
        paths: { habitRegistryPath: habitPath },
        refresh: {
          requestRefresh(scope, reason) {
            refreshes.push({ scope, reason });
          }
        },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath() {
            return [];
          }
        },
        t(key) {
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async () => "" },
      page: () => null,
      container: createFakeElement()
    },
    app: {
      setIcon() {},
      vault: {
        getAbstractFileByPath(pathText) {
          return files.get(pathText) || null;
        },
        async createFolder(pathText) {
          files.set(pathText, { path: pathText, name: pathText.split("/").pop(), children: [] });
        },
        async create(pathText, text) {
          createdText = String(text || "");
          const file = { path: pathText, name: pathText.split("/").pop(), extension: "md" };
          files.set(pathText, file);
          return file;
        },
        getMarkdownFiles: () => []
      },
      metadataCache: { getFileCache: () => null },
      workspace: {
        getLeaf() {
          return {
            async openFile(file) {
              openedFiles.push(file);
            }
          };
        }
      }
    },
    globals: {
      Notice: function Notice() {},
      window: { innerWidth: 1300 },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const action = flattenElements(mount).find((el) => el.attrs?.["data-noria-action-kind"] === "initialize-habit-registry");
  assert.equal(action?.textContent, "Create habit registry");
  assert.equal(action?.attrs["data-noria-action-state"], "idle");
  assert.equal(files.has(habitPath), false);

  await action?.onclick?.();

  assert.equal(action?.attrs["data-noria-action-state"], "ok");
  assert.equal(files.has(habitPath), true);
  assert.match(createdText, /## 打卡中的习惯/);
  assert.match(createdText, /## 循环任务源（每日）/);
  assert.deepEqual(openedFiles.map((file) => file.path), [habitPath]);
  assert.deepEqual(refreshes, [{ scope: "home", reason: "habit-registry-write" }]);
});

test("home countdown rows expose source-aware workbench actions and open due task sources", async () => {
  const countdownPathText = "02_Areas/知识库管理/Countdowns.md";
  const dueTaskPath = "01_Projects/论文-6Equation/Tasks.md";
  const manualCountdown = [
    "## 重要日期",
    "",
    "| 日期 | 名称 | 类型 |",
    "| --- | --- | --- |",
    "| 2099-06-20 | 手动里程碑 | project |",
    "|            |          |     |"
  ].join("\n");
  const fileBodies = new Map([
    [countdownPathText, manualCountdown],
    [dueTaskPath, "- [ ] 到期任务 #due [due:: 2099-06-18]"]
  ]);
  const mount = createFakeElement();
  const opened = [];
  const leaf = {
    view: {
      getViewType: () => "markdown",
      setEphemeralState(state) {
        opened.push({ state });
      },
      editor: {
        setCursor(pos) {
          opened.push({ cursor: pos });
        },
        scrollIntoView(range, center) {
          opened.push({ range, center });
        }
      }
    },
    async openFile(file, options) {
      opened.push({ path: file.path, options });
    }
  };

  await runRuntimeSource("views/periodic/dashboardCountdown.js", {
    input: {
      mount,
      noriaBridge: {
        paths: { importantDatesPath: countdownPathText },
        runtime: {
          async tasksForScope(scope) {
            assert.equal(scope, "tasks");
            return [
              {
                text: "到期任务 #due [due:: 2099-06-18]",
                rawLine: "- [ ] 到期任务 #due [due:: 2099-06-18]",
                completed: false,
                due: "2099-06-18",
                path: dueTaskPath,
                line: 7
              }
            ];
          }
        },
        t(key, params = {}) {
          const map = {
            "runtime.countdown.tooltip": `目标日 ${params.date} · 还剩 ${params.days} 天`,
            "runtime.countdown.remaining": "还有",
            "runtime.countdown.dayUnit": "天",
            "runtime.countdown.add": "新增倒计时",
            "runtime.countdown.none": "暂无倒计时事项。",
            "runtime.countdown.noneAction": "添加倒计时"
          };
          return map[key] || key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => fileBodies.get(pathText) || "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          return fileBodies.has(pathText) ? { path: pathText, name: path.basename(pathText) } : null;
        },
        read: async (file) => fileBodies.get(file.path) || ""
      },
      workspace: {
        activeLeaf: leaf,
        getLeaf: () => leaf
      }
    },
    globals: {
      requestAnimationFrame: (fn) => setImmediate(fn),
      window: {
        innerWidth: 1300,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {}
      },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const cards = flattenElements(mount).filter((el) => el.classList?.contains?.("dashboard-countdown-card"));
  assert.equal(cards.length, 2);
  const dueCard = cards.find((el) => el.attrs["data-countdown-kind"] === "due");
  const manualCard = cards.find((el) => el.attrs["data-countdown-kind"] === "manual");

  assert.ok(dueCard, "due countdown should render as a card");
  assert.equal(dueCard.attrs["data-noria-action-kind"], "open-countdown-source");
  assert.equal(dueCard.attrs["data-noria-action-source"], "home-countdown");
  assert.equal(dueCard.attrs["data-countdown-source-path"], dueTaskPath);
  assert.equal(dueCard.attrs["data-countdown-source-line"], "7");

  assert.ok(manualCard, "manual countdown should render as a card");
  assert.equal(manualCard.attrs["data-noria-action-kind"], "manage-countdown");
  assert.equal(manualCard.attrs["data-noria-action-source"], "home-countdown");
  assert.equal(manualCard.attrs["data-countdown-source-path"], countdownPathText);
  assert.equal(manualCard.attrs["data-countdown-source-line"], "4");

  await dueCard.onclick();
  assert.deepEqual(opened[0], { path: dueTaskPath, options: { active: true } });
  assert.deepEqual(opened[1], { state: { line: 7 } });
  assert.deepEqual(opened[2], { cursor: { line: 7, ch: 0 } });
});

test("home countdown loads manual rows and due tasks in parallel", () => {
  const countdown = readSource("views/periodic/dashboardCountdown.js");
  const renderStart = countdown.indexOf("const renderCountdownTray = async () => {");
  const renderEnd = countdown.indexOf("const actionsHost = input?.actionsHost", renderStart);
  assert.ok(renderStart > 0 && renderEnd > renderStart, "renderCountdownTray body should be found");
  const renderBlock = countdown.slice(renderStart, renderEnd);
  assert.match(renderBlock, /Promise\.all\(\[\s*parseImportantRows\(\),\s*parseDueTasks\(\)\s*\]\)/);
  assert.doesNotMatch(renderBlock, /const\s+\{\s*rows:\s*importantRows\s*\}\s*=\s*await\s+parseImportantRows\(\);\s*const\s+dueTasks\s*=\s*await\s+parseDueTasks\(\);/);
});

test("habit home matrix uses soft dark grid and purple streak semantics", () => {
  const habits = readSource("views/periodic/dashboardHabitWeek.js");
  const bootstrap = readSource("views/dashboard/home/sections/bootstrap-style/view.js");

  assert.match(habits, /const\s+HABIT_WINDOW_DAYS\s*=\s*22/);
  assert.match(habits, /const\s+HABIT_COMPACT_FIRST_LINE_DAYS\s*=\s*11/);
  assert.match(habits, /isMonthStartDate/);
  assert.match(habits, /head\.addClass\("is-month-start"\)/);
  assert.match(habits, /Number\(streak\?\.streakCount \|\| 0\)\s*<\s*2/);
  assert.doesNotMatch(habits, /btn\.onmouseenter[\s\S]*rgba\(59,\s*130,\s*246/);
  assert.doesNotMatch(habits, /boxShadow\s*=\s*"0 0 0 2px rgba\(59,\s*130,\s*246/);

  assert.match(bootstrap, /--habit-matrix-bg:/);
  assert.match(bootstrap, /--habit-grid-line:/);
  assert.match(bootstrap, /--habit-done:\s*#8b5cf6/);
  assert.match(bootstrap, /--habit-name-col:\s*clamp\(88px,\s*25%,\s*116px\)/);
  assert.doesNotMatch(bootstrap, /--habit-today-column:\s*transparent/);
  assert.match(bootstrap, /--habit-today-column:\s*color-mix/);
  assert.match(bootstrap, /\.dashboard-habit-21-track::after/);
  assert.match(bootstrap, /\.dashboard-habit-today-strip\s*\{[\s\S]*border-bottom:\s*1px solid/);
  assert.match(bootstrap, /\.dashboard-habit-today-list\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(bootstrap, /\.dashboard-habit-today-chip\s*\{[\s\S]*border-radius:\s*999px/);
  assert.match(bootstrap, /\.dashboard-habit-today-chip\.is-done\s*\{[\s\S]*background:\s*color-mix/);
  assert.match(bootstrap, /\.dashboard-habit-21-grid\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(bootstrap, /\.dashboard-habit-21-grid\s*\{[\s\S]*background:\s*transparent/);
  assert.match(bootstrap, /\.dashboard-habit-21-grid\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(bootstrap, /\.dashboard-habit-21-name\s*\{[\s\S]*background:\s*transparent/);
  assert.match(bootstrap, /\.dashboard-habit-21-name\s*\{[\s\S]*border-right:\s*0/);
  assert.match(bootstrap, /\.dashboard-habit-21-name\s+\.dashboard-task-title\s*\{[\s\S]*font-weight:\s*620/);
  assert.match(bootstrap, /\.dashboard-habit-21-track\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(bootstrap, /\.dashboard-habit-21-line\s*\{[\s\S]*grid-template-columns:\s*repeat\(11,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(
    bootstrap,
    /\.dashboard-habit-21-head-track\s*\{[\s\S]*?grid-template-columns:\s*repeat\(22,\s*minmax\(0,\s*1fr\)\)/,
    "the two header line wrappers must occupy the same two-column track as the habit rows"
  );
  assert.match(bootstrap, /--habit-cell-h:\s*17px/);
  assert.match(bootstrap, /--habit-head-h:\s*15px/);
  assert.match(bootstrap, /\.dashboard-habit-21-head-track\s*\{[\s\S]*display:\s*flex/);
  assert.match(bootstrap, /\.dashboard-habit-21-head-track\s+\.dashboard-habit-21-line\s*\{[\s\S]*display:\s*grid/);
  assert.match(bootstrap, /\.dashboard-habit-21-head-track\s+\.dashboard-habit-21-line\s*\{[\s\S]*grid-template-columns:\s*repeat\(11,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(bootstrap, /\.dashboard-habit-21-date-head\.is-today\s*\{[\s\S]*border-radius:\s*999px/);
  assert.match(bootstrap, /\.dashboard-habit-21-date-head\.is-month-start\s*\{[\s\S]*font-weight:\s*680/);
  assert.match(bootstrap, /\.dashboard-habit-21-cell\.is-today::before\s*\{[\s\S]*background:\s*var\(--habit-today-column\)/);
  assert.match(bootstrap, /\.dashboard-habit-21-token\s*\{[\s\S]*background:\s*transparent/);
  assert.match(bootstrap, /button\.dashboard-habit-21-token\[data-noria-action-state="pending"\]/);
  assert.match(bootstrap, /button\.dashboard-habit-21-token\[data-noria-action-state="failed"\]/);
  assert.match(bootstrap, /\.dashboard-habit-21-cell\.is-done\.is-streak-start\.is-streak-end\s+\.dashboard-habit-21-token/);
  assert.match(bootstrap, /\.dashboard-habit-21-cell\.is-done\.is-streak-middle\s+\.dashboard-habit-21-token/);
});

test("habit writeback resolves sleep notes from the configured diary root", () => {
  const habits = readSource("views/periodic/dashboardHabitWeek.js");
  const pathBlock = habits.slice(
    habits.indexOf("const getDailyNotePath"),
    habits.indexOf("const ensureParentFolder")
  );

  assert.match(habits, /bridge\.paths\?\.diaryRoot/);
  assert.match(pathBlock, /diaryRoot/);
  assert.doesNotMatch(pathBlock, /06_Diary/);
});

test("habit task status writeback follows the unique task after a concurrent line insertion", async () => {
  const file = { path: "Noria/Habits.md" };
  let current = "- [ ] Concurrent task\n- [ ] Drink water\n";
  let processCalls = 0;
  let modifies = 0;
  let refreshes = 0;
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      read: async () => "- [ ] Drink water\n",
      modify: async (_file, text) => {
        modifies += 1;
        current = String(text);
      },
      process: async (_file, transform) => {
        processCalls += 1;
        current = String(transform(current));
      }
    }
  };
  const markTaskStatus = loadHabitTaskStatus(app, () => { refreshes += 1; });

  const changed = await markTaskStatus({ path: file.path, line: 0, text: "Drink water" }, true);

  assert.equal(changed, true);
  assert.equal(processCalls, 1);
  assert.equal(modifies, 0);
  assert.equal(refreshes, 1);
  assert.match(current, /^- \[ \] Concurrent task$/m);
  assert.match(current, /^- \[x\] Drink water$/m);
});

test("Today tasks status writeback follows the unique task after a concurrent insertion", async () => {
  const file = { path: "Tasks.md" };
  let current = "- [ ] Concurrent task\n- [ ] Target task [due:: 2026-05-03]\n";
  let processCalls = 0;
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      read: async () => "- [ ] Target task [due:: 2026-05-03]\n",
      modify: async (_file, text) => {
        current = String(text);
      },
      process: async (_file, transform) => {
        processCalls += 1;
        current = String(transform(current));
      }
    }
  };
  const markTaskStatus = loadTodayTaskStatus(app);

  const changed = await markTaskStatus({ path: file.path, line: 0, text: "Target task [due:: 2026-05-03]" }, true);

  assert.equal(changed, true);
  assert.equal(processCalls, 1);
  assert.match(current, /^- \[ \] Concurrent task$/m);
  assert.match(current, /^- \[x\] Target task \[due:: 2026-05-03\]$/m);
});

test("Today tasks status writeback rejects ambiguous duplicate-title fallbacks", async () => {
  const file = { path: "Tasks.md" };
  let current = "- [ ] Same task\n- [ ] Concurrent task\n- [ ] Same task\n";
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      read: async () => current,
      modify: async (_file, text) => {
        current = String(text);
      },
      process: async (_file, transform) => {
        current = String(transform(current));
      }
    }
  };
  const markTaskStatus = loadTodayTaskStatus(app);

  const changed = await markTaskStatus({ path: file.path, line: 1, text: "Same task" }, true);

  assert.equal(changed, false);
  assert.equal((current.match(/\[x\]/g) || []).length, 0);
});

test("Today tasks period additions use a latest-text transaction helper", () => {
  const source = readSource("views/periodic/dashboardTodayTasks.js");
  const start = source.indexOf("const addTaskToPeriodDiary = async");
  const end = source.indexOf("\n\nconst cleanTaskText", start);
  assert.ok(start >= 0 && end > start, "expected period task add helper");
  const method = source.slice(start, end);

  assert.match(source, /const processPeriodDiaryText = async/);
  assert.match(method, /processPeriodDiaryText/);
  assert.doesNotMatch(method, /app\.vault\.(?:read|modify|create)/);
});

test("countdown table updates transform the latest note text", () => {
  const source = readSource("views/periodic/dashboardCountdown.js");
  const start = source.indexOf("const writeImportantRows = async");
  const end = source.indexOf("\n\nconst openCountdownManagePanel", start);
  assert.ok(start >= 0 && end > start, "expected countdown write helper");
  const method = source.slice(start, end);

  assert.match(method, /app\.vault\.process/);
  assert.doesNotMatch(method, /await app\.vault\.modify\(file, next\)/);
});

test("project card registry and next-step writes use latest-text transactions", () => {
  const source = readSource("views/periodic/dashboardGuideProjects.js");
  const registryStart = source.indexOf("const renderProjectRegistry =");
  const registryEnd = source.indexOf("\n  const removeProjectFromView", registryStart);
  const nextStart = source.indexOf("const appendProjectNextStep = async");
  const nextEnd = source.indexOf("\n  const openTaskTarget", nextStart);
  assert.ok(registryStart >= 0 && registryEnd > registryStart);
  assert.ok(nextStart >= 0 && nextEnd > nextStart);

  const registryMethods = source.slice(registryStart, registryEnd);
  const nextMethod = source.slice(nextStart, nextEnd);
  assert.match(registryMethods, /app\.vault\.process/);
  assert.match(nextMethod, /app\.vault\.process/);
});

test("home project manager applies registry actions to the latest file text", () => {
  const source = readSource("views/dashboard/home/sections/guide-panels/view.js");
  const processStart = source.indexOf("const processProjectRegistry = async");
  const managerStart = source.indexOf("function openManageProjectPanel", processStart);
  assert.ok(processStart >= 0 && managerStart > processStart);
  const mutationBlock = source.slice(processStart, managerStart);

  assert.match(mutationBlock, /app\.vault\.process/);
  assert.match(mutationBlock, /appendProjectEntry[\s\S]*processProjectRegistry/);
  assert.match(mutationBlock, /updateProjectTargetPath[\s\S]*processProjectRegistry/);
  assert.match(mutationBlock, /hideProjectEntry[\s\S]*processProjectRegistry/);
  assert.match(mutationBlock, /deleteProjectEntry[\s\S]*processProjectRegistry/);
  assert.match(mutationBlock, /resumeProjectFromHidden[\s\S]*processProjectRegistry/);
  assert.doesNotMatch(mutationBlock, /await writeProjectRegistry/);
});

test("habit missing-file creation reuses a concurrently created note without overwriting it", async () => {
  const pathValue = "Noria/Habits.md";
  const concurrentFile = { path: pathValue };
  let indexedFile = null;
  let current = "";
  let creates = 0;
  const app = {
    vault: {
      getAbstractFileByPath: () => indexedFile,
      create: async () => {
        creates += 1;
        current = "concurrent registry";
        indexedFile = concurrentFile;
        throw new Error("File already exists");
      }
    }
  };
  const ensureHabitFileWithSeed = loadHabitFileEnsurer(app);

  const file = await ensureHabitFileWithSeed(pathValue, "stale seed");

  assert.equal(file, concurrentFile);
  assert.equal(creates, 1);
  assert.equal(current, "concurrent registry");
});

test("habit home block renders active habits without mutating registry on view load", async () => {
  const habitPath = "02_Areas/知识库管理/Habits.md";
  const registry = [
    "---",
    "tags:",
    " - \"#dashboard\"",
    "---",
    "",
    "## 打卡中的习惯",
    "",
    "",
    "- 12:30前睡 [type:: sleep] [target:: 00:30]",
    "- 喝水 [type:: number] [target:: 5] [unit:: 杯]",
    "- 运动 [type:: number] [target:: 300] [unit:: 大卡]",
    "",
    "## 已养成习惯",
    "",
    "- （空）",
    "",
    "## 暂停的习惯",
    "",
    "- （空）",
    "",
    "## 循环任务源（每日）",
    "- [x] 喝水 #habit #active [due:: 2026-04-28] [completion:: 2026-04-28] [type:: number] [value:: 5] [target:: 5] [unit:: 杯]"
  ].join("\n");
  const mount = createFakeElement();
  let modified = false;

  await runRuntimeSource("views/periodic/dashboardHabitWeek.js", {
    input: {
      mount,
      actionsHost: createFakeElement(),
      noriaBridge: {
        paths: { habitRegistryPath: habitPath },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath() {
            return [];
          },
          displayLabel(_kind, value) {
            return value;
          }
        },
        t(key, params = {}) {
          return params.count != null ? `${key}:${params.count}` : key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => (pathText === habitPath ? registry : "") },
      page: () => ({ file: { tasks: [] } }),
      container: createFakeElement()
    },
    app: {
      setIcon() {},
      vault: {
        getAbstractFileByPath(pathText) {
          return pathText === habitPath ? { path: habitPath, name: "Habits.md" } : null;
        },
        read: async () => registry,
        modify: async () => {
          modified = true;
          throw new Error("view load must not modify habit registry");
        },
        create: async () => {
          throw new Error("view load must not create habit registry");
        },
        createFolder: async () => {},
        getMarkdownFiles: () => []
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: { innerWidth: 1300 },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.equal(modified, false);
  assert.match(text, /12:30前睡|喝水|运动/);
  assert.doesNotMatch(text, /runtime\.habits\.noActive/);
});

test("habit home today token toggles the existing registry record format", async () => {
  const todayDate = new Date();
  const todayKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
  const habitPath = "02_Areas/知识库管理/Habits.md";
  let registry = [
    "## 打卡中的习惯",
    "",
    "- 阅读 [type:: check]",
    "",
    "## 暂停的习惯",
    "",
    "- （空）",
    "",
    "## 已养成习惯",
    "",
    "- （空）",
    "",
    "## 循环任务源（每日）",
    ""
  ].join("\n");
  let modifiedText = "";
  let processCalls = 0;
  const mount = createFakeElement();

  await runRuntimeSource("views/periodic/dashboardHabitWeek.js", {
    input: {
      mount,
      actionsHost: createFakeElement(),
      noriaBridge: {
        paths: { habitRegistryPath: habitPath },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath() {
            return [];
          },
          displayLabel(_kind, value) {
            return value;
          }
        },
        refresh: { requestRefresh() {} },
        t(key, params = {}) {
          const messages = {
            "runtime.habits.toggleRecord": `切换 ${params.date} ${params.name} 打卡`
          };
          return messages[key] || key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => (pathText === habitPath ? registry : "") },
      page: () => ({ file: { tasks: [] } }),
      container: createFakeElement()
    },
    app: {
      setIcon() {},
      vault: {
        getAbstractFileByPath(pathText) {
          return pathText === habitPath ? { path: habitPath, name: "Habits.md" } : null;
        },
        read: async () => registry,
        modify: async (_file, next) => {
          registry = next;
          modifiedText = next;
        },
        process: async (_file, transform) => {
          processCalls += 1;
          const concurrent = `${registry}\n<!-- concurrent habit edit -->`;
          registry = String(transform(concurrent) || "");
          modifiedText = registry;
        },
        create: async () => {
          throw new Error("habit registry should already exist");
        },
        createFolder: async () => {},
        getMarkdownFiles: () => []
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: { innerWidth: 1300 },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const todayToken = flattenElements(mount).find((el) =>
    el.tagName === "button" &&
    el.classList.contains("dashboard-habit-21-token") &&
    el.attrs["data-habit-name"] === "阅读" &&
    el.attrs["data-habit-date"] === todayKey
  );
  assert.ok(todayToken, "today habit token should expose stable habit/date metadata");
  assert.equal(todayToken.attrs["data-habit-type"], "check");
  assert.equal(todayToken.attrs["data-noria-action-source"], "home-habit-checkin");
  assert.equal(todayToken.attrs["data-noria-action-kind"], "toggle-habit-checkin");
  assert.equal(todayToken.attrs["data-noria-action-target"], "阅读");
  assert.equal(todayToken.attrs["data-noria-action-target-path"], habitPath);
  assert.equal(todayToken.attrs["data-noria-action-target-date"], todayKey);
  assert.equal(todayToken.attrs["data-noria-action-state"], "idle");
  assert.equal(todayToken.attrs["aria-pressed"], "false");
  assert.match(todayToken.attrs["aria-label"], /阅读/);
  assert.equal(typeof todayToken.onclick, "function");

  const todayChip = flattenElements(mount).find((el) =>
    el.tagName === "button" &&
    el.classList.contains("dashboard-habit-today-chip") &&
    el.attrs["data-noria-habit-name"] === "阅读" &&
    el.attrs["data-noria-habit-date"] === todayKey
  );
  assert.ok(todayChip, "today habit strip should expose a same-day chip");
  assert.equal(todayChip.attrs["data-noria-action-source"], "home-habit-today-strip");
  assert.equal(todayChip.attrs["data-noria-action-kind"], "focus-habit-today-token");
  assert.equal(todayChip.attrs["data-noria-action-target"], "阅读");
  assert.equal(todayChip.attrs["data-noria-action-target-date"], todayKey);
  assert.equal(todayChip.attrs["data-noria-action-target-path"], habitPath);
  assert.equal(todayChip.attrs["data-noria-habit-today-state"], "pending");
  assert.equal(todayChip.attrs["aria-pressed"], "false");
  assert.equal(typeof todayChip.onclick, "function");

  await todayChip.onclick({ preventDefault() {} });

  assert.equal(processCalls, 1);
  assert.match(modifiedText, /<!-- concurrent habit edit -->/);
  assert.match(modifiedText, new RegExp(`- \\[x\\] 阅读 #habit #active \\[due:: ${todayKey}\\] \\[completion:: ${todayKey}\\]`));
  assert.equal(todayToken.attrs["aria-pressed"], "true");
  assert.equal(todayToken.attrs["data-noria-action-state"], "ok");
  assert.equal(todayChip.attrs["data-noria-habit-today-state"], "done");
  assert.equal(todayChip.attrs["aria-pressed"], "true");

  const shell = flattenElements(mount).find((el) => el.classList.contains("dashboard-habit-21-shell"));
  assert.ok(shell, "habit shell should mirror the last check-in action");
  assert.equal(shell.attrs["data-noria-action-source"], "home-habit-checkin");
  assert.equal(shell.attrs["data-noria-last-habit-checkin-action-state"], "ok");
  assert.equal(shell.attrs["data-noria-last-habit-checkin-action-kind"], "toggle-habit-checkin");
  assert.equal(shell.attrs["data-noria-last-habit-checkin-action-habit"], "阅读");
  assert.equal(shell.attrs["data-noria-last-habit-checkin-action-date"], todayKey);
  assert.equal(shell.attrs["data-noria-last-habit-checkin-action-path"], habitPath);
});

test("home note trend renders note series from the shared home snapshot", async () => {
  const mount = createFakeElement();
  await runRuntimeSource("views/dashboard/home/sections/trends-and-stats/blocks/note-trend/view.js", {
    input: {
      mount,
      statsSnapshot: {
        domains: {
          notes: {
            trend: {
              series: [
                { key: "2026-05-01", label: "05-01", notes: 1, words: 100 },
                { key: "2026-05-02", label: "05-02", notes: 2, words: 500 }
              ]
            }
          }
        }
      },
      noriaBridge: {
        runtime: {
          pagesForScope() { return []; },
          pagesForManagedPath() { return []; }
        },
        t(key) {
          const messages = {
            "runtime.home.trends.noteTrendTitle": "笔记趋势",
            "runtime.home.trends.newNotes": "新建笔记数",
            "runtime.home.trends.words": "码字数",
            "runtime.home.trends.noteTrendAria": "笔记趋势",
            "runtime.home.trends.diaryWordsTooltip": "日记字数"
          };
          return messages[key] || key;
        }
      }
    },
    ctxFallback: { io: { load: async () => "" }, container: createFakeElement() },
    globals: {
      document: {
        createElement: (tag) => createFakeElement(tag),
        createElementNS: (_ns, tag) => createFakeElement(tag)
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Total: 3/);
  assert.match(text, /Total: 600/);
  assert.doesNotMatch(text, /Total: 0/);
});

test("home note share renders distribution from the shared home snapshot", async () => {
  const mount = createFakeElement();
  let donutOptions = null;
  await runRuntimeSource("views/dashboard/home/sections/trends-and-stats/blocks/tag-distribution/view.js", {
    input: {
      mount,
      statsSnapshot: {
        domains: {
          notes: {
            distribution: {
              total: 3,
              items: [
                { key: "01_Projects", count: 2, pct: 66.7 },
                { key: "06_Diary", count: 1, pct: 33.3 }
              ]
            }
          }
        }
      },
      noriaBridge: {
        runtime: {
          pagesForScope() { return []; }
        },
        t(key) {
          const messages = {
            "runtime.home.trends.noteShareTitle": "笔记占比",
            "runtime.home.trends.noMarkdownPaths": "暂无可统计的 Markdown 笔记路径。",
            "runtime.home.trends.other": "其他",
            "runtime.home.trends.rootVault": "根目录"
          };
          return messages[key] || key;
        }
      }
    },
    ctxFallback: { container: createFakeElement() },
    globals: {
      dashboardCore: {
        theme: { home: { trends: {} } },
        components: {
          charts: {
            leaderDonutChart: {
              renderLeaderDonutChart(host, options) {
                donutOptions = options;
                host.createDiv({ text: `donut:${options.total}` });
              }
            }
          }
        }
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.equal(donutOptions?.total, 3);
  assert.deepEqual(donutOptions.items.map((item) => [item.label, item.value]), [["01_Projects", 2], ["06_Diary", 1]]);
  assert.match(text, /donut:3/);
  assert.doesNotMatch(text, /暂无可统计/);
});

test("project guide uses managed project metadata tasks and preserves registry stages", async () => {
  const registryPath = "02_Areas/知识库管理/Projects.md";
  const projectMoc = "01_Projects/论文-6Equation/论文-6Equation·MOC.md";
  const projectTasks = "01_Projects/论文-6Equation/任务列表.md";
  const plannedTasks = "01_Projects/论文-UWENO/任务列表.md";
  const registry = [
    "## 项目隐藏清单",
    "",
    "## 进行中的项目",
    "",
    "- 论文-6 Equation·MOC",
    "",
    "## 计划中的项目",
    "",
    "- [[01_Projects/论文-UWENO/论文-UWENO.md|论文-UWENO]]",
    "",
    "## 已完成的项目",
    "- （空）"
  ].join("\n");
  const fileBodies = new Map([
    [registryPath, registry],
    [projectMoc, "- [ ] 明确论文核心问题与贡献边界 #proj-6equation 📅 2026-04-24"],
    [projectTasks, "- [ ] 补算例 #proj-6equation [due:: 2026-03-09]\n- [x] 已完成项 #proj-6equation"],
    ["01_Projects/论文-UWENO/论文-UWENO.md", ""],
    [plannedTasks, "- [ ] 完成r=n的完整推导程序及得到d_{2r-2}形式 #proj-UWENO"]
  ]);
  const mount = createFakeElement();

  await runRuntimeSource("views/periodic/dashboardGuideProjects.js", {
    input: {
      mount,
      noriaBridge: {
        paths: {
          projectRegistryPath: registryPath,
          projectsRoot: "01_Projects"
        },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath(pathKey) {
            assert.equal(pathKey, "projectsRoot");
            return [
              { file: { path: projectMoc, name: path.basename(projectMoc), tasks: [{ text: "明确论文核心问题与贡献边界", completed: false }] } },
              { file: { path: projectTasks, name: path.basename(projectTasks), tasks: [{ text: "补算例", completed: false }, { text: "已完成项", completed: true }] } },
              { file: { path: "01_Projects/论文-UWENO/论文-UWENO.md", name: "论文-UWENO.md", tasks: [] } },
              { file: { path: plannedTasks, name: path.basename(plannedTasks), tasks: [{ text: "完成r=n的完整推导程序及得到d_{2r-2}形式", completed: false }] } }
            ];
          }
        },
        t(key, params = {}) {
          if (key === "runtime.periodic.projects.emptyActiveProjectTasks") return `${params.name} 当前暂无未完成任务`;
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => fileBodies.get(pathText) || "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          return fileBodies.has(pathText) ? { path: pathText, name: path.basename(pathText) } : null;
        },
        read: async (file) => fileBodies.get(file.path) || "",
        modify: async () => {},
        create: async () => {},
        createFolder: async () => {}
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: {
        innerWidth: 1300,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {}
      },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /论文-6Equation/);
  assert.match(text, /补算例|明确论文核心问题/);
  assert.match(text, /论文-UWENO\*/);
});

test("project guide uses Data API task facts for project todos", async () => {
  const registryPath = "02_Areas/知识库管理/Projects.md";
  const projectMoc = "01_Projects/论文-6Equation/论文-6Equation·MOC.md";
  const projectTasks = "01_Projects/论文-6Equation/任务列表.md";
  const registry = [
    "## 项目隐藏清单",
    "",
    "## 进行中的项目",
    "",
    "- 论文-6 Equation·MOC",
    "",
    "## 计划中的项目",
    "- （空）",
    "",
    "## 已完成的项目",
    "- （空）"
  ].join("\n");
  const fileBodies = new Map([
    [registryPath, registry],
    [projectMoc, ""],
    [projectTasks, ""]
  ]);
  const dataRequests = [];
  const mount = createFakeElement();

  delete globalThis.__noriaHomeProjectsLastDebug;
  await runRuntimeSource("views/periodic/dashboardGuideProjects.js", {
    input: {
      mount,
      noriaBridge: {
        paths: {
          projectRegistryPath: registryPath,
          projectsRoot: "01_Projects"
        },
        data: {
          async getTasks(request) {
            dataRequests.push(request);
            return {
              items: [
                {
                  title: "补算例",
                  completed: false,
                  status: "open",
                  checkbox: { state: "todo" },
                  source: { path: projectTasks, line: 4 },
                  classification: { projectPath: "01_Projects/论文-6Equation", isHabit: false },
                  dates: { due: "2026-05-08" },
                  text: { clean: "补算例", raw: "补算例 #proj-6equation [due:: 2026-05-08]" }
                },
                {
                  title: "继续推导",
                  completed: false,
                  status: "open",
                  checkbox: { state: "in_progress" },
                  source: { path: projectTasks, line: 5 },
                  classification: { projectPath: "01_Projects/论文-6Equation", isHabit: false },
                  dates: { start: "2026-05-01", due: "2026-05-12" },
                  text: { clean: "继续推导", raw: "继续推导 [start:: 2026-05-01] [due:: 2026-05-12]" }
                },
                {
                  title: "已完成项",
                  completed: true,
                  status: "done",
                  checkbox: { state: "done" },
                  source: { path: projectTasks, line: 6 },
                  classification: { projectPath: "01_Projects/论文-6Equation", isHabit: false },
                  dates: { completion: "2026-05-07" },
                  text: { clean: "已完成项", raw: "已完成项 [completion:: 2026-05-07]" }
                },
                {
                  title: "已取消项",
                  completed: false,
                  status: "cancelled",
                  checkbox: { state: "cancelled" },
                  source: { path: projectTasks, line: 7 },
                  classification: { projectPath: "01_Projects/论文-6Equation", isHabit: false },
                  dates: { due: "2026-05-08" },
                  text: { clean: "已取消项", raw: "已取消项 [due:: 2026-05-08]" }
                },
                {
                  title: "习惯打卡",
                  completed: false,
                  status: "open",
                  checkbox: { state: "todo" },
                  source: { path: projectTasks, line: 8 },
                  classification: { projectPath: "01_Projects/论文-6Equation", isHabit: true },
                  dates: { due: "2026-05-08" },
                  text: { clean: "习惯打卡", raw: "习惯打卡 #habit [due:: 2026-05-08]" }
                }
              ]
            };
          }
        },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath(pathKey) {
            assert.equal(pathKey, "projectsRoot");
            return [
              { file: { path: projectMoc, name: path.basename(projectMoc), tasks: [] } },
              { file: { path: projectTasks, name: path.basename(projectTasks), tasks: [] } }
            ];
          }
        },
        t(key, params = {}) {
          if (key === "runtime.periodic.projects.emptyActiveProjectTasks") return `${params.name} 当前暂无未完成任务`;
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => fileBodies.get(pathText) || "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          return fileBodies.has(pathText) ? { path: pathText, name: path.basename(pathText) } : null;
        },
        read: async (file) => fileBodies.get(file.path) || "",
        modify: async () => {},
        create: async () => {},
        createFolder: async () => {}
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: {
        innerWidth: 1300,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {}
      },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.equal(dataRequests.length, 1);
  assert.equal(dataRequests[0].rangePolicy, "allFacts");
  assert.equal(dataRequests[0].bucketBy, "active");
  assert.equal(dataRequests[0].status, "all");
  assert.match(text, /补算例/);
  assert.match(text, /继续推导/);
  assert.doesNotMatch(text, /当前暂无未完成任务/);
  assert.doesNotMatch(text, /已完成项|已取消项|习惯打卡/);
  assert.equal(globalThis.__noriaHomeProjectsLastDebug?.taskSource, "data");
  assert.ok(globalThis.__noriaHomeProjectsLastDebug?.dataTaskCount >= 5);
  delete globalThis.__noriaHomeProjectsLastDebug;
});

test("project guide appends a next step to the selected project note inline", async () => {
  const registryPath = "02_Areas/知识库管理/Projects.md";
  const projectMoc = "01_Projects/论文-6Equation/论文-6Equation.md";
  const registry = [
    "## 项目隐藏清单",
    "",
    "## 进行中的项目",
    "",
    "- 论文-6Equation",
    "",
    "## 计划中的项目",
    "- （空）",
    "",
    "## 已完成的项目",
    "- （空）"
  ].join("\n");
  const fileBodies = new Map([
    [registryPath, registry],
    [projectMoc, "## 目标\n\n完成方程推导。"]
  ]);
  const refreshRequests = [];
  const mount = createFakeElement();

  await runRuntimeSource("views/periodic/dashboardGuideProjects.js", {
    input: {
      mount,
      noriaBridge: {
        paths: {
          projectRegistryPath: registryPath,
          projectsRoot: "01_Projects"
        },
        refresh: {
          requestRefresh(scope, reason) {
            refreshRequests.push([scope, reason]);
          }
        },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath(pathKey) {
            assert.equal(pathKey, "projectsRoot");
            return [{ file: { path: projectMoc, name: path.basename(projectMoc), tasks: [] } }];
          },
          notice() {}
        },
        t(key, params = {}) {
          const map = {
            "runtime.periodic.projects.nextPlaceholder": "记下一步",
            "runtime.periodic.projects.nextAria": `给 ${params.name} 记下一步`,
            "runtime.periodic.projects.nextAdd": `给 ${params.name} 追加下一步`,
            "runtime.periodic.projects.nextAdded": `已追加下一步：${params.name}`,
            "runtime.periodic.projects.nextAddFailed": `追加失败：${params.message}`,
            "runtime.periodic.projects.emptyActiveProjectTasks": `${params.name} 当前暂无未完成任务`,
            "runtime.periodic.projects.openTaskSource": "单击跳转到任务来源",
            "runtime.periodic.projects.taskStats": "任务",
            "runtime.periodic.projects.noTaskStats": "暂无项目任务统计"
          };
          return map[key] || key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => fileBodies.get(pathText) || "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          return fileBodies.has(pathText) ? { path: pathText, name: path.basename(pathText) } : null;
        },
        read: async (file) => fileBodies.get(file.path) || "",
        modify: async (file, text) => {
          fileBodies.set(file.path, text);
        },
        create: async () => {},
        createFolder: async () => {}
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: {
        innerWidth: 1300,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {}
      },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const input = flattenElements(mount).find((el) => /\bdashboard-project-next-input\b/.test(String(el.className || "")));
  const nextRow = flattenElements(mount).find((el) => el.classList?.contains?.("dashboard-project-next-row"));
  const nextButton = flattenElements(mount).find((el) => /\bdashboard-project-next-add\b/.test(String(el.className || "")));
  assert.ok(input, "project panel should expose a next-step input");
  assert.ok(nextRow, "project panel should expose a next-step row");
  assert.ok(nextButton, "project panel should expose a next-step add button");
  assert.equal(input.attrs.placeholder, "记下一步");
  assert.equal(nextRow.attrs["data-noria-project-next-row"], "true");
  assert.equal(nextRow.attrs["data-noria-project-next-state"], "idle");
  assert.equal(nextRow.attrs["data-noria-project-name"], "论文-6Equation");
  assert.equal(nextRow.attrs["data-noria-project-stage"], "active");
  assert.equal(nextRow.attrs["data-noria-project-target-path"], projectMoc);
  assert.equal(input.attrs["data-noria-action-kind"], "append-project-next-step");
  assert.equal(input.attrs["data-noria-action-source"], "home-project-guide");
  assert.equal(input.attrs["data-noria-action-state"], "idle");
  assert.equal(input.attrs["data-noria-project-target-path"], projectMoc);
  assert.equal(nextButton.attrs["data-noria-action-id"], "project-next-step-add");
  assert.equal(nextButton.attrs["data-noria-action-kind"], "append-project-next-step");
  assert.equal(nextButton.attrs["data-noria-action-source"], "home-project-guide");
  assert.equal(nextButton.attrs["data-noria-action-state"], "idle");
  assert.equal(nextButton.attrs["data-noria-project-target-path"], projectMoc);
  input.value = "写下一步实验方案";
  await input.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {}, stopPropagation() {} });

  assert.match(fileBodies.get(projectMoc), /## 目标\n\n完成方程推导。\n\n- \[ \] 写下一步实验方案\n$/);
  assert.equal(input.attrs["data-noria-action-state"], "ok");
  assert.equal(nextButton.attrs["data-noria-action-state"], "ok");
  assert.deepEqual(refreshRequests, [["home", "project-next-step"]]);
  const renderedText = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(renderedText, /写下一步实验方案/);
  const createdRows = flattenElements(mount).filter((el) => el.classList?.contains?.("dashboard-project-task-row"));
  const createdRow = createdRows.find((el) => el.attrs["data-noria-project-task-source-path"] === projectMoc);
  assert.ok(createdRow, "created next step should render as a source-aware project task row");
  assert.equal(createdRow.attrs["data-noria-action-kind"], "open-project-task-source");
  assert.equal(createdRow.attrs["data-noria-action-source"], "home-project-guide");
  assert.equal(createdRow.attrs["data-noria-project-task-kind"], "backlog");
  assert.equal(createdRow.attrs["data-noria-project-task-status"], "open");
  assert.equal(createdRow.attrs["data-noria-project-task-source-line"], "4");
});

test("project guide keeps next-step failures isolated with row state and notice", async () => {
  const registryPath = "02_Areas/知识库管理/Projects.md";
  const projectMoc = "01_Projects/论文-6Equation/论文-6Equation.md";
  const registry = [
    "## 项目隐藏清单",
    "",
    "## 进行中的项目",
    "",
    "- 论文-6Equation",
    "",
    "## 计划中的项目",
    "- （空）",
    "",
    "## 已完成的项目",
    "- （空）"
  ].join("\n");
  const fileBodies = new Map([
    [registryPath, registry],
    [projectMoc, "## 目标\n\n完成方程推导。"]
  ]);
  const notices = [];
  const mount = createFakeElement();

  await runRuntimeSource("views/periodic/dashboardGuideProjects.js", {
    input: {
      mount,
      noriaBridge: {
        paths: {
          projectRegistryPath: registryPath,
          projectsRoot: "01_Projects"
        },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath(pathKey) {
            assert.equal(pathKey, "projectsRoot");
            return [{ file: { path: projectMoc, name: path.basename(projectMoc), tasks: [] } }];
          },
          notice(key, params = {}, duration) {
            notices.push({ key, params, duration });
          }
        },
        t(key, params = {}) {
          const map = {
            "runtime.periodic.projects.nextPlaceholder": "记下一步",
            "runtime.periodic.projects.nextAria": `给 ${params.name} 记下一步`,
            "runtime.periodic.projects.nextAdd": `给 ${params.name} 追加下一步`,
            "runtime.periodic.projects.nextAddFailed": `追加失败：${params.message}`,
            "runtime.periodic.projects.emptyActiveProjectTasks": `${params.name} 当前暂无未完成任务`,
            "runtime.periodic.projects.openTaskSource": "单击跳转到任务来源",
            "runtime.periodic.projects.taskStats": "任务",
            "runtime.periodic.projects.noTaskStats": "暂无项目任务统计"
          };
          return map[key] || key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => fileBodies.get(pathText) || "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          return fileBodies.has(pathText) ? { path: pathText, name: path.basename(pathText) } : null;
        },
        read: async (file) => fileBodies.get(file.path) || "",
        modify: async () => {
          throw new Error("disk locked");
        },
        create: async () => {},
        createFolder: async () => {}
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: {
        innerWidth: 1300,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {}
      },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const input = flattenElements(mount).find((el) => /\bdashboard-project-next-input\b/.test(String(el.className || "")));
  const nextRow = flattenElements(mount).find((el) => el.classList?.contains?.("dashboard-project-next-row"));
  const nextButton = flattenElements(mount).find((el) => /\bdashboard-project-next-add\b/.test(String(el.className || "")));
  input.value = "写下一步实验方案";
  await input.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {}, stopPropagation() {} });

  assert.equal(fileBodies.get(projectMoc), "## 目标\n\n完成方程推导。");
  assert.equal(nextRow.attrs["data-noria-project-next-state"], "error");
  assert.equal(input.attrs["data-noria-action-state"], "failed");
  assert.equal(input.attrs["data-noria-action-error"], "disk locked");
  assert.equal(nextButton.attrs["data-noria-action-state"], "failed");
  assert.equal(nextButton.attrs["data-noria-action-error"], "disk locked");
  assert.equal(input.disabled, false);
  assert.equal(nextButton.disabled, false);
  assert.deepEqual(notices.map((notice) => notice.key), ["runtime.periodic.projects.nextAddFailed"]);
  assert.equal(notices[0].params.message, "disk locked");
});

test("project guide ignores unusable managed task rows without reparsing markdown bodies", async () => {
  const registryPath = "02_Areas/知识库管理/Projects.md";
  const projectMoc = "01_Projects/论文-6Equation/论文-6Equation·MOC.md";
  const projectTasks = "01_Projects/论文-6Equation/任务列表.md";
  const registry = [
    "## 项目隐藏清单",
    "",
    "## 进行中的项目",
    "",
    "- 论文-6 Equation·MOC",
    "",
    "## 计划中的项目",
    "- （空）",
    "",
    "## 已完成的项目",
    "- （空）"
  ].join("\n");
  const fileBodies = new Map([
    [registryPath, registry],
    [projectMoc, "- [ ] 明确论文核心问题与贡献边界 #proj-6equation 📅 2026-04-24"],
    [projectTasks, "- [ ] 补算例 #proj-6equation [due:: 2026-03-09]\n- [x] 已完成项 #proj-6equation"]
  ]);
  const pages = [
    { file: { path: projectMoc, name: "论文-6Equation·MOC.md", tasks: [{ text: "", completed: false }] } },
    { file: { path: projectTasks, name: "任务列表.md", tasks: [{ text: "", completed: false }] } }
  ];
  const mount = createFakeElement();

  delete globalThis.__noriaHomeProjectsLastDebug;
  await runRuntimeSource("views/periodic/dashboardGuideProjects.js", {
    input: {
      mount,
      noriaBridge: {
        paths: {
          projectRegistryPath: registryPath,
          projectsRoot: "01_Projects"
        },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath() {
            return pages;
          }
        },
        t(key, params = {}) {
          if (key === "runtime.periodic.projects.emptyActiveProjectTasks") return `${params.name} 当前暂无未完成任务`;
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => fileBodies.get(pathText) || "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          return fileBodies.has(pathText) ? { path: pathText, name: path.basename(pathText) } : null;
        },
        read: async (file) => fileBodies.get(file.path) || "",
        modify: async () => {},
        create: async () => {},
        createFolder: async () => {}
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: {
        innerWidth: 1300,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {}
      },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.doesNotMatch(text, /补算例|明确论文核心问题/);
  assert.match(text, /当前暂无未完成任务/);
  assert.ok(globalThis.__noriaHomeProjectsLastDebug, "project guide should expose debug diagnostics");
  assert.equal(globalThis.__noriaHomeProjectsLastDebug.projectsRoot, "01_Projects");
  assert.ok(globalThis.__noriaHomeProjectsLastDebug.candidateFileCount >= 2);
  assert.equal(globalThis.__noriaHomeProjectsLastDebug.currentProject?.openCount, 0);
  const openCountHosts = flattenElements(mount).filter((el) => el.attrs["data-project-open-count"] != null);
  assert.ok(openCountHosts.every((el) => Number(el.attrs["data-project-open-count"]) === 0));
  delete globalThis.__noriaHomeProjectsLastDebug;
});

test("project guide respects multi-segment managed project roots", async () => {
  const registryPath = "Noria/Projects.md";
  const projectA = "Noria/Projects/Noria Workspace/Noria Workspace.md";
  const projectB = "Noria/Projects/Paper Materials/Paper Materials.md";
  const registry = [
    "## 项目隐藏清单",
    "",
    "## 进行中的项目",
    "",
    "- [[Noria/Projects/Noria Workspace/Noria Workspace.md|Noria Workspace]]",
    "- [[Noria/Projects/Paper Materials/Paper Materials.md|Paper Materials]]",
    "",
    "## 计划中的项目",
    "- （空）",
    "",
    "## 已完成的项目",
    "- （空）"
  ].join("\n");
  const fileBodies = new Map([
    [registryPath, registry],
    [projectA, "- [x] Create workspace [completion:: 2026-05-05]\n- [ ] Review Home sections [due:: 2026-05-05]"],
    [projectB, "- [x] Collect two papers [completion:: 2026-05-05]\n- [ ] Extract reusable claims [due:: 2026-05-12]"]
  ]);
  const mount = createFakeElement();

  delete globalThis.__noriaHomeProjectsLastDebug;
  await runRuntimeSource("views/periodic/dashboardGuideProjects.js", {
    input: {
      mount,
      noriaBridge: {
        paths: {
          projectRegistryPath: registryPath,
          projectsRoot: "Noria/Projects"
        },
        runtime: {
          toArray(value) {
            return Array.from(value || []);
          },
          pagesForManagedPath(pathKey) {
            assert.equal(pathKey, "projectsRoot");
            return [
              { file: { path: projectA, name: path.basename(projectA), tasks: [{ text: "Create workspace", completed: true }, { text: "Review Home sections", completed: false }] } },
              { file: { path: projectB, name: path.basename(projectB), tasks: [{ text: "Collect two papers", completed: true }, { text: "Extract reusable claims", completed: false }] } }
            ];
          }
        },
        t(key, params = {}) {
          if (key === "runtime.periodic.projects.emptyActiveProjectTasks") return `${params.name} 当前暂无未完成任务`;
          return key;
        }
      }
    },
    ctxFallback: {
      io: { load: async (pathText) => fileBodies.get(pathText) || "" },
      container: createFakeElement()
    },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          return fileBodies.has(pathText) ? { path: pathText, name: path.basename(pathText) } : null;
        },
        read: async (file) => fileBodies.get(file.path) || "",
        modify: async () => {},
        create: async () => {},
        createFolder: async () => {}
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    },
    globals: {
      Notice: function Notice() {},
      window: {
        innerWidth: 1300,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {}
      },
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement(),
        addEventListener() {},
        removeEventListener() {}
      }
    }
  });

  const text = flattenElements(mount).map((el) => el.textContent).filter(Boolean).join(" ");
  assert.match(text, /Noria Workspace/);
  assert.match(text, /Review Home sections/);
  assert.match(text, /Paper Materials/);
  assert.equal(globalThis.__noriaHomeProjectsLastDebug.projectCount, 2);
  assert.ok(globalThis.__noriaHomeProjectsLastDebug.projects.every((project) => project.name !== "Projects"));
  delete globalThis.__noriaHomeProjectsLastDebug;
});

test("MOC chips use filled color surfaces without decorative gradients", () => {
  const bootstrap = readSource("views/dashboard/home/sections/bootstrap-style/view.js");
  const block = bootstrap.match(/\.dashboard-moc-chip\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";
  const hoverBlock = bootstrap.match(/\.dashboard-moc-chip:hover\s*\{[\s\S]*?\n\s{4}\}/)?.[0] || "";

  assert.ok(block, "MOC chip block should exist");
  assert.doesNotMatch(block, /(?:linear|radial)-gradient/i);
  assert.match(block, /--moc-chip-fill/);
  assert.match(block, /background:\s*var\(--moc-chip-fill\)/);
  assert.match(block, /color:\s*var\(--moc-chip-ink\)/);
  const fillLine = block.match(/--moc-chip-fill:[^\n]+/)?.[0] || "";
  assert.doesNotMatch(fillLine, /var\(--moc-chip-accent\)\s+[3-9][0-9]%/);
  assert.match(fillLine, /var\(--moc-chip-accent\)\s+1[2-8]%/);
  assert.ok(hoverBlock, "MOC chip hover block should exist");
  const hoverFillLine = hoverBlock.match(/--moc-chip-fill:[^\n]+/)?.[0] || "";
  assert.doesNotMatch(hoverFillLine, /var\(--moc-chip-accent\)\s+[3-9][0-9]%/);
});

test("Home guide MOC section uses direct chips instead of the retired canvas entry", () => {
  const guidePanels = readSource("views/dashboard/home/sections/guide-panels/view.js");
  const retiredSection = ["moc", "canvas", "portal"].join("-");

  assert.match(guidePanels, /views\/dashboard\/home\/sections\/moc-chips/);
  assert.doesNotMatch(guidePanels, new RegExp(`views/dashboard/home/sections/${retiredSection}`));
});

test("Home MOC chip panel uses its own compact resizer storage", () => {
  const guidePanels = readSource("views/dashboard/home/sections/guide-panels/view.js");

  assert.match(guidePanels, /noria\.tray\.guide\.moc\.chips\.height/);
  assert.doesNotMatch(guidePanels, /noria\.tray\.guide\.moc\.height/);
  assert.match(guidePanels, /minHeight:\s*56/);
  assert.match(guidePanels, /maxHeight:\s*(?:2[0-9]{2}|3[0-9]{2})/);
  assert.match(guidePanels, /overflow-y:auto/);
});

test("home tray resizers expose local transient storage diagnostics", () => {
  const overviewColumns = readSource("views/dashboard/home/sections/overview-columns/view.js");
  const guidePanels = readSource("views/dashboard/home/sections/guide-panels/view.js");
  const sources = [overviewColumns, guidePanels].join("\n");

  assert.match(sources, /data-noria-tray-resize-scope/);
  assert.match(sources, /local-transient/);
  assert.match(sources, /data-noria-tray-resize-key/);
  assert.match(sources, /data-noria-tray-resize-height/);
  assert.match(sources, /data-noria-tray-resize-persisted/);
  assert.match(sources, /role",\s*"separator"/);
  assert.match(sources, /aria-orientation",\s*"horizontal"/);
  assert.match(overviewColumns, /noria\.tray\.workbench\.height/);
  assert.match(guidePanels, /noria\.tray\.guide\.entries\.height/);
  assert.match(guidePanels, /noria\.tray\.guide\.moc\.chips\.height/);
});

test("main MOC resolver keeps configured Markdown primary and same-name Canvas secondary", () => {
  const source = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const start = source.indexOf("  resolveMocTarget(pathText) {");
  const end = source.indexOf("\n  labelFromMocPath(pathText) {", start);
  assert.ok(start >= 0 && end > start, "main MOC resolver source should remain inspectable");
  const block = source.slice(start, end);
  assert.match(block, /targetPath:\s*sourcePath/);
  assert.match(block, /file:\s*direct\s*\|\|\s*null/);
  assert.match(block, /visualPath:\s*canvasPath/);
  assert.match(block, /visualFile:\s*canvasFile\s*\|\|\s*null/);
  assert.doesNotMatch(block, /file:\s*canvasFile\s*\|\|\s*direct/);
});

test("MOC chips keep configured Markdown as the primary entry and expose same-name Canvas as a secondary visual action", async () => {
  const mount = createFakeElement();
  const opened = [];
  await runRuntimeSource("views/dashboard/home/sections/moc-chips/view.js", {
    input: {
      mount,
      noriaBridge: {
        t(key, params = {}) {
          return params.path ? `${key}:${params.path}` : key;
        },
        homeDashboard: {
          getMocEntries() {
            return [{ path: "05_MOC/知识管理·MOC.md", color: "#6366f1" }];
          }
        }
      }
    },
    ctxFallback: { container: mount, paragraph() {} },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          if (pathText === "05_MOC/知识管理·MOC.md") return { path: pathText };
          if (pathText === "05_MOC/知识管理·MOC.canvas") return { path: pathText };
          return null;
        }
      },
      workspace: {
        getLeaf() {
          return {
            openFile(file) {
              opened.push(file.path);
            }
          };
        }
      }
    },
    globals: {
      Notice: function Notice() {},
      window: {},
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement()
      }
    }
  });

  const chip = flattenElements(mount).find((el) => el.tagName === "a" && el.textContent === "知识管理·MOC");
  assert.ok(chip?.onclick, "MOC chip should be directly clickable");
  assert.equal(chip.attrs.href, "05_MOC/知识管理·MOC.md");
  await chip.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(opened, ["05_MOC/知识管理·MOC.md"]);

  const visual = flattenElements(mount).find((el) => el.attrs["data-noria-moc-role"] === "visual");
  assert.ok(visual?.onclick, "same-name Canvas should be exposed as a secondary visual action");
  assert.equal(visual.attrs.title, "runtime.home.moc.openVisual");
  assert.equal(visual.attrs["aria-label"], "runtime.home.moc.openVisual");
  await visual.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(opened, ["05_MOC/知识管理·MOC.md", "05_MOC/知识管理·MOC.canvas"]);
});

test("MOC chips show a missing Markdown primary even when same-name Canvas remains available", async () => {
  const mount = createFakeElement();
  const opened = [];
  await runRuntimeSource("views/dashboard/home/sections/moc-chips/view.js", {
    input: {
      mount,
      noriaBridge: {
        t(key, params = {}) {
          return params.path ? `${key}:${params.path}` : key;
        },
        homeDashboard: {
          getMocEntries() {
            return [{ path: "05_MOC/缺失·MOC.md", color: "#6366f1" }];
          }
        }
      }
    },
    ctxFallback: { container: mount, paragraph() {} },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          if (pathText === "05_MOC/缺失·MOC.canvas") return { path: pathText };
          return null;
        }
      },
      workspace: {
        getLeaf() {
          return {
            openFile(file) {
              opened.push(file.path);
            }
          };
        }
      }
    },
    globals: {
      Notice: function Notice() {},
      window: {},
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement()
      }
    }
  });

  const chip = flattenElements(mount).find((el) => el.tagName === "a" && el.textContent === "缺失·MOC");
  assert.ok(chip?.classList.contains("dashboard-moc-chip--missing"), "missing Markdown should remain visibly missing");
  assert.equal(chip.attrs.href, "05_MOC/缺失·MOC.md");
  await chip.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(opened, []);

  const visual = flattenElements(mount).find((el) => el.attrs["data-noria-moc-role"] === "visual");
  assert.ok(visual?.onclick, "available Canvas should remain independently accessible");
  await visual.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(opened, ["05_MOC/缺失·MOC.canvas"]);
});

test("MOC chips keep explicitly configured Canvas entries as direct legacy visual entries", async () => {
  const mount = createFakeElement();
  const opened = [];
  await runRuntimeSource("views/dashboard/home/sections/moc-chips/view.js", {
    input: {
      mount,
      noriaBridge: {
        t(key, params = {}) {
          return params.path ? `${key}:${params.path}` : key;
        },
        homeDashboard: {
          getMocEntries() {
            return [{ path: "05_MOC/思维模型·MOC.canvas", color: "#10b981" }];
          }
        }
      }
    },
    ctxFallback: { container: mount, paragraph() {} },
    app: {
      vault: {
        getAbstractFileByPath(pathText) {
          if (pathText === "05_MOC/思维模型·MOC.canvas") return { path: pathText };
          return null;
        }
      },
      workspace: {
        getLeaf() {
          return {
            openFile(file) {
              opened.push(file.path);
            }
          };
        }
      }
    },
    globals: {
      Notice: function Notice() {},
      window: {},
      document: {
        createElement: (tag) => createFakeElement(tag),
        body: createFakeElement()
      }
    }
  });

  const chip = flattenElements(mount).find((el) => el.tagName === "a" && el.textContent === "思维模型·MOC");
  assert.equal(chip?.attrs.href, "05_MOC/思维模型·MOC.canvas");
  assert.equal(flattenElements(mount).some((el) => el.attrs["data-noria-moc-role"] === "visual"), false);
  await chip.onclick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(opened, ["05_MOC/思维模型·MOC.canvas"]);
});

test("Home MOC retired canvas implementation is absent", () => {
  const retiredSection = ["moc", "canvas", "portal"].join("-");
  const retiredCamel = ["moc", "Canvas"].join("");
  const portalPath = path.join(pluginRoot, "src", "runtime", "views", "dashboard", "home", "sections", retiredSection, "view.js");
  const main = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8");
  const bootstrap = readSource("views/dashboard/home/sections/bootstrap-style/view.js");
  const retiredMainPattern = new RegExp([
    `${retiredCamel}Path`,
    `MocCanvas`,
    retiredCamel,
    `read${retiredCamel[0].toUpperCase()}${retiredCamel.slice(1)}Snapshot`,
    `create${retiredCamel[0].toUpperCase()}${retiredCamel.slice(1)}FromEntries`,
    `renderMarkdownEmbed`,
    `runtime\\.home\\.${retiredCamel}`,
    `settings\\.home\\.${retiredCamel}Path`
  ].join("|"));

  assert.equal(fs.existsSync(portalPath), false);
  assert.doesNotMatch(main, retiredMainPattern);
  assert.doesNotMatch(bootstrap, new RegExp(["dashboard", "moc", "canvas"].join("-")));
});
