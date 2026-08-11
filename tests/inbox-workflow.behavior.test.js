const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeDomNode(tagName = "div", options = {}) {
  const classes = new Set();
  const node = {
    tagName,
    children: [],
    attrs: {},
    style: { cssText: "" },
    textContent: String(options.text || ""),
    type: "",
    onclick: null,
    onkeydown: null,
    classList: {
      add(...items) {
        items.filter(Boolean).forEach((item) => classes.add(String(item)));
        node.className = [...classes].join(" ");
      },
      remove(...items) {
        items.filter(Boolean).forEach((item) => classes.delete(String(item)));
        node.className = [...classes].join(" ");
      },
      toggle(item, force) {
        const key = String(item || "");
        if (!key) return false;
        const next = force == null ? !classes.has(key) : !!force;
        if (next) classes.add(key);
        else classes.delete(key);
        node.className = [...classes].join(" ");
        return next;
      },
      contains(item) {
        return classes.has(String(item || ""));
      }
    },
    set className(value) {
      classes.clear();
      String(value || "").split(/\s+/).filter(Boolean).forEach((item) => classes.add(item));
      this._className = [...classes].join(" ");
    },
    get className() {
      return this._className || "";
    },
    setAttr(key, value) {
      this.attrs[key] = String(value);
    },
    setAttribute(key, value) {
      this.setAttr(key, value);
    },
    addClass(value) {
      this.classList.add(value);
    },
    toggleClass(value, force) {
      this.classList.toggle(value, force);
    },
    empty() {
      this.children = [];
      this.textContent = "";
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    createDiv(opts = {}) {
      const child = makeDomNode("div", typeof opts === "string" ? { text: opts } : opts);
      this.appendChild(child);
      return child;
    },
    createEl(tag, opts = {}) {
      const child = makeDomNode(tag, opts || {});
      this.appendChild(child);
      return child;
    }
  };
  if (options.cls) node.className = options.cls;
  return node;
}

function findDomNodes(root, predicate) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (predicate(node)) out.push(node);
    (node.children || []).forEach(visit);
  };
  visit(root);
  return out;
}

async function renderHomeInboxRuntime({ bridge, pages = [], files = {}, failOpen = false, readProbe = null }) {
  const source = fs.readFileSync(pluginPath("views/periodic/dashboardGuideInbox.js"), "utf8");
  const host = makeDomNode("div");
  const opened = [];
  const normalizedFiles = new Map(Object.entries(files).map(([filePath, text]) => {
    const p = String(filePath).replace(/\\/g, "/");
    return [p, { path: p, name: p.split("/").pop(), text: String(text || "") }];
  }));
  const app = {
    vault: {
      getAbstractFileByPath(filePath) {
        return normalizedFiles.get(String(filePath || "").replace(/\\/g, "/")) || null;
      },
      async cachedRead(file) {
        if (readProbe && typeof readProbe === "object") {
          readProbe.current = Number(readProbe.current || 0) + 1;
          readProbe.max = Math.max(Number(readProbe.max || 0), readProbe.current);
          try {
            if (Number(readProbe.delayMs || 0) > 0) {
              await new Promise((resolve) => setTimeout(resolve, Number(readProbe.delayMs || 0)));
            }
            return String(normalizedFiles.get(file.path)?.text || "");
          } finally {
            readProbe.current = Math.max(0, Number(readProbe.current || 0) - 1);
          }
        }
        return String(normalizedFiles.get(file.path)?.text || "");
      },
      adapter: {
        async read(filePath) {
          return String(normalizedFiles.get(String(filePath || "").replace(/\\/g, "/"))?.text || "");
        }
      },
      getMarkdownFiles() {
        return [...normalizedFiles.values()];
      }
    },
    workspace: {
      getLeaf() {
        return {
          async openFile(file) {
            if (failOpen) throw new Error("open failed");
            opened.push({ kind: "openFile", path: file.path });
          }
        };
      },
      async openLinkText(pathText) {
        if (failOpen) throw new Error("open failed");
        opened.push({ kind: "openLinkText", path: pathText });
      }
    }
  };
  const runtimeBridge = {
    ...bridge,
    runtime: {
      ...(bridge.runtime || {}),
      pagesForManagedPath() {
        return pages;
      }
    }
  };
  const fn = new Function(
    "input",
    "ctx",
    "app",
    "globalThis",
    "viewThis",
    `return (async function(){\n${source}\n}).call(viewThis);`
  );
  await fn({ noriaBridge: runtimeBridge }, {}, app, {}, { container: host });
  host.__opened = opened;
  return host;
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
          Plugin: class {},
          PluginSettingTab: class {},
          ItemView: class {
            constructor(leaf) {
              this.leaf = leaf;
              this.containerEl = null;
            }
          },
          Setting: class {},
          Notice: class {
            constructor(message) {
              context.__notices.push(String(message || ""));
            }
          },
          setIcon() {},
          getLanguage() {
            return language;
          }
        };
      }
      if (id === "child_process") return {};
      throw new Error(`Unexpected require: ${id}`);
    },
    __notices: [],
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
  const modified = [];
  const renamed = [];
  const folders = [];
  for (const [filePath, text] of Object.entries(options.files || {})) {
    const p = String(filePath || "").replace(/\\/g, "/");
    files.set(p, { path: p, name: p.split("/").pop(), text: String(text || "") });
  }
  const mainLeaf = { id: "main", async setViewState(state) { this.state = state; } };
  const rightLeaf = { id: "right", async setViewState(state) { this.state = state; } };
  const activated = [];
  const getLeafCalls = [];
  const getRightLeafCalls = [];
  plugin.app = {
    workspace: {
      getLeavesOfType() {
        return options.existingLeaves || [];
      },
      getLeaf(kind) {
        getLeafCalls.push(kind);
        return mainLeaf;
      },
      getRightLeaf(create) {
        getRightLeafCalls.push(create);
        return rightLeaf;
      },
      setActiveLeaf(leaf, activationOptions) {
        activated.push({ leaf, options: activationOptions });
      },
      revealLeaf() {
        throw new Error("legacy revealLeaf path must not be used");
      },
      trigger() {}
    },
    vault: {
      getAbstractFileByPath(filePath) {
        const p = String(filePath || "").replace(/\\/g, "/");
        return files.get(p) || null;
      },
      getMarkdownFiles() {
        return [...files.values()].filter((file) => file.path.toLowerCase().endsWith(".md"));
      },
      async cachedRead(file) {
        return String(files.get(file.path)?.text || "");
      },
      async modify(file, text) {
        const p = String(file?.path || "").replace(/\\/g, "/");
        files.set(p, { path: p, name: p.split("/").pop(), text: String(text || "") });
        modified.push(p);
      },
      async rename(file, targetPath) {
        const from = String(file?.path || "").replace(/\\/g, "/");
        const to = String(targetPath || "").replace(/\\/g, "/");
        const existing = files.get(from);
        if (!existing) throw new Error(`Missing source: ${from}`);
        if (files.has(to)) throw new Error(`File already exists: ${to}`);
        files.delete(from);
        files.set(to, { path: to, name: to.split("/").pop(), text: existing.text });
        renamed.push({ from, to });
        return files.get(to);
      },
      async createFolder(folderPath) {
        folders.push(String(folderPath || "").replace(/\\/g, "/"));
      },
      adapter: {
        async exists(filePath) {
          return files.has(String(filePath || "").replace(/\\/g, "/"));
        },
        async read(filePath) {
          return String(files.get(String(filePath || "").replace(/\\/g, "/"))?.text || "");
        },
        async write(filePath, text) {
          const p = String(filePath || "").replace(/\\/g, "/");
          files.set(p, { path: p, name: p.split("/").pop(), text: String(text || "") });
          modified.push(p);
        }
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
  plugin.__modified = modified;
  plugin.__renamed = renamed;
  plugin.__folders = folders;
  plugin.__leaves = { mainLeaf, rightLeaf, activated, getLeafCalls, getRightLeafCalls };
  return plugin;
}

test("inbox workflow settings normalize to configurable status, home view, and base view lists", () => {
  const plugin = makePlugin();
  const settings = plugin.normalizeSettings({});

  assert.equal(settings.inboxWorkflow.defaultStatusId, "triage");
  assert.deepEqual(plain(settings.inboxWorkflow.statuses.map((item) => item.id)), ["triage", "processing", "ready"]);
  assert.ok(settings.inboxWorkflow.homeViews.length >= 3);
  assert.ok(settings.inboxWorkflow.baseViews.length >= 3);
  assert.deepEqual(plain(settings.inboxWorkflow.homeViews.map((item) => item.labelKey)), [
    "runtime.periodic.inbox.triage",
    "runtime.periodic.inbox.reviewDue",
    "runtime.periodic.inbox.processing",
    "runtime.periodic.inbox.closing",
    "runtime.periodic.inbox.trust"
  ]);
  assert.deepEqual(plain(settings.inboxWorkflow.homeViews.map((item) => item.titleKey)), [
    "runtime.periodic.inbox.triageTitle",
    "runtime.periodic.inbox.reviewDueTitle",
    "runtime.periodic.inbox.processingTitle",
    "runtime.periodic.inbox.closingTitle",
    "runtime.periodic.inbox.trustTitle"
  ]);
  assert.deepEqual(plain(settings.inboxWorkflow.homeViews.map((item) => item.showOnHome)), [
    true, false, true, true, false
  ]);

  const custom = plugin.normalizeSettings({
    inboxWorkflow: {
      statuses: [
        { id: "capture", label: "Capture", aliases: ["待决"], color: "#2563eb" },
        { id: "done", label: "Done" }
      ],
      defaultStatusId: "capture",
      homeViews: [{ id: "capture-lane", label: "Capture lane", statusIds: ["capture"], showOnHome: true }],
      baseViews: [{ id: "done-view", label: "Done view", statusIds: ["done"] }]
    }
  });

  assert.deepEqual(plain(custom.inboxWorkflow.statuses.map((item) => item.id)), ["capture", "done"]);
  assert.equal(custom.inboxWorkflow.defaultStatusId, "capture");
  assert.deepEqual(plain(custom.inboxWorkflow.homeViews.map((item) => item.id)), ["capture-lane"]);
  assert.equal(custom.inboxWorkflow.homeViews[0].label, "Capture lane");
  assert.equal(Object.prototype.hasOwnProperty.call(custom.inboxWorkflow.homeViews[0], "labelKey"), false);
  assert.deepEqual(plain(custom.inboxWorkflow.baseViews.map((item) => item.id)), ["done-view"]);
});

test("Inbox workflow settings use direct status and Home-group managers instead of raw JSON", () => {
  const source = fs.readFileSync(pluginPath("main.js"), "utf8");
  const start = source.indexOf("renderInboxWorkflowSettings(containerEl)");
  const end = source.indexOf("renderHomeWorkbenchPanelControls", start);
  assert.ok(start > 0 && end > start, "Inbox workflow settings renderer should be found");
  const body = source.slice(start, end);

  assert.match(body, /noria-inbox-workflow-status-row/);
  assert.match(body, /noria-inbox-workflow-view-row/);
  assert.match(body, /settings\.inboxWorkflow\.addStatus/);
  assert.match(body, /settings\.inboxWorkflow\.addHomeView/);
  assert.match(body, /settings\.inboxWorkflow\.showOnHome/);
  assert.match(body, /decorateSettingsManagerIconButton/);
  assert.doesNotMatch(body, /addJsonSetting\(details,\s*"settings\.inboxWorkflow\.statuses"/);
  assert.doesNotMatch(body, /addJsonSetting\(details,\s*"settings\.inboxWorkflow\.homeViews"/);
});

test("Inbox workflow settings localize untouched defaults without replacing custom labels", () => {
  const source = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = source.indexOf("renderInboxWorkflowSettings(containerEl)");
  const end = source.indexOf("renderHomeWorkbenchPanelControls", start);
  assert.ok(start > 0 && end > start, "Inbox workflow settings renderer should be found");
  const body = source.slice(start, end);

  for (const key of ["triage", "processing", "ready"]) {
    assert.match(source, new RegExp(`settings\\.inboxWorkflow\\.defaultStage\\.${key}`));
  }
  assert.match(body, /displayStatusLabel/);
  assert.match(body, /displayHomeViewLabel/);
  assert.match(body, /label\s*===\s*displayLabel/);
  assert.match(body, /view\?\.labelKey\s*\?\s*this\.t\(view\.labelKey\)/);
});

test("default Inbox workflow has no standalone deferred stage", () => {
  const source = fs.readFileSync(pluginPath("main.js"), "utf8");
  const runtime = fs.readFileSync(pluginPath("views/periodic/dashboardGuideInbox.js"), "utf8");
  const start = source.indexOf("const NORIA_DEFAULT_INBOX_WORKFLOW");
  const end = source.indexOf("const NORIA_DEFAULT_REVIEW_SKILL", start);
  const defaults = source.slice(start, end);

  assert.doesNotMatch(defaults, /id:\s*"deferred"/);
  assert.doesNotMatch(runtime, /actionId === "defer"[\s\S]{0,100}return "deferred"/);
});

test("managed Inbox workflow notes describe the current three-stage model in both locales", () => {
  const english = makePlugin({ language: "en" }).getManagedNoteSeed("inboxWorkflow");
  const chinese = makePlugin({ language: "zh-CN" }).getManagedNoteSeed("inboxWorkflow");

  for (const stage of ["Triage", "Processing", "Ready"]) {
    assert.match(english, new RegExp(`\\| ${stage} \\|`));
  }
  for (const stage of ["判断去留", "正在加工", "准备迁出"]) {
    assert.match(chinese, new RegExp(`\\| ${stage} \\|`));
  }
  assert.match(english, /shows these three stages by default/);
  assert.match(chinese, /默认显示这三个阶段/);
  assert.match(english, /Completion is not a fourth status/);
  assert.match(chinese, /处理完成不是第四个状态/);
  assert.match(english, /not a separate default stage/);
  assert.match(chinese, /不是独立的默认阶段/);
  assert.doesNotMatch(english, /- defer: postpone/);
  assert.doesNotMatch(chinese, /- defer：暂缓/);
});

test("Inbox workflow uses three active stages without a terminal-stage mechanism", () => {
  const plugin = makePlugin();
  const settings = plugin.normalizeSettings({});
  const source = fs.readFileSync(pluginPath("main.js"), "utf8");
  const runtime = fs.readFileSync(pluginPath("views/periodic/dashboardGuideInbox.js"), "utf8");
  const english = makePlugin({ language: "en" }).getManagedNoteSeed("inboxWorkflow");
  const chinese = makePlugin({ language: "zh-CN" }).getManagedNoteSeed("inboxWorkflow");

  assert.deepEqual(
    plain(settings.inboxWorkflow.statuses.map((status) => status.id)),
    ["triage", "processing", "ready"]
  );
  assert.equal(settings.inboxWorkflow.statuses.some((status) => "terminal" in status), false);
  assert.doesNotMatch(source, /settings\.inboxWorkflow\.terminal|excludeTerminal|getInboxTerminalStatusIds/);
  assert.doesNotMatch(runtime, /terminalIds|flags\.terminal|excludeTerminal/);
  assert.doesNotMatch(english, /\| Closed \||`closed`/);
  assert.doesNotMatch(chinese, /\| 已关闭 \||`closed`/);
});

test("Inbox workflow preserves explicit custom stages without legacy status migrations", () => {
  const plugin = makePlugin();
  const custom = plugin.normalizeInboxWorkflowConfig({
    statuses: [
      { id: "triage", label: "Triage" },
      { id: "later", label: "Later", color: "#7c3aed", terminal: true }
    ],
    defaultStatusId: "triage",
    homeViews: [
      { id: "triage", label: "Triage", statusIds: ["triage"], includeMissingCore: true, showOnHome: true, order: 10 },
      { id: "later", label: "Later", statusIds: ["later"], excludeTerminal: true, showOnHome: true, order: 20 }
    ]
  });
  assert.deepEqual(plain(custom.statuses.map((status) => status.id)), ["triage", "later"]);
  assert.equal(custom.statuses.some((status) => "terminal" in status), false);
  assert.equal(custom.homeViews.some((view) => "excludeTerminal" in view), false);
  assert.equal(custom.homeViews.find((view) => view.id === "later").showOnHome, true);
});

test("inbox starter notes and base seeds write configured status ids instead of Chinese legacy values", () => {
  const plugin = makePlugin({ language: "en" });
  plugin.settings = plugin.normalizeSettings({});

  const starterRows = plugin.getStarterInboxDefinitions();
  assert.deepEqual(plain(starterRows.map((row) => row.status)), ["processing", "triage"]);
  assert.doesNotMatch(plugin.buildStarterInboxSeed({ title: "Demo" }), /待决|加工中|已关闭/);
  assert.match(plugin.buildStarterInboxSeed({ title: "Demo" }), /inbox-status: "triage"/);

  const defaultBase = plugin.getManagedNoteSeed("inboxQueue");
  assert.doesNotMatch(defaultBase, /待决|加工中|已关闭/);
  assert.match(defaultBase, /inbox-status == "triage"/);
  assert.doesNotMatch(defaultBase, /inbox-status !=/);

  plugin.settings = plugin.normalizeSettings({
    inboxWorkflow: {
      statuses: [
        { id: "capture", label: "Capture", aliases: ["待决"] },
        { id: "done", label: "Done" }
      ],
      defaultStatusId: "capture",
      baseViews: [
        { id: "capture", label: "Capture", statusIds: ["capture"] },
        { id: "active", label: "Active", statusIds: ["capture"] }
      ]
    }
  });
  const customBase = plugin.getManagedNoteSeed("inboxQueue");
  assert.match(customBase, /name: Capture/);
  assert.match(customBase, /inbox-status == "capture"/);
  assert.doesNotMatch(customBase, /inbox-status !=/);
  assert.doesNotMatch(customBase, /待决|加工中|已关闭/);
});

test("runtime bridge and home inbox view use configured inbox workflow instead of hardcoded Chinese status values", () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({
    inboxWorkflow: {
      statuses: [
        { id: "capture", label: "Capture", aliases: ["待决"] },
        { id: "done", label: "Done", aliases: ["已关闭"] }
      ],
      defaultStatusId: "capture",
      homeViews: [{ id: "capture", label: "Capture", statusIds: ["capture"], showOnHome: true }]
    }
  });

  const bridge = plugin.buildRuntimeBridgeConfig();
  assert.deepEqual(plain(bridge.inboxWorkflow.statuses.map((item) => item.id)), ["capture", "done"]);
  assert.deepEqual(plain(bridge.inboxWorkflow.homeViews.map((item) => item.id)), ["capture"]);

  const source = fs.readFileSync(pluginPath("views/periodic/dashboardGuideInbox.js"), "utf8");
  assert.match(source, /bridge\.inboxWorkflow/);
  assert.match(source, /homeViews/);
  assert.doesNotMatch(source, /待决|加工中|已关闭/);
});

test("home inbox runtime renders configured workflow lanes from object arrays", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "capture", label: "Capture", aliases: ["待决"] },
          { id: "done", label: "Done", aliases: ["已关闭"] }
        ],
        homeViews: [
          { id: "capture", label: "Capture", statusIds: ["capture"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Idea.md", path: "Inbox/Idea.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "capture",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      }
    ],
    files: {
      "Inbox/Idea.md": "---\ninbox-status: capture\n---\n"
    }
  });

  const laneButtons = findDomNodes(host, (node) => /\bdashboard-inbox-lane\b/.test(node.className));
  assert.equal(laneButtons.length, 1);
  assert.equal(laneButtons[0].attrs.title, "Capture");
  assert.equal(laneButtons[0].attrs["data-noria-action-source"], "home-inbox-lane");
  assert.equal(laneButtons[0].attrs["data-noria-action-kind"], "toggle-inbox-lane");
  assert.equal(laneButtons[0].attrs["data-noria-action-state"], "idle");
  assert.equal(laneButtons[0].attrs["data-noria-inbox-lane-id"], "capture");
  assert.equal(laneButtons[0].attrs["data-noria-inbox-lane-label"], "Capture");
  assert.equal(laneButtons[0].attrs["data-noria-inbox-lane-count"], "1");
  assert.equal(laneButtons[0].attrs["data-noria-inbox-lane-state"], "inactive");
  assert.equal(
    findDomNodes(laneButtons[0], (node) => /\bdashboard-inbox-lane__count\b/.test(node.className))[0]?.textContent,
    "1"
  );
  laneButtons[0].onclick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(laneButtons[0].attrs["data-noria-inbox-lane-state"], "active");
  assert.equal(laneButtons[0].attrs["aria-pressed"], "true");
  const summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  assert.equal(summary.attrs["data-noria-inbox-active-lane"], "capture");
  assert.equal(summary.attrs["data-noria-inbox-active-lane-label"], "Capture");
  assert.equal(summary.attrs["data-noria-inbox-active-lane-count"], "1");
});

