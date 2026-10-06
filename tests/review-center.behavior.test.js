const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");
const vm = require("node:vm");
const D = require("../src/review-document.js");
const { fingerprintReviewSection } = require("../src/review-center-core.js");

const pluginRoot = path.resolve(__dirname, "..");

test("review refresh keeps the mounted review instead of rebuilding Home", async () => {
  const Plugin = loadPluginClass(), plugin = new Plugin();
  let homeReloads = 0, reviewRefreshes = 0;
  const mounted = { __noriaReviewRenderer: { refreshReviewSupport: async () => { reviewRefreshes++; } } };
  const leaf = { view: { hostEl: { querySelectorAll: () => [mounted] }, reload: async () => { homeReloads++; } } };
  plugin.app = { workspace: { getLeavesOfType: () => [leaf] } };
  await plugin.reloadOpenNoriaViews("review");
  assert.equal(reviewRefreshes, 1);
  assert.equal(homeReloads, 0);
  await plugin.reloadOpenNoriaViews("home");
  assert.equal(homeReloads, 1);
});

test("task writeback refreshes the mounted Home workbench as well as Task Board",async()=>{
  const Plugin=loadPluginClass(),plugin=new Plugin(),refreshed=[];
  plugin.app={workspace:{getLeavesOfType:type=>[{view:{reload:async()=>refreshed.push(type)}}]}};
  await plugin.reloadOpenNoriaViews("tasks");
  assert.deepEqual(refreshed.sort(),["noria-dashboard-home","noria-tasks-calendar"]);
});

test("task writeback uses the mounted workbench task refresh",async()=>{
  const Plugin=loadPluginClass(),plugin=new Plugin(),refreshed=[];
  plugin.app={workspace:{getLeavesOfType:type=>[{view:{workbench:type==="noria-dashboard-home"?{refreshTasks:async()=>refreshed.push("home tasks")}:null,reload:async()=>refreshed.push(type)}}]}};
  await plugin.reloadOpenNoriaViews("tasks");
  assert.deepEqual(refreshed,["home tasks","noria-tasks-calendar"]);
});

test("reference choices reuse Calendar paths and keep missing lower reviews available", async () => {
  const Plugin = loadPluginClass(), plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  plugin.app = { vault: { getAbstractFileByPath: () => null } };
  plugin.createDataService = async () => ({ resolveRange: request => {
    assert.equal(request.anchor, "2026-09-13");
    return { dates: ["2026-09-07", "2026-09-08", "2026-09-14"] };
  } });
  plugin.resolveCalendarNoteSpecAsync = async (mode, date) => ({ path: `Custom/${mode}/${date}.md` });
  const selection = { mode:"monthly", anchorDate:"2026-09-13" };
  const choices = await plugin.getReviewReferenceChoices(selection, "weekly");
  assert.equal(choices.length, 2);
  assert.deepEqual(Array.from(choices, c => c.exists), [false, false]);
  assert.equal(choices[0].targetPath, "Custom/weekly/2026-09-07.md");
  assert.deepEqual(selection, { mode:"monthly", anchorDate:"2026-09-13" });
});

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

test("new period templates keep review optional and bind it on first use", () => {
  const Plugin = loadPluginClass(), plugin = new Plugin();
  plugin.settings = plugin.normalizeSettings({});
  for (const locale of ["zh", "en"]) {
    plugin.getNoriaLocale = () => locale;
    for (const mode of ["daily", "weekly", "monthly", "yearly"]) {
      const seed = plugin.getManagedNoteSeed(mode + "Template");
      const binding = D.readReviewDocument(seed);
      assert.equal(binding.kind, "absent");
      assert.equal(D.hasReviewContent(binding.markdown), false);
      assert.doesNotMatch(binding.markdown, /GDD|Highlight:|Deviation:|Blocker:|亮点：|偏差：|阻塞：/);
      const written = D.writeReviewDocument(seed, binding, "## Review\n\nOne thing to remember.");
      assert.equal(D.readReviewDocument(written).markdown, "## Review\n\nOne thing to remember.");
      assert.ok(written.startsWith(seed), "adding the optional review preserves the original date content");
    }
  }
});

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

