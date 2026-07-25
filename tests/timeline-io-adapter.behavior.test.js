const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pluginRoot = path.resolve(__dirname, "..");

function loadAdapter() {
  const code = fs.readFileSync(
    path.join(pluginRoot, "src", "runtime", "core", "adapters", "timeline-io-adapter.js"),
    "utf8"
  );
  const context = { console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "core/adapters/timeline-io-adapter.js" });
  return context.dashboardCore.adapters.timelineIoAdapter;
}

function createVaultHarness(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  let processCalls = 0;
  let modifyCalls = 0;
  const vault = {
    getAbstractFileByPath(pathText) {
      const pathValue = String(pathText || "");
      return files.has(pathValue) ? { path: pathValue } : null;
    },
    async cachedRead(file) {
      return files.get(file.path) || "";
    },
    async modify(file, text) {
      modifyCalls += 1;
      files.set(file.path, String(text || ""));
    },
    async process(file, transform) {
      processCalls += 1;
      const concurrent = `${files.get(file.path) || ""}\n<!-- concurrent edit -->`;
      const next = transform(concurrent);
      files.set(file.path, String(next || ""));
    },
    async create(pathText, text) {
      files.set(String(pathText || ""), String(text || ""));
      return { path: String(pathText || "") };
    },
    async createFolder() {}
  };
  return {
    app: { vault },
    files,
    get processCalls() { return processCalls; },
    get modifyCalls() { return modifyCalls; }
  };
}

test("timeline IO appends a task against the latest daily-note content", async () => {
  const adapter = loadAdapter();
  const pathValue = "Diary/2026-06-08.md";
  const harness = createVaultHarness({
    [pathValue]: "### 今日任务\n\n- [ ] 已有任务\n"
  });

  const changed = await adapter.appendTaskLineToDaily({
    app: harness.app,
    buildDailyNotePath: () => pathValue,
    dateStr: "2026-06-08",
    lineText: "- [ ] 新任务"
  });

  assert.equal(changed, true);
  assert.equal(harness.processCalls, 1);
  assert.equal(harness.modifyCalls, 0);
  assert.match(harness.files.get(pathValue), /<!-- concurrent edit -->/);
  assert.match(harness.files.get(pathValue), /- \[ \] 新任务/);
});

test("timeline IO appends a template against the latest library content", async () => {
  const adapter = loadAdapter();
  const pathValue = "Noria/Event library.md";
  const harness = createVaultHarness({ [pathValue]: "# Templates\n" });

  await adapter.appendTemplateToLibrary({
    app: harness.app,
    libPath: pathValue,
    line: "- [x] 深度工作 #tl/template",
    uniqueNeedle: "深度工作"
  });

  assert.equal(harness.processCalls, 1);
  assert.equal(harness.modifyCalls, 0);
  assert.match(harness.files.get(pathValue), /<!-- concurrent edit -->/);
  assert.match(harness.files.get(pathValue), /深度工作/);
});

test("timeline IO updates health frontmatter against the latest daily-note content", async () => {
  const adapter = loadAdapter();
  const pathValue = "Diary/2026-06-08.md";
  const harness = createVaultHarness({ [pathValue]: "---\nenergy: 2\n---\n\n正文\n" });

  await adapter.appendHealthMetricsToDaily({
    app: harness.app,
    buildDailyNotePath: () => pathValue,
    dateStr: "2026-06-08",
    metricsObj: { energy: 4, focus: 3 }
  });

  assert.equal(harness.processCalls, 1);
  assert.equal(harness.modifyCalls, 0);
  assert.match(harness.files.get(pathValue), /<!-- concurrent edit -->/);
  assert.match(harness.files.get(pathValue), /^energy: 4$/m);
  assert.match(harness.files.get(pathValue), /^focus: 3$/m);
});

test("timeline IO removes one exact relocated line from the latest target text", async () => {
  const adapter = loadAdapter();
  const pathValue = "Diary/2026-06-09.md";
  const targetLine = "- [ ] Move me [start:: 2026-06-09] [due:: 2026-06-09]";
  const harness = createVaultHarness({
    [pathValue]: `### 今日任务\n\n${targetLine}\n`
  });

  const removed = await adapter.removeExactTaskLineFromDaily({
    app: harness.app,
    filePath: pathValue,
    lineText: targetLine
  });

  assert.equal(removed, true);
  assert.equal(harness.processCalls, 1);
  assert.equal(harness.modifyCalls, 0);
  assert.match(harness.files.get(pathValue), /<!-- concurrent edit -->/);
  assert.doesNotMatch(harness.files.get(pathValue), /Move me/);
});