test("home inbox runtime localizes default workflow lane labels by key", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key) {
        const zh = {
          "runtime.periodic.inbox.triage": "判断去留",
          "runtime.periodic.inbox.triageTitle": "还没明确去留、形态或下一步。"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage", aliases: ["待决"] },
        ],
        homeViews: [
          { id: "triage", label: "Triage", labelKey: "runtime.periodic.inbox.triage", titleKey: "runtime.periodic.inbox.triageTitle", statusIds: ["triage"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Idea.md", path: "Inbox/Idea.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      }
    ],
    files: {
      "Inbox/Idea.md": "---\ninbox-status: triage\n---\n"
    }
  });

  const laneButtons = findDomNodes(host, (node) => /\bdashboard-inbox-lane\b/.test(node.className));
  assert.equal(laneButtons[0].attrs.title, "还没明确去留、形态或下一步。");
  assert.equal(
    findDomNodes(laneButtons[0], (node) => /\bdashboard-inbox-lane__label\b/.test(node.className))[0]?.textContent,
    "判断去留"
  );
});

test("home inbox runtime renders row workbench metadata without adding an action rail", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.closing": "准备迁出",
          "runtime.periodic.inbox.closingTitle": "可以迁出",
          "runtime.periodic.inbox.actionMeta": `动作：${params.action}`,
          "runtime.periodic.inbox.shapeMeta": `形态：${params.shape}`,
          "runtime.periodic.inbox.nextMeta": `下一步：${params.next}`,
          "runtime.periodic.inbox.reviewMeta": `回看 ${params.date}`,
          "runtime.periodic.inbox.needsEvidence": "补证据"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "ready", label: "Ready", aliases: ["准备迁出"] },
        ],
        homeViews: [
          { id: "ready", label: "Ready", labelKey: "runtime.periodic.inbox.closing", titleKey: "runtime.periodic.inbox.closingTitle", statusIds: ["ready"], actionIds: ["file"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Idea.md", path: "Inbox/Idea.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "移入 Area",
        "inbox-review": "2026-05-06"
      }
    ],
    files: {
      "Inbox/Idea.md": "---\ninbox-status: ready\n---\n"
    }
  });

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attrs["data-inbox-path"], "Inbox/Idea.md");
  assert.equal(rows[0].attrs["data-inbox-stage"], "ready");
  assert.equal(rows[0].attrs["data-inbox-status"], "ready");
  assert.equal(rows[0].attrs["data-inbox-action"], "file");
  assert.equal(rows[0].attrs["data-inbox-shape"], "note");
  assert.equal(rows[0].attrs["data-inbox-next"], "移入 Area");

  const metaItems = findDomNodes(rows[0], (node) => /\bdashboard-inbox-row__meta-item\b/.test(node.className));
  assert.deepEqual(
    metaItems.map((node) => node.textContent),
    ["准备迁出", "补证据", "回看 2026-05-06", "动作：file", "形态：note", "下一步：移入 Area"]
  );
  assert.equal(findDomNodes(rows[0], (node) => node.tagName === "button").length, 0);
});

