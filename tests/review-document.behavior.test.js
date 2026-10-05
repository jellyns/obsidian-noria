"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/review-document.js");

const begin = "%% noria:review:start %%";
const end = "%% noria:review:end %%";

test("a renamed review binds to its markers and preserves both surrounding sections", () => {
  const before = "---\ntags: [daily]\n---\n\n## 记录\n\n原记录  \n\n";
  const after = "\n# 私人附记\n\n保留  \n";
  const raw = `${before}${begin}\n## 这个月的回看\n\n旧内容\n${end}\n${after}`;
  const doc = D.readReviewDocument(raw, ["月复盘"]);
  assert.equal(doc.markdown, "## 这个月的回看\n\n旧内容");
  const next = "## 想记住的事\n\n正文  \n下一行\n\n## 另一主题\n\n    code  ";
  assert.equal(D.writeReviewDocument(raw, doc, next), `${before}${begin}\n${next}\n${end}\n${after}`);
});

test("first save marks a unique legacy section without swallowing a later parent heading", () => {
  const raw = "## 计划\n\nkeep\n\n## Review\n\nold\n\n# Other\n\nkeep exactly  \n";
  const doc = D.readReviewDocument(raw, ["复盘", "Review"]);
  const next = D.writeReviewDocument(raw, doc, "## My review\n\nnew");
  assert.equal(next, `## 计划\n\nkeep\n\n${begin}\n## My review\n\nnew\n${end}\n\n# Other\n\nkeep exactly  \n`);
  assert.equal(D.writeReviewDocument(next, D.readReviewDocument(next, ["Review"]), "## My review\n\nnew"), next);
});

test("marker and heading examples in metadata, comments, indented or fenced code cannot bind", () => {
  const prefix = `---\n## Review\n---\n\n\`\`\`\`md\n${begin}\n## Review\n${end}\n\`\`\`\`\n\n    ${begin}\n    ## Review\n    ${end}\n\n%%\n## Review\n%%\n\n<!--\n${begin}\n## Review\n${end}\n-->\n\n`;
  const doc = D.readReviewDocument(prefix + "## Review\n\nreal\n", ["Review"]);
  assert.equal(doc.markdown, "## Review\n\nreal");
  assert.ok(D.writeReviewDocument(prefix + "## Review\n\nreal\n", doc, "## Review\n\nnew").startsWith(prefix));
});

test("broken or duplicate range markers and ambiguous legacy headings refuse writes", () => {
  for (const raw of [`${begin}\nbody`, `${end}\nbody`, `${end}\n${begin}`, `${begin}\n${begin}\n${end}`, "## Review\n\na\n\n## Review\n\nb"]) {
    assert.throws(() => D.readReviewDocument(raw, ["Review"]), { code: "review-range" });
  }
  const raw = `${begin}\n## Review\n\nold\n${end}\n`;
  const doc = D.readReviewDocument(raw, ["Review"]);
  assert.throws(() => D.writeReviewDocument("## Review\n\nold\n", doc, "new"), { code: "review-range" });
});

test("source edits are detected even when the body stayed equal and only the title changed", () => {
  const raw = `${begin}\n## Review\n\nbody\n${end}`;
  const doc = D.readReviewDocument(raw, ["Review"]);
  assert.throws(() => D.writeReviewDocument(raw.replace("## Review", "## Changed"), doc, "new"), { code: "review-conflict" });
  assert.equal(D.readReviewDocument(raw.replaceAll("\n", "\r\n"), ["Review"]).markdown, doc.markdown);
});

