"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeReviewSelection,
  reviewTargetKey,
  createReviewGenerationGate,
  fingerprintReviewSection,
  extractReviewSection,
  upsertReviewSection,
  normalizeRecoveryEntry
} = require("../src/review-center-core.js");

test("review selection normalizes modes and resolved periods", () => {
  const fallback = normalizeReviewSelection({
    mode: "unknown",
    anchorDate: "2026-07-14",
    period: "2026-W29"
  });
  assert.deepEqual(fallback, {
    mode: "daily",
    anchorDate: "2026-07-14",
    period: "2026-07-14",
    yearlyVariant: "month",
    generation: 0
  });

  assert.equal(normalizeReviewSelection({
    mode: "weekly",
    anchorDate: "2026-07-14",
    period: "2026-W29"
  }).period, "2026-W29");
  assert.equal(normalizeReviewSelection({
    mode: "monthly",
    anchorDate: "2026-07-14",
    period: "2026-07"
  }).period, "2026-07");
  assert.equal(normalizeReviewSelection({
    mode: "yearly",
    anchorDate: "2026-07-14",
    period: "2026"
  }).period, "2026");
});

test("yearly review variants share one final target key", () => {
  const month = normalizeReviewSelection({
    mode: "yearly",
    anchorDate: "2026-07-14",
    period: "2026",
    yearlyVariant: "month"
  });
  const week = normalizeReviewSelection({
    mode: "yearly",
    anchorDate: "2026-07-14",
    period: "2026",
    yearlyVariant: "week"
  });

  assert.equal(reviewTargetKey(month), "yearly:2026");
  assert.equal(reviewTargetKey(week), "yearly:2026");
});

test("generation gate rejects stale async tokens", () => {
  const gate = createReviewGenerationGate();
  const first = gate.issue();
  const second = gate.issue();

  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.current(), second);
});

test("review section extraction matches only the requested level-two section", () => {
  const markdown = [
    "---",
    "type: weekly",
    "---",
    "",
    "## 周复盘",
    "",
    "weekly body",
    "",
    "### 周内细节",
    "",
    "detail",
    "",
    "## 月复盘",
    "",
    "monthly body"
  ].join("\n");

  const section = extractReviewSection(markdown, "周复盘");
  assert.equal(section.exists, true);
  assert.equal(section.body, "weekly body\n\n### 周内细节\n\ndetail");
  assert.doesNotMatch(section.body, /monthly body/);
  assert.equal(extractReviewSection(markdown, "年复盘").exists, false);
});

test("review section upsert preserves frontmatter and unrelated sections", () => {
  const markdown = [
    "---",
    "type: weekly",
    "owner: noria",
    "---",
    "",
    "# 2026-W29",
    "",
    "## 计划",
    "",
    "keep plan",
    "",
    "## 周复盘",
    "",
    "old review",
    "",
    "## 备注",
    "",
    "keep note"
  ].join("\n");

  const result = upsertReviewSection(markdown, "周复盘", "new review\n\n- next");
  assert.equal(result.existed, true);
  assert.equal(result.previousBody, "old review");
  assert.match(result.markdown, /^---\ntype: weekly\nowner: noria\n---/);
  assert.match(result.markdown, /## 计划\n\nkeep plan/);
  assert.match(result.markdown, /## 周复盘\n\nnew review\n\n- next/);
  assert.match(result.markdown, /## 备注\n\nkeep note/);
  assert.doesNotMatch(result.markdown, /old review/);
});

test("review section upsert appends a missing section without changing existing content", () => {
  const result = upsertReviewSection("# 2026-W29\n\n## 计划\n\nkeep plan\n", "周复盘", "new review");

  assert.equal(result.existed, false);
  assert.equal(result.previousBody, "");
  assert.match(result.markdown, /^# 2026-W29\n\n## 计划\n\nkeep plan/);
  assert.match(result.markdown, /\n\n## 周复盘\n\nnew review\n$/);
});

test("review fingerprints normalize line endings and trailing whitespace only", () => {
  const first = fingerprintReviewSection("Summary  \r\n\r\n- next\t\r\n");
  const equivalent = fingerprintReviewSection("Summary\n\n- next");
  const edited = fingerprintReviewSection("Summary changed\n\n- next");

  assert.equal(first, equivalent);
  assert.notEqual(first, edited);
});

test("recovery entry validation rejects incompatible or incomplete entries", () => {
  const valid = {
    schemaVersion: 1,
    targetKey: "daily:2026-07-14",
    targetPath: "06_Diary/2026/2026-07-14.md",
    baseFingerprint: "review-v1-abc",
    payload: { summary: "Recovered summary" },
    updatedAt: 123
  };

  assert.deepEqual(normalizeRecoveryEntry(valid, valid.targetKey), valid);
  assert.equal(normalizeRecoveryEntry({ ...valid, schemaVersion: 2 }, valid.targetKey), null);
  assert.equal(normalizeRecoveryEntry({ ...valid, targetKey: "daily:2026-07-13" }, valid.targetKey), null);
  assert.equal(normalizeRecoveryEntry({ ...valid, payload: null }, valid.targetKey), null);
});
