const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sourcePath } = require("./source-paths.cjs");

function read(rel) {
  return fs.readFileSync(sourcePath(rel), "utf8");
}

function loadTaskLinePicker() {
  const runtime = read("views/tasks-calendar/runtime-core.js");
  const start = runtime.indexOf("function isTaskLine(line)");
  const end = runtime.indexOf("\nfunction showDebugNotice", start);
  assert.ok(start >= 0 && end > start, "expected task line picker helpers");
  return new Function(`${runtime.slice(start, end)}\nreturn { pickTaskLineIndex };`)();
}

function loadTaskMarkdownProcessor(app) {
  const runtime = read("views/tasks-calendar/runtime-core.js");
  const start = runtime.indexOf("async function processTaskMarkdownFile");
  const end = runtime.indexOf("\nasync function modifyTaskLineByRef", start);
  assert.ok(start >= 0 && end > start, "expected task Markdown transaction helper");
  return new Function("app", `${runtime.slice(start, end)}\nreturn processTaskMarkdownFile;`)(app);
}

test("task editor command is registered without reserving a default hotkey", () => {
  const main = read("src/main.js");

  assert.match(main, /"commands\.editTaskUnderCursor":\s*"Edit or create task at cursor"/);
  assert.match(main, /"commands\.editTaskUnderCursor":\s*"编辑\/创建光标处任务"/);
  assert.match(main, /id:\s*"edit-task-under-cursor"/);
  assert.match(main, /nameKey:\s*"commands\.editTaskUnderCursor"/);
  assert.match(main, /editorCallback:\s*\(editor,\s*ctx\)\s*=>\s*this\.editTaskUnderCursor\(editor,\s*ctx\)/);
  const commandStart = main.indexOf('id: "edit-task-under-cursor"');
  const commandEnd = main.indexOf('id: "open-home-tab"', commandStart);
  assert.doesNotMatch(main.slice(commandStart, commandEnd), /hotkeys\s*:/);

  const registerStart = main.indexOf("registerCoreCommands()");
  const registerEnd = main.indexOf("async focusTodayInTasksBoard", registerStart);
  const registerBody = main.slice(registerStart, registerEnd);
  assert.match(registerBody, /spec\.editorCallback/);
  assert.match(registerBody, /command\.editorCallback/);
  assert.match(registerBody, /command\.callback/);
  assert.match(registerBody, /this\.addCommand\(command\)/);
});

test("task editor command opens the runtime adapter for any current markdown line", () => {
  const main = read("src/main.js");

  assert.match(main, /async editTaskUnderCursor\(editor,\s*ctx\)/);
  assert.match(main, /editor\.getCursor\(\)/);
  assert.match(main, /editor\.getLine\(cursor\.line\)/);
  assert.match(main, /notices\.taskEditor\.noFile/);
  assert.match(main, /await this\.ensureTaskDateTimeEditorApi\(\)/);
  assert.match(main, /openTaskDateTimeEditorFromMarkdownLine/);
  assert.match(main, /filePath:\s*file\.path/);
  assert.match(main, /lineIndex:\s*String\(cursor\.line\)/);
  assert.match(main, /rawLine:\s*rawLine/);
  assert.match(main, /sourceWasTask:\s*this\.isMarkdownTaskLineForEditor\(rawLine\)/);

  const methodStart = main.indexOf("async editTaskUnderCursor(editor, ctx)");
  const methodEnd = main.indexOf("\n  async focusTodayInTasksBoard", methodStart);
  const methodBody = main.slice(methodStart, methodEnd);
  assert.doesNotMatch(methodBody, /notices\.taskEditor\.notTaskLine/);
  assert.doesNotMatch(methodBody, /return;\s*\}\s*const file = this\.resolveEditorCommandFile/);
});