test("sections follow actual hierarchy and retain preamble, duplicates and fenced headings", () => {
  const raw = "## 周末回看\n\n前言。\n\n### 阅读\n\n书里的句子。\n\n#### 摘录\n\n引用。\n\n### 阅读\n\n另一本。\n\n```md\n## Example\n```";
  const sections = D.splitReviewSections(raw);
  assert.deepEqual(sections.map(s => s.title), ["", "阅读", "阅读"]);
  assert.match(sections[1].markdown, /#### 摘录/);
  assert.match(sections[2].markdown, /## Example/);
  const changed = D.replaceReviewPart(raw, sections[2], "### 散步\n\n回来了。");
  assert.ok(changed.startsWith(raw.slice(0, sections[2].start)));
  assert.match(changed, /### 阅读/);
  assert.match(changed, /### 散步/);
  assert.equal(D.splitReviewSections("只写两句。\n\n也很好。").length, 1);
});

test("preview boundaries preserve complete blocks, never an unterminated code fence", () => {
  const raw = "第一段。\n\n第二段。\n\n```js\n" + "const sample = true;\n".repeat(40) + "```\n\n末段。";
  const preview = D.previewReviewPart(raw, 70);
  assert.equal(preview.markdown, "第一段。\n\n第二段。");
  assert.equal(preview.truncated, true);
  assert.equal(D.previewReviewPart("短句。", 70).truncated, false);
  const longBlock = "```js\n" + "const sample = true;\n".repeat(40) + "```";
  assert.deepEqual(D.previewReviewPart(longBlock, 70), { markdown: "", truncated: true });
});

test("legacy recovery fields retain custom sections and explicit none, without inserting empty GDD fields", () => {
  const source = "## Review\n\n### Summary\n\nold\n\n### GDD\n\n- Highlight: old\n- Deviation:\n- Blocker:\n\n### Custom\n\n    keep  ";
  const p = D.normalizeReviewPayload({ summary: "new  ", gdd: { hi: "none" }, gratitude: "", thought: "" }, "Review", source);
  assert.equal(p.format, "markdown");
  assert.match(p.body, /new  /);
  assert.match(p.body, /Highlight: none/);
  assert.doesNotMatch(p.body, /Deviation:|Blocker:/);
  assert.match(p.body, /### Custom\n\n    keep  /);
  assert.deepEqual(D.normalizeReviewPayload(p, "Review"), p);
});
test("unfinished fences and comments cannot hide the saved range end", () => {
  const source = "## Review\n\nold\n\n# Outside\nkeep";
  const binding = D.readReviewDocument(source, ["Review"]);
  for (const body of ["## Review\n\n```js\nunfinished", "## Review\n\n%% unfinished", "## Review\n\n<!-- unfinished"]) {
    assert.throws(() => D.writeReviewDocument(source, binding, body), { code: "review-range" });
  }
});

test("analysis adoption appends selected real sections and preserves the current draft", () => {
  const artifact = "---\nmode: monthly\n---\n# Analysis\n\n## A useful observation\n\nText\n\n### Detail\n\nMore\n\n## Another\n\nLater";
  const parts = D.getReviewAnalysisSections(artifact);
  assert.equal(parts.length, 2);
  const original = "## My review\n\nUnsubmitted words.  \nNext line";
  const result = D.appendReviewAnalysis(original, parts[0]);
  assert.ok(result.startsWith(original + "\n\n"));
  assert.match(result, /### A useful observation\n\nText\n\n#### Detail/);
  assert.doesNotMatch(result, /Another|mode: monthly/);
});

test("preview disables executable fences and note transclusion while retaining images", () => {
  const source = "```noria\n{}\n````\n\n> ```dataviewjs\n> await write()\n> ```\n\n![[Other note#Part]]\n![[photo.png|320]]";
  const preview = D.prepareReviewPreview(source);
  assert.doesNotMatch(preview, /```noria|```dataviewjs|!\[\[Other note/);
  assert.match(preview, /!\[\[photo.png\|320\]\]/);
  assert.match(preview, /\[\[Other note#Part\]\]/);
});

test("empty outlines and legacy view configuration do not count as a written review", () => {
  const body = "## Review\n\n### GDD\n\n- Highlight:\n- Deviation:\n- Blocker:\n\n### Old view\n\n```noria-view\n{\"view\":\"focusPanel\"}\n````";
  assert.equal(D.hasReviewContent(body), false);
  assert.equal(D.hasReviewContent(body + "\n\nOne thing worth remembering."), true);
});

test("a partial legacy draft cannot erase saved fields it never supplied", () => {
  const source = "## Review\n\n### Summary\n\nSaved summary.\n\n### Gratitude\n\nSaved gratitude.\n\n### Free writing\n\nSaved thought.";
  const result = D.normalizeReviewPayload({ summary: "Changed summary." }, "Review", source);
  assert.match(result.body, /Changed summary/);
  assert.match(result.body, /Saved gratitude/);
  assert.match(result.body, /Saved thought/);
});
test("legacy capture before an explicit review heading stays outside the review presentation",()=>{
  const {reviewPresentation}=require("../src/review-document.js");
  const source="- [11:51] a capture\n\n## 复盘\n\nConfirmed result";
  const split=reviewPresentation(source,"复盘");assert.equal(split.leading,"- [11:51] a capture\n\n");assert.equal(split.review,"## 复盘\n\nConfirmed result");assert.equal(split.leading+split.review,source);
  const ambiguous="## 复盘\nA\n## 复盘\nB";assert.equal(reviewPresentation(ambiguous,"复盘").review,ambiguous);
});
