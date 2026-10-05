const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { sourcePath } = require("./source-paths.cjs");

function pluginPath(...parts) {
  return sourcePath(path.join(...parts).replace(/\\/g, "/"));
}

function loadDiaryBlocks() {
  const code = fs.readFileSync(pluginPath("views/dashboard/core/utils/diary-day-blocks.js"), "utf8");
  const context = { console, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "views/dashboard/core/utils/diary-day-blocks.js" });
  return context.dashboardCore.utils.diaryDayBlocks;
}

test("diary inbox append adds minute timestamp", () => {
  const U = loadDiaryBlocks();
  const next = U.appendDiaryInboxLine("## Inbox\n\n", "捕获一条想法", { now: new Date("2026-05-06T09:05:00") });

  assert.match(next, /^## Inbox\n\n- \[09:05\] 捕获一条想法\n$/);
});

test("diary inbox reading is chronological while appending preserves the existing source", () => {
  const U = loadDiaryBlocks();
  const before = [
    "## Inbox",
    "",
    "- [12:30] 午间记录",
    "- 旧格式记录",
    "- [08:15] 早间记录",
    ""
  ].join("\n");
  const next = U.appendDiaryInboxLine(before, "上午补充", { now: new Date("2026-05-06T09:05:00") });

  assert.ok(next.startsWith(before));
  assert.deepEqual(Array.from(U.parseDiaryInboxEntries(next),e=>e.text),["早间记录","上午补充","午间记录","旧格式记录"]);
});

test("diary inbox append is stable within the same minute", () => {
  const U = loadDiaryBlocks();
  const before = "## Inbox\n\n- [09:05] 第一条\n- [09:05] 第二条\n";
  const next = U.appendDiaryInboxLine(before, "第三条", { now: new Date("2026-05-06T09:05:40") });

  assert.deepEqual(Array.from(U.parseDiaryInboxEntries(next),e=>e.text),["第一条","第二条","第三条"]);
});

test("capture preserves paragraphs, nested lists, fenced examples and real section boundaries", () => {
  const U=loadDiaryBlocks(), before="## Inbox\n\n- [08:00] 已有记录\n  第一段\n\n  ```md\n  ## 示例标题\n  - 示例列表\n  ```\n\n### 其他资料\n这段不属于随手记。\n\n# 后续正文\n保留。\n";
  const note="一段 [[材料]]\n\n第二段\n  - 内部清单\n    继续说明";
  const next=U.appendDiaryInboxLine(before,note,{now:new Date("2026-05-06T09:00:00")});
  assert.ok(next.endsWith("### 其他资料\n这段不属于随手记。\n\n# 后续正文\n保留。\n"));
  const entries=U.parseDiaryInboxEntries(next);
  assert.equal(entries.length,2);
  assert.equal(entries[1].text,note);
  assert.ok(entries[0].text.includes("```md\n## 示例标题\n- 示例列表\n```"));
  assert.equal(next.slice(entries[1].start,entries[1].end).trimEnd(),entries[1].line);
});
test("historical capture remains untimed, CRLF and pre-existing prose stay intact", () => {
  const U=loadDiaryBlocks(), before="## Inbox\r\n\r\n原有说明。\r\n\r\n## 想法\r\n保持。\r\n";
  const next=U.appendDiaryInboxLine(before,"    缩进原文\n下一行",{includeTime:false});
  assert.ok(next.includes("-     缩进原文\r\n  下一行\r\n"));
  assert.equal(U.parseDiaryInboxEntries(next)[0].time,"");
  assert.equal(U.parseDiaryInboxEntries(next)[0].text,"    缩进原文\n下一行");
  assert.ok(!/(?<!\r)\n/.test(next));
  assert.ok(next.endsWith("## 想法\r\n保持。\r\n"));
});

test("diary inbox append does not duplicate an existing timestamp prefix", () => {
  const U = loadDiaryBlocks();
  const next = U.appendDiaryInboxLine("## Inbox\n\n", "[07:45] 已带时间", { now: new Date("2026-05-06T09:05:00") });

  assert.match(next, /^## Inbox\n\n- \[07:45\] 已带时间\n$/);
});
