"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inventory,statisticsItems}=require("../src/inbox-data.js");
function fixture(body) {
  const files=[{path:"Inbox/Idea.md",basename:"Idea",stat:{ctime:100,mtime:200}},{path:"Inbox/Inbox.md",basename:"Inbox",stat:{ctime:50,mtime:300}}];
  const plugin={getManagedPath:()=>"Inbox",filesUnderRoots:()=>files,app:{vault:{getAbstractFileByPath:p=>files.find(f=>f.path===p),read:async()=>body},metadataCache:{getFileCache:()=>({frontmatter:{"inbox-work":"SI：整理","inbox-status":"processing"}})}}};
  return plugin;
}
test("card and statistics share notes and linked entries without counting the list container twice",async()=>{
  const plugin=fixture("## Inbox\n\n- [[Library/Book]] [inbox-work:: 我：阅读]\n- [[Projects/Alpha]]\n");
  const rows=await inventory(plugin),stats=await statisticsItems(plugin);
  assert.equal(rows.length,3);assert.equal(stats.length,3);
  assert.deepEqual(rows.map(r=>r.path),stats.map(r=>r.path));
  assert.equal(stats.filter(r=>r.kind==="entry"&&r.ctime===null).length,2);
  assert.deepEqual(stats.map(r=>r.actor),["我","","SI"]);
  assert.ok(stats.every(r=>!("status" in r)&&!("entry" in r)));
});
test("independent prose in the entry container is kept as a note, and unreadable entries reject rather than report zero",async()=>{
  const plugin=fixture("## Inbox\nMy own notes\n\n- [[Book]]\n");assert.equal((await inventory(plugin)).length,3);
  plugin.app.vault.read=async()=>{throw Error("cannot read");};await assert.rejects(inventory(plugin),/cannot read/);
});
test("new Base uses shared assignment fields and never generates retired stage filters",()=>{
  const {inboxQueueSeed}=require("../src/inbox-seeds.js");const seed=inboxQueueSeed({locale:"zh",root:'My Inbox'});
  for(const label of ["全部","未安排","我","SI"])assert.ok(seed.includes(`name: "${label}"`));
  assert.ok(seed.includes('note.inbox-work'));assert.ok(!/inbox-status|inbox-action|inbox-review/.test(seed));
});
