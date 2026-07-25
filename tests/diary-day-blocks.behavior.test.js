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

test("diary inbox entries sort by timestamp and keep legacy entries after timed entries", () => {
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

  assert.match(next, /## Inbox\n\n- \[08:15\] 早间记录\n- \[09:05\] 上午补充\n- \[12:30\] 午间记录\n- 旧格式记录\n/);
});

test("diary inbox append is stable within the same minute", () => {
  const U = loadDiaryBlocks();
  const before = "## Inbox\n\n- [09:05] 第一条\n- [09:05] 第二条\n";
  const next = U.appendDiaryInboxLine(before, "第三条", { now: new Date("2026-05-06T09:05:40") });

  assert.match(next, /- \[09:05\] 第一条\n- \[09:05\] 第二条\n- \[09:05\] 第三条\n/);
});

test("diary inbox append does not duplicate an existing timestamp prefix", () => {
  const U = loadDiaryBlocks();
  const next = U.appendDiaryInboxLine("## Inbox\n\n", "[07:45] 已带时间", { now: new Date("2026-05-06T09:05:00") });

  assert.match(next, /^## Inbox\n\n- \[07:45\] 已带时间\n$/);
});