test("home inbox rows expose processing needs and primary next metadata without action rails", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.triage": "判断去留",
          "runtime.periodic.inbox.closing": "准备迁出",
          "runtime.periodic.inbox.actionMeta": `动作：${params.action}`,
          "runtime.periodic.inbox.shapeMeta": `形态：${params.shape}`,
          "runtime.periodic.inbox.nextMeta": `下一步：${params.next}`,
          "runtime.periodic.inbox.reviewMeta": `回看 ${params.date}`,
          "runtime.periodic.inbox.needsDecision": "需要判断",
          "runtime.periodic.inbox.needsEvidence": "补证据"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", labelKey: "runtime.periodic.inbox.triage", statusIds: ["triage"], showOnHome: true },
          { id: "ready", label: "Ready", labelKey: "runtime.periodic.inbox.closing", statusIds: ["ready"], actionIds: ["file"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Capture.md", path: "Inbox/Capture.md", mtime: "2026-05-05T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      },
      {
        file: { name: "Ready.md", path: "Inbox/Ready.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "移入 Area",
        "inbox-review": "2026-05-06"
      }
    ],
    files: {
      "Inbox/Capture.md": "---\ninbox-status: triage\n---\n# Capture\n\n还没有决定去留。",
      "Inbox/Ready.md": "---\ninbox-status: ready\n---\n# Ready\n\n准备迁出。"
    }
  });

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].attrs["data-noria-inbox-needs"], "decision");
  assert.equal(rows[0].attrs["data-noria-inbox-primary-next"], "decide-status");
  assert.match(rows[0].attrs["aria-label"], /需要判断/);

  assert.equal(rows[1].attrs["data-noria-inbox-needs"], "evidence review");
  assert.equal(rows[1].attrs["data-noria-inbox-primary-next"], "add-evidence");
  const readyMetaItems = findDomNodes(rows[1], (node) => /\bdashboard-inbox-row__meta-item\b/.test(node.className));
  assert.deepEqual(
    readyMetaItems.slice(0, 3).map((node) => node.textContent),
    ["准备迁出", "补证据", "回看 2026-05-06"]
  );
  assert.equal(findDomNodes(rows[1], (node) => node.tagName === "button").length, 0);
});

test("home inbox rows keep primary next metadata without rendering safe-next advice text", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.triage": "判断去留",
          "runtime.periodic.inbox.closing": "准备迁出",
          "runtime.periodic.inbox.cuePrefix": "建议",
          "runtime.periodic.inbox.primaryNext.decideStatus": "先补处置判断",
          "runtime.periodic.inbox.primaryNext.addEvidence": "补来源或关联",
          "runtime.periodic.inbox.needsDecision": "需要判断",
          "runtime.periodic.inbox.needsEvidence": "补证据"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "ready", label: "Ready" }
        ],
        homeViews: [
          { id: "triage", label: "Triage", labelKey: "runtime.periodic.inbox.triage", statusIds: ["triage"], showOnHome: true },
          { id: "ready", label: "Ready", labelKey: "runtime.periodic.inbox.closing", statusIds: ["ready"], actionIds: ["file"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Capture.md", path: "Inbox/Capture.md", mtime: "2026-05-05T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      },
      {
        file: { name: "Ready.md", path: "Inbox/Ready.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "移入 Area"
      }
    ],
    files: {
      "Inbox/Capture.md": "---\ninbox-status: triage\n---\n# Capture\n\n还没有决定去留。",
      "Inbox/Ready.md": "---\ninbox-status: ready\n---\n# Ready\n\n准备迁出。"
    }
  });

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.equal(rows[0].attrs["data-noria-inbox-primary-next"], "decide-status");
  assert.equal(rows[0].attrs["data-noria-inbox-primary-next-label"], "先补处置判断");
  assert.match(rows[0].attrs["aria-label"], /先补处置判断/);

  const firstSafeNext = findDomNodes(rows[0], (node) => /(?:^|\s)dashboard-inbox-row__cue(?:\s|$)/.test(node.className));
  assert.equal(firstSafeNext.length, 0);

  assert.equal(rows[1].attrs["data-noria-inbox-primary-next"], "add-evidence");
  assert.equal(rows[1].attrs["data-noria-inbox-primary-next-label"], "补来源或关联");
  assert.match(rows[1].attrs["aria-label"], /补来源或关联/);
  const secondSafeNext = findDomNodes(rows[1], (node) => /(?:^|\s)dashboard-inbox-row__cue(?:\s|$)/.test(node.className));
  assert.equal(secondSafeNext.length, 0);
  assert.equal(findDomNodes(rows[0], (node) => /\bdashboard-inbox-row__meta-primary\b/.test(node.className)).length, 0);
  assert.equal(findDomNodes(rows[1], (node) => /\bdashboard-inbox-row__meta-primary\b/.test(node.className)).length, 0);
  assert.equal(findDomNodes(rows[0], (node) => node.tagName === "button").length, 0);
  assert.equal(findDomNodes(rows[1], (node) => node.tagName === "button").length, 0);
});

test("home inbox rows expose gentle rhythm cues without a separate suggestion panel", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.triage": "判断去留",
          "runtime.periodic.inbox.closing": "准备迁出",
          "runtime.periodic.inbox.quiet": "稍后处理",
          "runtime.periodic.inbox.cuePrefix": "建议",
          "runtime.periodic.inbox.primaryNext.decideStatus": "先补处置判断",
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源",
          "runtime.periodic.inbox.rhythm.now": "现在",
          "runtime.periodic.inbox.rhythm.next": "推进",
          "runtime.periodic.inbox.rhythm.later": "稍后"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "ready", label: "Ready" },
          { id: "defer", label: "Deferred" }
        ],
        homeViews: [
          { id: "triage", label: "Triage", labelKey: "runtime.periodic.inbox.triage", statusIds: ["triage"], showOnHome: true },
          { id: "ready", label: "Ready", labelKey: "runtime.periodic.inbox.closing", statusIds: ["ready"], actionIds: ["file"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Capture.md", path: "Inbox/Capture.md", mtime: "2026-05-05T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      },
      {
        file: { name: "Ready.md", path: "Inbox/Ready.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "02_Areas/知识库管理",
        related: ["[[知识库管理]]"]
      },
      {
        file: { name: "Later.md", path: "Inbox/Later.md", mtime: "2026-05-07T00:00:00.000Z" },
        "inbox-status": "defer",
        "inbox-action": "defer",
        "inbox-shape": "note",
        "inbox-next": ""
      }
    ],
    files: {
      "Inbox/Capture.md": "---\ninbox-status: triage\n---\n# Capture\n\n还没有决定去留。",
      "Inbox/Ready.md": "---\ninbox-status: ready\ninbox-action: file\ninbox-shape: note\ninbox-next: 02_Areas/知识库管理\n---\n# Ready\n\n准备迁出。\n\n## Source\n\nhttps://example.com",
      "Inbox/Later.md": "---\ninbox-status: defer\ninbox-action: defer\n---\n# Later\n\n暂时不用处理。"
    }
  });

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.deepEqual(rows.map((row) => row.attrs["data-noria-inbox-rhythm"]), ["now", "next", "later"]);

  const rhythmChips = rows.map((row) => findDomNodes(row, (node) => /\bdashboard-inbox-row__rhythm\b/.test(node.className))[0]);
  assert.deepEqual(rhythmChips.map((node) => node?.textContent), ["现在", "推进", "稍后"]);
  assert.deepEqual(rhythmChips.map((node) => node?.attrs["data-noria-inbox-rhythm"]), ["now", "next", "later"]);
  assert.match(rows[0].attrs["aria-label"], /现在/);
  assert.equal(findDomNodes(host, (node) => /\bdashboard-inbox-suggestion-panel\b/.test(node.className)).length, 0);
});

test("home inbox workbench exposes queue scope and overflow without adding action buttons", async () => {
  const pages = Array.from({ length: 12 }, (_, index) => {
    const n = index + 1;
    return {
      file: { name: `Item-${n}.md`, path: `Inbox/Item-${n}.md`, mtime: `2026-05-${String(n).padStart(2, "0")}T00:00:00.000Z` },
      "inbox-status": "triage",
      "inbox-action": "",
      "inbox-shape": "",
      "inbox-next": "",
      "inbox-review": index < 3 ? "2026-05-06" : ""
    };
  });
  const files = Object.fromEntries(pages.map((page, index) => [
    page.file.path,
    `---\ninbox-status: triage\n---\n# Item ${index + 1}\n\n需要判断。`
  ]));
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.triage": "判断去留",
          "runtime.periodic.inbox.queueSummary": `显示 ${params.visible}/${params.total}`,
          "runtime.periodic.inbox.queueHidden": `未显示 ${params.hidden}`,
          "runtime.periodic.inbox.queueExpand": `展开剩余 ${params.hidden}`,
          "runtime.periodic.inbox.primaryNext.decideStatus": "先补处置判断"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", labelKey: "runtime.periodic.inbox.triage", statusIds: ["triage"], includeMissingCore: true, showOnHome: true }
        ]
      }
    },
    pages,
    files
  });

  const summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  assert.ok(summary);
  assert.equal(summary.attrs["data-noria-inbox-total"], "12");
  assert.equal(summary.attrs["data-noria-inbox-filtered"], "12");
  assert.equal(summary.attrs["data-noria-inbox-visible"], "10");
  assert.equal(summary.attrs["data-noria-inbox-hidden"], "2");
  assert.equal(summary.attrs["data-noria-inbox-attention"], "12");
  assert.equal(summary.attrs["data-noria-inbox-review-due"], "3");
  assert.equal(summary.attrs["data-noria-inbox-active-lane"], "");
  assert.deepEqual(
    findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item\b/.test(node.className)).map((node) => node.textContent),
    ["展开剩余 2"]
  );
  assert.equal(findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--priority\b/.test(node.className)).length, 0);
  assert.equal(findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--health\b/.test(node.className)).length, 0);
  assert.equal(findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--attention\b/.test(node.className)).length, 0);
  assert.equal(findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--review\b/.test(node.className)).length, 0);
  assert.equal(findDomNodes(summary, (node) => node.tagName === "button").length, 0);
});