test("daily final fields preserve Markdown indentation, hard breaks and fenced headings", () => {
  const U = loadDiaryBlocks();
  const body = "    code  \n\nparagraph  \nnext\n\n```md\n### Gratitude\nexample  \n```";
  const prefix = "## Plan\n\nkeep this  \nnext\n\n";
  const suffix = "# Other notes\n\nkeep this too  \n\n";
  const original = `${prefix}## Review\n\n### Summary\n\n${body}\n\n### GDD\n\n- Highlight: first  \n  continuation\n- Deviation: none\n- Blocker: none\n\n### Gratitude\n\n    grateful  \n\n### Free writing\n\nthought  \n\n### Summary of a separate project\n\n    custom  \n\n${suffix}`;
  assert.equal(U.parseSummary(original), body);
  assert.equal(U.parseGratitude(original), "    grateful  ");
  assert.equal(U.parseThought(original), "thought  ");
  assert.equal(U.parseGdd(original).hi, "first  \n  continuation");
  const binding = D.readReviewDocument(original, ["Review"]);
  const result = D.writeReviewDocument(original, binding, binding.markdown);
  assert.ok(result.startsWith(prefix));
  assert.ok(result.endsWith(suffix));
  assert.ok(result.includes(body));
  assert.ok(result.includes("### Summary of a separate project\n\n    custom  "));
});

test("legacy GDD first-line indentation remains readable in both languages", () => {
  const U = loadDiaryBlocks();
  for (const labels of [["亮点：", "偏差：", "阻塞："], ["Highlight: ", "Deviation: ", "Blocker: "]]) {
    const body = "### GDD\n\n- " + labels[0] + "    code  \n- " + labels[1] + "\tindented\n- " + labels[2] + "first  \n  continuation";
    assert.deepEqual(JSON.parse(JSON.stringify(U.parseGdd(body))), {hi:"    code  ", dev:"\tindented", blk:"first  \n  continuation"});
  }
});

