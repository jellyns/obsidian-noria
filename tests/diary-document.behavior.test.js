const test = require("node:test");
const assert = require("node:assert/strict");
const { DiaryDocumentStore, splitDateMarkdown } = require("../src/diary-document.js");

function fixture(initial) {
  const files = new Map(initial === undefined ? [] : [["Custom/2097-09-12.md", initial]]);
  const drafts = new Map();
  const plugin = {
    resolveReviewSelection: s => ({mode: "daily", anchorDate: "2097-09-12", period: "2097-09-12", ...s}),
    resolveCalendarNoteSpecAsync: async (period, date) => ({period, date, periodId: date, path: `Custom/${date}.md`}),
    app: {vault: {getAbstractFileByPath: path => files.has(path) ? {path} : null}},
    loadTextFromVault: async path => files.get(path) || "",
    buildCalendarNoteContent: async () => "---\ncssclasses: [daily-clean]\n---\n\n## 记录\n\n",
    loadReviewRecoveryEntry: async key => drafts.get(key),
    queueReviewRecoveryEntry: async entry => {drafts.set(entry.targetKey, entry);},
    clearReviewRecoveryEntry: async key => {drafts.delete(key);},
    processTextAtVaultPath: async (path, transform) => { const text = transform(files.get(path) || ""); files.set(path, text); },
    requestNoriaRefresh() {}
  };
  return {files, drafts, plugin, store: new DiaryDocumentStore(plugin)};
}

test("date document retains frontmatter, CRLF, hard breaks and arbitrary headings", async () => {
  const raw = "---\r\ncssclasses: [daily-clean, custom]\r\nunknown: kept\r\n---\r\n\r\n## 随手写\r\n\r\n第一行  \r\n第二行\r\n";
  const f = fixture(raw), model = await f.store.load({});
  assert.equal(model.body, "\r\n## 随手写\r\n\r\n第一行  \r\n第二行\r\n");
  await f.store.save(model, model.body + "\n    缩进\n");
  assert.equal(f.files.get(model.path), raw + "\r\n    缩进\r\n");
  assert.equal(splitDateMarkdown("## 记录\n正文").prefix, "");
});

test("browsing a missing date and saving its recovery draft creates no date file", async () => {
  const f = fixture(), model = await f.store.load({});
  assert.equal(f.files.size, 0);
  await f.store.preserve(model, "## 记录\n未写完");
  assert.equal(f.files.size, 0);
  const recovered = await f.store.load({});
  assert.equal(recovered.recoveryDraft.payload.body, "## 记录\n未写完");
  await f.store.save(recovered, recovered.recoveryDraft.payload.body);
  assert.match(f.files.get(model.path), /cssclasses: \[daily-clean\][\s\S]*未写完/);
  assert.equal(f.drafts.size, 0);
});

test("date save rejects external changes and preserves the user's draft", async () => {
  const f = fixture("## 记录\n原文\n"), model = await f.store.load({});
  await f.store.preserve(model, "## 记录\n本地修改");
  f.files.set(model.path, "## 记录\n外部修改\n");
  await assert.rejects(f.store.save(model, "## 记录\n本地修改"), {code: "diary-conflict"});
  assert.equal(f.files.get(model.path), "## 记录\n外部修改\n");
  const latest = await f.store.load({});
  assert.equal(latest.recoveryDraft, null);
  assert.equal(latest.preservedDrafts.length, 1);
});

test("changed calendar settings cannot send an old editor to a new file", async () => {
  const f = fixture("## 记录\n"), model = await f.store.load({});
  f.plugin.resolveCalendarNoteSpecAsync = async () => ({path: "Elsewhere/new.md"});
  await assert.rejects(f.store.save(model, "修改"), {code: "diary-target"});
  assert.equal(f.files.size, 1);
});

test("a saved review can coexist with an unsaved record draft without overwriting either", async () => {
  const oldReview="%% noria:review:start %%\n## 回顾\n旧总结\n%% noria:review:end %%\n";
  const newReview=oldReview.replace("旧总结","新总结");
  const raw="## 记录\n原文  \n下一行\n\n"+oldReview+"\n## 附记\n保留\n";
  const f=fixture(raw),model=await f.store.load({});
  f.files.set(model.path,raw.replace(oldReview,newReview));
  const next=await f.store.save(model,model.body.replace("原文","草稿"));
  assert.equal(next.raw,raw.replace("原文","草稿").replace(oldReview,newReview));
  const both=await f.store.load({});
  f.files.set(model.path,next.raw.replace("新总结","另一窗口的总结"));
  await assert.rejects(f.store.save(both,both.body.replace("新总结","本地也改了总结")),{code:"diary-conflict"});
});

test("own habit and task writes rebase a draft without suppressing true conflicts",async()=>{
  const raw="## 记录\n原文  \n\n## 习惯记录\n- [ ] 阅读 #habit [due:: 2097-09-12]\n";
  const f=fixture(raw),model=await f.store.load({});
  let result={path:model.path,previousText:raw,text:raw.replace("[ ]","[x]")};
  const body=model.body.replace("原文","新增段落");
  const rebased=f.store.rebaseKnownWrite(model,body,result);
  assert.match(rebased.body,/新增段落/);assert.match(rebased.body,/- \[x\] 阅读/);
  f.files.set(model.path,result.text);await f.store.save(rebased.model,rebased.body);
  assert.match(f.files.get(model.path),/新增段落/);
  assert.equal(f.store.rebaseKnownWrite(model,body.replace("阅读","修改了这一项"),result),null);
  assert.equal(f.store.rebaseKnownWrite(model,body,{...result,previousText:raw+"外部修改"}),null);
});

test("first habit creation retains an unsaved note without duplicating its template",async()=>{
  const f=fixture(),model=await f.store.load({});
  const seed=model.prefix+model.body,added="## 习惯记录\n- [x] 阅读 #habit [due:: 2097-09-12]\n";
  const rebased=f.store.rebaseKnownWrite(model,model.body+"我的初稿\n",{path:model.path,previousText:"",text:seed+added});
  assert.ok(rebased.body.includes("我的初稿"));assert.equal((rebased.body.match(/## 记录/g)||[]).length,1);
  f.files.set(model.path,seed+added);await f.store.save(rebased.model,rebased.body);
  assert.match(f.files.get(model.path),/我的初稿/);
});

test("undoing all edits removes only the session's resolved recovery copies", async () => {
  const f = fixture("## 记录\n原文\n"), model = await f.store.load({});
  await f.store.preserve(model, model.body + "稍后撤销");
  let selectors;
  const clear = f.plugin.clearReviewRecoveryEntry;
  f.plugin.clearReviewRecoveryEntry = async (key, entries) => {selectors = entries; await clear(key);};
  await f.store.preserve(model, model.body);
  assert.equal((await f.store.load({})).recoveryDraft, null);
  assert.deepEqual(selectors.map(d => d.draftId), [model.draftId]);
  await f.store.preserve(model, model.body + "关闭后恢复");
  const recovered = await f.store.load({});
  await f.store.preserve(recovered, recovered.body);
  assert.equal((await f.store.load({})).recoveryDraft, null);
  assert.deepEqual(selectors.map(d => d.draftId), [recovered.draftId, model.draftId]);
});