test("home inbox workbench exposes queue health without adding action controls", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.processing": "正在加工",
          "runtime.periodic.inbox.closing": "准备迁出",
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源",
          "runtime.periodic.inbox.primaryNext.reviewSource": "回看来源"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "processing", label: "Processing" },
          { id: "ready", label: "Ready" },
          { id: "deferred", label: "Deferred", aliases: ["暂缓"] },
        ],
        homeViews: [
          { id: "processing", label: "Processing", labelKey: "runtime.periodic.inbox.processing", statusIds: ["processing"], showOnHome: true },
          { id: "ready", label: "Ready", labelKey: "runtime.periodic.inbox.closing", statusIds: ["ready"], actionIds: ["file"], showOnHome: true },
          { id: "deferred", label: "Deferred", statusIds: ["deferred"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Ready.md", path: "Inbox/Ready.md", mtime: "2026-05-07T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "02_Areas/Ready.md",
        related: ["[[Ready Area]]"]
      },
      {
        file: { name: "Blocked.md", path: "Inbox/Blocked.md", mtime: "2026-05-08T00:00:00.000Z" },
        "inbox-status": "legacy",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "02_Areas/Blocked.md",
        related: ["[[Blocked Area]]"]
      },
      {
        file: { name: "Waiting.md", path: "Inbox/Waiting.md", mtime: "2026-05-09T00:00:00.000Z" },
        "inbox-status": "deferred",
        "inbox-action": "",
        "inbox-shape": ""
      },
      {
        file: { name: "Stale.md", path: "Inbox/Stale.md", mtime: "2026-05-10T00:00:00.000Z" },
        "inbox-status": "processing",
        "inbox-action": "refine",
        "inbox-shape": "note",
        "inbox-review": "2026-05-06"
      }
    ],
    files: {
      "Inbox/Ready.md": "---\ninbox-status: ready\nrelated:\n  - \"[[Ready Area]]\"\n---\n# Ready\n\n## Source\n[[Ready Area]]",
      "Inbox/Blocked.md": "---\ninbox-status: legacy\nrelated:\n  - \"[[Blocked Area]]\"\n---\n# Blocked\n\n## Source\n[[Blocked Area]]",
      "Inbox/Waiting.md": "---\ninbox-status: deferred\n---\n# Waiting",
      "Inbox/Stale.md": "---\ninbox-status: processing\n---\n# Stale"
    }
  });

  const summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  assert.ok(summary);
  assert.equal(summary.attrs["data-noria-inbox-health-ready"], "1");
  assert.equal(summary.attrs["data-noria-inbox-health-blocked"], "1");
  assert.equal(summary.attrs["data-noria-inbox-health-waiting"], "1");
  assert.equal(summary.attrs["data-noria-inbox-health-stale"], "1");
  assert.equal(summary.attrs["data-noria-inbox-health-primary-path"], "Inbox/Ready.md");
  assert.equal(summary.attrs["data-noria-inbox-health-primary-stage"], "ready");

  const health = findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--health\b/.test(node.className));
  assert.equal(health.length, 0);
  assert.equal(findDomNodes(summary, (node) => node.tagName === "button").length, 0);
});

test("home inbox overflow expands in place through a quiet summary text action", async () => {
  const pages = Array.from({ length: 12 }, (_, index) => {
    const n = index + 1;
    return {
      file: { name: `Item-${n}.md`, path: `Inbox/Item-${n}.md`, mtime: `2026-05-${String(n).padStart(2, "0")}T00:00:00.000Z` },
      "inbox-status": "triage",
      "inbox-action": "",
      "inbox-shape": "",
      "inbox-next": ""
    };
  });
  const files = Object.fromEntries(pages.map((page, index) => [
    page.file.path,
    `---\ninbox-status: triage\n---\n# Item ${index + 1}\n\n需要判断。`
  ]));
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.triage": "判断去留",
          "runtime.periodic.inbox.queueSummary": `显示 ${params.visible}/${params.total}`,
          "runtime.periodic.inbox.queueHidden": `未显示 ${params.hidden}`,
          "runtime.periodic.inbox.queueExpand": `展开剩余 ${params.hidden}`,
          "runtime.periodic.inbox.queueCollapse": `收起到 ${params.limit}`,
          "runtime.periodic.inbox.primaryNext.decideStatus": "先补处置判断"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", labelKey: "runtime.periodic.inbox.triage", statusIds: ["triage"], includeMissingCore: true, showOnHome: true }
        ]
      }
    },
    pages,
    files
  });

  let rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  let summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  let action = findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--overflow-action\b/.test(node.className))[0];
  assert.equal(rows.length, 10);
  assert.equal(summary.attrs["data-noria-inbox-overflow-state"], "collapsed");
  assert.equal(action.tagName, "span");
  assert.equal(action.attrs.role, "button");
  assert.equal(action.attrs.tabindex, "0");
  assert.equal(action.attrs["data-noria-action-source"], "home-inbox-overflow");
  assert.equal(action.attrs["data-noria-action-kind"], "expand-inbox-overflow");
  assert.equal(action.attrs["data-noria-action-state"], "idle");
  assert.equal(action.attrs["data-noria-inbox-hidden"], "2");
  assert.equal(action.textContent, "展开剩余 2");
  assert.equal(findDomNodes(summary, (node) => node.tagName === "button").length, 0);

  await action.onclick({ preventDefault() {}, stopPropagation() {} });

  rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  action = findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--overflow-action\b/.test(node.className))[0];
  assert.equal(rows.length, 12);
  assert.equal(summary.attrs["data-noria-inbox-visible"], "12");
  assert.equal(summary.attrs["data-noria-inbox-hidden"], "0");
  assert.equal(summary.attrs["data-noria-inbox-overflow-state"], "expanded");
  assert.equal(action.attrs["data-noria-action-kind"], "collapse-inbox-overflow");
  assert.equal(action.attrs["data-noria-inbox-hidden"], "0");
  assert.equal(action.textContent, "收起到 10");

  await action.onkeydown({ key: "Enter", preventDefault() {}, stopPropagation() {} });

  rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  assert.equal(rows.length, 10);
  assert.equal(summary.attrs["data-noria-inbox-overflow-state"], "collapsed");
});

test("home inbox workbench exposes current priority without adding action controls", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      t(key, params = {}) {
        const zh = {
          "runtime.periodic.inbox.triage": "判断去留",
          "runtime.periodic.inbox.closing": "准备迁出",
          "runtime.periodic.inbox.primaryNext.decideStatus": "先补处置判断",
          "runtime.periodic.inbox.primaryNext.addEvidence": "补来源或关联",
          "runtime.periodic.inbox.needsDecision": "需要判断",
          "runtime.periodic.inbox.needsEvidence": "补证据"
        };
        return zh[key] || key;
      },
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "ready", label: "Ready" }
        ],
        homeViews: [
          { id: "triage", label: "Triage", labelKey: "runtime.periodic.inbox.triage", statusIds: ["triage"], includeMissingCore: true, showOnHome: true },
          { id: "ready", label: "Ready", labelKey: "runtime.periodic.inbox.closing", statusIds: ["ready"], actionIds: ["file"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Ready.md", path: "Inbox/Ready.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "移入 Area"
      },
      {
        file: { name: "Capture.md", path: "Inbox/Capture.md", mtime: "2026-05-05T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      }
    ],
    files: {
      "Inbox/Ready.md": "---\ninbox-status: ready\n---\n# Ready\n\n准备迁出。",
      "Inbox/Capture.md": "---\ninbox-status: triage\n---\n# Capture\n\n还没有决定去留。"
    }
  });

  const summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  assert.ok(summary);
  assert.equal(summary.attrs["data-noria-inbox-priority-path"], "Inbox/Capture.md");
  assert.equal(summary.attrs["data-noria-inbox-priority-next"], "decide-status");
  assert.equal(summary.attrs["data-noria-inbox-priority-label"], "先补处置判断");
  assert.equal(summary.attrs["data-noria-inbox-priority-stage"], "triage");

  const summaryItems = findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item\b/.test(node.className));
  assert.equal(summaryItems.length, 0);
  assert.equal(host.__opened.length, 0);

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.equal(rows[0].attrs["data-inbox-path"], "Inbox/Capture.md");
  assert.equal(rows[0].attrs["data-noria-inbox-priority-rank"], "1");
  assert.equal(rows[0].attrs["data-noria-inbox-sort-reason"], "decide-status");
  assert.equal(rows[1].attrs["data-noria-inbox-priority-rank"], "2");
  assert.equal(rows[1].attrs["data-noria-inbox-sort-reason"], "add-evidence");
  assert.equal(findDomNodes(summary, (node) => node.tagName === "button").length, 0);
  assert.equal(findDomNodes(rows[0], (node) => node.tagName === "button").length, 0);
});

test("home inbox rows expose source-aware workbench actions and keyboard open behavior", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", statusIds: ["triage"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Idea.md", path: "Inbox/Idea.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "整理到项目"
      }
    ],
    files: {
      "Inbox/Idea.md": "---\ninbox-status: triage\n---\n# Idea\n\n整理到项目。"
    }
  });

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attrs.role, "button");
  assert.equal(rows[0].attrs.tabindex, "0");
  assert.equal(rows[0].attrs["data-noria-action-kind"], "open-inbox-source");
  assert.equal(rows[0].attrs["data-noria-action-source"], "home-inbox");
  assert.equal(rows[0].attrs["data-noria-action-target"], "Inbox/Idea.md");
  assert.equal(rows[0].attrs["data-noria-action-state"], "idle");
  assert.equal(rows[0].attrs["data-noria-inbox-stage"], "triage");
  assert.equal(rows[0].attrs["data-noria-inbox-status"], "triage");

  await rows[0].onclick({ target: null });
  assert.equal(rows[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(host.__opened[0], { kind: "openFile", path: "Inbox/Idea.md" });

  let prevented = false;
  await rows[0].onkeydown({ key: "Enter", preventDefault() { prevented = true; }, target: null });
  assert.equal(prevented, true);
  assert.equal(rows[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(host.__opened[1], { kind: "openFile", path: "Inbox/Idea.md" });

  const link = findDomNodes(rows[0], (node) => node.tagName === "a" && /\bdashboard-task-title--link\b/.test(node.className))[0];
  assert.ok(link);
  assert.equal(link.attrs["data-noria-action-kind"], "open-inbox-source");
  assert.equal(link.attrs["data-noria-action-state"], "idle");
});

test("home inbox source open reports failure on the same row", async () => {
  const notices = [];
  const host = await renderHomeInboxRuntime({
    failOpen: true,
    bridge: {
      paths: { inboxRoot: "Inbox" },
      runtime: {
        notice(key, params = {}) {
          notices.push({ key, params });
        }
      },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" }
        ],
        homeViews: [
          { id: "triage", label: "Triage", statusIds: ["triage"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Idea.md", path: "Inbox/Idea.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "file",
        "inbox-shape": "note"
      }
    ],
    files: {
      "Inbox/Idea.md": "---\ninbox-status: triage\n---\n# Idea\n\n整理到项目。"
    }
  });

  const row = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className))[0];
  assert.ok(row);
  assert.equal(await row.onclick({ target: null }), false);
  assert.equal(row.attrs["data-noria-action-state"], "failed");
  assert.equal(row.attrs["data-noria-action-error"], "open failed");
  assert.equal(notices[0].key, "runtime.periodic.inbox.openSourceFailed");
  assert.equal(notices[0].params.reason, "open failed");
});

test("home inbox exposes SOP writeback boundaries without adding row action rails", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", statusIds: ["triage"], includeMissingCore: true, showOnHome: true },
          { id: "ready", label: "Ready", statusIds: ["ready"], actionIds: ["file"], showOnHome: true }
        ]
      },
      t(key, params = {}) {
        const messages = {
          "runtime.periodic.inbox.primaryNext.decideStatus": "先补处置判断",
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源",
          "runtime.periodic.inbox.needsDecision": "需要判断"
        };
        return messages[key] || key;
      }
    },
    pages: [
      {
        file: { name: "Ready.md", path: "Inbox/Ready.md", mtime: "2026-05-07T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "移入 Area",
        related: ["[[Area]]"]
      },
      {
        file: { name: "Capture.md", path: "Inbox/Capture.md", mtime: "2026-05-05T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      },
      {
        file: { name: "Legacy.md", path: "Inbox/Legacy.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "legacy",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "迁移旧状态"
      }
    ],
    files: {
      "Inbox/Ready.md": "---\ninbox-status: ready\nrelated:\n  - \"[[Area]]\"\n---\n# Ready\n\n## Source\n[[Area]]",
      "Inbox/Capture.md": "---\ninbox-status: triage\n---\n# Capture",
      "Inbox/Legacy.md": "---\ninbox-status: legacy\n---\n# Legacy\n\n## Source\n[[Old]]"
    }
  });

  const summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  assert.ok(summary);
  assert.equal(summary.attrs["data-noria-inbox-writeback-ready"], "1");
  assert.equal(summary.attrs["data-noria-inbox-writeback-source-only"], "1");
  assert.equal(summary.attrs["data-noria-inbox-writeback-blocked"], "1");
  const writebackSummary = findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--writeback\b/.test(node.className));
  assert.equal(writebackSummary.length, 0);

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  const byPath = new Map(rows.map((row) => [row.attrs["data-inbox-path"], row]));
  assert.equal(byPath.get("Inbox/Ready.md").attrs["data-noria-inbox-writeback-state"], "ready");
  assert.equal(byPath.get("Inbox/Ready.md").attrs["data-noria-inbox-writeback-boundary"], "sop-ready");
  assert.equal(byPath.get("Inbox/Ready.md").attrs["data-noria-inbox-writeback-capabilities"], "open-source status-writeback move-candidate");

  assert.equal(byPath.get("Inbox/Capture.md").attrs["data-noria-inbox-writeback-state"], "source-only");
  assert.equal(byPath.get("Inbox/Capture.md").attrs["data-noria-inbox-writeback-boundary"], "missing-decision");
  assert.equal(byPath.get("Inbox/Capture.md").attrs["data-noria-inbox-writeback-capabilities"], "open-source");

  assert.equal(byPath.get("Inbox/Legacy.md").attrs["data-noria-inbox-writeback-state"], "blocked");
  assert.equal(byPath.get("Inbox/Legacy.md").attrs["data-noria-inbox-writeback-boundary"], "unknown-status");
  assert.equal(byPath.get("Inbox/Legacy.md").attrs["data-noria-inbox-writeback-capabilities"], "open-source");
  assert.equal(findDomNodes(host, (node) => node.tagName === "button" && /\bdashboard-inbox-row\b/.test(node.className)).length, 0);
});