test("tasks calendar runtime exposes markdown-line task editor adapter", () => {
  const runtime = read("views/tasks-calendar/runtime-core.js");

  assert.match(runtime, /function openTaskDateTimeEditorFromMarkdownLine\(payload\)/);
  const adapterStart = runtime.indexOf("function openTaskDateTimeEditorFromMarkdownLine(payload)");
  const adapterEnd = runtime.indexOf("\ntry {\n\tif (typeof globalThis", adapterStart);
  const adapterBody = runtime.slice(adapterStart, adapterEnd);
  assert.doesNotMatch(adapterBody, /!\s*isTaskLine\(rawLine\)/);
  assert.match(adapterBody, /normalizeMarkdownLineToTaskDraft\(rawLine/);
  assert.match(adapterBody, /sourceWasTask/);
  assert.match(runtime, /setAttribute\("data-tc-path",\s*filePath\)/);
  assert.match(runtime, /setAttribute\("data-tc-line",\s*lineIndex\)/);
  assert.match(runtime, /setAttribute\("data-noria-source-was-task",\s*sourceWasTask/);
  assert.match(runtime, /setAttribute\("data-noria-source-raw-line",\s*encodeURIComponent\(rawLine\)\)/);
  assert.match(runtime, /setAttribute\("data-nav-href",\s*filePath\)/);
  assert.match(runtime, /setAttribute\("data-full-text",\s*titleInfo\.title\)/);
  assert.match(runtime, /setAttribute\("data-start-date",\s*startParts\.date/);
  assert.match(runtime, /setAttribute\("data-due-date",\s*dueParts\.date/);
  assert.match(runtime, /openTaskDateTimeEditor\(synthetic,\s*\{\s*returnFocusEl/);
  assert.match(runtime, /__noriaTasksCalendarApi\.openTaskDateTimeEditorFromMarkdownLine = openTaskDateTimeEditorFromMarkdownLine/);
});

test("runtime has a dedicated non-task line conversion save path", () => {
  const runtime = read("views/tasks-calendar/runtime-core.js");

  assert.match(runtime, /function normalizeMarkdownLineToTaskDraft\(rawLine,\s*fallbackTitle\)/);
  assert.match(runtime, /function pickMarkdownLineIndexForConversion\(lines,\s*preferredLine,\s*sourceRawLine\)/);
  assert.match(runtime, /function buildTaskLineFromMarkdownConversion\(lineText,\s*status\)/);

  const saveStart = runtime.indexOf("async function saveTaskDateTimeLines");
  const saveEnd = runtime.indexOf("\nfunction isPlannerChromeActive", saveStart);
  const saveBody = runtime.slice(saveStart, saveEnd);
  assert.match(saveBody, /sourceWasTask/);
  assert.match(saveBody, /pickMarkdownLineIndexForConversion/);
  assert.match(saveBody, /buildTaskLineFromMarkdownConversion/);
  assert.match(saveBody, /pickTaskLineIndex/);
});

test("task line picker never falls back to an unrelated nearby task", () => {
  const { pickTaskLineIndex } = loadTaskLinePicker();
  const lines = [
    "- [ ] 其他任务 A",
    "普通正文",
    "- [ ] 其他任务 B"
  ];

  assert.equal(pickTaskLineIndex(lines, 1, "已移动的原任务", "", "", ""), -1);
});

test("task line picker rejects ambiguous drift but accepts a matching current line", () => {
  const { pickTaskLineIndex } = loadTaskLinePicker();
  const lines = [
    "- [ ] 同名任务 [start:: 2026-06-08]",
    "- [ ] 插入的任务",
    "- [ ] 同名任务 [start:: 2026-06-08]"
  ];

  assert.equal(pickTaskLineIndex(lines, 1, "同名任务", "", "[start:: 2026-06-08]", ""), -1);
  assert.equal(pickTaskLineIndex(lines, 2, "同名任务", "", "[start:: 2026-06-08]", ""), 2);
});

test("task Markdown processor transforms the latest vault text without overwriting concurrent edits", async () => {
  const file = { path: "Tasks.md" };
  let current = "concurrent note\n- [ ] Task";
  let cachedReads = 0;
  let modifies = 0;
  let processCalls = 0;
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      cachedRead: async () => {
        cachedReads += 1;
        return "- [ ] Task";
      },
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
  const processTaskMarkdownFile = loadTaskMarkdownProcessor(app);

  await processTaskMarkdownFile("Tasks.md", (latest) => latest.replace("- [ ] Task", "- [x] Task"));

  assert.equal(processCalls, 1);
  assert.equal(cachedReads, 0);
  assert.equal(modifies, 0);
  assert.equal(current, "concurrent note\n- [x] Task");
});

test("task editor single-file mutations share the latest-text processor", () => {
  const runtime = read("views/tasks-calendar/runtime-core.js");
  const slices = [
    ["async function modifyTaskLineByRef", "\nasync function ensureDependencyRefId"],
    ["async function saveTaskDateTimeLines", "\nfunction isPlannerChromeActive"],
    ["async function removeTaskLine", "\nfunction patchGlobalTaskCompletionFromSave"],
    ["async function setTaskCompletionState", "\nfunction getPendingEditCount"]
  ];

  for (const [startMarker, endMarker] of slices) {
    const start = runtime.indexOf(startMarker);
    const end = runtime.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `expected ${startMarker} body`);
    const body = runtime.slice(start, end);
    assert.match(body, /processTaskMarkdownFile\(/);
    assert.doesNotMatch(body, /vault\.cachedRead|vault\.modify/);
  }
});

test("cross-daily task relocation removes the source transactionally and rolls back its own target append", () => {
  const runtime = read("views/tasks-calendar/runtime-core.js");
  const start = runtime.indexOf("async function saveTaskDateTimeRelocateBetweenDailyNotes");
  const end = runtime.indexOf("\nasync function saveTaskDateTimeLines", start);
  assert.ok(start >= 0 && end > start, "expected cross-daily relocation body");
  const body = runtime.slice(start, end);

  assert.match(body, /var appended = await adapter\.appendTaskLineToDaily/);
  assert.match(body, /processTaskMarkdownFile\(sourceNorm/);
  assert.match(body, /if \(appended && typeof adapter\.removeExactTaskLineFromDaily === "function"\)/);
  assert.doesNotMatch(body, /vault\.cachedRead\(srcFile\)|vault\.modify\(srcFile/);
});

test("conversion mode protects ordinary text from accidental delete", () => {
  const runtime = read("views/tasks-calendar/runtime-core.js");

  const editorStart = runtime.indexOf("function openTaskDateTimeEditor(taskEl, opts)");
  const editorEnd = runtime.indexOf("\nfunction openTaskDateTimeEditorFromMarkdownLine", editorStart);
  const editorBody = runtime.slice(editorStart, editorEnd);
  assert.match(editorBody, /sourceWasTask/);
  assert.match(editorBody, /btnDelete\.disabled = true/);
  assert.match(editorBody, /runtime\.tasksCalendar\.notice\.deleteConversionMode/);
});

test("task editor keeps the primary flow quiet and moves real advanced fields behind disclosure", () => {
  const runtime = read("views/tasks-calendar/runtime-core.js");
  const css = read("views/tasks-calendar/default.css");
  const editorStart = runtime.indexOf("function openTaskDateTimeEditor(taskEl, opts)");
  const editorEnd = runtime.indexOf("\nfunction openTaskDateTimeEditorFromMarkdownLine", editorStart);
  const editorBody = runtime.slice(editorStart, editorEnd);

  assert.match(editorBody, /repeatDepsBlock\s*=\s*document\.createElement\("details"\)/);
  assert.match(editorBody, /advancedSummary\s*=\s*document\.createElement\("summary"\)/);
  assert.match(editorBody, /runtime\.tasksCalendar\.editor\.advanced/);
  assert.match(editorBody, /repeatDepsBlock\.open\s*=\s*!!\(taskAdvanced\.repeat\s*\|\|\s*selectedBeforeRefs\.length\s*\|\|\s*selectedAfterRefs\.length\)/);
  assert.doesNotMatch(editorBody, /onlyFuture(?:Wrap|Input|Text)/);
  assert.doesNotMatch(editorBody, /runtime\.tasksCalendar\.filter\.onlyFutureDates/);
  assert.doesNotMatch(editorBody, /buildDependencyPicker\("Before this"|buildDependencyPicker\("After this"/);
  assert.match(editorBody, /runtime\.tasksCalendar\.editor\.beforeThis/);
  assert.match(editorBody, /runtime\.tasksCalendar\.editor\.afterThis/);

  const block = css.match(/\.tc-planner-te-block\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const priority = css.match(/\.tc-planner-te-priority\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const status = Array.from(css.matchAll(/\.tc-planner-te-status\s*\{[\s\S]*?\n\}/g))
    .map((match) => match[0])
    .find((block) => /grid-template-columns:\s*repeat\(4/.test(block)) || "";
  assert.match(block, /border-radius:\s*0/);
  assert.match(block, /background:\s*transparent/);
  assert.match(block, /border:\s*0/);
  assert.match(priority, /gap:\s*0/);
  assert.match(priority, /border:\s*1px solid/);
  assert.match(status, /gap:\s*0/);
  assert.match(status, /border:\s*1px solid/);
  assert.match(css, /\.tc-planner-te-advanced-summary\s*\{/);
});
