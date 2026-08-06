const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");
const vm = require("node:vm");
const { fingerprintReviewSection } = require("../src/review-center-core.js");

const pluginRoot = path.resolve(__dirname, "..");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function loadGlobalScript(relativePath, globalPath) {
  const code = fs.readFileSync(pluginPath(relativePath), "utf8");
  const context = { console, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: relativePath });
  return globalPath(context);
}

function loadDiaryBlocks() {
  return loadGlobalScript(
    "views/dashboard/core/utils/diary-day-blocks.js",
    (ctx) => ctx.dashboardCore.utils.diaryDayBlocks
  );
}

function loadReviewCenter() {
  return loadGlobalScript(
    "views/dashboard/core/utils/review-center.js",
    (ctx) => ctx.dashboardCore.utils.reviewCenter
  );
}

function loadPluginClass(options = {}) {
  const code = fs.readFileSync(pluginPath("main.js"), "utf8");
  const module = { exports: {} };
  const clipboardWrites = options.clipboardWrites || [];
  const notices = options.notices || [];
  const context = {
    console,
    module,
    exports: module.exports,
    navigator: { clipboard: { async writeText(text) { clipboardWrites.push(String(text || "")); } } },
    require(id) {
      if (id === "obsidian") {
        return {
          Plugin: class {},
          PluginSettingTab: class {},
          ItemView: class {},
          Setting: class {},
          Notice: class {
            constructor(message) {
              notices.push(String(message || ""));
            }
          },
          MarkdownRenderer: {},
          TFile: class {},
          setIcon() {},
          requestUrl: options.requestUrl || (async () => ({ json: {} })),
          getLanguage() {
            return options.language || "en";
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
  const PluginClass = module.exports.default || module.exports;
  return options.exposeContext ? { PluginClass, context } : PluginClass;
}

function makeAiPlugin(options = {}) {
  const Plugin = loadPluginClass(options);
  const plugin = new Plugin();
  const secrets = new Map(Object.entries(options.secrets || {}));
  const writes = [];
  const opened = [];
  plugin.app = {
    secretStorage: {
      async getSecret(name) {
        return secrets.get(name) || "";
      },
      async setSecret(name, value) {
        secrets.set(name, value);
      }
    },
    vault: {
      getAbstractFileByPath() {
        return null;
      },
      async create(pathText, text) {
        writes.push({ path: pathText, text });
        return { path: pathText };
      },
      adapter: {
        async exists() {
          return false;
        },
        async mkdir() {},
        async write(pathText, text) {
          writes.push({ path: pathText, text });
        }
      }
    },
    workspace: {
      getLeavesOfType: () => [],
      async openLinkText(pathText) {
        opened.push(String(pathText || ""));
      }
    },
    plugins: { plugins: {} }
  };
  plugin.__writes = writes;
  plugin.__opened = opened;
  plugin.settings = plugin.normalizeSettings(options.settings || {});
  plugin.ensureReviewCenterUtils = async () => ({
    buildDailyEvidenceMarkdown: () => "## Evidence\n\n- Finished focused work.",
    buildDailyReviewPrompt: ({ evidenceMarkdown }) => `Review this evidence:\n\n${evidenceMarkdown}`,
    buildClaudianReviewPrompt: ({ skillName, mode, period, artifactPath, evidenceFile }) => [
      String(skillName || ""),
      "",
      `mode: ${mode}`,
      `period: ${period}`,
      `review_note: ${artifactPath}`,
      `evidence_file: ${evidenceFile}`,
      "请生成复盘笔记。"
    ].join("\n")
  });
  plugin.getDailyReviewModel = async () => ({
    date: "2026-05-05",
    diaryPath: "Noria/Diary/2026/2026-05-05.md",
    artifactPath: "Noria/Diary/2026/2026-05-05-review.md",
    evidenceHash: "hash123",
    evidence: {},
    artifact: { exists: options.artifactExists === true }
  });
  plugin.validateDailyReviewMarkdown = () => true;
  return plugin;
}

test("daily and review note paths derive from the configured diary root", () => {
  const diary = loadDiaryBlocks();
  const review = loadReviewCenter();

  assert.equal(diary.getDiaryPathForDate("2026-05-01", { diaryRoot: "Noria/Diary" }), "Noria/Diary/2026/2026-05-01.md");
  assert.equal(
    diary.getTodayDiaryPath(new Date("2026-05-01T09:30:00+08:00"), { diaryRoot: "06_Diary" }),
    "06_Diary/2026/2026-05-01.md"
  );
  assert.equal(review.resolveDailyArtifactPath({ managedPaths: { diaryRoot: "06_Diary" } }, "2026-05-01"), "06_Diary/2026/2026-05-01-review.md");
  assert.equal(review.resolveReviewNotePathFromDailyPath("Noria/Diary/2026/2026-05-01.md"), "Noria/Diary/2026/2026-05-01-review.md");
  assert.equal(review.isDailyNotePath("Noria/Diary/2026/2026-05-01.md"), true);
  assert.equal(review.isReviewNotePath("Noria/Diary/2026/2026-05-01-review.md"), true);
});

test("final review writeback updates target recap sections and preserves unrelated user notes", () => {
  const diary = loadDiaryBlocks();
  const input = [
    "## 待办",
    "",
    "- [ ] keep task",
    "",
    "## 复盘",
    "",
    "### 内容变化分析",
    "",
    "AI detail should disappear from final archive.",
    "",
    "### 其他记录",
    "",
    "这是一条用户手写记录，应该保留。",
    "",
    "### 感想",
    "",
    "old thought",
    "",
    "## 其他",
    "",
    "keep me"
  ].join("\n");

  const next = diary.upsertFinalReviewSections(input, {
    summary: "今天完成了复盘中心的第一版。",
    gdd: { hi: "独立入口清晰", dev: "证据还需扩展", blk: "Claudian 自动化待实测" },
    gratitude: "感谢今天的稳定专注。",
    thought: "明天继续做周复盘。"
  });

  assert.doesNotMatch(next, /^### 日态$/m);
  assert.match(next, /^### 总结$/m);
  assert.match(next, /^### GDD$/m);
  assert.match(next, /^### 今日感恩$/m);
  assert.match(next, /^### 感想（自由写）$/m);
  assert.doesNotMatch(next, /内容变化分析/);
  assert.doesNotMatch(next, /AI detail/);
  assert.match(next, /这是一条用户手写记录，应该保留。/);
  assert.match(next, /感谢今天的稳定专注。/);
  assert.match(next, /## 其他\s+keep me/);
});

test("final review editor replaces and clears managed fields instead of merging old text", () => {
  const diary = loadDiaryBlocks();
  const input = [
    "## Review",
    "",
    "### Summary",
    "",
    "old summary",
    "",
    "### GDD",
    "",
    "- Highlight: old highlight",
    "- Deviation: old deviation",
    "- Blocker: old blocker",
    "",
    "### Gratitude",
    "",
    "old gratitude",
    "",
    "### Free writing",
    "",
    "old thought",
    "",
    "### Other notes",
    "",
    "keep this handwritten note"
  ].join("\n");

  const next = diary.replaceFinalReviewSections(input, {
    summary: "new summary",
    gdd: { hi: "", dev: "new deviation", blk: "" },
    gratitude: "",
    thought: "new thought"
  });

  assert.equal(diary.parseSummary(next), "new summary");
  assert.deepEqual({ ...diary.parseGdd(next) }, { hi: "", dev: "new deviation", blk: "" });
  assert.equal(diary.parseGratitude(next), "");
  assert.equal(diary.parseThought(next), "new thought");
  assert.doesNotMatch(next, /old summary|old highlight|old deviation|old blocker|old gratitude|old thought/);
  assert.match(next, /keep this handwritten note/);
});

test("final review writeback preserves an English diary structure", () => {
  const diary = loadDiaryBlocks();
  const input = [
    "## Tasks",
    "",
    "- [ ] keep task",
    "",
    "## Review",
    "",
    "### Content change analysis",
    "",
    "Generated detail should disappear from the final archive.",
    "",
    "### Other notes",
    "",
    "Keep this handwritten note.",
    "",
    "### Free writing",
    "",
    "old thought",
    "",
    "## Other",
    "",
    "keep me"
  ].join("\n");

  const next = diary.upsertFinalReviewSections(input, {
    summary: "Completed the first review-center pass.",
    gdd: { hi: "Clear entry point", dev: "Needs more evidence", blk: "Automation is pending" },
    gratitude: "Grateful for sustained focus.",
    thought: "Continue with the weekly review tomorrow."
  });

  assert.match(next, /^## Review$/m);
  assert.match(next, /^### Summary$/m);
  assert.match(next, /^### GDD$/m);
  assert.match(next, /^- Highlight: Clear entry point$/m);
  assert.match(next, /^- Deviation: Needs more evidence$/m);
  assert.match(next, /^- Blocker: Automation is pending$/m);
  assert.match(next, /^### Gratitude$/m);
  assert.match(next, /^### Free writing$/m);
  assert.doesNotMatch(next, /^## 复盘$/m);
  assert.doesNotMatch(next, /^### (?:总结|今日感恩|感想)/m);
  assert.doesNotMatch(next, /Content change analysis/);
  assert.match(next, /Keep this handwritten note\./);
  assert.match(next, /## Other\s+keep me/);
  assert.equal(diary.parseSummary(next), "Completed the first review-center pass.");
});

test("today-task writeback reuses English task headings", () => {
  const diary = loadDiaryBlocks();
  const next = diary.appendTodayTaskLine("## Tasks\n\n### Today tasks\n\n", "Draft release note");

  assert.match(next, /^## Tasks$/m);
  assert.match(next, /^### Today tasks$/m);
  assert.match(next, /^- \[ \] Draft release note$/m);
  assert.doesNotMatch(next, /^## 待办$/m);
  assert.doesNotMatch(next, /^### 今日任务$/m);
  assert.equal((next.match(/^### Today tasks$/gm) || []).length, 1);
  assert.equal(diary.getRecapFillFlags(next).hasTodayTasks, true);
});

test("review child sections remain readable and replaceable at end of file", () => {
  const diary = loadDiaryBlocks();
  const input = "## Review\n\n### Free writing\n\nold thought";

  assert.equal(diary.parseThought(input), "old thought");
  const next = diary.upsertThoughtSection(input, "new thought");
  assert.equal((next.match(/^### Free writing$/gm) || []).length, 1);
  assert.equal(diary.parseThought(next), "new thought");
  assert.doesNotMatch(next, /old thought/);
});

test("English diary creation paths use localized structural headings", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const periodicRecap = fs.readFileSync(pluginPath("views/periodic/dashboardDailyRecap.js"), "utf8");

  assert.match(main, /"review\.final\.subtitle": "[^"]*## Review\./);
  assert.match(main, /createTimelineDiarySeed\(\)\s*\{[\s\S]*getNoriaLocale\(\)[\s\S]*## Tasks[\s\S]*## Review/);
  assert.match(periodicRecap, /bridge\.locale\s*\|\|\s*bridge\.i18n\?\.locale/);
  assert.match(periodicRecap, /\? "复盘" : "Review"/);
  assert.match(periodicRecap, /## \$\{reviewHeading\}/);
  assert.match(periodicRecap, /runtime\.periodic\.dailyRecap\.stepState/);
  assert.match(periodicRecap, /runtime\.periodic\.dailyRecap\.gddHighlight/);
  assert.doesNotMatch(periodicRecap, /const taHi = mk\("亮点"\)/);
});

test("legacy daily recap mutates the latest diary text and tolerates a concurrent create", () => {
  const periodicRecap = fs.readFileSync(pluginPath("views/periodic/dashboardDailyRecap.js"), "utf8");
  const ensureStart = periodicRecap.indexOf("async function ensureDiaryFile");
  const writeStart = periodicRecap.indexOf("async function writeDiary", ensureStart);
  const end = periodicRecap.indexOf("\n\n  await readDiary", writeStart);
  assert.ok(ensureStart >= 0 && writeStart > ensureStart && end > writeStart);
  const body = periodicRecap.slice(ensureStart, end);

  assert.match(body, /File already exists|already exists/);
  assert.match(body, /if \(typeof app\.vault\.process === "function"\)/);
  assert.match(body, /await app\.vault\.process\(f, applyMutation\)/);
  assert.doesNotMatch(body, /let t = await app\.vault\.read\(f\);\s*t = mutator\(t\);\s*await app\.vault\.modify\(f, t\);/s);
});

test("review center source removes duplicate evidence metrics and final daily state controls", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const evidenceStart = main.indexOf("renderEvidenceSection(body, model)");
  const finalStart = main.indexOf("renderFinalSection(body, model)");
  assert.notEqual(evidenceStart, -1);
  assert.notEqual(finalStart, -1);
  const evidenceBody = main.slice(evidenceStart, finalStart);
  const finalBody = main.slice(finalStart, main.indexOf("\n  async render", finalStart));

  assert.doesNotMatch(evidenceBody, /noria-review-metric-grid/);
  assert.doesNotMatch(evidenceBody, /review\.metric\.doneTasks/);
  assert.doesNotMatch(finalBody, /noria-review-state-box/);
  assert.doesNotMatch(finalBody, /review\.final\.weather/);
  assert.doesNotMatch(finalBody, /state:\s*state/);
});

test("home guide panels mounts one review disclosure after the MOC strip", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const mocPos = guide.indexOf("dashboard-moc-host");
  const reviewPos = guide.indexOf("dashboard-review-center-host");

  assert.ok(mocPos > 0);
  assert.ok(reviewPos > mocPos);
  assert.match(guide, /dashboard-review-center-card/);
  assert.doesNotMatch(guide, /getReviewCenterSummary/);
  assert.match(guide, /openHomeReviewFocusPanel/);
  assert.match(guide, /renderHomeReviewFocusPanel/);
  assert.match(guide, /renderReviewCenter/);
  assert.match(guide, /expanded:\s*false/);
  assert.match(guide, /const requestedSelection = request\?\.selection/);
  assert.match(guide, /reviewRenderer\?\.setSelection\?\.\(requestedSelection\)/);
  assert.doesNotMatch(guide, /createEl\("details"\)/);
  assert.match(guide, /homeSettings\?\.guidePanels\?\.reviewCenter\s*!==\s*false/);
});

test("review renderer owns one normalized selection and rejects stale generations", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("class NoriaReviewCenterRenderer");
  const end = main.indexOf("class NoriaSettingTab", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const renderer = main.slice(start, end);

  assert.match(renderer, /this\.selection\s*=\s*this\.plugin\.resolveReviewSelection/);
  assert.match(renderer, /this\.generationGate\s*=\s*reviewCenterCore\.createReviewGenerationGate/);
  assert.match(renderer, /setSelection\(patch\s*=\s*\{\}\)/);
  assert.match(renderer, /this\.generationGate\.issue\(\)/);
  assert.match(renderer, /this\.generationGate\.isCurrent\(generation\)/);
  assert.doesNotMatch(renderer, /this\.selectedDate\s*=/);
  assert.doesNotMatch(renderer, /this\.activePeriod\s*=/);
});

test("review renderer opens final-first and keeps evidence and analysis lazy", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("class NoriaReviewCenterRenderer");
  const end = main.indexOf("class NoriaSettingTab", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const renderer = main.slice(start, end);
  const renderStart = renderer.indexOf("async render()");
  const renderEnd = renderer.indexOf("\n  normalizeFinalPayload(", renderStart);
  const initialRender = renderer.slice(renderStart, renderEnd);

  assert.match(renderer, /this\.state\s*=\s*\{/);
  assert.match(renderer, /support:\s*\{\s*mode:\s*""/);
  assert.match(renderer, /final:\s*\{[\s\S]*dirty:\s*false/);
  assert.match(initialRender, /this\.plugin\.loadReviewFinal\(selection\)/);
  assert.match(initialRender, /this\.renderFinalFirst/);
  assert.doesNotMatch(initialRender, /getDailyReviewModel|getPeriodReviewModel/);
  assert.doesNotMatch(initialRender, /renderEvidenceSection|renderLlmSection/);
  assert.match(renderer, /setSupportMode\(mode\)/);
  assert.match(renderer, /this\.plugin\.getFullReviewEvidence/);
  assert.match(renderer, /this\.plugin\.getReviewAnalysisArtifact/);
});

test("review final pane does not repeat the period already shown by the shared shell", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("  renderFinalFirst(body = this.bodyEl)");
  const end = main.indexOf("\n  createFinalField(", start);
  assert.ok(start > 0);
  assert.ok(end > start);
  const finalPane = main.slice(start, end);

  assert.match(finalPane, /review\.final\.editorTitle/);
  assert.doesNotMatch(finalPane, /noria-review-final-context/);
  assert.doesNotMatch(finalPane, /this\.selection\.anchorDate\s*:\s*this\.selection\.period/);
});

test("review renderer debounces recovery drafts and flushes them before target changes", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("class NoriaReviewCenterRenderer");
  const end = main.indexOf("class NoriaSettingTab", start);
  const renderer = main.slice(start, end);

  assert.match(renderer, /scheduleReviewRecoveryDraft\(\)/);
  assert.match(renderer, /setTimeout\([\s\S]*400/);
  assert.match(renderer, /flushReviewRecoveryDraft\(\)/);
  assert.match(renderer, /queueReviewRecoveryEntry/);
  assert.match(renderer, /async setSelection\(patch\s*=\s*\{\}\)[\s\S]*await this\.flushReviewRecoveryDraft\(\)/);
  assert.match(renderer, /unload\(\)[\s\S]*flushReviewRecoveryDraft\(\)/);
});

test("review support reuses one full-evidence load and artifact events never rerender the dirty root", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("class NoriaReviewCenterRenderer");
  const end = main.indexOf("class NoriaSettingTab", start);
  const renderer = main.slice(start, end);
  const watchStart = renderer.indexOf("watchReviewAnalysisArtifact(");
  const watchEnd = renderer.indexOf("\n  getReviewDraftSections(", watchStart);
  const watcher = renderer.slice(watchStart, watchEnd);

  assert.match(renderer, /this\._supportEvidenceCache\s*=/);
  assert.match(renderer, /getFullReviewEvidenceOnce\(generation\)/);
  assert.match(renderer, /this\.plugin\.getFullReviewEvidence\(this\.selection\)/);
  assert.match(renderer, /disposeReviewAnalysisArtifactWatch\(\)/);
  assert.ok(watchStart > 0);
  assert.match(watcher, /refreshReviewAnalysisArtifact\(generation\)/);
  assert.doesNotMatch(watcher, /this\.render\(\)/);
});

test("daily personal record stays compact when empty and opens when saved content exists", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("renderDailyFinalEditor(parent)");
  const end = main.indexOf("\n  renderPeriodFinalEditor(parent)", start);
  const editor = main.slice(start, end);

  assert.match(editor, /const hasPersonal\s*=\s*!!\(payload\.gratitude\.trim\(\)\s*\|\|\s*payload\.thought\.trim\(\)\)/);
  assert.match(editor, /personal\.open\s*=\s*hasPersonal/);
});

test("daily gratitude and free-writing editors use the same field height", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const start = main.indexOf("renderDailyFinalEditor(parent)");
  const end = main.indexOf("\n  renderPeriodFinalEditor(parent)", start);
  const editor = main.slice(start, end);

  assert.match(editor, /review\.final\.gratitude[\s\S]{0,160}payload\.gratitude,\s*4/);
  assert.match(editor, /review\.final\.thought[\s\S]{0,160}payload\.thought,\s*4/);
  assert.match(styles, /\.noria-review-final-personal-body\s+\.noria-review-textarea\s*\{[\s\S]*?min-height:\s*86px/);
});

test("period analysis adoption replaces only the local final after inline confirmation", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const start = main.indexOf("renderAnalysisSupport(parent, artifact)");
  const end = main.indexOf("\n  renderDaily(body, model)", start);
  const support = main.slice(start, end);

  assert.match(support, /normalizePeriodReviewArtifactForWriteback\(artifact\.text\)/);
  assert.match(support, /this\.state\.support\.confirmAdoption/);
  assert.match(support, /this\.state\.final\.payload\.body\s*=\s*periodDraft/);
  assert.match(support, /this\.markFinalDirty\("adopted"\)/);
  assert.doesNotMatch(support, /window\.confirm/);
  assert.doesNotMatch(support, /saveReviewFinal\(/);
});

test("Home owns the only review product entry and reuses one collapsible renderer", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const rendererStart = main.indexOf("class NoriaReviewCenterRenderer");
  const rendererEnd = main.indexOf("class NoriaSettingTab", rendererStart);
  const renderer = main.slice(rendererStart, rendererEnd);
  const commandSpecs = main.slice(main.indexOf("getCoreCommandSpecs()"), main.indexOf("getEnabledCoreCommandSpecs()"));
  const runtimeBridge = main.slice(main.indexOf("async getReviewCenterSummary"), main.indexOf("async saveDailyStateForDate"));
  const collapseStart = guide.indexOf("const collapseReviewFocusPanel");
  const collapseEnd = guide.indexOf("const mountHomeReviewFocusPanel", collapseStart);
  const collapse = guide.slice(collapseStart, collapseEnd);

  assert.match(renderer, /expanded:\s*options\.expanded\s*===\s*true/);
  assert.match(renderer, /async setExpanded\(expanded\)/);
  assert.match(renderer, /if \(!this\.state\.expanded\)[\s\S]*return this\.performance/);
  assert.match(renderer, /await this\.flushReviewRecoveryDraft\(\)/);
  assert.doesNotMatch(commandSpecs, /noria-open-review-center-standalone|openReviewCenterStandalone/);
  assert.doesNotMatch(runtimeBridge, /openReviewCenterStandalone/);
  assert.doesNotMatch(main, /class NoriaReviewCenterView|VIEW_TYPE_NORIA_REVIEW_CENTER/);
  assert.equal((guide.match(/runtimeBridge\.renderReviewCenter\(/g) || []).length, 1);
  assert.match(guide, /expanded:\s*false/);
  assert.match(guide, /reviewRenderer\?\.setSelection/);
  assert.match(guide, /reviewRenderer\?\.setExpanded\?\.\(true\)/);
  assert.match(guide, /reviewRenderer\?\.setExpanded\?\.\(false\)/);
  assert.doesNotMatch(guide, /const reviewDate\s*=/);
  assert.doesNotMatch(collapse, /reviewRenderer\?\.unload/);
});

test("review selection resolves one period from the calendar contract", () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.app = {
    vault: { getAbstractFileByPath: () => null },
    plugins: { plugins: {} }
  };
  plugin.settings = plugin.normalizeSettings({});

  assert.deepEqual({ ...plugin.resolveReviewSelection({
    mode: "weekly",
    anchorDate: "2026-07-14"
  }) }, {
    mode: "weekly",
    anchorDate: "2026-07-14",
    period: "2026-W29",
    yearlyVariant: "month",
    generation: 0
  });
  assert.equal(plugin.resolveReviewSelection({
    mode: "monthly",
    anchorDate: "2026-07-14"
  }).period, "2026-07");
});

test("home review summary expands the full workbench inside a same-leaf focus panel", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(guide, /dashboard-review-center-summary/);
  assert.match(guide, /dashboard-review-center-summary-title/);
  assert.doesNotMatch(guide, /applyReviewSummary/);
  assert.match(guide, /dashboard-review-center-open/);
  assert.match(guide, /dashboard-review-focus-panel/);
  assert.doesNotMatch(guide, /dashboard-review-center-collapse/);
  assert.doesNotMatch(guide, /review\.home\.focusTitle/);
  assert.match(guide, /registerCleanup\(/);
  assert.match(guide, /consumeHomeReviewFocusRequest/);
  assert.match(main, /getReviewCenterHomeSummary/);
  assert.match(main, /openReviewCenter\(request = \{\}\)/);
  assert.match(main, /openReviewCenterInHome\(request\s*\|\|\s*\{\}\)/);
  assert.match(main, /consumeHomeReviewFocusRequest\(\)/);
  assert.match(main, /"review\.home\.focusTitle":\s*(?:"复盘中心"|"\\u590D\\u76D8\\u4E2D\\u5FC3")/);
  assert.doesNotMatch(main, /"review\.home\.focusTitle":\s*(?:"复盘工作台"|"\\u590D\\u76D8\\u5DE5\\u4F5C\\u53F0")/);
  assert.match(styles, /\.dashboard-review-center-card\s*\{/);
  assert.match(styles, /\.dashboard-review-center-open\s*\{/);
  assert.match(styles, /\.dashboard-review-focus-panel\s*\{/);
  assert.doesNotMatch(styles, /\.dashboard-review-center-host\[data-noria-review-focus="open"\]\s+\.dashboard-review-center-card\s*\{[\s\S]*display:\s*none/);
  assert.match(styles, /\.dashboard-review-center-host\[data-noria-review-focus="open"\]\s+\.dashboard-review-center-open\s*\{[\s\S]*border:\s*0/);
  assert.match(styles, /\.dashboard-review-center-host\[data-noria-review-focus="open"\]\s+\.dashboard-review-center-marker\s*\{[\s\S]*background:\s*var\(--dash-heading-accent/);
  assert.match(styles, /\.dashboard-review-center-host\[data-noria-review-focus="open"\]\s+\.dashboard-review-center-summary-copy::after\s*\{[\s\S]*border-bottom:\s*2px dashed var\(--dash-heading-divider/);
  assert.match(styles, /\.dashboard-review-center-host\[data-noria-review-focus="open"\]\s+\.dashboard-review-focus-panel\s*\{[\s\S]*border:\s*0/);
  assert.match(styles, /\.dashboard-review-center-host\[data-noria-review-focus="open"\]\s+\.dashboard-review-focus-head\s*\{[\s\S]*border-bottom:\s*0/);
  assert.match(styles, /\.dashboard-review-center-host\[data-noria-review-focus="open"\]\s+\.dashboard-review-focus-head\s*\{[\s\S]*justify-content:\s*flex-end/);
  assert.doesNotMatch(styles, /\.dashboard-review-center-collapse\s*\{/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-root/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-section::before\s*\{[\s\S]*display:\s*none/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-section\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(styles, /\.noria-review-root\.has-external-controls\s+\./);
});

test("home review focus keeps a structured fallback when the embedded workbench is unavailable", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(guide, /renderReviewFocusFallback/);
  assert.match(guide, /data-noria-review-focus-state/);
  assert.match(guide, /data-noria-review-stage/);
  assert.match(guide, /review\.home\.fallback\.evidence\.title/);
  assert.match(guide, /review\.home\.fallback\.draft\.title/);
  assert.match(guide, /review\.home\.fallback\.final\.title/);
  assert.match(guide, /review\.home\.focusError/);
  assert.match(main, /"review\.home\.fallback\.evidence\.title"/);
  assert.match(main, /"review\.home\.fallback\.draft\.title"/);
  assert.match(main, /"review\.home\.fallback\.final\.title"/);
  assert.match(styles, /\.dashboard-review-focus-fallback\s*\{/);
  assert.match(styles, /\.dashboard-review-focus-fallback-stage\s*\{/);
  assert.match(styles, /\.dashboard-review-focus-fallback-stage\[data-noria-review-stage="evidence"\]/);
  assert.match(styles, /\.dashboard-review-focus-fallback-state\s*\{/);
});

test("the shared review shell reads as one disclosure in both collapsed and expanded states", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const rendererStart = main.indexOf("class NoriaReviewCenterRenderer");
  const rendererEnd = main.indexOf("class NoriaSettingTab", rendererStart);
  const renderer = main.slice(rendererStart, rendererEnd);

  assert.match(main, /"review\.home\.open":\s*(?:"展开"|"\\u5C55\\u5F00")/);
  assert.doesNotMatch(main, /"review\.home\.open":\s*(?:"打开工作台"|"\\u6253\\u5F00\\u5DE5\\u4F5C\\u53F0")/);
  assert.match(renderer, /renderReviewShellHeader\(parent\)/);
  assert.match(renderer, /cls:\s*"noria-review-shell-toggle dashboard-review-center-card dashboard-review-center-open"/);
  assert.match(renderer, /toggle\.setAttribute\("aria-expanded", expanded \? "true" : "false"\)/);
  assert.match(renderer, /dashboard-review-center-summary-title/);
  assert.match(renderer, /review\.home\.diary/);
  assert.match(renderer, /noria-review-shell-save-state/);
  assert.match(renderer, /dashboard-review-center-toggle-label/);
  assert.match(renderer, /dashboard-review-center-chevron/);
  assert.match(renderer, /void this\.setExpanded\(!expanded\)/);
  assert.equal((guide.match(/runtimeBridge\.renderReviewCenter\(/g) || []).length, 1);
  assert.match(styles, /\.noria-review-shell-header\s*\{/);
  assert.match(styles, /\.dashboard-review-center-host\s*>\s*\.dashboard-review-focus-panel\s*\{[\s\S]*border:\s*0/);
  assert.match(styles, /\.dashboard-review-center-host\s*>\s*\.dashboard-review-focus-panel\s*>\s*\.dashboard-review-focus-body\s*\{[\s\S]*padding:\s*0/);
  assert.match(styles, /\.dashboard-review-center-host\s*>\s*\.dashboard-review-center-card\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important/);
});

test("dirty final edits update shell and action affordances in place without rebuilding the textarea", () => {
  const main = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const rendererStart = main.indexOf("class NoriaReviewCenterRenderer");
  const rendererEnd = main.indexOf("class NoriaSettingTab", rendererStart);
  const renderer = main.slice(rendererStart, rendererEnd);
  const dirtyStart = renderer.indexOf("markFinalDirty(saveState = \"dirty\")");
  const dirtyEnd = renderer.indexOf("async refreshReviewSupport", dirtyStart);
  const dirty = renderer.slice(dirtyStart, dirtyEnd);
  const fieldStart = renderer.indexOf("createFinalField(parent");
  const fieldEnd = renderer.indexOf("renderDailyFinalEditor", fieldStart);
  const field = renderer.slice(fieldStart, fieldEnd);

  assert.match(renderer, /syncFinalSaveUi\(\)/);
  assert.match(dirty, /this\.syncFinalSaveUi\(\)/);
  assert.doesNotMatch(dirty, /renderFinalFirst|\.render\(/);
  assert.doesNotMatch(field, /renderFinalFirst|\.render\(/);
  assert.match(renderer, /this\.shellSaveStateEl/);
  assert.match(renderer, /this\.finalDiscardButton/);
  assert.match(renderer, /this\.finalSaveButton/);
});

test("home review focus mounts a light disclosure first and defers expansion until the next frame", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const renderBlock = guide.slice(
    guide.indexOf("const renderHomeReviewFocusPanel"),
    guide.indexOf("const openHomeReviewFocusPanel")
  );

  assert.match(guide, /const nextReviewFocusFrame = \(\) => new Promise/);
  assert.match(guide, /requestAnimationFrame/);
  assert.match(guide, /setTimeout\(finish,\s*120\)/);
  assert.match(guide, /renderReviewCenter\(focusBody,\s*\{[\s\S]*expanded:\s*false/);
  assert.match(renderBlock, /setHomeReviewFocusDiagnostics\("opening"/);
  assert.match(renderBlock, /void mountHomeReviewFocusPanel\(seq,\s*\{ \.\.\.\(request \|\| \{\}\), __source: source, __startedAt: startedAt \},\s*null\)/);
  assert.match(guide, /await nextReviewFocusFrame\(\)/);
  assert.match(guide, /setHomeReviewFocusDiagnostics\("loading"/);
  assert.match(guide, /await reviewRenderer\?\.setExpanded\?\.\(true\)/);
  assert.match(guide, /if \(seq !== focusRenderSeq\) return/);
  assert.doesNotMatch(renderBlock, /openButton\.disabled\s*=\s*true/);
});

test("home review focus exposes mount timing diagnostics without adding visual chrome", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");

  assert.match(guide, /function nowHomeReviewFocusMs/);
  assert.match(guide, /function setHomeReviewFocusDiagnostics/);
  assert.match(guide, /data-noria-review-focus-source/);
  assert.match(guide, /data-noria-review-focus-started-at/);
  assert.match(guide, /data-noria-review-focus-mounted-at/);
  assert.match(guide, /data-noria-review-focus-mount-ms/);
  assert.match(guide, /data-noria-review-focus-error/);
  assert.match(guide, /setHomeReviewFocusDiagnostics\("opening"/);
  assert.match(guide, /setHomeReviewFocusDiagnostics\("loading"/);
  assert.match(guide, /setHomeReviewFocusDiagnostics\("ready"/);
  assert.match(guide, /setHomeReviewFocusDiagnostics\("error"/);
  assert.match(guide, /renderReviewCenter[\s\S]*nowHomeReviewFocusMs/);
  assert.doesNotMatch(guide, /dashboard-review-focus-performance-card|dashboard-review-focus-timing-pill|review focus performance rail/);
});

test("home review focus exposes model render and evidence phase diagnostics without visual chrome", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  ["model", "render", "evidence", "tasks", "git", "stats", "excerpts"].forEach((phase) => {
    assert.match(guide, new RegExp(`data-noria-review-focus-${phase}-ms`));
  });
  assert.match(guide, /nextRenderer\?\.performance/);
  assert.match(main, /data-noria-review-model-ms/);
  assert.match(main, /data-noria-review-render-ms/);
  assert.match(main, /this\.performance\s*=/);
  assert.doesNotMatch(guide, /dashboard-review-focus-performance-card|dashboard-review-focus-timing-pill|review focus performance rail/);
});

test("home review focus default-expanded setting reuses the staged same-leaf opener", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");

  assert.match(guide, /reviewCenterExpanded\s*===\s*true/);
  assert.match(guide, /const defaultReviewFocusRequest/);
  assert.match(guide, /defaultReviewFocusRequest[\s\S]*source:\s*"home-default"/);
  assert.match(guide, /if \(pendingReviewFocus\) void openHomeReviewFocusPanel\(pendingReviewFocus\)/);
  assert.match(guide, /else if \(defaultReviewFocusRequest\) scheduleDefaultReviewFocusOpen\(defaultReviewFocusRequest\)/);
  assert.doesNotMatch(guide, /reviewCenterExpanded[\s\S]{0,180}renderReviewCenter/);
});

test("home review focus default-expanded auto-open waits for idle budget before heavy renderer mount", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");

  assert.match(guide, /const nextReviewFocusIdle = \(\) => new Promise/);
  assert.match(guide, /requestIdleCallback/);
  assert.match(guide, /timeout:\s*900/);
  assert.match(guide, /const scheduleDefaultReviewFocusOpen = \(request = \{\}\) =>/);
  assert.match(guide, /setHomeReviewFocusDiagnostics\("scheduled"/);
  assert.match(guide, /await nextReviewFocusIdle\(\)/);
  assert.match(guide, /source:\s*"home-default"/);
  assert.doesNotMatch(guide, /else if \(defaultReviewFocusRequest\) void openHomeReviewFocusPanel\(defaultReviewFocusRequest\)/);
});

test("home review frame and idle gates recover when host callbacks are dropped during reload", () => {
  const guide = fs.readFileSync(pluginPath("views/dashboard/home/sections/guide-panels/view.js"), "utf8");
  const frameStart = guide.indexOf("const nextReviewFocusFrame");
  const idleStart = guide.indexOf("const nextReviewFocusIdle", frameStart);
  const fallbackStart = guide.indexOf("const renderReviewFocusFallback", idleStart);
  assert.ok(frameStart >= 0 && idleStart > frameStart && fallbackStart > idleStart);

  const frameBlock = guide.slice(frameStart, idleStart);
  const idleBlock = guide.slice(idleStart, fallbackStart);
  assert.match(frameBlock, /let done = false/);
  assert.match(frameBlock, /setTimeout\(finish,\s*120\)/);
  assert.ok(frameBlock.indexOf("setTimeout(finish, 120)") < frameBlock.indexOf("frame(finish)"));
  assert.match(idleBlock, /let done = false/);
  assert.match(idleBlock, /setTimeout\(finish,\s*1000\)/);
  assert.ok(idleBlock.indexOf("setTimeout(finish, 1000)") < idleBlock.indexOf("idle(finish"));
});

test("daily state heatmap opens selectors for mood energy and focus but not weather", () => {
  const view = fs.readFileSync(pluginPath("views/dashboard/home/sections/trends-and-stats/blocks/daily-state/view.js"), "utf8");

  assert.match(view, /openStatePicker/);
  assert.match(view, /saveDailyStateForDate/);
  assert.match(view, /renderDotOrEmoji\(idx,\s*2,[\s\S]*"mood"/);
  assert.match(view, /renderMetricCell\(idx,\s*4,[\s\S]*"energy"/);
  assert.match(view, /renderMetricCell\(idx,\s*5,[\s\S]*"focus"/);
  const weatherCall = view.match(/renderDotOrEmoji\(idx,\s*3,[^\n]+/)?.[0] || "";
  assert.ok(weatherCall);
  assert.doesNotMatch(weatherCall, /,\s*"weather"/);
  assert.match(view, /dashboard-daily-state-cell--empty/);
  assert.match(view, /dashboard-daily-state-picker-button/);
  assert.match(view, /dashboard-daily-state-picker-button--energy/);
  assert.match(view, /saveStatePatch\(date,\s*kind,\s*op\.value,\s*\{\s*refresh:\s*false\s*\}\)/);
  assert.match(view, /captureScrollPosition\(\)/);
  assert.match(view, /restoreScrollPosition\(scrollSnapshot\)/);
  assert.match(view, /data-noria-action-source/);
  assert.match(view, /source:\s*"home-daily-state-cell"/);
  assert.match(view, /data-noria-action-kind/);
  assert.match(view, /action:\s*"open-daily-state-picker"/);
  assert.match(view, /source:\s*"home-daily-state-picker"/);
  assert.match(view, /action:\s*"save-daily-state"/);
  assert.match(view, /data-noria-daily-state-date/);
  assert.match(view, /data-noria-daily-state-field/);
  assert.match(view, /data-noria-daily-state-value/);
  assert.match(view, /data-noria-last-daily-state-action-state/);
  assert.match(view, /data-noria-last-daily-state-action-error/);
  assert.doesNotMatch(view, /buttonClass:\s*"dashboard-recap-pill"/);
  assert.doesNotMatch(view, /buttonClass:\s*"dashboard-recap-energy-cell"/);
  assert.match(view, /dashboard-recap-energy-icon/);
  assert.match(view, /🪫/);
  assert.match(view, /🔋/);
  assert.match(view, /🟢/);
  assert.match(view, /🟡/);
  assert.match(view, /🟠/);
  assert.match(view, /🔴/);
  assert.match(view, /document\.body\.appendChild\(menu\)[\s\S]*getBoundingClientRect/);
  const styles = fs.readFileSync(pluginPath("views/dashboard/home/sections/bootstrap-style/view.js"), "utf8");
  const pickerButtonRule = styles.match(/button\.dashboard-daily-state-picker-button\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
  assert.ok(pickerButtonRule, "daily-state picker button style should exist");
  assert.match(pickerButtonRule, /border:\s*0/);
  assert.match(pickerButtonRule, /box-shadow:\s*none/);
  assert.match(styles, /button\.dashboard-daily-state-picker-button\[data-noria-action-state="pending"\]/);
  assert.match(styles, /button\.dashboard-daily-state-picker-button\[data-noria-action-state="failed"\]/);
});

test("daily state writeback stores metadata in frontmatter and removes visible inline fields", () => {
  const diary = loadDiaryBlocks();
  const input = [
    "---",
    "tags:",
    "  - daily-plan",
    "---",
    "",
    "## 复盘",
    "",
    "### 日态",
    "",
    "weather:: 雨",
    "weather_status:: 毛毛雨",
    "weather_temp:: 13.4~20.3",
    "weather_humidity:: 70",
    "weather_city:: 北京",
    "weather_source:: history-api:open-meteo",
    "mood:: 稳定",
    "energy:: 3",
    "focus:: 很专注",
    "```noria-view",
    "{ \"view\": \"statusSelector\", \"props\": {} }",
    "```",
    "",
    "### GDD",
    "",
    "- 亮点："
  ].join("\n");

  const next = diary.upsertDailyStateSection(input, {
    weather: "晴",
    weather_status: "晴",
    mood: "很好",
    energy: "4",
    focus: "基本专注"
  });

  assert.match(next, /^weather:\s*晴$/m);
  assert.match(next, /^weather_status:\s*晴$/m);
  assert.match(next, /^mood:\s*很好$/m);
  assert.match(next, /^energy:\s*4$/m);
  assert.match(next, /^focus:\s*基本专注$/m);
  assert.doesNotMatch(next, /^weather::/m);
  assert.doesNotMatch(next, /^weather_status::/m);
  assert.doesNotMatch(next, /^mood::/m);
  assert.match(next, /"view": "statusSelector"/);

  const parsed = diary.parseDailyState(next);
  assert.equal(parsed.weather, "晴");
  assert.equal(parsed.weather_status, "晴");
  assert.equal(parsed.mood, "很好");
  assert.equal(parsed.energy, "4");
  assert.equal(parsed.focus, "基本专注");
});

test("visible daily state migration moves old inline fields and preserves user text", () => {
  const diary = loadDiaryBlocks();
  const input = [
    "---",
    "tags: [daily-plan]",
    "---",
    "",
    "## 复盘",
    "",
    "### 日态",
    "",
    "weather:: 雨",
    "mood:: 稳定",
    "energy:: 3",
    "focus:: 很专注",
    "",
    "这是一句用户自由文本，应该保留。",
    "",
    "```noria-view",
    "{ \"view\": \"statusSelector\", \"props\": {} }",
    "```",
    "",
    "### GDD",
    "",
    "- 亮点：保留"
  ].join("\n");

  const migrated = diary.migrateVisibleDailyStateToFrontmatter(input);

  assert.equal(migrated.changed, true);
  assert.match(migrated.text, /^weather:\s*雨$/m);
  assert.match(migrated.text, /^mood:\s*稳定$/m);
  assert.match(migrated.text, /^energy:\s*3$/m);
  assert.match(migrated.text, /^focus:\s*很专注$/m);
  assert.doesNotMatch(migrated.text, /^weather::/m);
  assert.doesNotMatch(migrated.text, /^mood::/m);
  assert.match(migrated.text, /这是一句用户自由文本，应该保留。/);
  assert.match(migrated.text, /"view": "statusSelector"/);
});

test("daily state parsing prefers frontmatter over stale visible body fields", () => {
  const diary = loadDiaryBlocks();
  const input = [
    "---",
    "weather: 晴",
    "mood: 专注",
    "---",
    "",
    "### 日态",
    "",
    "weather:: 雨",
    "mood:: 稳定"
  ].join("\n");

  const parsed = diary.parseDailyState(input);

  assert.equal(parsed.weather, "晴");
  assert.equal(parsed.mood, "专注");
  assert.equal(diary.hasVisibleDailyStateFields(input), true);
});

test("review artifact parser keeps legacy LLM sections readable", () => {
  const review = loadReviewCenter();
  const artifact = [
    "---",
    "date: 2026-05-01",
    "evidence_hash: abc123",
    "generated_at: 2026-05-01T20:00:00+08:00",
    "---",
    "",
    "## 综合总结",
    "",
    "Summary text.",
    "",
    "## 内容变化分析",
    "",
    "Change analysis.",
    "",
    "## 建议",
    "",
    "Advice text.",
    "",
    "## GDD 建议",
    "",
    "- 亮点：A",
    "- 偏差：B",
    "- 阻塞：C"
  ].join("\n");

  const parsed = review.parseReviewArtifact(artifact);

  assert.equal(parsed.meta.date, "2026-05-01");
  assert.equal(parsed.meta.evidence_hash, "abc123");
  assert.equal(parsed.sections.summary, "Summary text.");
  assert.equal(parsed.sections.analysis, "Change analysis.");
  assert.equal(parsed.sections.advice, "Advice text.");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.gddSuggestion)), { hi: "A", dev: "B", blk: "C" });
  assert.equal(review.isArtifactStale(parsed, "abc123"), false);
  assert.equal(review.isArtifactStale(parsed, "def456"), true);
});

test("review artifact parser maps multi-project sections into the review workbench", () => {
  const review = loadReviewCenter();
  const artifact = [
    "---",
    "period: 2026-07-25",
    "mode: daily",
    "evidence_hash: def456",
    "---",
    "",
    "## 今日判断",
    "",
    "今天完成一条主线并收敛两个项目的未闭环事项。",
    "",
    "## 项目复盘",
    "",
    "### Noria",
    "- [已完成] 复盘证据合同通过验证。",
    "- [未闭环] 真实写回仍待验收。",
    "",
    "### ZFD_AMR",
    "- [已确认] 保留最小状态设计。",
    "",
    "## 明日聚焦",
    "",
    "- 主线：完成真实写回验收。",
    "",
    "## 偏差与阻塞",
    "",
    "- 亮点：项目边界更清楚",
    "- 偏差：科研主线投入不足",
    "- 阻塞：无明确阻塞",
    "",
    "## 证据索引",
    "",
    "- Noria: progress.md#2026-07-25"
  ].join("\n");

  const parsed = review.parseReviewArtifact(artifact);

  assert.equal(parsed.sections.summary, "今天完成一条主线并收敛两个项目的未闭环事项。");
  assert.match(parsed.sections.analysis, /### Noria/);
  assert.match(parsed.sections.analysis, /### ZFD_AMR/);
  assert.equal(parsed.sections.advice, "- 主线：完成真实写回验收。");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.gddSuggestion)), {
    hi: "项目边界更清楚",
    dev: "科研主线投入不足",
    blk: "无明确阻塞"
  });
  assert.equal(parsed.sections.evidence, "- Noria: progress.md#2026-07-25");
  assert.equal(review.hasGeneratedReviewContent(parsed), true);
});

test("review center refreshes a stale global parser contract before reading new review headings", async () => {
  const { PluginClass, context } = loadPluginClass({ exposeContext: true });
  const plugin = new PluginClass();
  const staleReviewCenter = {
    parseReviewArtifact() {
      return { sections: { summary: "", analysis: "", advice: "", evidence: "" }, gddSuggestion: {} };
    },
    hasGeneratedReviewContent() {
      return false;
    }
  };
  context.dashboardCore = { utils: { reviewCenter: staleReviewCenter } };

  const review = await plugin.ensureReviewCenterUtils();
  const parsed = review.parseReviewArtifact([
    "## 今日判断",
    "",
    "当天完成了有证据的闭环。",
    "",
    "## 项目复盘",
    "",
    "### Noria",
    "- [已完成] 运行态验收。"
  ].join("\n"));

  assert.notEqual(review, staleReviewCenter);
  assert.equal(review.runtimeContractVersion, 2);
  assert.equal(parsed.sections.summary, "当天完成了有证据的闭环。");
  assert.equal(review.hasGeneratedReviewContent(parsed), true);
});

test("review evidence hash tolerates circular snapshot references", () => {
  const review = loadReviewCenter();
  const snapshot = {
    range: { start: "2026-05-01", end: "2026-05-07" },
    domains: { tasks: { completion: { completed: 1 } } },
    views: { review: {} }
  };
  snapshot.views.review.snapshot = snapshot;

  assert.doesNotThrow(() => review.createEvidenceHash({ stats: snapshot }));
  assert.match(review.createEvidenceHash({ stats: snapshot }), /^[0-9a-f]{8}$/);
});

test("daily review evidence starts independent collectors in parallel", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const started = [];
  const defer = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  const tasks = defer();
  const git = defer();
  const stats = defer();
  const flushMicrotasks = async (count = 4) => {
    for (let i = 0; i < count; i += 1) await Promise.resolve();
  };

  plugin.collectDailyTasks = async () => {
    started.push("tasks");
    return tasks.promise;
  };
  plugin.collectGitReview = async () => {
    started.push("git");
    return git.promise;
  };
  plugin.collectReviewExcerpts = async (_diaryPath, gitPayload) => {
    started.push(`excerpts:${gitPayload.marker}`);
    return [{ path: "06_Diary/2026/2026-05-04.md", text: "excerpt" }];
  };
  plugin.createDataService = async () => {
    started.push("service");
    return {
      getSnapshot: async () => {
        started.push("stats");
        return stats.promise;
      }
    };
  };

  const review = { countWords: (text) => String(text || "").split(/\s+/).filter(Boolean).length };
  const pending = plugin.collectDailyReviewEvidence("2026-05-04", "06_Diary/2026/2026-05-04.md", "two words", review);
  await flushMicrotasks();

  assert.equal(started.join("|"), "tasks|git|service|stats");

  git.resolve({ marker: "git-ready" });
  await flushMicrotasks();

  assert.ok(started.includes("excerpts:git-ready"), "excerpts should start as soon as git evidence is ready");

  tasks.resolve({ done: 1, open: 0 });
  stats.resolve({ range: { start: "2026-05-04", end: "2026-05-04" } });
  const result = await pending;

  assert.deepEqual(result.tasks, { done: 1, open: 0 });
  assert.equal(result.git.marker, "git-ready");
  assert.equal(result.diaryWords, 2);
  assert.deepEqual(result.stats, { range: { start: "2026-05-04", end: "2026-05-04" } });
  assert.deepEqual(result.excerpts, [{ path: "06_Diary/2026/2026-05-04.md", text: "excerpt" }]);
  assert.deepEqual(Object.keys(result.performance).sort(), ["excerptsMs", "gitMs", "statsMs", "tasksMs", "totalMs"]);
  Object.values(result.performance).forEach((value) => assert.equal(Number.isFinite(value), true));
});

test("daily review keeps an unavailable Git evidence shape without shell execution", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const result = await plugin.collectGitReview("2026-05-04", {});

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    available: false,
    commits: [],
    committed: { added: 0, modified: 0, deleted: 0, renamed: 0, files: [] },
    working: { added: 0, modified: 0, deleted: 0, renamed: 0, files: [] },
    diff: { added: 0, deleted: 0, net: 0, files: [] },
    newFolders: []
  });
});

test("daily review excerpts read source files in parallel while preserving order", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const started = [];
  const gates = new Map();
  const defer = () => {
    let resolve;
    const promise = new Promise((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };
  const flushMicrotasks = async (count = 4) => {
    for (let i = 0; i < count; i += 1) await Promise.resolve();
  };
  ["06_Diary/2026/2026-05-04.md", "01_Projects/A.md", "01_Projects/B.md", "01_Projects/C.md"].forEach((pathText) => {
    gates.set(pathText, defer());
  });

  plugin.loadTextFromVault = async (pathText) => {
    started.push(String(pathText || ""));
    return gates.get(pathText).promise;
  };

  const pending = plugin.collectReviewExcerpts(
    "06_Diary/2026/2026-05-04.md",
    {
      committed: { files: [{ kind: "modified", path: "01_Projects/A.md" }, { kind: "deleted", path: "01_Projects/Deleted.md" }] },
      working: { files: [{ kind: "modified", path: "01_Projects/B.md" }, { kind: "added", path: "01_Projects/C.md" }] }
    },
    { sanitizeReviewExcerptText: (text) => `clean:${text}` }
  );
  await flushMicrotasks();

  assert.equal(started.join("|"), "06_Diary/2026/2026-05-04.md|01_Projects/A.md|01_Projects/B.md|01_Projects/C.md");

  gates.get("01_Projects/C.md").resolve("C text");
  gates.get("01_Projects/A.md").resolve("A text");
  gates.get("06_Diary/2026/2026-05-04.md").resolve("Diary text");
  gates.get("01_Projects/B.md").resolve("B text");
  const result = await pending;

  assert.equal(result.map((item) => item.path).join("|"), "06_Diary/2026/2026-05-04.md|01_Projects/A.md|01_Projects/B.md|01_Projects/C.md");
  assert.equal(result.map((item) => item.text).join("|"), "clean:Diary text|clean:A text|clean:B text|clean:C text");
});

test("review prompt is a JSON evidence skill and review-note path instruction", () => {
  const review = loadReviewCenter();
  const prompt = review.buildClaudianReviewPrompt({
    date: "2026-05-01",
    mode: "daily",
    period: "2026-05-01",
    artifactPath: "06_Diary/2026/2026-05-01-review.md",
    evidenceFile: ".obsidian/plugins/noria/cache/stats/review/2026/2026-05-01.json",
    evidenceHash: "abc123",
    skillName: "noria-review"
  });

  assert.match(prompt, /^\$noria-review/m);
  assert.doesNotMatch(prompt, /^\/noria-review/m);
  assert.match(prompt, /2026-05-01/);
  assert.match(prompt, /mode:\s*daily/);
  assert.match(prompt, /period:\s*2026-05-01/);
  assert.match(prompt, /2026-05-01-review\.md/);
  assert.match(prompt, /evidence_file:\s*\.obsidian\/plugins\/noria\/cache\/stats\/review\/2026\/2026-05-01\.json/);
  assert.match(prompt, /生成复盘笔记/);
  assert.doesNotMatch(prompt, /abc123/);
  assert.doesNotMatch(prompt, /evidence_context/);
  assert.doesNotMatch(prompt, /读取证据上下文/);
  assert.doesNotMatch(prompt, /修复时间轴|习惯矩阵|statusSelector|noriaView/);
  assert.ok(prompt.length < 260, "review prompt should stay minimal and delegate rules to the skill");
});

test("noria-review skill carries multi-project evidence and low-burden review rules", () => {
  const codexSkill = fs.readFileSync(path.join(pluginRoot, "..", "..", "..", ".codex", "skills", "noria-review", "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const claudeSkill = fs.readFileSync(path.join(pluginRoot, "..", "..", "..", ".claude", "skills", "noria-review", "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const sourceMain = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8").replace(/\r\n/g, "\n");
  const embeddedExpression = sourceMain.match(/const NORIA_DEFAULT_REVIEW_SKILL = (\[[\s\S]*?\])\.join\("\\n"\);/)?.[1] || "";
  const embeddedSkill = embeddedExpression ? vm.runInNewContext(embeddedExpression).join("\n") : "";
  const skill = `${codexSkill}\n${claudeSkill}`;

  assert.equal(codexSkill, claudeSkill);
  assert.equal(`${embeddedSkill}\n`, codexSkill);
  assert.match(skill, /evidence_file/);
  assert.match(skill, /JSON/);
  assert.match(skill, /daily/);
  assert.match(skill, /weekly/);
  assert.match(skill, /monthly/);
  assert.match(skill, /yearly/);
  assert.match(skill, /metrics as evidence/i);
  assert.match(skill, /低负担|low-burden/i);
  assert.match(skill, /心流|flow/i);
  assert.match(skill, /掌控感|agency/i);
  assert.match(skill, /review_note/);
  assert.match(skill, /list_threads/);
  assert.match(skill, /read_thread/);
  assert.match(skill, /task_plan\.md/);
  assert.match(skill, /findings\.md/);
  assert.match(skill, /progress\.md/);
  assert.match(skill, /实际产物\/测试/);
  assert.match(skill, /对话不能单独证明完成/);
  assert.match(skill, /今日判断/);
  assert.match(skill, /项目复盘/);
  assert.match(skill, /明日聚焦/);
  assert.match(skill, /偏差与阻塞/);
  assert.match(skill, /证据索引/);
  assert.match(skill, /全局只保留一个.*主线/);
  assert.match(skill, /不要为每个项目分别生成下一步/);
  assert.match(skill, /MOC 反思（稀疏触发）/);
  assert.match(skill, /稳定主题\/owner 入口反复难找/);
  assert.match(skill, /证据不足则省略/);
  assert.match(skill, /不得生成 MOC 覆盖率、治理任务或待办队列/);
  assert.match(sourceMain, /MOC 反思（稀疏触发）/);
  assert.match(sourceMain, /不得生成 MOC 覆盖率、治理任务或待办队列/);
  assert.doesNotMatch(skill, /evidence_context/);
});

test("codex fallback prompt still asks for decision-focused summaries", () => {
  const review = loadReviewCenter();
  const prompt = review.buildDailyReviewPrompt({
    date: "2026-05-01",
    artifactPath: "06_Diary/2026/2026-05-01-review.md",
    evidenceHash: "abc123",
    evidenceMarkdown: "## 证据\n\n- done: 修复时间轴"
  });

  assert.match(prompt, /关键任务/);
  assert.match(prompt, /日常时间线任务/);
  assert.match(prompt, /知识库或项目材料变化/);
  assert.match(prompt, /今天真正推进了什么/);
  assert.match(prompt, /偏离了什么/);
  assert.match(prompt, /明天最小下一步/);
  assert.match(prompt, /#habit、喝水、锻炼/);
  assert.match(prompt, /证据复读机/);
  assert.match(prompt, /600[–-]900 字/);
  assert.match(prompt, /同一个统计数字全文最多出现一次/);
  assert.match(prompt, /整体上、总的来说、可以看出、值得注意的是/);
  assert.match(prompt, /项目复盘/);
  assert.match(prompt, /任务三件套/);
  assert.match(prompt, /每个项目不超过 150 字/);
  assert.match(prompt, /全局只保留一个/);
  assert.match(prompt, /不要为每个项目分别生成下一步/);
  assert.match(prompt, /明天最重要的一件事/);
  assert.match(prompt, /无明确阻塞/);
  assert.match(prompt, /不超过 5 行/);
  assert.match(prompt, /忽略.*\.codex.*\.obsidian/);
  assert.match(prompt, /渲染出来的仪表盘|习惯矩阵|状态控件/);
  assert.match(prompt, /不要把文件路径清单当作复盘正文/);
  assert.match(prompt, /AI 建议自然融合进最终总结正文/);
  assert.doesNotMatch(prompt, /3-5 条/);
});

test("daily context markdown suppresses dependency and toolchain noise but keeps human notes", () => {
  const review = loadReviewCenter();
  const context = review.buildDailyEvidenceMarkdown({
    date: "2026-05-01",
    diaryPath: "06_Diary/2026/2026-05-01.md",
    artifactPath: "06_Diary/2026/2026-05-01-review.md",
    evidenceHash: "abc123",
    evidence: {
      tasks: { done: 1, open: 1, total: 2, doneItems: ["修复时间轴待办自动更新"], openItems: ["WENO 方法植入"] },
      diaryWords: 131,
      git: {
        committed: { files: [] },
        working: {
          files: [
            { kind: "modified", path: "06_Diary/2026/2026-05-01.md" },
            { kind: "modified", path: "02_Areas/知识库管理/知识库治理.md" },
            { kind: "modified", path: ".codex/skills/noria-review/SKILL.md" },
            { kind: "modified", path: ".obsidian/plugins/noria/docs/USER-GUIDE.md" },
            { kind: "modified", path: ".codex/skills/zotero-pdf-attach-workflow/scripts/node_modules/smart-buffer/docs/ROADMAP.md" }
          ]
        },
        diff: { added: 5, deleted: 1, net: 4 }
      },
      excerpts: [
        { path: "06_Diary/2026/2026-05-01.md", text: "### 日态\n\nweather:: 晴" },
        { path: "02_Areas/知识库管理/知识库治理.md", text: "治理复盘" },
        { path: ".codex/skills/noria-review/SKILL.md", text: "# Noria Review" },
        { path: ".obsidian/plugins/noria/docs/USER-GUIDE.md", text: "plugin docs" },
        { path: ".codex/skills/zotero-pdf-attach-workflow/scripts/node_modules/smart-buffer/docs/ROADMAP.md", text: "smart-buffer dependency docs" }
      ]
    }
  });

  assert.match(context, /06_Diary\/2026\/2026-05-01\.md/);
  assert.match(context, /02_Areas\/知识库管理\/知识库治理\.md/);
  assert.match(context, /治理复盘/);
  assert.doesNotMatch(context, /\.codex\/skills\/noria-review\/SKILL\.md/);
  assert.doesNotMatch(context, /\.obsidian\/plugins\/noria\/docs\/USER-GUIDE\.md/);
  assert.doesNotMatch(context, /# Noria Review/);
  assert.doesNotMatch(context, /plugin docs/);
  assert.doesNotMatch(context, /node_modules\/smart-buffer/);
  assert.doesNotMatch(context, /smart-buffer dependency docs/);
});

test("daily review context strips dataview dashboard widgets from excerpts but keeps handwritten diary", () => {
  const review = loadReviewCenter();
  const context = review.buildDailyEvidenceMarkdown({
    date: "2026-05-04",
    diaryPath: "06_Diary/2026/2026-05-04.md",
    artifactPath: "06_Diary/2026/2026-05-04-review.md",
    evidenceHash: "abc123",
    evidence: {
      tasks: { done: 0, open: 0, total: 0 },
      diaryWords: 109,
      git: { committed: { files: [] }, working: { files: [] }, diff: { files: [] } },
      excerpts: [
        {
          path: "06_Diary/2026/2026-05-04.md",
          text: [
            "## 待办",
            "",
            "```dataviewjs",
            "await noriaView(dv, \"focusPanel\", {",
            "  sourcePath: \"02_Areas/知识库管理/清单-习惯打卡.md\"",
            "});",
            "```",
            "",
            "今天手写记录：整理了复盘中心生成链路。",
            "",
            "```dataviewjs",
            "await noriaView(dv, \"statusSelector\", {});",
            "```",
            "",
            "### GDD",
            "",
            "- 亮点：证据边界更清晰"
          ].join("\n")
        }
      ]
    }
  });

  assert.match(context, /今天手写记录：整理了复盘中心生成链路。/);
  assert.match(context, /亮点：证据边界更清晰/);
  assert.doesNotMatch(context, /```dataviewjs/);
  assert.doesNotMatch(context, /noriaView/);
  assert.doesNotMatch(context, /focusPanel/);
  assert.doesNotMatch(context, /statusSelector/);
  assert.doesNotMatch(context, /清单-习惯打卡/);
});

test("daily review context groups excerpts by source file and markdown block", () => {
  const review = loadReviewCenter();
  const context = review.buildDailyEvidenceMarkdown({
    date: "2026-05-06",
    diaryPath: "06_Diary/2026/2026-05-06.md",
    artifactPath: "06_Diary/2026/2026-05-06-review.md",
    evidenceHash: "abc123",
    evidence: {
      tasks: { done: 0, open: 0, total: 0 },
      diaryWords: 88,
      git: { committed: { files: [] }, working: { files: [] }, diff: { files: [] } },
      excerpts: [
        {
          path: "06_Diary/2026/2026-05-06.md",
          text: [
            "## 今日推进",
            "",
            "完成复盘中心证据分组。",
            "",
            "### GDD",
            "",
            "- 亮点：证据更可扫读",
            "- 阻塞：还缺周复盘聚合"
          ].join("\n")
        },
        {
          path: "02_Areas/知识库管理/知识库治理.md",
          text: "## Inbox\n\n治理队列仍需拆分。"
        }
      ]
    }
  });

  assert.match(context, /### 06_Diary\/2026\/2026-05-06\.md/);
  assert.match(context, /#### 今日推进/);
  assert.match(context, /完成复盘中心证据分组。/);
  assert.match(context, /#### GDD/);
  assert.match(context, /亮点：证据更可扫读/);
  assert.match(context, /### 02_Areas\/知识库管理\/知识库治理\.md/);
  assert.match(context, /#### Inbox/);
  assert.match(context, /治理队列仍需拆分。/);
  assert.equal(review.countReviewExcerptBlocks([
    { path: "06_Diary/2026/2026-05-06.md", text: "## A\n\none\n\n## B\n\ntwo" }
  ]), 2);
  const blockPositions = review.splitReviewExcerptBlocks({
    path: "06_Diary/2026/2026-05-06.md",
    text: "intro\n\n## A\n\none\n\n## B\n\ntwo"
  }).map((block) => ({ heading: block.heading, line: block.line }));
  assert.deepEqual(JSON.parse(JSON.stringify(blockPositions)), [
    { heading: "2026-05-06", line: 1 },
    { heading: "A", line: 3 },
    { heading: "B", line: 7 }
  ]);
});

test("git status parser separates added modified deleted and approximate mtime files", () => {
  const review = loadReviewCenter();
  const parsed = review.parsePorcelainStatus(" M a.md\nA  b.md\n D c.md\n?? d.md\nR  old.md -> new.md\n");

  assert.deepEqual(JSON.parse(JSON.stringify(parsed.map((x) => [x.kind, x.path]))), [
    ["modified", "a.md"],
    ["added", "b.md"],
    ["deleted", "c.md"],
    ["added", "d.md"],
    ["renamed", "new.md"]
  ]);
});

test("git commit parser keeps changelog metadata only for human note changes", () => {
  const review = loadReviewCenter();
  const raw = [
    "@@COMMIT@@abc123456789\t2026-05-04T09:15:00+08:00\t[note] update daily review evidence",
    "A\t06_Diary/2026/2026-05-04.md",
    "M\t02_Areas/知识库管理/知识库治理.md",
    "M\t.obsidian/plugins/noria/main.js",
    "@@COMMIT@@def987654321\t2026-05-04T11:20:00+08:00\t[refactor] plugin internals",
    "M\t.obsidian/plugins/noria/styles.css",
    "@@COMMIT@@fed111122222\t2026-05-04T13:05:00+08:00\t[organize] rename weekly note",
    "R100\t06_Diary/2026/old.md\t06_Diary/2026/2026-W19.md"
  ].join("\n");

  const commits = review.parseCommitLog(raw, (p) => /\.md$/i.test(p) && !review.isReviewNoisePath(p));

  assert.deepEqual(JSON.parse(JSON.stringify(commits.map((x) => [x.shortHash, x.time, x.message, x.fileCount]))), [
    ["abc1234", "09:15", "[note] update daily review evidence", 2],
    ["fed1111", "13:05", "[organize] rename weekly note", 1]
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(commits[0].counts)), { added: 1, modified: 1, deleted: 0, renamed: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(commits[1].files.map((x) => [x.kind, x.path]))), [["renamed", "06_Diary/2026/2026-W19.md"]]);
});

test("review notes are excluded from evidence file records", () => {
  const review = loadReviewCenter();
  const records = review.filterReviewRecords([
    { kind: "modified", path: "06_Diary/2026/2026-05-01.md" },
    { kind: "modified", path: "06_Diary/2026/2026-05-01-review.md" },
    { kind: "modified", path: "Noria/Diary/2026/2026-05-01-review.md" },
    { kind: "modified", path: ".codex/skills/foo/SKILL.md" },
    { kind: "modified", path: ".obsidian/plugins/noria/docs/USER-GUIDE.md" },
    { kind: "modified", path: "99_Attachment/image-note.md" },
    { kind: "modified", path: "01_Projects/A.md" }
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(records.map((x) => x.path))), [
    "06_Diary/2026/2026-05-01.md",
    "01_Projects/A.md"
  ]);
});

test("task timeline no longer contains the old recap toolbar entry", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const runtime = fs.readFileSync(pluginPath("views/tasks-timeline/view.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const combined = `${main}\n${runtime}\n${styles}`;

  assert.doesNotMatch(combined, /noria-tl-toolbar-link--diary-recap/);
  assert.doesNotMatch(combined, /打开日态 \/ GDD \/ 感想/);
  assert.doesNotMatch(combined, /renderTimelineReviewPanel/);
  assert.doesNotMatch(combined, /noriaTlOpenDiaryRecapPopover/);
  assert.doesNotMatch(combined, /recap-popover/);
});

test("daily review final archive omits duplicated daily state controls", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.doesNotMatch(main, /choose\("focus",\s*\["1",\s*"2",\s*"3",\s*"4",\s*"5"\]\)/);
  assert.doesNotMatch(main, /choose\("energy",\s*\["1",\s*"2",\s*"3",\s*"4",\s*"5"\]\)/);
  assert.doesNotMatch(main, /noria-review-state-strip/);
  assert.doesNotMatch(main, /noria-review-state-card--weather/);
  assert.doesNotMatch(main, /noria-review-state-card--mood/);
  assert.doesNotMatch(main, /state:\s*state/);
});

test("daily review final archive keeps the low-noise actionbar without state strip layout", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /noria-review-actionbar/);
  assert.match(main, /noria-review-actionbar-primary/);
  assert.match(main, /noria-review-final-primary/);
  assert.match(main, /noria-review-write-target/);
  assert.match(main, /data-noria-review-write-target/);
  assert.match(main, /openReviewSourceFile\(targetPath/);
  assert.match(main, /model\.diaryPath/);
  assert.match(main, /model\.periodNotePath/);
  assert.match(main, /noria-review-status-pill/);
  assert.match(styles, /width:\s*min\(1280px,\s*100%\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(260px,\s*\.72fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(400px,\s*\.86fr\)/);
  assert.match(styles, /\.noria-review-workbench\s*\{[\s\S]*align-items:\s*stretch/);
  assert.match(styles, /\.noria-review-workbench-main\s*\{[\s\S]*height:\s*100%/);
  assert.match(styles, /\.noria-review-section--evidence\s*\{[\s\S]*flex:\s*1/);
  assert.match(styles, /\.noria-review-write-target\s*\{[\s\S]*box-shadow:\s*none/);
  assert.doesNotMatch(main, /noria-review-state-strip/);
});

test("embedded daily review final actionbar does not crush writeback copy into vertical text", () => {
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar-copy\s*\{[\s\S]*display:\s*grid/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar-title,\s*\n\.noria-review-workbench-final\s+\.noria-review-actionbar-copy\s+\.noria-review-save-status\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-write-target\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar-buttons\s*\{[\s\S]*justify-content:\s*flex-start/);
});

test("daily review final archive separates draft adoption from save state", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /"review\.final\.adoptionTitle"/);
  assert.match(main, /"review\.final\.useDraftFields"/);
  assert.match(main, /"review\.final\.dirty"/);
  assert.match(main, /"review\.final\.adopted"/);
  assert.match(main, /noria-review-adoption/);
  assert.match(main, /data-noria-review-adoption-ready/);
  assert.match(main, /data-noria-review-draft-part/);
  assert.match(main, /data-noria-review-save-state/);
  assert.match(main, /data-noria-review-final-state/);
  assert.match(main, /const setSaveState = \(state,\s*text\) =>/);
  assert.match(main, /const markDirty = \(\) => setSaveState\("dirty"/);
  assert.match(main, /const markAdopted = \(\) => setSaveState\("adopted"/);
  assert.match(main, /\[summary,\s*gddHi,\s*gddDev,\s*gddBlk,\s*gratitude,\s*thought\]\.forEach/);
  assert.match(main, /field\.addEventListener\("input",\s*markDirty\)/);
  assert.match(main, /summary\.value = draftSummary/);
  assert.match(main, /gddHi\.value = draftGdd\.hi \|\| ""/);
  assert.match(main, /const allDraftBtn = this\.createAction\(adoptionActions,\s*this\.plugin\.t\("review\.final\.useDraftFields"\)/);
  assert.match(styles, /\.noria-review-adoption\s*\{/);
  assert.match(styles, /\.noria-review-adoption-chip\[data-noria-review-draft-ready="false"\]\s*\{/);
  assert.match(styles, /\.noria-review-adoption\s+\.noria-review-btn\[data-noria-action-rank="secondary"\]\s*\{[\s\S]*border-color:\s*transparent/);
  assert.match(styles, /\.noria-review-save-status\.is-dirty\b/);
  assert.match(styles, /\.noria-review-save-status\.is-adopted\b/);
});

test("daily review final archive previews draft-to-final differences without promoting the draft", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /getReviewDraftDiffRows\(model,\s*draftSummary,\s*draftGdd\)/);
  assert.match(main, /renderReviewDraftDiffPreview\(adoption,\s*diffRows\)/);
  assert.match(main, /data-noria-review-diff-preview/);
  assert.match(main, /data-noria-review-diff-field/);
  assert.match(main, /data-noria-review-diff-state/);
  assert.match(main, /review\.final\.diffTitle/);
  assert.match(main, /review\.final\.diffChanged/);
  assert.match(main, /review\.final\.diffFill/);
  assert.match(main, /review\.final\.diffSame/);
  assert.match(main, /review\.final\.diffNoDraft/);
  assert.match(styles, /\.noria-review-diff-preview\s*\{/);
  assert.match(styles, /\.noria-review-diff-row\s*\{/);
  assert.match(styles, /\.noria-review-diff-row\[data-noria-review-diff-state="replace"\]\s+\.noria-review-diff-state\s*\{/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-diff-preview\s*\{/);
});

test("daily review workbench exposes evidence draft final stages and quiet secondary actions", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  const dailyStart = main.indexOf("renderDaily(body, model)");
  const evidenceCall = main.indexOf("renderEvidenceSection(evidenceCol, model)", dailyStart);
  const draftCall = main.indexOf("renderLlmSection(draftCol, model)", dailyStart);
  const finalCall = main.indexOf("renderFinalSection(finalCol, model)", dailyStart);

  assert.ok(dailyStart > 0, "renderDaily should exist");
  assert.ok(evidenceCall > dailyStart, "evidence stage should be rendered explicitly");
  assert.ok(draftCall > evidenceCall, "draft stage should come after evidence");
  assert.ok(finalCall > draftCall, "final stage should come after draft setup");
  assert.match(main, /noria-review-workbench--daily/);
  assert.match(main, /data-noria-review-workbench",\s*"daily"/);
  assert.match(main, /noria-review-workbench-evidence/);
  assert.match(main, /noria-review-workbench-draft/);
  assert.match(main, /noria-review-workbench-final/);
  assert.match(main, /data-noria-review-stage",\s*"evidence"/);
  assert.match(main, /data-noria-review-stage",\s*"draft"/);
  assert.match(main, /data-noria-review-stage",\s*"final"/);
  assert.match(main, /data-noria-review-stage",\s*"writeback"/);
  assert.match(main, /renderEvidenceExcerptGroups\(lists,\s*excerptGroups\)/);
  assert.match(main, /noria-review-excerpt-groups/);
  assert.match(main, /data-noria-review-excerpt-heading/);
  assert.match(main, /review\.excerpts\.title/);
  assert.match(main, /data-noria-action-rank/);
  assert.match(styles, /grid-template-columns:\s*minmax\(260px,\s*\.72fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(400px,\s*\.86fr\)/);
  assert.match(styles, /\.noria-review-workbench-evidence\b/);
  assert.match(styles, /\.noria-review-workbench-draft\b/);
  assert.match(styles, /\.noria-review-workbench-final\b/);
  assert.match(styles, /\.noria-review-excerpt-list\b/);
  assert.match(styles, /\.noria-review-excerpt-block\b/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-excerpt-list\s*\{[\s\S]*background:\s*transparent/);
  assert.match(styles, /\.noria-review-btn\[data-noria-action-rank="secondary"\]\s*\{[\s\S]*box-shadow:\s*none/);
});

test("daily review shell removes the standalone title and keeps controls in the shared first row", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.doesNotMatch(main, /noria-review-host--standalone/);
  assert.match(main, /noria-review-shell-header/);
  assert.match(main, /noria-review-shell-controls/);
  assert.match(main, /renderReviewShellHeader\(root\)/);
  assert.doesNotMatch(main, /noria-review-kicker/);
  assert.doesNotMatch(main, /text:\s*"Noria"/);
  assert.doesNotMatch(styles, /\.noria-review-kicker\b/);
  assert.doesNotMatch(main, /noria-review-date-context/);
  assert.doesNotMatch(styles, /\.noria-review-date-context\b/);
  assert.doesNotMatch(main, /noria-review-title-wrap/);
  assert.doesNotMatch(main, /noria-review-title",\s*text:\s*this\.plugin\.t\("review\.title"\)/);
  assert.match(main, /review\.home\.diary",\s*\{ date:\s*this\.selection\.anchorDate \}/);
  assert.match(styles, /\.noria-review-shell-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(220px,\s*1fr\)\s+auto/);
  assert.match(main, /"review\.period\.shortDaily":\s*"Day"/);
  assert.match(main, /"review\.period\.shortDaily":\s*(?:"日"|"\\u65E5")/);
  assert.match(main, /review\.period\.shortWeekly/);
  assert.match(main, /dashboard-heatmap-mode-button/);
  const controls = styles.match(/\.noria-review-controls\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(controls, "review controls style should exist");
  assert.doesNotMatch(controls, /border:\s*1px/);
  assert.match(controls, /box-shadow:\s*none\s*!important/);
  const periods = styles.match(/\.noria-review-periods\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(periods, "review period group style should exist");
  assert.match(periods, /background:\s*transparent\s*!important/);
  assert.match(periods, /border:\s*0\s*!important/);
  assert.match(periods, /box-shadow:\s*none\s*!important/);
  const periodButton = styles.match(/\.noria-review-period\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(periodButton, "review period button style should exist");
  assert.match(periodButton, /border:\s*0\s*!important/);
  assert.match(periodButton, /border-color:\s*transparent\s*!important/);
  assert.match(periodButton, /background:\s*transparent\s*!important/);
  assert.match(periodButton, /background-image:\s*none\s*!important/);
  assert.match(periodButton, /box-shadow:\s*none\s*!important/);
  assert.match(periodButton, /height:\s*var\(--noria-panel-segment-height,\s*28px\)/);
  assert.match(periodButton, /font-size:\s*var\(--noria-panel-segment-font-size,\s*13px\)/);
  assert.match(periodButton, /font-weight:\s*(?:var\(--noria-panel-segment-weight,\s*)?650/);
  const periodActiveButton = styles.match(/\.noria-review-period\.is-active\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(periodActiveButton, "review active period button style should exist");
  assert.match(periodActiveButton, /font-weight:\s*(?:var\(--noria-panel-segment-active-weight,\s*)?720/);
  assert.match(main, /this\.paintIcon\(refreshBtn,\s*"refresh-cw"/);
});

test("daily review AI analysis actions are explicit and low-noise", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.match(main, /"review\.llm\.generate":\s*(?:"生成AI分析"|"\\u751F\\u6210AI\\u5206\\u6790")/);
  assert.match(main, /"review\.llm\.refreshArtifact":\s*(?:"刷新AI分析"|"\\u5237\\u65B0AI\\u5206\\u6790")/);
  assert.match(main, /"review\.llm\.openArtifact":\s*(?:"打开复盘笔记"|"\\u6253\\u5F00\\u590D\\u76D8\\u7B14\\u8BB0")/);
  assert.doesNotMatch(main, /生成 \/ 刷新 LLM 分析/);
  assert.doesNotMatch(main, /创建 \/ 打开复盘笔记/);
  assert.doesNotMatch(main, /section\.createDiv\(\{\s*cls:\s*"noria-review-artifact-path"/);
  assert.doesNotMatch(main, /section\.createDiv\(\{\s*cls:\s*"noria-review-empty",\s*text:\s*this\.plugin\.t\("review\.llm\.empty"\)/);
  assert.match(main, /this\.createAction\(actions,\s*this\.plugin\.t\("review\.llm\.generate"\)/);
  assert.match(main, /this\.createAction\(actions,\s*this\.plugin\.t\("review\.llm\.refreshArtifact"\)/);
  assert.match(main, /renderReviewDraftSectionIndex\(section,\s*model\)/);
  assert.match(main, /getReviewDraftSections\(model\)/);
  assert.match(main, /data-noria-review-draft-section/);
  assert.match(main, /review\.llm\.copySection/);
  assert.match(main, /copyReviewText\(section\.text\)/);
});

test("home review focus AI rail uses a compact assistant toolbox", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /noria-review-assistant-panel/);
  assert.match(main, /data-noria-review-has-artifact/);
  assert.match(main, /noria-review-llm-primary/);
  assert.match(main, /noria-review-llm-secondary/);
  assert.match(main, /noria-review-draft-index/);
  assert.match(styles, /\.noria-review-assistant-panel\s*\{[\s\S]*display:\s*contents/);
  assert.match(styles, /\.noria-review-draft-index\s*\{[\s\S]*background:/);
  assert.match(styles, /\.noria-review-draft-index-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(54px,\s*\.22fr\)\s+minmax\(0,\s*1fr\)\s+auto/);
  assert.match(styles, /\.noria-review-draft-copy\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-workbench-draft\s+\.noria-review-assistant-panel\s*\{[\s\S]*display:\s*grid/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-workbench-draft\s+\.noria-review-llm-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-workbench-draft\s+\.noria-review-llm-primary\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-workbench-draft\s+\.noria-review-section--llm\[data-noria-review-has-artifact="false"\]\s*\{[\s\S]*min-height:\s*0/);
});

test("home review focus exposes stage-level empty states for evidence draft and final target", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /renderReviewStageEmpty\(parent,\s*stage,\s*titleKey,\s*bodyKey/);
  assert.match(main, /data-noria-review-stage-empty/);
  assert.match(main, /data-noria-review-evidence-empty/);
  assert.match(main, /review\.evidence\.emptyTitle/);
  assert.match(main, /review\.evidence\.emptyBody/);
  assert.match(main, /data-noria-review-draft-empty/);
  assert.match(main, /review\.llm\.emptyTitle/);
  assert.match(main, /review\.llm\.emptyBody/);
  assert.match(main, /data-noria-review-final-target-ready/);
  assert.match(main, /review\.final\.missingTargetTitle/);
  assert.match(main, /review\.final\.missingTargetBody/);
  assert.match(styles, /\.noria-review-stage-empty\s*\{/);
  assert.match(styles, /\.noria-review-stage-empty-title\s*\{/);
  assert.match(styles, /\.noria-review-stage-empty-body\s*\{/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-stage-empty\s*\{/);
  assert.match(styles, /\.noria-review-section\[data-noria-review-evidence-empty="true"\]\s+\.noria-review-evidence-summary\s*\{/);
});

test("daily review settings expose prompt defaults without internal AI settings", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.match(main, /reviewCenter:\s*\{\s*prompt:\s*JSON\.parse\(JSON\.stringify\(NORIA_DEFAULT_REVIEW_PROMPT_SETTINGS\)\)/);
  assert.match(main, /"settings\.sections\.reviewPrompt"/);
  assert.match(main, /"settings\.review\.promptSkillName"/);
  assert.match(main, /"settings\.review\.promptNotePath"/);
  assert.match(main, /"settings\.review\.promptTemplate"/);
  assert.match(main, /"settings\.review\.defaultSkill"/);
  assert.doesNotMatch(main, /NORIA_DEFAULT_AI_SETTINGS/);
  assert.doesNotMatch(main, /"settings\.tabs\.ai"/);
  assert.doesNotMatch(main, /"settings\.ai\./);
  assert.doesNotMatch(main, /reviewGeneration:\s*\{\s*\.\.\.NORIA_DEFAULT_REVIEW_GENERATION\s*\}/);
  assert.doesNotMatch(main, /"settings\.review\.aiProvider"/);
});

test("daily review evidence keeps file changes in always-visible grouped lists", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.doesNotMatch(main, /createEl\("details",\s*\{\s*cls:\s*"noria-review-evidence-details"/s);
  assert.doesNotMatch(main, /createEl\("summary",\s*\{\s*cls:\s*"noria-review-list-title"/s);
  assert.match(main, /renderEvidenceFileGroups\(lists,\s*allFiles,\s*(?:git|\{\s*\.\.\.git,\s*commits\s*\})\)/);
  assert.match(main, /renderEvidenceSummary\(section,\s*\[/);
  assert.match(main, /noria-review-evidence-summary/);
  assert.match(main, /data-noria-review-summary-kind/);
  assert.match(main, /data-noria-review-summary-empty/);
  assert.match(main, /review\.files\.fileChangesTitle/);
  assert.match(main, /review\.files\.changelogTitle/);
  assert.match(main, /noria-review-file-groups/);
  assert.match(main, /noria-review-file-group--added/);
  assert.match(main, /noria-review-file-group--modified/);
  assert.match(main, /noria-review-file-scope/);
  assert.match(main, /renderEvidenceChangelog\(files,\s*git\.commits \|\| \[\]\)/);
  assert.match(main, /if \(!commits\.length\) return;/);
  assert.match(main, /noria-review-commit-log/);
  assert.match(main, /noria-review-commit-hash/);
  assert.match(main, /noria-review-commit-message/);
  assert.match(styles, /\.noria-review-file-groups\b/);
  assert.match(styles, /\.noria-review-evidence-summary\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.noria-review-evidence-summary-value\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums/);
  assert.match(styles, /\.noria-review-evidence-summary-chip\[data-noria-review-summary-empty="true"\]\s*\{[\s\S]*opacity:\s*0\.72/);
  assert.match(styles, /@media \(max-width:\s*820px\)[\s\S]*\.noria-review-evidence-summary\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.noria-review-commit-log\b/);
  const commitMessageRule = styles.match(/\.noria-review-commit-message\s*\{([\s\S]*?)\}/);
  assert.ok(commitMessageRule, "expected commit message CSS rule");
  assert.match(commitMessageRule[1], /white-space:\s*normal/);
  assert.match(commitMessageRule[1], /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(commitMessageRule[1], /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(commitMessageRule[1], /white-space:\s*nowrap/);
  assert.match(styles, /\.noria-review-evidence-lists\s*\{[\s\S]*flex:\s*1/);
  assert.match(styles, /\.noria-review-evidence-lists\s*\{[\s\S]*overflow:\s*auto/);
  assert.match(styles, /\.noria-review-file-groups\s*\{[\s\S]*max-height:\s*none/);
  assert.match(styles, /@media \(max-width:\s*1180px\)[\s\S]*\.noria-review-workbench-evidence\s+\.noria-review-section--evidence\s*\{[\s\S]*max-height:\s*min\(46vh,\s*520px\)/);
  assert.match(styles, /@media \(max-width:\s*1180px\)[\s\S]*\.noria-review-workbench-evidence\s+\.noria-review-evidence-lists\s*\{[\s\S]*max-height:\s*min\(30vh,\s*360px\)/);
});

test("home review focus evidence rail uses progressive disclosure", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /isHomeFocusMode\(\)/);
  assert.match(main, /createEl\("details",\s*\{\s*cls:\s*"noria-review-file-list noria-review-file-groups noria-review-evidence-disclosure"/);
  assert.match(main, /noria-review-evidence-disclosure-summary/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-evidence-lists\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-evidence-summary\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-file-groups\s*\{[\s\S]*max-height:\s*min\(46vh,\s*420px\)/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-evidence-disclosure:not\(\[open\]\)\s*\{[\s\S]*max-height:\s*none/);
});

test("home review focus responds to its root widget width instead of the app viewport only", () => {
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(styles, /@container noria-home-widget \(max-width:\s*1180px\)[\s\S]*\.noria-review-host--home-focus\s+\.noria-review-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /@container noria-home-widget \(max-width:\s*820px\)[\s\S]*\.noria-review-host--home-focus\s+\.noria-review-actionbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /@container noria-home-widget \(max-width:\s*760px\)[\s\S]*\.noria-review-host--home-focus\s+\.noria-review-workbench-final\s+\.noria-review-gdd-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("home review focus renders period source map as compact evidence chain", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(main, /renderEvidenceSourceMap\(section,\s*model\)/);
  assert.match(main, /getReviewEvidenceSourceMap\(model\)/);
  assert.match(main, /data-noria-review-source-map/);
  assert.match(main, /data-noria-review-source-map-day-count/);
  assert.match(main, /data-noria-review-source-map-missing-count/);
  assert.match(main, /data-noria-review-source-map-task-source-count/);
  assert.match(main, /data-noria-review-source-kind",\s*"daily-note"/);
  assert.match(main, /data-noria-review-source-kind",\s*"task-source-note"/);
  assert.match(main, /data-noria-review-source-date/);
  assert.match(main, /bindReviewSourceRow\(row,\s*path/);
  assert.match(main, /review\.sourceMap\.title/);
  assert.match(styles, /\.noria-review-source-map\s*\{/);
  assert.match(styles, /\.noria-review-source-map-chip\s*\{/);
  assert.match(styles, /\.noria-review-source-map-row\[data-noria-review-source-exists="false"\]\s*\{/);
  assert.match(styles, /\.noria-review-host--home-focus\s+\.noria-review-source-map\s*\{/);
});

test("daily review evidence rows expose quiet source navigation", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const collectTasksBody = main.match(/async collectDailyTasks\(date,\s*diaryPath\)\s*\{([\s\S]*?)\n\s*return out;\n\s*\}/);

  assert.ok(collectTasksBody, "expected collectDailyTasks body");
  assert.match(collectTasksBody[1], /lineNumber\s*=\s*lineIndex\s*\+\s*1/);
  assert.match(collectTasksBody[1], /out\.doneItems\.push\(\{\s*label,\s*path:\s*file\.path,\s*line:\s*lineNumber\s*\}\)/);
  assert.match(collectTasksBody[1], /out\.openItems\.push\(\{\s*label,\s*path:\s*file\.path,\s*line:\s*lineNumber\s*\}\)/);
  assert.match(main, /async openReviewSourceFile\(pathText,\s*options = \{\}\)/);
  assert.match(main, /openCalendarNoteFile\(path,\s*\{\s*newLeaf:\s*options\.newLeaf !== false/);
  assert.match(main, /focusEditorLine\(leaf,\s*line\)/);
  assert.match(main, /editor\.setCursor\(\{\s*line:\s*targetLine,\s*ch:\s*0\s*\}\)/);
  assert.match(main, /editor\.scrollIntoView\(\{\s*from:\s*\{\s*line:\s*targetLine,\s*ch:\s*0\s*\}/);
  assert.match(main, /renderTaskList\(parent,\s*title,\s*items\)/);
  assert.match(main, /noria-review-task-row/);
  assert.match(main, /data-noria-review-source-path/);
  assert.match(main, /data-noria-review-source-line/);
  assert.match(main, /openReviewSourceFile\(sourcePath/);
  assert.match(main, /noria-review-source-action/);
  assert.match(main, /paintIcon\(action,\s*"external-link"/);
  assert.match(styles, /\.noria-review-task-row\.is-openable:hover\s*\{/);
  assert.match(styles, /\.noria-review-source-action\s*\{[\s\S]*box-shadow:\s*none/);
});

test("review evidence source navigation exposes same-control action state", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const fileRowOpenBlock = main.match(/if \(canOpen\) \{\s*([\s\S]*?)\s*const action = row\.createEl\("button"/);

  assert.match(main, /setReviewActionState\(target,\s*state = "idle",\s*error = ""\)/);
  assert.match(main, /runReviewSourceAction\(target,\s*sourcePath,\s*options = \{\}\)/);
  assert.match(main, /target\.setAttribute\("data-noria-action-state",\s*nextState\)/);
  assert.match(main, /target\.setAttribute\("data-noria-action-error",\s*message\)/);
  assert.match(main, /target\.removeAttribute\("data-noria-action-error"\)/);
  assert.match(main, /row\.setAttribute\("data-noria-action-source",\s*"review-source-row"\)/);
  assert.match(main, /row\.setAttribute\("data-noria-action-kind",\s*"open-review-source"\)/);
  assert.match(main, /row\.setAttribute\("data-noria-action-target-path",\s*sourcePath\)/);
  assert.match(main, /this\.runReviewSourceAction\(row,\s*sourcePath,\s*\{ line \}\)/);
  assert.match(main, /action\.setAttribute\("data-noria-action-source",\s*"review-file-source"\)/);
  assert.match(main, /action\.setAttribute\("data-noria-action-kind",\s*"open-review-source"\)/);
  assert.match(main, /this\.runReviewSourceAction\(action,\s*sourcePath\)/);
  assert.ok(fileRowOpenBlock, "expected review file rows to bind row-level source opening before the icon action");
  assert.match(fileRowOpenBlock[1], /row\.setAttribute\("role",\s*"button"\)/);
  assert.match(fileRowOpenBlock[1], /row\.setAttribute\("tabindex",\s*"0"\)/);
  assert.match(fileRowOpenBlock[1], /row\.setAttribute\("data-noria-action-source",\s*"review-file-row"\)/);
  assert.match(fileRowOpenBlock[1], /row\.setAttribute\("data-noria-action-kind",\s*"open-review-source"\)/);
  assert.match(fileRowOpenBlock[1], /row\.setAttribute\("data-noria-action-target-path",\s*sourcePath\)/);
  assert.match(fileRowOpenBlock[1], /this\.setReviewActionState\(row,\s*"idle"\)/);
  assert.match(fileRowOpenBlock[1], /row\.addEventListener\("click",\s*async \(ev\) => \{[\s\S]*?this\.runReviewSourceAction\(row,\s*sourcePath\)/);
  assert.match(fileRowOpenBlock[1], /row\.addEventListener\("keydown",\s*\(ev\) => \{[\s\S]*?ev\.key !== "Enter" && ev\.key !== " "/);
  assert.match(styles, /\.noria-review-source-map-row\.is-openable\[data-noria-action-state="pending"\]/);
  assert.match(styles, /\.noria-review-task-row\.is-openable\[data-noria-action-state="failed"\]/);
  assert.match(styles, /\.noria-review-excerpt-block\.is-openable\[data-noria-action-state="failed"\]/);
  assert.match(styles, /\.noria-review-file-row\.is-openable\[data-noria-action-state="pending"\]/);
  assert.match(styles, /\.noria-review-file-row\.is-openable\[data-noria-action-state="failed"\]/);
  assert.match(styles, /\.noria-review-source-action\[data-noria-action-state="pending"\]/);
  assert.match(styles, /\.noria-review-source-action\[data-noria-action-state="failed"\]/);
});

test("daily review context markdown includes filtered commit messages for LLM evidence", () => {
  const review = loadReviewCenter();
  const md = review.buildDailyEvidenceMarkdown({
    date: "2026-05-04",
    diaryPath: "06_Diary/2026/2026-05-04.md",
    artifactPath: "06_Diary/2026/2026-05-04-review.md",
    evidenceHash: "abc",
    evidence: {
      tasks: {},
      diaryWords: 109,
      git: {
        commits: [
          {
            shortHash: "abc1234",
            time: "09:15",
            message: "[note] update daily review evidence",
            fileCount: 2,
            counts: { added: 1, modified: 1, deleted: 0, renamed: 0 },
            files: [
              { kind: "added", path: "06_Diary/2026/2026-05-04.md" },
              { kind: "modified", path: ".obsidian/plugins/noria/main.js" }
            ]
          }
        ],
        committed: { files: [] },
        working: { files: [] },
        diff: { files: [] }
      },
      excerpts: []
    }
  });

  assert.match(md, /## 今日提交/);
  assert.match(md, /\[note\] update daily review evidence/);
  assert.match(md, /abc1234/);
  assert.doesNotMatch(md, /\.obsidian/);
});

test("daily review context markdown renders structured task evidence without object noise", () => {
  const review = loadReviewCenter();
  const md = review.buildDailyEvidenceMarkdown({
    date: "2026-05-04",
    diaryPath: "06_Diary/2026/2026-05-04.md",
    artifactPath: "06_Diary/2026/2026-05-04-review.md",
    evidenceHash: "abc",
    evidence: {
      tasks: {
        done: 1,
        open: 1,
        total: 2,
        doneItems: [{ label: "修复复盘中心来源跳转", path: "06_Diary/2026/2026-05-04.md", line: 23 }],
        openItems: [{ text: "继续优化时间轴密度", source: { path: "01_Projects/Noria.md", line: 7 } }]
      },
      diaryWords: 109,
      git: { committed: { files: [] }, working: { files: [] }, diff: { files: [] } },
      excerpts: []
    }
  });

  assert.match(md, /- 修复复盘中心来源跳转（06_Diary\/2026\/2026-05-04\.md:23）/);
  assert.match(md, /- 继续优化时间轴密度（01_Projects\/Noria\.md:7）/);
  assert.doesNotMatch(md, /\[object Object\]/);
});

test("daily review generation writes JSON evidence and removes internal AI adapters", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const generateBody = main.match(/async generateReview\(modeInput\s*=\s*"daily",\s*dateInput,\s*variantInput\s*=\s*""\)\s*\{([\s\S]*?)\n\s*\}/);

  assert.ok(generateBody, "expected generateDailyReview body");
  assert.match(generateBody[1], /writeReviewEvidenceFile\(model,\s*review\d*\)/);
  assert.match(generateBody[1], /buildExternalDailyReviewPrompt\(model,\s*evidence\.path,\s*review\d*\)/);
  assert.match(generateBody[1], /copyReviewPromptFallback\(prompt\)/);
  assert.doesNotMatch(generateBody[1], /ensureDailyReviewNoteExists/);
  assert.doesNotMatch(main, /async generateDailyReviewWithApi/);
  assert.doesNotMatch(main, /async generateDailyReviewWithClaudianSkill/);
  assert.doesNotMatch(main, /async sendDailyReviewPromptToClaudian/);
  assert.doesNotMatch(main, /async generateDailyReviewWithCodexCli/);
  assert.doesNotMatch(main, /async requestAiReviewMarkdown/);
  assert.doesNotMatch(main, /async runCodexCliReviewPrompt/);
  assert.doesNotMatch(main, /resolveClaudianCodexTab/);
  assert.doesNotMatch(main, /obsidian\.requestUrl/);
  assert.match(main, /\.codex\/skills\/noria-review\/SKILL\.md/);
  assert.match(main, /\.claude\/skills\/noria-review\/SKILL\.md/);
  assert.doesNotMatch(main, /buildDailyContextMarkdown/);
  assert.doesNotMatch(main, /evidence_context/);
});

test("daily review generation copies a JSON evidence prompt and writes evidence without creating review note", async () => {
  const calls = [];
  const clipboardWrites = [];
  const plugin = makeAiPlugin({
    clipboardWrites,
    requestUrl: async (request) => {
      calls.push(request);
      throw new Error("AI API should not be called");
    }
  });

  const result = await plugin.generateDailyReview("2026-05-05");

  assert.equal(result.ok, true);
  assert.equal(result.mode, "copy-prompt");
  assert.equal(calls.length, 0);
  assert.equal(clipboardWrites.length, 1);
  assert.match(clipboardWrites[0], /noria-review/);
  assert.match(clipboardWrites[0], /review_note: Noria\/Diary\/2026\/2026-05-05-review\.md/);
  assert.match(clipboardWrites[0], /evidence_file: \.obsidian\/plugins\/noria\/cache\/stats\/review\/2026\/2026-05-05\.json/);
  assert.doesNotMatch(clipboardWrites[0], /evidence_context/);
  assert.doesNotMatch(clipboardWrites[0], /evidence_hash/);
  assert.doesNotMatch(clipboardWrites[0], /\.obsidian\/plugins\/noria\/cache\/review-context\/2026-05-05\.md/);
  assert.doesNotMatch(clipboardWrites[0], /hash123/);
  assert.equal(plugin.__writes.length, 1);
  assert.equal(plugin.__writes[0].path, ".obsidian/plugins/noria/cache/stats/review/2026/2026-05-05.json");
  const payload = JSON.parse(plugin.__writes[0].text);
  assert.equal(payload.exportKind, "noria.reviewEvidence");
  assert.equal(payload.payload.mode, "daily");
  assert.equal(payload.payload.period, "2026-05-05");
  assert.equal(payload.payload.evidenceHash, "hash123");
});

test("open daily review note only opens existing artifacts", async () => {
  const notices = [];
  const plugin = makeAiPlugin({
    notices,
    artifactExists: false
  });

  const missing = await plugin.openDailyReviewNote("2026-05-05");
  assert.equal(missing.ok, false);
  assert.equal(plugin.__opened.length, 0);
  assert.equal(plugin.__writes.length, 0);
  assert.ok(notices.some((msg) => /复盘|review/i.test(msg)));

  const existing = makeAiPlugin({ artifactExists: true });
  const opened = await existing.openDailyReviewNote("2026-05-05");

  assert.equal(opened.ok, true);
  assert.deepEqual(existing.__opened, ["Noria/Diary/2026/2026-05-05-review"]);
  assert.equal(existing.__writes.length, 0);
});

test("daily review context writes upsert hidden cache files that are outside the vault index", () => {
  const src = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const body = src.match(/async writeTextToVault\(pathText,\s*text\)\s*\{([\s\S]*?)\r?\n\s*\}\r?\n\s*createDailyDiarySeed/);

  assert.ok(body, "expected writeTextToVault body");
  assert.match(body[1], /getAbstractFileByPath\(normalized\)/);
  assert.match(body[1], /adapter\.exists\(normalized\)/);
  assert.match(body[1], /adapter\.write\(normalized,\s*String\(text \|\| ""\)\)/);
  assert.match(body[1], /File already exists|already exists/i);
});

test("daily review final writeback uses managed daily template for missing diary notes", () => {
  const src = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const body = src.match(/async saveDailyReviewFinal\(dateInput,\s*payload\)\s*\{([\s\S]*?)\r?\n\s*\}\r?\n\s*syncRuntimeBridgeConfig/);

  assert.ok(body, "expected saveDailyReviewFinal body");
  assert.match(body[1], /await this\.getTodayDiarySeedText\(\)/);
  assert.doesNotMatch(body[1], /current \|\| this\.createDailyDiarySeed\(\)/);
});

test("legacy review writebacks transform the latest target text", () => {
  const src = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const dailyStart = src.indexOf("async saveDailyReviewFinal");
  const periodStart = src.indexOf("async writePeriodReviewToNote", dailyStart);
  const syncStart = src.indexOf("syncRuntimeBridgeConfig", periodStart);
  assert.ok(dailyStart >= 0 && periodStart > dailyStart && syncStart > periodStart);

  const daily = src.slice(dailyStart, src.indexOf("normalizePeriodReviewArtifactForWriteback", dailyStart));
  const period = src.slice(periodStart, syncStart);
  assert.match(daily, /processTextAtVaultPath/);
  assert.doesNotMatch(daily, /writeTextToVault/);
  assert.match(period, /processTextAtVaultPath/);
  assert.doesNotMatch(period, /writeTextToVault/);
});

test("review final model loads only the daily target and keeps bilingual final fields", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({ managedPaths: { diaryRoot: "06_Diary" } });
  const reads = [];
  plugin.app = {
    vault: { getAbstractFileByPath: () => ({ path: "06_Diary/2026/2026-07-14.md" }) },
    plugins: { plugins: {} }
  };
  plugin.ensureDiaryDayBlocks = async () => ({
    normalizeYmd: (value) => String(value).slice(0, 10),
    getDiaryPathForDate: (date) => `06_Diary/2026/${date}.md`,
    parseSummary: () => "Completed the final-first loader.",
    parseGdd: () => ({ hi: "Clear final", dev: "No recovery yet", blk: "None" }),
    parseGratitude: () => "Grateful for a quiet workflow.",
    parseThought: () => "Continue tomorrow."
  });
  plugin.getManagedPath = () => "06_Diary";
  plugin.loadTextFromVault = async (pathText) => {
    reads.push(String(pathText));
    return "## Review\n\n### Summary\n\nCompleted the final-first loader.\n\n## Notes\n\nkeep";
  };

  const model = await plugin.loadReviewFinal({ mode: "daily", anchorDate: "2026-07-14" });

  assert.deepEqual({ ...model.savedPayload, gdd: { ...model.savedPayload.gdd } }, {
    summary: "Completed the final-first loader.",
    gdd: { hi: "Clear final", dev: "No recovery yet", blk: "None" },
    gratitude: "Grateful for a quiet workflow.",
    thought: "Continue tomorrow."
  });
  assert.equal(model.sectionHeading, "Review");
  assert.equal(model.targetKey, "daily:2026-07-14");
  assert.match(model.baseFingerprint, /^review-v1-/);
  assert.deepEqual(reads, ["06_Diary/2026/2026-07-14.md"]);
});

test("daily final rechecks the review fingerprint when a missing target is created concurrently", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({ managedPaths: { diaryRoot: "06_Diary" } });
  const targetPath = "06_Diary/2026/2026-07-14.md";
  let indexedFile = null;
  let current = "";
  let adapterWrites = 0;
  let processCalls = 0;
  plugin.app = {
    vault: {
      getAbstractFileByPath: (pathText) => String(pathText) === targetPath ? indexedFile : null,
      create: async (pathText) => {
        assert.equal(String(pathText), targetPath);
        current = "## Review\n\n### Summary\n\ncreated elsewhere\n";
        indexedFile = { path: targetPath };
        throw new Error("File already exists");
      },
      process: async (file, transform) => {
        assert.equal(file, indexedFile);
        processCalls += 1;
        current = String(transform(current));
      },
      adapter: {
        write: async (_path, text) => {
          adapterWrites += 1;
          current = String(text);
        }
      }
    },
    plugins: { plugins: {} }
  };
  plugin.ensureDiaryDayBlocks = async () => ({
    normalizeYmd: (value) => String(value).slice(0, 10),
    getDiaryPathForDate: (date) => `06_Diary/2026/${date}.md`,
    parseSummary: () => "",
    parseGdd: () => ({ hi: "", dev: "", blk: "" }),
    parseGratitude: () => "",
    parseThought: () => "",
    replaceFinalReviewSections: (markdown) => `${markdown}\n\n### Summary\n\nmy local final\n`
  });
  plugin.getManagedPath = () => "06_Diary";
  plugin.getTodayDiarySeedText = async () => "# 2026-07-14\n\n## Review\n";
  plugin.loadTextFromVault = async () => current;
  plugin.ensureVaultParent = async () => {};
  plugin.loadReviewRecoveryEntry = async () => null;
  plugin.requestNoriaRefresh = () => {};

  const model = await plugin.loadReviewFinal({ mode: "daily", anchorDate: "2026-07-14" });
  const result = await plugin.saveReviewFinal(model, {
    summary: "my local final",
    gdd: {},
    gratitude: "",
    thought: ""
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "conflict");
  assert.equal(processCalls, 1);
  assert.equal(adapterWrites, 0);
  assert.match(current, /created elsewhere/);
  assert.doesNotMatch(current, /my local final/);
});

test("period final load and save preserve frontmatter and unrelated sections", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  let current = [
    "---",
    "type: weekly",
    "---",
    "",
    "## Plan",
    "",
    "keep plan",
    "",
    "## Weekly review",
    "",
    "old review",
    "",
    "## Notes",
    "",
    "keep note"
  ].join("\n");
  const writes = [];
  plugin.app = {
    vault: { getAbstractFileByPath: () => ({ path: "06_Diary/2026/2026-W29.md" }) },
    plugins: { plugins: {} }
  };
  plugin.resolveCalendarNoteSpecAsync = async () => ({
    period: "weekly",
    date: "2026-07-14",
    periodId: "2026-W29",
    path: "06_Diary/2026/2026-W29.md",
    exists: true
  });
  plugin.loadTextFromVault = async () => current;
  plugin.writeTextToVault = async (_path, text) => {
    current = String(text);
    writes.push(current);
  };
  plugin.requestNoriaRefresh = () => {};

  const model = await plugin.loadReviewFinal({ mode: "weekly", anchorDate: "2026-07-14" });
  assert.equal(model.sectionHeading, "Weekly review");
  assert.deepEqual({ ...model.savedPayload }, { body: "old review" });

  const result = await plugin.saveReviewFinal(model, { body: "new review\n\n- next" });
  assert.equal(result.ok, true);
  assert.equal(writes.length, 1);
  assert.match(current, /^---\ntype: weekly\n---/);
  assert.match(current, /## Plan\n\nkeep plan/);
  assert.match(current, /## Weekly review\n\nnew review\n\n- next/);
  assert.match(current, /## Notes\n\nkeep note/);
});

test("missing period final stays read-only until save creates the Calendar target", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  let current = "";
  let created = 0;
  let writes = 0;
  plugin.app = {
    vault: { getAbstractFileByPath: () => null },
    plugins: { plugins: {} }
  };
  const spec = {
    period: "monthly",
    date: "2026-07-14",
    periodId: "2026-07",
    path: "06_Diary/2026/2026-07.md",
    exists: false
  };
  plugin.resolveCalendarNoteSpecAsync = async () => spec;
  plugin.loadTextFromVault = async () => current;
  plugin.createCalendarNoteIfMissing = async () => {
    created += 1;
    current = "# 2026-07\n\n## Plan\n\nkeep\n";
    return { file: { path: spec.path }, created: true };
  };
  plugin.writeTextToVault = async (_path, text) => {
    writes += 1;
    current = String(text);
  };
  plugin.requestNoriaRefresh = () => {};

  const model = await plugin.loadReviewFinal({ mode: "monthly", anchorDate: "2026-07-14" });
  assert.equal(model.source, "empty");
  assert.equal(created, 0);
  assert.equal(writes, 0);

  const result = await plugin.saveReviewFinal(model, { body: "monthly final" });
  assert.equal(result.ok, true);
  assert.equal(created, 1);
  assert.equal(writes, 1);
  assert.match(current, /## Monthly review\n\nmonthly final/);
});

test("period final rechecks the review fingerprint after a missing target is created", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  let current = "";
  let writes = 0;
  const spec = {
    period: "monthly",
    date: "2026-07-14",
    periodId: "2026-07",
    path: "06_Diary/2026/2026-07.md",
    exists: false
  };
  plugin.app = {
    vault: { getAbstractFileByPath: () => null },
    plugins: { plugins: {} }
  };
  plugin.resolveCalendarNoteSpecAsync = async () => spec;
  plugin.loadTextFromVault = async () => current;
  plugin.createCalendarNoteIfMissing = async () => {
    current = "# 2026-07\n\n## Monthly review\n\ncreated elsewhere\n";
    return { file: { path: spec.path }, created: true };
  };
  plugin.writeTextToVault = async (_path, text) => {
    writes += 1;
    current = String(text);
  };
  plugin.requestNoriaRefresh = () => {};

  const model = await plugin.loadReviewFinal({ mode: "monthly", anchorDate: "2026-07-14" });
  const result = await plugin.saveReviewFinal(model, { body: "my local final" });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "conflict");
  assert.equal(writes, 0);
  assert.match(current, /created elsewhere/);
  assert.doesNotMatch(current, /my local final/);
});

test("review final save refuses an externally changed base fingerprint", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  let current = "## Yearly review\n\ninitial";
  let writes = 0;
  plugin.app = {
    vault: { getAbstractFileByPath: () => ({ path: "06_Diary/2026/2026.md" }) },
    plugins: { plugins: {} }
  };
  plugin.resolveCalendarNoteSpecAsync = async () => ({
    period: "yearly",
    date: "2026-07-14",
    periodId: "2026",
    path: "06_Diary/2026/2026.md",
    exists: true
  });
  plugin.loadTextFromVault = async () => current;
  plugin.writeTextToVault = async () => { writes += 1; };

  const model = await plugin.loadReviewFinal({
    mode: "yearly",
    anchorDate: "2026-07-14",
    yearlyVariant: "week"
  });
  current = "## Yearly review\n\nchanged elsewhere";
  const result = await plugin.saveReviewFinal(model, { body: "my edit" });

  assert.deepEqual({ ...result }, {
    ok: false,
    reason: "conflict",
    path: "06_Diary/2026/2026.md",
    targetKey: "yearly:2026"
  });
  assert.equal(writes, 0);
});

test("review recovery store serializes mutations and replaces one target entry", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.manifest = { id: "noria-dev" };
  const files = new Map();
  const writes = [];
  plugin.app = {
    vault: {
      configDir: ".config",
      getAbstractFileByPath: () => null,
      adapter: {
        async exists(pathText) {
          const pathValue = String(pathText);
          return files.has(pathValue) || [...files.keys()].some((key) => key.startsWith(`${pathValue}/`));
        },
        async mkdir(pathText) {
          files.set(String(pathText), null);
        },
        async read(pathText) {
          if (!files.has(String(pathText))) throw new Error("missing");
          return files.get(String(pathText));
        },
        async write(pathText, text) {
          writes.push(String(pathText));
          files.set(String(pathText), String(text));
        }
      }
    }
  };
  const entry = (targetKey, summary, updatedAt) => ({
    schemaVersion: 1,
    targetKey,
    targetPath: `06_Diary/2026/${targetKey.split(":")[1]}.md`,
    baseFingerprint: "review-v1-empty",
    payload: { summary },
    updatedAt
  });

  await Promise.all([
    plugin.queueReviewRecoveryEntry(entry("daily:2026-07-14", "first", 1)),
    plugin.queueReviewRecoveryEntry(entry("daily:2026-07-15", "other day", 2)),
    plugin.queueReviewRecoveryEntry(entry("daily:2026-07-14", "latest", 3))
  ]);

  const recoveryPath = ".config/plugins/noria-dev/cache/review/recovery-drafts.json";
  assert.equal(plugin.getReviewRecoveryDraftPath(), recoveryPath);
  const store = JSON.parse(files.get(recoveryPath));
  assert.equal(store.version, 1);
  assert.equal(store.entries["daily:2026-07-14"].payload.summary, "latest");
  assert.equal(store.entries["daily:2026-07-15"].payload.summary, "other day");
  assert.equal(writes.length, 3);
});

test("review recovery load fails closed on malformed JSON", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  let writes = 0;
  plugin.manifest = { id: "noria" };
  plugin.app = {
    vault: {
      configDir: ".obsidian-alt",
      adapter: {
        async read() { return "{ broken"; },
        async write() { writes += 1; }
      }
    }
  };

  assert.equal(await plugin.loadReviewRecoveryEntry("daily:2026-07-14"), null);
  assert.equal(writes, 0);
});

test("review final ignores recovery entries for another path or stale Markdown", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  const current = "## Monthly review\n\nsaved final";
  const targetPath = "06_Diary/2026/2026-07.md";
  plugin.app = {
    vault: { getAbstractFileByPath: () => ({ path: targetPath }) },
    plugins: { plugins: {} }
  };
  plugin.resolveCalendarNoteSpecAsync = async () => ({
    period: "monthly",
    date: "2026-07-14",
    periodId: "2026-07",
    path: targetPath,
    exists: true
  });
  plugin.loadTextFromVault = async () => current;
  const baseEntry = {
    schemaVersion: 1,
    targetKey: "monthly:2026-07",
    targetPath,
    baseFingerprint: fingerprintReviewSection("saved final"),
    payload: { body: "recovered final" },
    updatedAt: 10
  };

  plugin.loadReviewRecoveryEntry = async () => ({ ...baseEntry, targetPath: "06_Diary/old/2026-07.md" });
  const wrongPath = await plugin.loadReviewFinal({ mode: "monthly", anchorDate: "2026-07-14" });
  assert.equal(wrongPath.source, "markdown");
  assert.equal(wrongPath.recoveryDraft, null);

  plugin.loadReviewRecoveryEntry = async () => ({ ...baseEntry, baseFingerprint: "review-v1-stale" });
  const stale = await plugin.loadReviewFinal({ mode: "monthly", anchorDate: "2026-07-14" });
  assert.equal(stale.source, "markdown");
  assert.equal(stale.recoveryDraft, null);
});

test("review final load prefers matching recovery and successful save clears it", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({ managedPaths: { diaryRoot: "06_Diary" } });
  let current = "## Review\n\n### Summary\n\nSaved summary";
  let cleared = 0;
  plugin.app = {
    vault: { getAbstractFileByPath: () => ({ path: "06_Diary/2026/2026-07-14.md" }) },
    plugins: { plugins: {} }
  };
  plugin.ensureDiaryDayBlocks = async () => ({
    normalizeYmd: (value) => String(value).slice(0, 10),
    getDiaryPathForDate: (date) => `06_Diary/2026/${date}.md`,
    parseSummary: () => "Saved summary",
    parseGdd: () => ({ hi: "", dev: "", blk: "" }),
    parseGratitude: () => "",
    parseThought: () => "",
    replaceFinalReviewSections: (_text, payload) => `## Review\n\n### Summary\n\n${payload.summary}`
  });
  plugin.getManagedPath = () => "06_Diary";
  plugin.loadTextFromVault = async () => current;
  plugin.writeTextToVault = async (_path, text) => { current = String(text); };
  plugin.requestNoriaRefresh = () => {};
  plugin.loadReviewRecoveryEntry = async () => ({
    schemaVersion: 1,
    targetKey: "daily:2026-07-14",
    targetPath: "06_Diary/2026/2026-07-14.md",
    baseFingerprint: fingerprintReviewSection("### Summary\n\nSaved summary"),
    payload: { summary: "Recovered summary", gdd: {}, gratitude: "", thought: "" },
    updatedAt: 10
  });
  plugin.clearReviewRecoveryEntry = async () => { cleared += 1; };

  const model = await plugin.loadReviewFinal({ mode: "daily", anchorDate: "2026-07-14" });
  assert.equal(model.source, "recovery");
  assert.equal(model.recoveryDraft.payload.summary, "Recovered summary");

  const result = await plugin.saveReviewFinal(model, { summary: "Saved now", gdd: {}, gratitude: "", thought: "" });
  assert.equal(result.ok, true);
  assert.equal(cleared, 1);
});

test("review staged APIs keep summary cheap and load daily support only on request", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({ managedPaths: { diaryRoot: "06_Diary" } });
  let fullEvidenceCalls = 0;
  const reads = [];
  plugin.app = {
    vault: { getAbstractFileByPath: () => null },
    plugins: { plugins: {} }
  };
  plugin.ensureDiaryDayBlocks = async () => ({
    getDiaryPathForDate: (date) => `06_Diary/2026/${date}.md`
  });
  plugin.getManagedPath = () => "06_Diary";
  plugin.ensureReviewCenterUtils = async () => ({
    resolveDailyArtifactPath: (_settings, date) => `06_Diary/2026/${date}-review.md`,
    createEvidenceHash: () => "hash123",
    parseReviewArtifact: (text) => ({ summary: String(text) }),
    hasGeneratedReviewContent: (parsed) => !!parsed?.summary,
    isArtifactStale: () => false
  });
  plugin.loadTextFromVault = async (pathText) => {
    reads.push(String(pathText));
    return "## Comprehensive summary\n\nDraft";
  };
  plugin.collectDailyReviewEvidence = async () => {
    fullEvidenceCalls += 1;
    return { tasks: { done: 2, open: 1 }, git: { changed: 3 }, excerpts: [] };
  };
  const selection = plugin.resolveReviewSelection({ mode: "daily", anchorDate: "2026-07-14" });
  const finalModel = {
    selection,
    targetKey: "daily:2026-07-14",
    targetPath: "06_Diary/2026/2026-07-14.md",
    savedPayload: {
      summary: "Saved",
      gdd: { hi: "Clear", dev: "", blk: "" },
      gratitude: "",
      thought: ""
    }
  };

  const summary = await plugin.getReviewEvidenceSummary(selection, finalModel);
  assert.deepEqual(Array.from(summary.facts, (fact) => fact.id), ["summary", "gdd"]);
  assert.equal(fullEvidenceCalls, 0);
  assert.deepEqual(reads, []);

  const evidence = await plugin.getFullReviewEvidence(selection);
  assert.equal(evidence.evidence.tasks.done, 2);
  assert.equal(fullEvidenceCalls, 1);
  assert.deepEqual(reads, ["06_Diary/2026/2026-07-14.md"]);

  const artifact = await plugin.getReviewAnalysisArtifact(selection, evidence);
  assert.equal(artifact.exists, true);
  assert.equal(artifact.path, "06_Diary/2026/2026-07-14-review.md");
  assert.deepEqual(reads, [
    "06_Diary/2026/2026-07-14.md",
    "06_Diary/2026/2026-07-14-review.md"
  ]);
});

test("period evidence, final target, and analysis artifact share the calendar-resolved paths", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  const requests = [];
  const reads = [];
  let preparedModel = null;
  plugin.app = {
    vault: { getAbstractFileByPath: () => null },
    plugins: { plugins: {} }
  };
  plugin.resolveCalendarNoteSpecAsync = async () => ({ path: "Custom/Periods/2026.md" });
  plugin.createDataService = async () => ({
    async getReviewEvidence(request) {
      requests.push({ ...request });
      return {
        mode: request.mode,
        period: request.period,
        range: { mode: "custom", start: "2026-01-01", end: "2026-12-31" },
        evidence: { dailyNotes: [] },
        artifactPath: "06_Diary/2026/2026-review-week.md",
        writeback: { targetPath: "06_Diary/2026/2026.md", sectionHeading: "年复盘" }
      };
    }
  });
  plugin.ensureReviewCenterUtils = async () => ({
    createEvidenceHash: () => "period-hash",
    parseReviewArtifact: (text) => ({ summary: String(text) }),
    hasGeneratedReviewContent: () => true,
    isArtifactStale: () => false
  });
  plugin.loadTextFromVault = async (pathText) => {
    reads.push(String(pathText));
    return "## Comprehensive summary\n\nDraft";
  };
  plugin.writeReviewEvidenceFile = async (model) => {
    preparedModel = model;
    return { path: ".obsidian/plugins/noria/cache/stats/review/2026/2026.json" };
  };
  plugin.buildExternalDailyReviewPrompt = async () => "prompt";
  plugin.copyReviewPromptFallback = async () => true;

  const selection = {
    mode: "yearly",
    anchorDate: "2026-07-14",
    period: "2026",
    yearlyVariant: "week"
  };
  const evidence = await plugin.getFullReviewEvidence(selection);
  const artifact = await plugin.getReviewAnalysisArtifact(selection, evidence);
  await plugin.prepareReviewAnalysis(selection, evidence);

  assert.deepEqual(requests, [{ mode: "yearly", period: "2026", granularity: "week" }]);
  assert.equal(evidence.periodNotePath, "Custom/Periods/2026.md");
  assert.equal(evidence.writeback.targetPath, "Custom/Periods/2026.md");
  assert.equal(evidence.artifactPath, "Custom/Periods/2026-review-week.md");
  assert.equal(artifact.path, evidence.artifactPath);
  assert.deepEqual(reads, ["Custom/Periods/2026-review-week.md"]);
  assert.equal(preparedModel.artifactPath, evidence.artifactPath);
  assert.equal(preparedModel.periodNotePath, evidence.periodNotePath);
  assert.deepEqual(preparedModel.reviewEvidence.range, evidence.range);
});

test("home review summary coalesces repeated file reads and invalidates after related writes", async () => {
  const plugin = makeAiPlugin({
    settings: { managedPaths: { diaryRoot: "06_Diary" } }
  });
  let unblockReads = null;
  let diarySaved = false;
  const firstReadGate = new Promise((resolve) => {
    unblockReads = resolve;
  });
  const readCalls = [];

  plugin.ensureReviewCenterUtils = async () => ({
    resolveDailyArtifactPath: (_settings, date) => `06_Diary/2026/${date}-review.md`,
    parseReviewArtifact: (text) => ({ text }),
    hasGeneratedReviewContent: (parsed) => String(parsed?.text || "").trim().length > 0
  });
  plugin.ensureDiaryDayBlocks = async () => ({
    normalizeYmd: (value) => String(value || "2026-05-05").slice(0, 10),
    getDiaryPathForDate: (date) => `06_Diary/2026/${date}.md`,
    parseSummary: (text) => (String(text || "").includes("FINAL") ? "FINAL" : ""),
    parseGdd: () => ({})
  });
  plugin.loadTextFromVault = async (pathText) => {
    readCalls.push(String(pathText || ""));
    if (readCalls.length <= 2) await firstReadGate;
    if (String(pathText || "").endsWith("-review.md")) return "## 综合总结\nDraft";
    return diarySaved ? "## 复盘\nFINAL" : "";
  };

  const first = plugin.getReviewCenterHomeSummary("2026-05-05");
  const second = plugin.getReviewCenterHomeSummary("2026-05-05");
  for (let i = 0; i < 8 && readCalls.length < 2; i += 1) {
    await Promise.resolve();
  }
  assert.equal(readCalls.length, 2);
  unblockReads();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, "generated");
  assert.equal(b.status, "generated");
  assert.equal(readCalls.length, 2);

  const cached = await plugin.getReviewCenterHomeSummary("2026-05-05");
  assert.equal(cached.status, "generated");
  assert.equal(readCalls.length, 2);

  diarySaved = true;
  await plugin.writeTextToVault("06_Diary/2026/2026-05-05.md", "FINAL");
  const refreshed = await plugin.getReviewCenterHomeSummary("2026-05-05");
  assert.equal(refreshed.status, "finalSaved");
  assert.equal(readCalls.length, 4);
});

test("home review summary invalidation prevents pending stale reads from repopulating cache", async () => {
  const plugin = makeAiPlugin({
    settings: { managedPaths: { diaryRoot: "06_Diary" } }
  });
  let unblockReads = null;
  const firstReadGate = new Promise((resolve) => {
    unblockReads = resolve;
  });
  const readCalls = [];

  plugin.ensureReviewCenterUtils = async () => ({
    resolveDailyArtifactPath: (_settings, date) => `06_Diary/2026/${date}-review.md`,
    parseReviewArtifact: (text) => ({ text }),
    hasGeneratedReviewContent: (parsed) => String(parsed?.text || "").trim().length > 0
  });
  plugin.ensureDiaryDayBlocks = async () => ({
    normalizeYmd: (value) => String(value || "2026-05-05").slice(0, 10),
    getDiaryPathForDate: (date) => `06_Diary/2026/${date}.md`,
    parseSummary: (text) => (String(text || "").includes("FINAL") ? "FINAL" : ""),
    parseGdd: () => ({})
  });
  plugin.loadTextFromVault = async (pathText) => {
    const pathValue = String(pathText || "");
    readCalls.push(pathValue);
    const initialBatch = readCalls.length <= 2;
    if (initialBatch) await firstReadGate;
    if (pathValue.endsWith("-review.md")) return "## 综合总结\nDraft";
    return initialBatch ? "" : "## 复盘\nFINAL";
  };

  const pending = plugin.getReviewCenterHomeSummary("2026-05-05");
  for (let i = 0; i < 8 && readCalls.length < 2; i += 1) {
    await Promise.resolve();
  }
  assert.equal(readCalls.length, 2);
  await plugin.writeTextToVault("06_Diary/2026/2026-05-05.md", "FINAL");
  unblockReads();

  const staleResult = await pending;
  assert.equal(staleResult.status, "generated");

  const refreshed = await plugin.getReviewCenterHomeSummary("2026-05-05");
  assert.equal(refreshed.status, "finalSaved");
  assert.equal(readCalls.length, 4);
});

test("daily review model starts artifact read before diary text settles", async () => {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({
    managedPaths: { diaryRoot: "06_Diary" }
  });
  const diaryPath = "06_Diary/2026/2026-05-05.md";
  const artifactPath = "06_Diary/2026/2026-05-05-review.md";
  const readCalls = [];
  let releaseDiaryRead = null;
  const diaryReadGate = new Promise((resolve) => {
    releaseDiaryRead = resolve;
  });
  let evidenceInput = null;

  plugin.ensureReviewCenterUtils = async () => ({
    resolveDailyArtifactPath: () => artifactPath,
    createEvidenceHash: () => "hash123",
    parseReviewArtifact: (text) => ({ text }),
    hasGeneratedReviewContent: (parsed) => String(parsed?.text || "").trim().length > 0,
    isArtifactStale: () => false
  });
  plugin.ensureDiaryDayBlocks = async () => ({
    normalizeYmd: () => "2026-05-05",
    getDiaryPathForDate: () => diaryPath,
    parseDailyState: () => ({}),
    parseDailyStateFromBody: () => ({}),
    parseSummary: () => "",
    parseGdd: () => ({}),
    parseGratitude: () => "",
    parseThought: () => ""
  });
  plugin.getManagedPath = () => "06_Diary";
  plugin.loadTextFromVault = async (pathText) => {
    const pathValue = String(pathText || "");
    readCalls.push(pathValue);
    if (pathValue === diaryPath) await diaryReadGate;
    return pathValue === artifactPath ? "## 综合总结\nDraft" : "diary words";
  };
  plugin.collectDailyReviewEvidence = async (date, pathText, diaryText) => {
    evidenceInput = { date, path: pathText, diaryText };
    return { tasks: {}, git: {}, excerpts: [], diaryWords: 2 };
  };

  const pending = plugin.getDailyReviewModel("2026-05-05");
  for (let i = 0; i < 8 && readCalls.length < 2; i += 1) {
    await Promise.resolve();
  }
  const startedArtifactBeforeDiarySettled = readCalls.includes(artifactPath);
  releaseDiaryRead();
  const model = await pending;

  assert.equal(startedArtifactBeforeDiarySettled, true);
  assert.equal(evidenceInput.diaryText, "diary words");
  assert.equal(model.artifact.generated, true);
  ["totalMs", "diaryReadMs", "artifactReadMs", "evidenceMs", "tasksMs", "gitMs", "statsMs", "excerptsMs"].forEach((key) => {
    assert.equal(Number.isFinite(model.performance[key]), true, `${key} should be a finite timing`);
  });
});

test("daily review task collection reads source files with bounded concurrency and stable order", async () => {
  const plugin = makeAiPlugin();
  const files = Array.from({ length: 14 }, (_, index) => ({
    path: `01_Projects/Review/${String(index + 1).padStart(2, "0")}.md`
  }));
  let activeReads = 0;
  let maxActiveReads = 0;

  plugin.app.vault.getMarkdownFiles = () => files;
  plugin.app.vault.cachedRead = async (file) => {
    activeReads += 1;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    await new Promise((resolve) => setTimeout(resolve, 4));
    activeReads -= 1;
    const index = files.indexOf(file) + 1;
    return `- [ ] task ${String(index).padStart(2, "0")} 2026-05-05`;
  };

  const result = await plugin.collectDailyTasks("2026-05-05", "06_Diary/2026/2026-05-05.md");

  assert.equal(result.open, files.length);
  assert.equal(result.openItems[0].label, "task 01 2026-05-05");
  assert.equal(result.openItems.at(-1).label, "task 14 2026-05-05");
  assert.ok(maxActiveReads > 1, `expected concurrent reads, saw ${maxActiveReads}`);
  assert.ok(maxActiveReads <= 6, `expected bounded reads, saw ${maxActiveReads}`);
});

test("daily review task collection uses Obsidian metadata to skip files without tasks", async () => {
  const plugin = makeAiPlugin();
  const files = [
    { path: "01_Projects/Task.md" },
    { path: "02_Areas/Notes.md" },
    { path: "06_Diary/2026/2026-05-05.md" }
  ];
  const reads = [];
  plugin.app.vault.getMarkdownFiles = () => files;
  plugin.app.vault.cachedRead = async (file) => {
    reads.push(file.path);
    return file.path.endsWith("Task.md") ? "- [ ] indexed task 2026-05-05" : "plain text";
  };
  plugin.app.metadataCache = {
    initialized: true,
    getFileCache(file) {
      return file.path.endsWith("Task.md") ? { listItems: [{ task: " " }] } : { listItems: [] };
    }
  };

  const result = await plugin.collectDailyTasks("2026-05-05", "06_Diary/2026/2026-05-05.md");

  assert.deepEqual(reads, ["01_Projects/Task.md"]);
  assert.equal(result.open, 1);
});

test("daily review evidence and task collection share human-note noise filters", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const src = fs.readFileSync(pluginPath("src/main.js"), "utf8");
  const collectTasksBody = main.match(/async collectDailyTasks\(date,\s*diaryPath\)\s*\{([\s\S]*?)\n\s*return out;\n\s*\}/);

  assert.ok(collectTasksBody, "expected collectDailyTasks body");
  assert.match(collectTasksBody[1], /files\.filter\(\(file\)\s*=>\s*this\.isHumanReviewNotePath\([\s\S]*file\.path[\s\S]*\|\| ""\)/);
  assert.match(main, /!\/\^\\\.\//);
  assert.match(main, /!p\.startsWith\("99_Attachment\/"\)/);
  assert.match(src, /async collectReviewExcerpts\(diaryPath,\s*git,\s*review\)/);
  assert.match(src, /collectReviewExcerpts\(diaryPath,\s*git,\s*review\)/);
  assert.match(src, /review && typeof review\.sanitizeReviewExcerptText === "function"/);
});

test("daily review AI analysis uses markdown preview and ignores seed artifacts", () => {
  const review = loadReviewCenter();
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");
  const seed = [
    "---",
    "date: 2026-05-04",
    "generated_at: \"\"",
    "evidence_hash: abc",
    "---",
    "",
    "## 综合总结",
    "",
    "## 内容变化分析",
    "",
    "## 建议",
    "",
    "## GDD 建议",
    "",
    "- 亮点：",
    "- 偏差：",
    "- 阻塞：",
    "",
    "## 证据引用/输入摘要",
    ""
  ].join("\n");
  const generated = [
    "---",
    "date: 2026-05-04",
    "generated_at: 2026-05-04T10:00:00+08:00",
    "evidence_hash: abc",
    "---",
    "",
    "## 综合总结",
    "",
    "今天完成了复盘中心生成链路修订。",
    "",
    "## 内容变化分析",
    "",
    "证据范围更清晰。",
    "",
    "## 建议",
    "",
    "- 明天验证 Claudian 写入。",
    "",
    "## GDD 建议",
    "",
    "- 亮点：链路更明确",
    "- 偏差：仍需实测",
    "- 阻塞：无",
    "",
    "## 证据引用/输入摘要",
    "",
    "- 06_Diary/2026/2026-05-04.md"
  ].join("\n");

  assert.equal(review.hasGeneratedReviewContent(review.parseReviewArtifact(seed)), false);
  assert.equal(review.buildArtifactPreviewMarkdown(seed), "");
  assert.equal(review.hasGeneratedReviewContent(review.parseReviewArtifact(generated)), true);
  assert.doesNotMatch(review.buildArtifactPreviewMarkdown(generated), /^---/);
  assert.match(review.buildArtifactPreviewMarkdown(generated), /## 综合总结/);
  assert.match(main, /noria-review-llm-preview/);
  assert.match(main, /MarkdownRenderer\.render/);
  assert.match(main, /generated\) === true|\.generated === true/);
  assert.doesNotMatch(main, /text \|\| this\.plugin\.t\("review\.empty"\)/);
  assert.doesNotMatch(main, /noria-review-llm-grid/);
  assert.doesNotMatch(main, /noria-review-llm-card/);
  assert.match(styles, /\.noria-review-llm-preview\b/);
  assert.doesNotMatch(styles, /\.noria-review-llm-grid\b/);
  assert.doesNotMatch(styles, /\.noria-review-llm-card\b/);
});

test("daily review save payload keeps recap fields and omits daily state", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");

  assert.match(main, /saveDailyReviewFinal\(model\.date,\s*\{\s*summary:\s*summary\.value,\s*gdd:\s*\{\s*hi:\s*gddHi\.value,\s*dev:\s*gddDev\.value,\s*blk:\s*gddBlk\.value\s*\},\s*gratitude:\s*gratitude\.value,\s*thought:\s*thought\.value\s*\}\)/s);
  assert.doesNotMatch(main, /saveDailyReviewFinal\(model\.date,\s*\{\s*state,/s);
});