test("home inbox exposes structural action confirmation boundaries before destructive writeback", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", statusIds: ["triage"], includeMissingCore: true, showOnHome: true },
          { id: "ready", label: "Ready", statusIds: ["ready"], actionIds: ["file", "archive", "delete"], showOnHome: true }
        ]
      },
      t(key, params = {}) {
        const messages = {
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源"
        };
        return messages[key] || key;
      }
    },
    pages: [
      {
        file: { name: "File.md", path: "Inbox/File.md", mtime: "2026-05-08T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "02_Areas/知识库管理/File.md",
        related: ["[[知识库管理]]"]
      },
      {
        file: { name: "Delete.md", path: "Inbox/Delete.md", mtime: "2026-05-09T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "delete",
        "inbox-shape": "note"
      },
      {
        file: { name: "Task.md", path: "Inbox/Task.md", mtime: "2026-05-10T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "task",
        "inbox-next": "01_Projects/Noria.md",
        related: ["[[Noria]]"]
      }
    ],
    files: {
      "Inbox/File.md": "---\ninbox-status: ready\nrelated:\n  - \"[[知识库管理]]\"\n---\n# File\n\n## Source\n[[知识库管理]]",
      "Inbox/Delete.md": "---\ninbox-status: ready\n---\n# Delete",
      "Inbox/Task.md": "---\ninbox-status: ready\nrelated:\n  - \"[[Noria]]\"\n---\n# Task\n\n## Source\n[[Noria]]"
    }
  });

  const summary = findDomNodes(host, (node) => /\bdashboard-inbox-workbench-summary\b/.test(node.className))[0];
  assert.ok(summary);
  assert.equal(summary.attrs["data-noria-inbox-structural-candidates"], "3");
  assert.equal(summary.attrs["data-noria-inbox-structural-blocked"], "0");
  const structuralSummary = findDomNodes(summary, (node) => /\bdashboard-inbox-workbench-summary__item--structural\b/.test(node.className));
  assert.equal(structuralSummary.length, 0);

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  const byPath = new Map(rows.map((row) => [row.attrs["data-inbox-path"], row]));
  assert.equal(byPath.get("Inbox/File.md").attrs["data-noria-inbox-structural-state"], "requires-confirmation");
  assert.equal(byPath.get("Inbox/File.md").attrs["data-noria-inbox-structural-actions"], "move base-sync");
  assert.equal(byPath.get("Inbox/File.md").attrs["data-noria-inbox-structural-boundary"], "destination-confirmation");
  assert.equal(byPath.get("Inbox/File.md").attrs["data-noria-inbox-structural-requires"], "source-position destination-confirmation base-sync");
  assert.equal(byPath.get("Inbox/File.md").attrs["data-noria-inbox-structural-target"], "02_Areas/知识库管理/File.md");

  assert.equal(byPath.get("Inbox/Delete.md").attrs["data-noria-inbox-structural-state"], "requires-confirmation");
  assert.equal(byPath.get("Inbox/Delete.md").attrs["data-noria-inbox-structural-actions"], "delete base-sync");
  assert.equal(byPath.get("Inbox/Delete.md").attrs["data-noria-inbox-structural-boundary"], "delete-confirmation");
  assert.equal(byPath.get("Inbox/Delete.md").attrs["data-noria-inbox-structural-requires"], "source-position delete-confirmation base-sync");

  assert.equal(byPath.get("Inbox/Task.md").attrs["data-noria-inbox-structural-state"], "requires-confirmation");
  assert.equal(byPath.get("Inbox/Task.md").attrs["data-noria-inbox-structural-actions"], "move convert-task base-sync");
  assert.equal(byPath.get("Inbox/Task.md").attrs["data-noria-inbox-structural-boundary"], "task-conversion-preview");
  assert.equal(byPath.get("Inbox/Task.md").attrs["data-noria-inbox-structural-requires"], "source-position destination-confirmation task-preview base-sync");

  assert.equal(findDomNodes(host, (node) => node.tagName === "button" && /archive|delete|move|convert/i.test(node.textContent || "")).length, 0);
  assert.equal(findDomNodes(host, (node) => /\bdashboard-inbox-row__structural-action\b/.test(node.className)).length, 0);
});

test("home inbox renders one quiet structural preview panel that follows focused candidates", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "ready", label: "Ready", statusIds: ["ready"], actionIds: ["file", "archive", "delete"], showOnHome: true }
        ]
      },
      inbox: {
        async moveOut() {
          return { ok: true };
        },
        async convertToTask() {
          return { ok: true };
        }
      },
      t(key, params = {}) {
        const messages = {
          "runtime.periodic.inbox.structuralPanel.title": "收口预览",
          "runtime.periodic.inbox.structuralPanel.state.requires-confirmation": "待确认",
          "runtime.periodic.inbox.structuralPanel.action.move": "迁出",
          "runtime.periodic.inbox.structuralPanel.action.delete": "删除",
          "runtime.periodic.inbox.structuralPanel.action.convert-task": "转任务",
          "runtime.periodic.inbox.structuralPanel.action.base-sync": "同步 Base",
          "runtime.periodic.inbox.structuralPanel.target": `目标 ${params.target}`,
          "runtime.periodic.inbox.structuralPanel.noTarget": "目标待补",
          "runtime.periodic.inbox.structuralPanel.require.source-position": "来源定位",
          "runtime.periodic.inbox.structuralPanel.require.destination-confirmation": "确认去向",
          "runtime.periodic.inbox.structuralPanel.require.task-preview": "任务预览",
          "runtime.periodic.inbox.structuralPanel.require.base-sync": "Base 同步",
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源"
        };
        return messages[key] || key;
      }
    },
    pages: [
      {
        file: { name: "File.md", path: "Inbox/File.md", mtime: "2026-05-08T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "02_Areas/知识库管理/File.md",
        related: ["[[知识库管理]]"]
      },
      {
        file: { name: "Task.md", path: "Inbox/Task.md", mtime: "2026-05-09T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "task",
        "inbox-next": "01_Projects/Noria.md",
        related: ["[[Noria]]"]
      }
    ],
    files: {
      "Inbox/File.md": "---\ninbox-status: ready\nrelated:\n  - \"[[知识库管理]]\"\n---\n# File\n\n## Source\n[[知识库管理]]",
      "Inbox/Task.md": "---\ninbox-status: ready\nrelated:\n  - \"[[Noria]]\"\n---\n# Task\n\n## Source\n[[Noria]]",
      "01_Projects/Noria.md": "# Noria"
    }
  });

  const panels = findDomNodes(host, (node) => /\bdashboard-inbox-structural-panel\b/.test(node.className));
  assert.equal(panels.length, 1);
  const panel = panels[0];
  assert.equal(panel.attrs["data-noria-inbox-structural-panel"], "1");
  assert.equal(panel.attrs["data-noria-inbox-structural-state"], "requires-confirmation");
  assert.equal(panel.attrs["data-noria-inbox-structural-source"], "Inbox/File.md");
  assert.equal(panel.attrs["data-noria-inbox-structural-actions"], "move base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-target"], "02_Areas/知识库管理/File.md");
  assert.equal(panel.attrs["data-noria-action-state"], "preview-only");
  assert.equal(panel.attrs["data-noria-inbox-structural-can-execute"], "true");
  assert.equal(panel.attrs["data-noria-inbox-structural-executable-actions"], "move-inbox-file");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-actions"], "base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-reason"], "base-sync-not-implemented");
  assert.equal(findDomNodes(panel, (node) => node.tagName === "button").length, 0);

  const actionChips = findDomNodes(panel, (node) => /\bdashboard-inbox-structural-panel__action\b/.test(node.className));
  assert.deepEqual(actionChips.map((node) => node.textContent), ["迁出", "同步 Base"]);
  const requireChips = findDomNodes(panel, (node) => /\bdashboard-inbox-structural-panel__check\b/.test(node.className));
  assert.deepEqual(requireChips.map((node) => node.textContent), ["来源定位", "确认去向", "Base 同步"]);
  const handoffs = () => findDomNodes(panel, (node) => /\bdashboard-inbox-structural-panel__handoff\b/.test(node.className));
  const sourceHandoff = () => handoffs().find((node) => node.attrs["data-noria-inbox-structural-handoff"] === "source");
  const targetHandoff = () => handoffs().find((node) => node.attrs["data-noria-inbox-structural-handoff"] === "target");

  assert.equal(sourceHandoff().attrs.role, "button");
  assert.equal(sourceHandoff().attrs["data-noria-action-source"], "home-inbox-structural");
  assert.equal(sourceHandoff().attrs["data-noria-action-kind"], "open-structural-source");
  assert.equal(sourceHandoff().attrs["data-noria-action-target"], "Inbox/File.md");
  assert.equal(sourceHandoff().attrs["data-noria-action-state"], "idle");
  assert.equal(targetHandoff().attrs["data-noria-action-kind"], "open-structural-target");
  assert.equal(targetHandoff().attrs["data-noria-action-target"], "02_Areas/知识库管理/File.md");
  assert.equal(targetHandoff().attrs["data-noria-inbox-structural-target-state"], "missing");
  assert.equal(targetHandoff().attrs.role, undefined);
  assert.equal(targetHandoff().onclick, null);

  await sourceHandoff().onclick({
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(sourceHandoff().attrs["data-noria-action-state"], "ok");
  assert.deepEqual(host.__opened, [{ kind: "openFile", path: "Inbox/File.md" }]);

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  const byPath = new Map(rows.map((row) => [row.attrs["data-inbox-path"], row]));
  assert.equal(byPath.get("Inbox/File.md").attrs["data-noria-inbox-structural-selected"], "true");
  assert.equal(byPath.get("Inbox/Task.md").attrs["data-noria-inbox-structural-selected"], "false");

  byPath.get("Inbox/Task.md").onfocus?.({});
  assert.equal(host.__opened.length, 1);
  assert.equal(panel.attrs["data-noria-inbox-structural-source"], "Inbox/Task.md");
  assert.equal(panel.attrs["data-noria-inbox-structural-actions"], "move convert-task base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-target"], "01_Projects/Noria.md");
  assert.equal(sourceHandoff().attrs["data-noria-action-kind"], "open-structural-source");
  assert.equal(sourceHandoff().attrs["data-noria-action-target"], "Inbox/Task.md");
  assert.equal(targetHandoff().attrs.role, "button");
  assert.equal(targetHandoff().attrs["data-noria-action-kind"], "open-structural-target");
  assert.equal(targetHandoff().attrs["data-noria-action-target"], "01_Projects/Noria.md");
  assert.equal(targetHandoff().attrs["data-noria-inbox-structural-target-state"], "openable");

  await targetHandoff().onclick({
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(targetHandoff().attrs["data-noria-action-state"], "ok");
  assert.deepEqual(host.__opened.at(-1), { kind: "openFile", path: "01_Projects/Noria.md" });
  assert.equal(byPath.get("Inbox/File.md").attrs["data-noria-inbox-structural-selected"], "false");
  assert.equal(byPath.get("Inbox/Task.md").attrs["data-noria-inbox-structural-selected"], "true");
  assert.equal(panel.attrs["data-noria-inbox-structural-can-execute"], "true");
  assert.equal(panel.attrs["data-noria-inbox-structural-executable-actions"], "convert-inbox-task");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-actions"], "move base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-reason"], "partial-structural-actions-not-implemented");

  assert.equal(findDomNodes(host, (node) => /\bdashboard-inbox-row__structural-action\b/.test(node.className)).length, 0);
});

test("home inbox structural panel marks destructive candidates unavailable with action reasons", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "ready", label: "Ready", statusIds: ["ready"], actionIds: ["delete", "archive"], showOnHome: true }
        ]
      },
      inbox: {
        async moveOut() {
          throw new Error("must not execute");
        },
        async convertToTask() {
          throw new Error("must not execute");
        }
      },
      t(key, params = {}) {
        const messages = {
          "runtime.periodic.inbox.structuralPanel.action.delete": "删除",
          "runtime.periodic.inbox.structuralPanel.action.archive": "归档",
          "runtime.periodic.inbox.structuralPanel.action.move": "迁出",
          "runtime.periodic.inbox.structuralPanel.action.base-sync": "同步 Base",
          "runtime.periodic.inbox.structuralPanel.require.source-position": "来源定位",
          "runtime.periodic.inbox.structuralPanel.require.delete-confirmation": "删除确认",
          "runtime.periodic.inbox.structuralPanel.require.destination-confirmation": "确认去向",
          "runtime.periodic.inbox.structuralPanel.require.base-sync": "Base 同步",
          "runtime.periodic.inbox.structuralPanel.noTarget": "目标待补",
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源"
        };
        return messages[key] || key;
      }
    },
    pages: [
      {
        file: { name: "Delete.md", path: "Inbox/Delete.md", mtime: "2026-05-09T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "delete",
        "inbox-shape": "note"
      },
      {
        file: { name: "Archive.md", path: "Inbox/Archive.md", mtime: "2026-05-10T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "archive",
        "inbox-shape": "note",
        "inbox-next": "04_Archives/Inbox/Archive.md"
      }
    ],
    files: {
      "Inbox/Delete.md": "---\ninbox-status: ready\ninbox-action: delete\n---\n# Delete",
      "Inbox/Archive.md": "---\ninbox-status: ready\ninbox-action: archive\n---\n# Archive"
    }
  });

  const panel = findDomNodes(host, (node) => /\bdashboard-inbox-structural-panel\b/.test(node.className))[0];
  assert.equal(panel.attrs["data-noria-inbox-structural-source"], "Inbox/Delete.md");
  assert.equal(panel.attrs["data-noria-inbox-structural-actions"], "delete base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-can-execute"], "false");
  assert.equal(panel.attrs["data-noria-inbox-structural-executable-actions"], "");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-actions"], "delete base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-reason"], "destructive-action-not-implemented");
  assert.equal(findDomNodes(panel, (node) => /\bdashboard-inbox-structural-panel__confirm\b/.test(node.className)).length, 0);

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  const archiveRow = rows.find((row) => row.attrs["data-inbox-path"] === "Inbox/Archive.md");
  archiveRow.onfocus?.({});
  assert.equal(panel.attrs["data-noria-inbox-structural-source"], "Inbox/Archive.md");
  assert.equal(panel.attrs["data-noria-inbox-structural-actions"], "archive move base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-can-execute"], "false");
  assert.equal(panel.attrs["data-noria-inbox-structural-executable-actions"], "");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-actions"], "archive move base-sync");
  assert.equal(panel.attrs["data-noria-inbox-structural-blocked-reason"], "destructive-action-not-implemented");
  assert.equal(findDomNodes(panel, (node) => /\bdashboard-inbox-structural-panel__confirm\b/.test(node.className)).length, 0);
});