test("legacy parenthetical thought heading is replaced once while custom headings survive", () => {
  const U = loadDiaryBlocks();
  const original = "## 复盘\n\n### 感想（自由写）\n\n原来的感想\n\n### 感想素材\n\n不能删除的素材\n";
  const payload = { summary: "", gdd: { hi: "", dev: "", blk: "" }, gratitude: "", thought: "更新后的感想  " };
  const binding = D.readReviewDocument(original, ["复盘"]);
  const normalized = D.normalizeReviewPayload(payload, "复盘", binding.markdown);
  const result = D.writeReviewDocument(original, binding, normalized.body);
  assert.equal(U.parseThought(result), payload.thought);
  assert.doesNotMatch(result, /原来的感想/);
  assert.equal((result.match(/^### 感想（自由写）$/gm) || []).length, 1);
  assert.match(result, /### 感想素材\n\n不能删除的素材/);
  assert.equal(D.writeReviewDocument(result, D.readReviewDocument(result), normalized.body), result);
});

function loadPluginClass(options = {}) {
  const code = fs.readFileSync(pluginPath("main.js"), "utf8");
  const module = { exports: {} };
  const notices = options.notices || [];
  const context = {
    console,
    module,
    exports: module.exports,
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
      if (id === "crypto") return require("node:crypto");
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
  const binding = D.readReviewDocument(input, ["Review"]);
  const next = D.writeReviewDocument(input, binding, D.normalizeReviewPayload({ thought: "new thought" }, "Review", binding.markdown).body);
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
  assert.match(periodicRecap, /bridge\.openReviewCenter/);
  assert.doesNotMatch(periodicRecap, /U\.upsertGdd|U\.upsertThoughtSection/);
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
  const watchStart = renderer.indexOf("\n  watchReviewAnalysisArtifact(");
  const watchEnd = renderer.length;
  const watcher = renderer.slice(watchStart, watchEnd);

  assert.match(renderer, /this\._supportEvidenceCache\s*=/);
  assert.match(renderer, /getFullReviewEvidenceOnce\(generation\)/);
  assert.match(renderer, /this\.plugin\.getFullReviewEvidence\(this\.selection\)/);
  assert.match(renderer, /disposeReviewAnalysisArtifactWatch\(\)/);
  assert.ok(watchStart > 0);
  assert.match(watcher, /refreshReviewAnalysisArtifact\(generation\)/);
  assert.doesNotMatch(watcher, /this\.render\(\)/);
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
  assert.match(styles, /\.dashboard-review-center-host\s*>\s*\.dashboard-review-center-card\[hidden\]\s*\{[\s\S]*display:\s*none\s*;/);
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
  const fieldEnd = renderer.indexOf("\n  renderPreservedRecoveryDrafts(", fieldStart);
  const field = renderer.slice(fieldStart, fieldEnd);

  assert.match(renderer, /syncFinalSaveUi\(\)/);
  assert.match(dirty, /this\.syncFinalSaveUi\(\)/);
  assert.doesNotMatch(dirty, /renderFinalFirst|\.render\(/);
  assert.doesNotMatch(field, /renderFinalFirst|\.render\(/);
  assert.match(renderer, /this\.shellSaveStateEl/);
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

test("daily review material keeps complete author records without automatic Git-source reads",async()=>{
  const Plugin=loadPluginClass(),plugin=new Plugin(),reads=[];
  const text="## Notes\n\n"+"A meaningful sentence. ".repeat(300);
  plugin.loadTextFromVault=async path=>{reads.push(path);return text;};
  const result=await plugin.collectReviewExcerpts("Diary/day.md",{committed:{files:[{path:"Projects/A.md"}]}},{});
  assert.deepEqual(reads,["Diary/day.md"]);assert.equal(result[0].text,text.trim());
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

test("embedded noria-review skill carries multi-project evidence and low-burden review rules", () => {
  const sourceMain = fs.readFileSync(path.join(pluginRoot, "src", "main.js"), "utf8").replace(/\r\n/g, "\n");
  const embeddedExpression = sourceMain.match(/const NORIA_DEFAULT_REVIEW_SKILL = (\[[\s\S]*?\])\.join\("\\n"\);/)?.[1] || "";
  const embeddedSkill = embeddedExpression ? vm.runInNewContext(embeddedExpression).join("\n") : "";
  const skill = embeddedSkill;

  assert.ok(skill);
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
  assert.match(skill,/具体项目、经历或主题/);
  assert.match(skill,/alreadyRead/);
  assert.match(skill,/不要求其他使用者具有这些工具或文件/);
  assert.match(skill,/材料少就写短/);
  assert.match(skill,/下级复盘/);
  assert.match(skill,/参考记录/);
  assert.doesNotMatch(skill,/600[–-]900|每个项目不超过 150/);
  assert.doesNotMatch(skill, /evidence_context/);
});

test("review artifacts recognize unheaded openings and arbitrary meaningful sections",()=>{
  const review=loadReviewCenter();
  const body="这一周重新找回了散步的时间。\n\n## 城市里的停留\n\n原本的绕路成为值得保留的观察。";
  const parsed=review.parseReviewArtifact("---\nperiod: 2026-W38\n---\n"+body);
  assert.equal(review.hasGeneratedReviewContent(parsed),true);
  assert.equal(review.buildArtifactPreviewMarkdown(parsed),body+"\n");
  assert.equal(review.hasGeneratedReviewContent(review.parseReviewArtifact("## 城市里的停留\n\n## 参考记录\n")),false);
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



test("embedded daily review final actionbar does not crush writeback copy into vertical text", () => {
  const styles = fs.readFileSync(pluginPath("styles.css"), "utf8");

  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar-copy\s*\{[\s\S]*display:\s*grid/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar-title,\s*\n\.noria-review-workbench-final\s+\.noria-review-actionbar-copy\s+\.noria-review-save-status\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-write-target\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(styles, /\.noria-review-workbench-final\s+\.noria-review-actionbar-buttons\s*\{[\s\S]*justify-content:\s*flex-start/);
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

test("daily review generation writes JSON evidence and a local prompt file without internal AI adapters", () => {
  const main = fs.readFileSync(pluginPath("main.js"), "utf8");
  const generateBody = main.match(/async generateReview\(modeInput\s*=\s*"daily",\s*dateInput,\s*variantInput\s*=\s*""\)\s*\{([\s\S]*?)\n\s*\}/);

  assert.ok(generateBody, "expected generateDailyReview body");
  assert.match(generateBody[1], /writeReviewEvidenceFile\(model,\s*review\d*\)/);
  assert.match(generateBody[1], /buildExternalDailyReviewPrompt\(model,\s*evidence\.readingPath,\s*review\d*\)/);
  assert.match(generateBody[1], /writeReviewPromptFile\(model,\s*prompt\)/);
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

test("daily review generation saves JSON evidence and its prompt without creating a review note", async () => {
  const calls = [];
  const plugin = makeAiPlugin({
    requestUrl: async (request) => {
      calls.push(request);
      throw new Error("AI API should not be called");
    }
  });

  const result = await plugin.generateDailyReview("2026-05-05");

  assert.equal(result.ok, true);
  assert.equal(result.mode, "prompt-file");
  assert.equal(calls.length, 0);
  assert.equal(result.promptPath, ".obsidian/plugins/noria/cache/stats/review/2026/2026-05-05.prompt.md");
  assert.equal(plugin.__writes.length, 3);
  const evidenceWrite = plugin.__writes.find((item) => item.path.endsWith("2026-05-05.json"));
  const promptWrite = plugin.__writes.find((item) => item.path.endsWith("2026-05-05.prompt.md"));
  assert.ok(evidenceWrite);
  assert.ok(promptWrite);
  assert.match(promptWrite.text, /noria-review/);
  assert.match(promptWrite.text, /review_note: Noria\/Diary\/2026\/2026-05-05-review\.md/);
  assert.match(promptWrite.text, /evidence_file: \.obsidian\/plugins\/noria\/cache\/stats\/review\/2026\/2026-05-05\.material\.json/);
  assert.doesNotMatch(promptWrite.text, /evidence_context/);
  assert.doesNotMatch(promptWrite.text, /evidence_hash/);
  assert.doesNotMatch(promptWrite.text, /\.obsidian\/plugins\/noria\/cache\/review-context\/2026-05-05\.md/);
  assert.doesNotMatch(promptWrite.text, /hash123/);
  const payload = JSON.parse(evidenceWrite.text);
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





test("review final model loads only the daily target and keeps the source Markdown", async () => {
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

  assert.deepEqual({ ...model.savedPayload }, { format: "markdown", body: "## Review\n\n### Summary\n\nCompleted the final-first loader." });
  assert.equal(model.sectionHeading, "Review");
  assert.equal(model.targetKey, "daily:2026-07-14");
  assert.match(model.baseFingerprint, /^review-doc-v1-/);
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

test("daily final replacement protects parent sections and fenced examples", () => {
  const diary = loadDiaryBlocks();
  const prefix = "# Journal\n\n```md\n## Review\n### Summary\nexample\n```\n\n";
  const tail = "# Private notes\n\n### Summary\nkeep this  \nexactly\n";
  const original = `${prefix}## Review\n\n### Summary\nold summary\n\n### My notes\n~~~md\n### Summary\nkeep code\n~~~\n\n${tail}`;
  const binding = D.readReviewDocument(original, ["Review"]);
  const updated = D.writeReviewDocument(original, binding, binding.markdown.replace("old summary", "new summary"));
  assert.ok(updated.startsWith(prefix));
  assert.ok(updated.endsWith(tail));
  assert.ok(updated.includes("### My notes\n~~~md\n### Summary\nkeep code\n~~~"));
  assert.ok(updated.includes("### Summary\nnew summary"));
  assert.ok(!updated.includes("old summary"));
});

test("diary utility loads in the Obsidian renderer without replacing its ambient module", () => {
  const ambientExports = { owner: "Obsidian" };
  const context = { module: { exports: ambientExports }, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(pluginPath("views/dashboard/core/utils/diary-day-blocks.js"), "utf8"), context);
  const result = context.dashboardCore.utils.diaryDayBlocks.appendTodayTaskLine("## Tasks\n\n### Today tasks\n", "new");
  assert.match(result, /### Today tasks\n- \[ \] new/);
  assert.equal(context.module.exports, ambientExports);
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
    "# Notes",
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
  assert.deepEqual({ ...model.savedPayload }, { format: "markdown", body: "## Weekly review\n\nold review" });

  const result = await plugin.saveReviewFinal(model, { body: "new review\n\n- next" });
  assert.equal(result.ok, true);
  assert.equal(writes.length, 1);
  assert.match(current, /^---\ntype: weekly\n---/);
  assert.match(current, /## Plan\n\nkeep plan/);
  assert.match(current, /## Weekly review\n\nnew review\n\n- next/);
  assert.match(current, /# Notes\n\nkeep note/);
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
    current = "# 2026-07\n\n## Plan\n\nkeep\n\n## Monthly review\n\n### GDD\n\n- Highlight:\n";
    return { file: { path: spec.path }, created: true, initialContent: current };
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
    return { file: { path: spec.path }, created: true, initialContent: "# 2026-07\n\n## Monthly review\n\n### GDD\n\n- Highlight:\n" };
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

test("review recovery store serializes mutations and replaces one editor draft", async () => {
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
  assert.equal(store.version, 2);
  assert.equal(store.entries["daily:2026-07-14"][0].payload.summary, "latest");
  assert.equal(store.entries["daily:2026-07-15"][0].payload.summary, "other day");
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
  assert.equal(stale.preservedRecoveryDrafts[0].payload.body, "recovered final");
});

function makeRecoveryFixture() {
  const Plugin = loadPluginClass();
  const plugin = new Plugin();
  const targetPath = "06_Diary/2026/2026-07.md";
  const files = new Map([[targetPath, "## Monthly review\n\nsaved final\n"]]);
  plugin.manifest = { id: "noria" };
  plugin.settings = plugin.normalizeSettings({});
  plugin.app = { plugins: { plugins: {} }, vault: {
    configDir: ".obsidian",
    getAbstractFileByPath: (name) => files.has(name) ? { path: name } : null,
    adapter: {
      exists: async (name) => files.has(name), mkdir: async () => {},
      read: async (name) => { if (!files.has(name)) throw new Error("missing"); return files.get(name); },
      write: async (name, text) => { files.set(name, String(text)); }
    }
  } };
  plugin.resolveCalendarNoteSpecAsync = async () => ({ path: targetPath, exists: true, periodId: "2026-07" });
  plugin.loadTextFromVault = async (name) => files.get(name) || "";
  plugin.writeTextToVault = async (name, text) => { files.set(name, text); };
  plugin.requestNoriaRefresh = () => {};
  const selection = { mode: "monthly", anchorDate: "2026-07-14" };
  const draft = (model, body, updatedAt = 10) => ({
    schemaVersion: 1, targetKey: model.targetKey, targetPath, draftId: model.draftId,
    baseFingerprint: model.baseFingerprint, payload: { body }, updatedAt
  });
  return { plugin, files, targetPath, selection, draft };
}

test("legacy or conflicting recovery survives a new draft and an unrelated save", async () => {
  const { plugin, files, targetPath, selection, draft } = makeRecoveryFixture();
  const key = "monthly:2026-07";
  const old = { schemaVersion: 1, targetKey: key, targetPath, baseFingerprint: "review-v1-old", payload: { body: "old unsaved work" }, updatedAt: 1 };
  files.set(plugin.getReviewRecoveryDraftPath(), JSON.stringify({ version: 1, entries: { [key]: old } }));
  const model = await plugin.loadReviewFinal(selection);
  assert.equal(model.recoveryDraft, null);
  assert.equal(model.preservedRecoveryDrafts[0].payload.body, "old unsaved work");
  await plugin.queueReviewRecoveryEntry(draft(model, "new work"));
  assert.equal((await plugin.readReviewRecoveryStore()).entries[key].length, 2);
  assert.equal((await plugin.saveReviewFinal(model, { body: "new work" })).ok, true);
  const remaining = (await plugin.loadReviewFinal(selection)).preservedRecoveryDrafts;
  assert.deepEqual(Array.from(remaining, (entry) => entry.payload.body), ["old unsaved work"]);
});

test("two review editors keep separate drafts and saving one preserves the other", async () => {
  const { plugin, selection, draft } = makeRecoveryFixture();
  const first = await plugin.loadReviewFinal(selection);
  const second = await plugin.loadReviewFinal(selection);
  assert.notEqual(first.draftId, second.draftId);
  await plugin.queueReviewRecoveryEntry(draft(first, "first editor"));
  await plugin.queueReviewRecoveryEntry(draft(second, "second editor"));
  assert.equal((await plugin.saveReviewFinal(first, { body: "first editor" })).ok, true);
  assert.equal((await plugin.saveReviewFinal(second, { body: "second editor" })).reason, "conflict");
  const store = await plugin.readReviewRecoveryStore();
  assert.deepEqual(Array.from(store.entries[first.targetKey], (entry) => entry.payload.body), ["second editor"]);
});

test("a recovery mutation refuses to overwrite unreadable recovery data", async () => {
  const { plugin, files, selection, draft } = makeRecoveryFixture();
  const model = await plugin.loadReviewFinal(selection);
  const path = plugin.getReviewRecoveryDraftPath();
  files.set(path, "{ damaged but still recoverable manually");
  await assert.rejects(plugin.queueReviewRecoveryEntry(draft(model, "new input")));
  assert.equal(files.get(path), "{ damaged but still recoverable manually");
});

test("saved snapshot cleanup keeps newer input from the same editor", async () => {
  const { plugin, selection, draft } = makeRecoveryFixture();
  const model = await plugin.loadReviewFinal(selection);
  await plugin.queueReviewRecoveryEntry(draft(model, "being saved", 10));
  const originalWrite = plugin.writeTextToVault;
  plugin.writeTextToVault = async (...args) => {
    await plugin.queueReviewRecoveryEntry(draft(model, "typed later", 11));
    return originalWrite(...args);
  };
  assert.equal((await plugin.saveReviewFinal(model, { body: "being saved" })).ok, true);
  const store = await plugin.readReviewRecoveryStore();
  assert.equal(store.entries[model.targetKey][0].payload.body, "typed later");
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
    baseFingerprint: D.readReviewDocument(current, ["Review"]).fingerprint,
    payload: { format: "markdown", body: "## Review\n\nRecovered summary" },
    updatedAt: 10
  });
  plugin.clearReviewRecoveryEntry = async () => { cleared += 1; };

  const model = await plugin.loadReviewFinal({ mode: "daily", anchorDate: "2026-07-14" });
  assert.equal(model.source, "recovery");
  assert.equal(model.recoveryDraft.payload.body, "## Review\n\nRecovered summary");

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
    savedPayload: { format: "markdown", body: "## Review\n\nSaved" }
  };

  const summary = await plugin.getReviewEvidenceSummary(selection, finalModel);
  assert.deepEqual(Array.from(summary.facts, (fact) => fact.id), ["review"]);
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
  plugin.writeReviewPromptFile = async () => ({
    path: ".obsidian/plugins/noria/cache/stats/review/2026/2026.prompt.md"
  });

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
  assert.deepEqual(reads, ["Custom/Periods/2026.md", "Custom/Periods/2026-review-week.md"]);
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

test("home review status recognizes a renamed Markdown review without GDD fields", async () => {
  const plugin = makeAiPlugin({ settings: { managedPaths: { diaryRoot: "06_Diary" } } });
  plugin.ensureReviewCenterUtils = async () => ({ resolveDailyArtifactPath: () => "analysis.md" });
  plugin.ensureDiaryDayBlocks = async () => ({
    normalizeYmd: value => String(value), getDiaryPathForDate: () => "day.md",
    parseSummary: () => "", parseGdd: () => ({})
  });
  plugin.loadTextFromVault = async path => path === "day.md"
    ? "%% noria:review:start %%\n## A small memory\n\nA walk by the river.\n%% noria:review:end %%\n" : "";
  const summary = await plugin.getReviewCenterHomeSummary("2026-09-13");
  assert.equal(summary.status, "finalSaved");
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

  plugin.filesForScope = (scopeId) => scopeId === "tasks" ? files : [];
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
  plugin.filesForScope = (scopeId) => scopeId === "tasks" ? files : [];
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
  assert.match(src, /text:readingBody\(text\)/);
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

  assert.match(main, /MarkdownRenderer\.render/);
  assert.match(fs.readFileSync(pluginPath("src/main.js"), "utf8"), /!artifact\?\.generated/);
  assert.doesNotMatch(main, /text \|\| this\.plugin\.t\("review\.empty"\)/);
  assert.doesNotMatch(main, /noria-review-llm-grid/);
  assert.doesNotMatch(main, /noria-review-llm-card/);
  assert.match(styles, /\.noria-review-llm-preview\b/);
  assert.doesNotMatch(styles, /\.noria-review-llm-grid\b/);
  assert.doesNotMatch(styles, /\.noria-review-llm-card\b/);
});


test("public review preparation returns persisted material and keeps each period and yearly variant separate", async () => {
  const notices=[],plugin=makeAiPlugin({notices}),api=require('../src/public-api.js').createPublicApi(plugin);
  const cache='.obsidian/plugins/noria/cache/stats/review/2026';
  const cases=[['daily',undefined,'2026-10-06'],['weekly',undefined,'2026-W41'],['monthly',undefined,'2026-10'],['yearly','month','2026.month'],['yearly','week','2026.week']];
  const results=[];
  plugin.readReviewPromptTemplate=async()=>'';
  for(const [mode,yearlyVariant,key] of cases){
    const request={mode,anchorDate:'2026-10-06',...(yearlyVariant?{yearlyVariant}:{})};
    plugin.getFullReviewEvidence=async selection=>({mode,period:selection.period,evidenceHash:key,evidencePath:`${cache}/${key}.json`,evidence:{},materialSources:{records:[{path:`Sources/${key}.md`,text:`Record ${key}`}],references:[],reads:[]}});
    plugin.resolveReviewAnalysisArtifactPath=async()=>`Custom/${key}-review.md`;
    const result=await api.reviews.prepare(request);results.push(result);
    assert.equal(result.promptPath,`${cache}/${key}.prompt.md`);
    assert.equal(result.readingPath,`${cache}/${key}.material.json`);
    const saved=plugin.__writes.findLast(item=>item.path===result.readingPath);
    assert.deepEqual(JSON.parse(saved.text),JSON.parse(JSON.stringify(result.material)));
    assert.equal(result.material.payload.records[0].text,`Record ${key}`);
    assert.equal(plugin.__writes.findLast(item=>item.path===result.promptPath).text,result.prompt+'\n');
    assert.ok(result.prompt.includes(result.readingPath));assert.ok(result.prompt.includes(result.artifactPath));
  }
  assert.equal(new Set(results.map(result=>result.promptPath)).size,5);
  assert.equal(plugin.__writes.length,15);assert.ok(plugin.__writes.every(write=>write.path.startsWith(cache+'/')));
  assert.equal(notices.length,0,'external preparation does not display UI toasts');
});
