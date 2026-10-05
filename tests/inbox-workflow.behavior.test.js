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
      if (id === "crypto") return require("node:crypto");
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
  assert.deepEqual(plain(settings.inboxWorkflow.baseViews), []);
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

test("Inbox reference uses configured paths without requiring stages; custom Base filters survive", () => {
  for (const language of ["en", "zh-CN"]) {
    const plugin = makePlugin({language});
    plugin.settings = plugin.normalizeSettings({
      managedPaths: {inboxQueue:"Custom/Queue.base", inboxRoot:"Capture"},
      inboxWorkflow: {statuses:[{id:"decide",label:"My decision"}],defaultStatusId:"decide",
        baseViews:[{id:"decide",label:"Decision: #1",statusIds:["decide"]}]}
    });
    const note = plugin.getManagedNoteSeed("inboxWorkflow");
    assert.ok(!note.includes("My decision"));
    assert.ok(note.includes("[[Custom/Queue.base|"));
    assert.ok(note.includes("`Capture`"));
    const base = plugin.getManagedNoteSeed("inboxQueue");
    assert.ok(base.includes('name: "Decision: #1"'));
    assert.ok(base.includes('inbox-status == "decide"'));
  }
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

test("Inbox default Base lists files without workflow fields and preserves explicit custom views", () => {
  const plugin = makePlugin({ language: "en" });
  plugin.settings = plugin.normalizeSettings({});

  assert.equal(plugin.getSupportSeedDefinitions().some(row=>row.key==="starterInboxNote"),false);

  const defaultBase = plugin.getManagedNoteSeed("inboxQueue");
  assert.doesNotMatch(defaultBase, /待决|加工中|已关闭/);
  assert.doesNotMatch(defaultBase, /inbox-(status|action|shape|next|review)/);
  assert.equal((defaultBase.match(/type: table/g) || []).length, 1);
  assert.match(defaultBase, /order:\n      - file.name\n/);
  assert.match(defaultBase, /property: file.mtime\n        direction: DESC/);
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
  assert.match(customBase, /name: "Capture"/);
  assert.match(customBase, /inbox-status == "capture"/);
  assert.doesNotMatch(customBase, /inbox-status !=/);
  assert.doesNotMatch(customBase, /待决|加工中|已关闭/);
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