test("home inbox structural panel exposes one confirmed move action only for file candidates", async () => {
  const calls = [];
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "ready", label: "Ready", statusIds: ["ready"], actionIds: ["file", "delete"], showOnHome: true }
        ]
      },
      inbox: {
        async moveOut(request) {
          calls.push({ ...request });
          return { ok: true, path: request.path, target: request.target, action: request.action };
        }
      },
      t(key, params = {}) {
        const messages = {
          "runtime.periodic.inbox.structuralPanel.action.move": "迁出",
          "runtime.periodic.inbox.structuralPanel.action.convert-task": "转任务",
          "runtime.periodic.inbox.structuralPanel.action.base-sync": "同步 Base",
          "runtime.periodic.inbox.structuralPanel.confirmMove": "确认迁出",
          "runtime.periodic.inbox.structuralPanel.target": `目标 ${params.target}`,
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源"
        };
        return messages[key] || key;
      }
    },
    pages: [
      {
        file: { name: "File.md", path: "Inbox/File.md", mtime: "2026-05-08T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "02_Areas/知识库管理/File.md",
        related: ["[[知识库管理]]"]
      },
      {
        file: { name: "Task.md", path: "Inbox/Task.md", mtime: "2026-05-09T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "task",
        "inbox-next": "01_Projects/Noria.md",
        related: ["[[Noria]]"]
      }
    ],
    files: {
      "Inbox/File.md": "---\ninbox-status: ready\nrelated:\n  - \"[[知识库管理]]\"\n---\n# File\n\n## Source\n[[知识库管理]]",
      "Inbox/Task.md": "---\ninbox-status: ready\nrelated:\n  - \"[[Noria]]\"\n---\n# Task\n\n## Source\n[[Noria]]"
    }
  });

  const panel = findDomNodes(host, (node) => /\bdashboard-inbox-structural-panel\b/.test(node.className))[0];
  const moveActions = () => findDomNodes(panel, (node) =>
    /\bdashboard-inbox-structural-panel__confirm\b/.test(node.className)
    && node.attrs["data-noria-action-kind"] === "move-inbox-file"
  );
  assert.equal(moveActions().length, 1);
  assert.equal(moveActions()[0].textContent, "确认迁出");
  assert.equal(moveActions()[0].attrs["data-noria-action-source"], "home-inbox-structural");
  assert.equal(moveActions()[0].attrs["data-noria-action-kind"], "move-inbox-file");
  assert.equal(moveActions()[0].attrs["data-noria-action-target"], "02_Areas/知识库管理/File.md");
  assert.equal(moveActions()[0].attrs["data-noria-inbox-source"], "Inbox/File.md");

  await moveActions()[0].onclick({
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(moveActions()[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(plain(calls), [{
    path: "Inbox/File.md",
    action: "file",
    target: "02_Areas/知识库管理/File.md",
    confirm: true,
    reason: "home-inbox-structural-move"
  }]);

  const taskRow = findDomNodes(host, (node) => node.attrs?.["data-inbox-path"] === "Inbox/Task.md")[0];
  taskRow.onfocus?.({});
  assert.equal(panel.attrs["data-noria-inbox-structural-source"], "Inbox/Task.md");
  assert.equal(moveActions().length, 0);
});

test("home inbox structural panel exposes one confirmed task conversion action for task candidates", async () => {
  const calls = [];
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "ready", label: "Ready", statusIds: ["ready"], actionIds: ["file"], showOnHome: true }
        ]
      },
      inbox: {
        async convertToTask(request) {
          calls.push({ ...request });
          return { ok: true, path: request.path, target: request.target, action: request.action };
        }
      },
      t(key, params = {}) {
        const messages = {
          "runtime.periodic.inbox.structuralPanel.action.move": "迁出",
          "runtime.periodic.inbox.structuralPanel.action.convert-task": "转任务",
          "runtime.periodic.inbox.structuralPanel.action.base-sync": "同步 Base",
          "runtime.periodic.inbox.structuralPanel.confirmConvertTask": "确认转任务",
          "runtime.periodic.inbox.structuralPanel.target": `目标 ${params.target}`,
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源"
        };
        return messages[key] || key;
      }
    },
    pages: [
      {
        file: { name: "File.md", path: "Inbox/File.md", mtime: "2026-05-08T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "02_Areas/知识库管理/File.md",
        related: ["[[知识库管理]]"]
      },
      {
        file: { name: "Task.md", path: "Inbox/Task.md", mtime: "2026-05-09T00:00:00.000Z" },
        "inbox-status": "ready",
        "inbox-action": "file",
        "inbox-shape": "task",
        "inbox-next": "01_Projects/Noria.md",
        related: ["[[Noria]]"]
      }
    ],
    files: {
      "Inbox/File.md": "---\ninbox-status: ready\nrelated:\n  - \"[[知识库管理]]\"\n---\n# File\n\n## Source\n[[知识库管理]]",
      "Inbox/Task.md": "---\ninbox-status: ready\nrelated:\n  - \"[[Noria]]\"\n---\n# Task\n\n## Source\n[[Noria]]"
    }
  });

  const panel = findDomNodes(host, (node) => /\bdashboard-inbox-structural-panel\b/.test(node.className))[0];
  const convertActions = () => findDomNodes(panel, (node) =>
    /\bdashboard-inbox-structural-panel__confirm\b/.test(node.className)
    && node.attrs["data-noria-action-kind"] === "convert-inbox-task"
  );

  assert.equal(convertActions().length, 0);
  const taskRow = findDomNodes(host, (node) => node.attrs?.["data-inbox-path"] === "Inbox/Task.md")[0];
  taskRow.onfocus?.({});
  assert.equal(panel.attrs["data-noria-inbox-structural-source"], "Inbox/Task.md");
  assert.equal(convertActions().length, 1);
  assert.equal(convertActions()[0].textContent, "确认转任务");
  assert.equal(convertActions()[0].attrs["data-noria-action-source"], "home-inbox-structural");
  assert.equal(convertActions()[0].attrs["data-noria-action-kind"], "convert-inbox-task");
  assert.equal(convertActions()[0].attrs["data-noria-action-target"], "01_Projects/Noria.md");
  assert.equal(convertActions()[0].attrs["data-noria-inbox-source"], "Inbox/Task.md");

  await convertActions()[0].onclick({
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(convertActions()[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(plain(calls), [{
    path: "Inbox/Task.md",
    action: "convert-task",
    target: "01_Projects/Noria.md",
    confirm: true,
    reason: "home-inbox-structural-convert-task"
  }]);
});

test("runtime bridge updates inbox status only through a bounded frontmatter writeback", async () => {
  const plugin = makePlugin({
    files: {
      "Inbox/Idea.md": "---\ninbox-status: triage\n---\n# Idea",
      "Archive/Old.md": "---\ninbox-status: triage\n---\n# Old",
      "Inbox/Missing.md": "# Missing frontmatter"
    }
  });
  plugin.settings = plugin.normalizeSettings({
    managedPaths: { inboxRoot: "Inbox" },
    inboxWorkflow: {
      statuses: [
        { id: "triage", label: "Triage" },
        { id: "processing", label: "Processing" },
        { id: "ready", label: "Ready" },
      ],
      defaultStatusId: "triage"
    }
  });

  const bridge = plugin.buildRuntimeBridgeConfig();

  assert.equal(typeof bridge.inbox.updateStatus, "function");
  const ok = await bridge.inbox.updateStatus({
    path: "Inbox/Idea.md",
    nextStatus: "processing",
    reason: "home-inbox-status-action"
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.path, "Inbox/Idea.md");
  assert.equal(ok.previousStatus, "triage");
  assert.equal(ok.status, "processing");
  assert.match(plugin.__files.get("Inbox/Idea.md").text, /inbox-status: processing/);
  assert.deepEqual(plugin.__modified, ["Inbox/Idea.md"]);

  assert.deepEqual(plain(await bridge.inbox.updateStatus({ path: "Archive/Old.md", nextStatus: "processing" })), {
    ok: false,
    path: "Archive/Old.md",
    reason: "outside-inbox-root"
  });
  assert.deepEqual(plain(await bridge.inbox.updateStatus({ path: "Inbox/Idea.md", nextStatus: "unknown" })), {
    ok: false,
    path: "Inbox/Idea.md",
    reason: "unknown-next-status",
    nextStatus: "unknown"
  });
  assert.deepEqual(plain(await bridge.inbox.updateStatus({ path: "Inbox/Missing.md", nextStatus: "ready" })), {
    ok: false,
    path: "Inbox/Missing.md",
    reason: "missing-status-frontmatter"
  });
});

test("inbox status writeback rejects a stale expected status inside the file transaction", async () => {
  const plugin = makePlugin({
    files: { "Inbox/Idea.md": "---\ninbox-status: triage\n---\n# Idea" }
  });
  plugin.settings = plugin.normalizeSettings({
    managedPaths: { inboxRoot: "Inbox" },
    inboxWorkflow: {
      statuses: [
        { id: "triage", label: "Triage" },
        { id: "processing", label: "Processing" },
        { id: "ready", label: "Ready" }
      ],
      defaultStatusId: "triage"
    }
  });
  let processCalls = 0;
  plugin.app.vault.process = async (file, transform) => {
    processCalls += 1;
    const concurrent = String(plugin.__files.get(file.path)?.text || "").replace("inbox-status: triage", "inbox-status: ready");
    const next = String(transform(concurrent) || "");
    plugin.__files.set(file.path, { path: file.path, name: file.name, text: next });
  };

  const result = await plugin.updateInboxStatus({
    path: "Inbox/Idea.md",
    currentStatus: "triage",
    nextStatus: "processing"
  });

  assert.equal(processCalls, 1);
  assert.deepEqual(plain(result), {
    ok: false,
    path: "Inbox/Idea.md",
    reason: "conflict",
    expectedStatus: "triage",
    currentStatus: "ready"
  });
  assert.match(plugin.__files.get("Inbox/Idea.md").text, /inbox-status: ready/);
});

test("runtime bridge moves out only confirmed file-action inbox notes and clears inbox frontmatter", async () => {
  const plugin = makePlugin({
    files: {
      "Inbox/File.md": "---\ninbox-status: ready\ninbox-action: file\ninbox-shape: note\ninbox-next: 02_Areas/知识库管理/File.md\nrelated:\n  - \"[[知识库管理]]\"\n---\n# File\n\n## Source\n[[知识库管理]]",
      "Inbox/Delete.md": "---\ninbox-status: ready\ninbox-action: delete\ninbox-shape: note\n---\n# Delete",
      "Inbox/MissingNext.md": "---\ninbox-status: ready\ninbox-action: file\ninbox-shape: note\n---\n# Missing",
      "Inbox/MissingFrontmatter.md": "# Missing frontmatter",
      "Archive/Old.md": "---\ninbox-status: ready\ninbox-action: file\ninbox-next: 02_Areas/知识库管理/Old.md\n---\n# Old",
      "02_Areas/知识库管理/Exists.md": "# Exists"
    }
  });
  plugin.settings = plugin.normalizeSettings({
    managedPaths: { inboxRoot: "Inbox" },
    inboxWorkflow: {
      statuses: [
        { id: "ready", label: "Ready" },
      ],
      defaultStatusId: "ready"
    }
  });

  const bridge = plugin.buildRuntimeBridgeConfig();
  assert.equal(typeof bridge.inbox.moveOut, "function");

  assert.deepEqual(plain(await bridge.inbox.moveOut({
    path: "Inbox/File.md",
    action: "file",
    target: "02_Areas/知识库管理/File.md"
  })), {
    ok: false,
    path: "Inbox/File.md",
    target: "02_Areas/知识库管理/File.md",
    reason: "confirmation-required"
  });

  const ok = await bridge.inbox.moveOut({
    path: "Inbox/File.md",
    action: "file",
    target: "02_Areas/知识库管理/File.md",
    confirm: true,
    reason: "test-move"
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.path, "Inbox/File.md");
  assert.equal(ok.target, "02_Areas/知识库管理/File.md");
  assert.equal(ok.action, "file");
  assert.deepEqual(plugin.__renamed, [{ from: "Inbox/File.md", to: "02_Areas/知识库管理/File.md" }]);
  assert.equal(plugin.__files.has("Inbox/File.md"), false);
  assert.equal(plugin.__files.has("02_Areas/知识库管理/File.md"), true);
  assert.doesNotMatch(plugin.__files.get("02_Areas/知识库管理/File.md").text, /^inbox-/m);
  assert.match(plugin.__files.get("02_Areas/知识库管理/File.md").text, /related:\n  - "\[\[知识库管理\]\]"/);

  assert.deepEqual(plain(await bridge.inbox.moveOut({ path: "Archive/Old.md", action: "file", target: "02_Areas/知识库管理/Old.md", confirm: true })), {
    ok: false,
    path: "Archive/Old.md",
    target: "02_Areas/知识库管理/Old.md",
    reason: "outside-inbox-root"
  });
  assert.deepEqual(plain(await bridge.inbox.moveOut({ path: "Inbox/Delete.md", action: "delete", confirm: true })), {
    ok: false,
    path: "Inbox/Delete.md",
    target: "",
    reason: "unsupported-action",
    action: "delete"
  });
  assert.deepEqual(plain(await bridge.inbox.moveOut({ path: "Inbox/MissingNext.md", action: "file", confirm: true })), {
    ok: false,
    path: "Inbox/MissingNext.md",
    target: "",
    reason: "missing-target"
  });
  assert.deepEqual(plain(await bridge.inbox.moveOut({ path: "Inbox/MissingFrontmatter.md", action: "file", target: "02_Areas/知识库管理/Missing.md", confirm: true })), {
    ok: false,
    path: "Inbox/MissingFrontmatter.md",
    target: "02_Areas/知识库管理/Missing.md",
    reason: "missing-status-frontmatter"
  });
  assert.deepEqual(plain(await bridge.inbox.moveOut({ path: "Inbox/MissingNext.md", action: "file", target: "02_Areas/知识库管理/Exists.md", confirm: true })), {
    ok: false,
    path: "Inbox/MissingNext.md",
    target: "02_Areas/知识库管理/Exists.md",
    reason: "target-exists"
  });
});

test("inbox move clears temporary fields from the latest moved content", async () => {
  const source = "Inbox/File.md";
  const target = "02_Areas/File.md";
  const plugin = makePlugin({
    files: {
      [source]: `---\ninbox-status: ready\ninbox-action: file\ninbox-shape: note\ninbox-next: ${target}\n---\n# File`
    }
  });
  plugin.settings = plugin.normalizeSettings({ managedPaths: { inboxRoot: "Inbox" } });
  const rename = plugin.app.vault.rename.bind(plugin.app.vault);
  plugin.app.vault.rename = async (file, targetPath) => {
    await rename(file, targetPath);
    const moved = plugin.__files.get(targetPath);
    moved.text = `${moved.text}\n\nConcurrent body edit`;
  };
  let processCalls = 0;
  plugin.app.vault.process = async (file, transform) => {
    processCalls += 1;
    const current = String(plugin.__files.get(file.path)?.text || "");
    const next = String(transform(current) || "");
    plugin.__files.set(file.path, { path: file.path, name: file.name, text: next });
  };

  const result = await plugin.moveOutInboxItem({
    path: source,
    action: "file",
    target,
    confirm: true
  });

  assert.equal(result.ok, true);
  assert.equal(processCalls, 1);
  assert.match(plugin.__files.get(target).text, /Concurrent body edit/);
  assert.doesNotMatch(plugin.__files.get(target).text, /^inbox-/m);
});

test("runtime bridge converts confirmed task-shaped inbox notes into source-linked target tasks", async () => {
  const plugin = makePlugin({
    files: {
      "Inbox/Task.md": "---\ninbox-status: ready\ninbox-action: file\ninbox-shape: task\ninbox-next: 01_Projects/Noria.md\nrelated:\n  - \"[[Noria]]\"\n---\n# Define source result list\n\n## Source\n[[Noria]]",
      "Inbox/Note.md": "---\ninbox-status: ready\ninbox-action: file\ninbox-shape: note\ninbox-next: 01_Projects/Noria.md\n---\n# Note",
      "Archive/Old.md": "---\ninbox-status: ready\ninbox-action: file\ninbox-shape: task\ninbox-next: 01_Projects/Noria.md\n---\n# Old",
      "01_Projects/Noria.md": "# Noria\n\n## Tasks\n\n- [ ] Existing task\n",
      "01_Projects/Exists.md": "- [ ] Define source result list [[Inbox/Task|source]]\n"
    }
  });
  plugin.settings = plugin.normalizeSettings({
    managedPaths: { inboxRoot: "Inbox" },
    inboxWorkflow: {
      statuses: [
        { id: "ready", label: "Ready" },
      ],
      defaultStatusId: "ready"
    }
  });

  const bridge = plugin.buildRuntimeBridgeConfig();
  assert.equal(typeof bridge.inbox.convertToTask, "function");

  assert.deepEqual(plain(await bridge.inbox.convertToTask({
    path: "Inbox/Task.md",
    action: "convert-task",
    target: "01_Projects/Noria.md"
  })), {
    ok: false,
    path: "Inbox/Task.md",
    target: "01_Projects/Noria.md",
    reason: "confirmation-required"
  });

  const ok = await bridge.inbox.convertToTask({
    path: "Inbox/Task.md",
    action: "convert-task",
    target: "01_Projects/Noria.md",
    confirm: true,
    reason: "test-convert"
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.path, "Inbox/Task.md");
  assert.equal(ok.target, "01_Projects/Noria.md");
  assert.equal(ok.action, "convert-task");
  assert.equal(ok.taskLine, "- [ ] Define source result list [[Inbox/Task|source]]");
  assert.deepEqual(plugin.__modified, ["01_Projects/Noria.md"]);
  assert.match(plugin.__files.get("01_Projects/Noria.md").text, /## Tasks\n\n- \[ \] Existing task\n\n- \[ \] Define source result list \[\[Inbox\/Task\|source\]\]/);
  assert.equal(plugin.__files.has("Inbox/Task.md"), true);

  assert.deepEqual(plain(await bridge.inbox.convertToTask({ path: "Archive/Old.md", action: "convert-task", target: "01_Projects/Noria.md", confirm: true })), {
    ok: false,
    path: "Archive/Old.md",
    target: "01_Projects/Noria.md",
    reason: "outside-inbox-root"
  });
  assert.deepEqual(plain(await bridge.inbox.convertToTask({ path: "Inbox/Note.md", action: "convert-task", target: "01_Projects/Noria.md", confirm: true })), {
    ok: false,
    path: "Inbox/Note.md",
    target: "01_Projects/Noria.md",
    reason: "unsupported-shape",
    shape: "note"
  });
  assert.deepEqual(plain(await bridge.inbox.convertToTask({ path: "Inbox/Task.md", action: "convert-task", target: "Inbox/Target.md", confirm: true })), {
    ok: false,
    path: "Inbox/Task.md",
    target: "Inbox/Target.md",
    reason: "target-inside-inbox"
  });
  assert.deepEqual(plain(await bridge.inbox.convertToTask({ path: "Inbox/Task.md", action: "convert-task", target: "01_Projects/Missing.md", confirm: true })), {
    ok: false,
    path: "Inbox/Task.md",
    target: "01_Projects/Missing.md",
    reason: "missing-target-file"
  });
});

test("inbox task conversion appends against the latest target content", async () => {
  const source = "Inbox/Task.md";
  const target = "01_Projects/Noria.md";
  const plugin = makePlugin({
    files: {
      [source]: `---\ninbox-status: ready\ninbox-action: convert-task\ninbox-shape: task\ninbox-next: ${target}\n---\n# New task`,
      [target]: "# Noria\n\n## Tasks\n"
    }
  });
  plugin.settings = plugin.normalizeSettings({ managedPaths: { inboxRoot: "Inbox" } });
  let processCalls = 0;
  plugin.app.vault.process = async (file, transform) => {
    processCalls += 1;
    const concurrent = `${plugin.__files.get(file.path)?.text || ""}\n- [ ] Concurrent target edit\n`;
    const next = String(transform(concurrent) || "");
    plugin.__files.set(file.path, { path: file.path, name: file.name, text: next });
  };

  const result = await plugin.convertInboxItemToTask({
    path: source,
    action: "convert-task",
    target,
    confirm: true
  });

  assert.equal(result.ok, true);
  assert.equal(processCalls, 1);
  assert.match(plugin.__files.get(target).text, /Concurrent target edit/);
  assert.match(plugin.__files.get(target).text, /New task \[\[Inbox\/Task\|source\]\]/);
});

test("inbox task conversion deduplicates an edited task by its source link", async () => {
  const source = "Inbox/Task.md";
  const target = "01_Projects/Noria.md";
  const plugin = makePlugin({
    files: {
      [source]: `---\ninbox-status: ready\ninbox-action: convert-task\ninbox-shape: task\ninbox-next: ${target}\n---\n# Original title`,
      [target]: "# Noria\n\n## Tasks\n\n- [x] Renamed after conversion [[Inbox/Task|source]]\n"
    }
  });
  plugin.settings = plugin.normalizeSettings({ managedPaths: { inboxRoot: "Inbox" } });

  const result = await plugin.convertInboxItemToTask({
    path: source,
    action: "convert-task",
    target,
    confirm: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
  assert.equal((plugin.__files.get(target).text.match(/\[\[Inbox\/Task\|source\]\]/g) || []).length, 1);
});

test("home inbox renders low-noise status writeback actions only for SOP-ready status mismatches", async () => {
  const calls = [];
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
          { id: "processing", label: "Processing" },
          { id: "ready", label: "Ready" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", statusIds: ["triage"], includeMissingCore: true, showOnHome: true },
          { id: "processing", label: "Processing", statusIds: ["processing"], actionIds: ["refine", "split", "merge"], showOnHome: true },
          { id: "ready", label: "Ready", statusIds: ["ready"], actionIds: ["file", "archive"], showOnHome: true }
        ]
      },
      inbox: {
        async updateStatus(request) {
          calls.push({ ...request });
          return { ok: true, path: request.path, previousStatus: request.currentStatus, status: request.nextStatus };
        }
      },
      t(key, params = {}) {
        const messages = {
          "runtime.periodic.inbox.statusAction": `标为 ${params.status}`,
          "runtime.periodic.inbox.primaryNext.openSource": "打开来源"
        };
        return messages[key] || key;
      }
    },
    pages: [
      {
        file: { name: "Refine.md", path: "Inbox/Refine.md", mtime: "2026-05-07T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "refine",
        "inbox-shape": "atom"
      },
      {
        file: { name: "File.md", path: "Inbox/File.md", mtime: "2026-05-08T00:00:00.000Z" },
        "inbox-status": "processing",
        "inbox-action": "file",
        "inbox-shape": "note",
        "inbox-next": "Area",
        related: ["[[Area]]"]
      },
      {
        file: { name: "Delete.md", path: "Inbox/Delete.md", mtime: "2026-05-09T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "delete",
        "inbox-shape": "note"
      }
    ],
    files: {
      "Inbox/Refine.md": "---\ninbox-status: triage\n---\n# Refine",
      "Inbox/File.md": "---\ninbox-status: processing\nrelated:\n  - \"[[Area]]\"\n---\n# File\n\n## Source\n[[Area]]",
      "Inbox/Delete.md": "---\ninbox-status: triage\n---\n# Delete"
    }
  });

  const actions = findDomNodes(host, (node) => /\bdashboard-inbox-row__status-action\b/.test(node.className));
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((node) => node.textContent), ["标为 Processing", "标为 Ready"]);
  assert.equal(actions[0].tagName, "span");
  assert.equal(actions[0].attrs.role, "button");
  assert.equal(actions[0].attrs["data-noria-action-source"], "home-inbox-status");
  assert.equal(actions[0].attrs["data-noria-action-kind"], "update-inbox-status");
  assert.equal(actions[0].attrs["data-noria-action-target"], "Inbox/Refine.md");
  assert.equal(actions[0].attrs["data-noria-inbox-status-next"], "processing");
  assert.equal(actions[1].attrs["data-noria-inbox-status-next"], "ready");

  let stopped = false;
  await actions[0].onclick({
    preventDefault() {},
    stopPropagation() { stopped = true; },
    target: { closest() { return true; } }
  });
  assert.equal(stopped, true);
  assert.equal(actions[0].attrs["data-noria-action-state"], "ok");
  assert.deepEqual(plain(calls), [{
    path: "Inbox/Refine.md",
    currentStatus: "triage",
    nextStatus: "processing",
    reason: "home-inbox-status-action"
  }]);
});

test("home inbox runtime exposes quiet markdown previews on each row", async () => {
  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", statusIds: ["triage"], showOnHome: true }
        ]
      }
    },
    pages: [
      {
        file: { name: "Idea.md", path: "Inbox/Idea.md", mtime: "2026-05-06T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      },
      {
        file: { name: "Empty.md", path: "Inbox/Empty.md", mtime: "2026-05-07T00:00:00.000Z" },
        "inbox-status": "triage",
        "inbox-action": "",
        "inbox-shape": "",
        "inbox-next": ""
      }
    ],
    files: {
      "Inbox/Idea.md": [
        "---",
        "inbox-status: triage",
        "---",
        "# Idea",
        "",
        "```",
        "console.log('ignore me')",
        "```",
        "",
        "- 围绕 [[知识库管理|知识库]] 判断去留，再决定是否归档到 [Area](https://example.com)。"
      ].join("\n"),
      "Inbox/Empty.md": "---\ninbox-status: triage\n---\n# Empty\n"
    }
  });

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.equal(rows.length, 2);
  assert.equal(
    rows[0].attrs["data-inbox-preview"],
    "围绕 知识库 判断去留，再决定是否归档到 Area。"
  );
  assert.match(rows[0].className, /\bhas-preview\b/);
  assert.equal(rows[1].attrs["data-inbox-preview"], "");
  assert.doesNotMatch(rows[1].className, /\bhas-preview\b/);

  const previews = findDomNodes(rows[0], (node) => /\bdashboard-inbox-row__preview\b/.test(node.className));
  assert.equal(previews.length, 1);
  assert.equal(previews[0].textContent, "围绕 知识库 判断去留，再决定是否归档到 Area。");
  assert.equal(previews[0].attrs.title, "围绕 知识库 判断去留，再决定是否归档到 Area。");
  assert.equal(findDomNodes(rows[0], (node) => node.tagName === "button").length, 0);
});

test("home inbox runtime bounds markdown content reads while preserving rows", async () => {
  const pages = [];
  const files = {};
  for (let i = 0; i < 18; i += 1) {
    const name = `Item-${String(i).padStart(2, "0")}.md`;
    const filePath = `Inbox/${name}`;
    pages.push({
      file: { name, path: filePath, mtime: `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` },
      "inbox-status": "triage",
      "inbox-action": "",
      "inbox-shape": "",
      "inbox-next": ""
    });
    files[filePath] = `---\ninbox-status: triage\n---\n# ${name}\n\n- Preview ${i}`;
  }
  const readProbe = { current: 0, max: 0, delayMs: 3 };

  const host = await renderHomeInboxRuntime({
    bridge: {
      paths: { inboxRoot: "Inbox" },
      inboxWorkflow: {
        statuses: [
          { id: "triage", label: "Triage" },
        ],
        homeViews: [
          { id: "triage", label: "Triage", statusIds: ["triage"], showOnHome: true }
        ]
      }
    },
    pages,
    files,
    readProbe
  });

  const rows = findDomNodes(host, (node) => /\bdashboard-inbox-row\b/.test(node.className));
  assert.ok(rows.length > 0);
  const lane = findDomNodes(host, (node) => /\bdashboard-inbox-lane\b/.test(node.className))[0];
  assert.equal(lane.attrs["data-noria-inbox-lane-count"], "18");
  assert.ok(readProbe.max > 1, "inbox reads should still overlap enough to avoid serial cold opens");
  assert.ok(readProbe.max <= 6, `expected bounded read concurrency, got ${readProbe.max}`);
});

test("rebuilding inbox queue base is explicit and uses current configured base views", async () => {
  const plugin = makePlugin({
    files: {
      "Config/Inbox queue.base": "old base"
    }
  });
  plugin.settings = plugin.normalizeSettings({
    managedPaths: { inboxQueue: "Config/Inbox queue.base", inboxRoot: "Inbox" },
    inboxWorkflow: {
      statuses: [
        { id: "capture", label: "Capture" },
        { id: "refine", label: "Refine" }
      ],
      defaultStatusId: "capture",
      baseViews: [{ id: "capture", label: "Capture", statusIds: ["capture"] }]
    }
  });

  const result = await plugin.rebuildInboxQueueBase();
  assert.equal(result.ok, true);
  assert.match(plugin.__files.get("Config/Inbox queue.base").text, /name: Capture/);
  assert.match(plugin.__files.get("Config/Inbox queue.base").text, /inbox-status == "capture"/);
  assert.doesNotMatch(plugin.__files.get("Config/Inbox queue.base").text, /inbox-status !=/);
});

test("task timeline opens in the right sidebar by default and can be switched back to main tabs", async () => {
  const plugin = makePlugin();
  plugin.settings = plugin.normalizeSettings({});

  await plugin.openTasksTimelineLeaf();
  assert.equal(plugin.__leaves.rightLeaf.state.type, "noria-task-timeline");
  assert.deepEqual(plugin.__leaves.getRightLeafCalls, [false]);
  assert.deepEqual(plugin.__leaves.getLeafCalls, []);
  assert.equal(plugin.__leaves.activated[0]?.leaf, plugin.__leaves.rightLeaf);
  assert.equal(plugin.__leaves.activated[0]?.options?.focus, true);

  const mainPlugin = makePlugin();
  mainPlugin.settings = mainPlugin.normalizeSettings({
    tasksCalendar: { taskTimelineOpenMode: "main-tab" }
  });
  await mainPlugin.openTasksTimelineLeaf();
  assert.equal(mainPlugin.__leaves.mainLeaf.state.type, "noria-task-timeline");
  assert.deepEqual(mainPlugin.__leaves.getRightLeafCalls, []);
  assert.deepEqual(mainPlugin.__leaves.getLeafCalls, ["tab"]);
  assert.equal(mainPlugin.__leaves.activated[0]?.leaf, mainPlugin.__leaves.mainLeaf);
});
