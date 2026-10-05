const test=require("node:test"),assert=require("node:assert/strict");
const {parseTaskLine,editTaskDocument,appendProjectTask}=require("../src/task-document.js");
const edit=(source,rawText,patch)=>editTaskDocument(source,{rawText},patch,"2099-01-02");
test("title-only edits keep an undated task undated and preserve source Markdown",()=>{
  const raw="  - [ ] Read [[Notes|notes]] #read [custom:: [[Book]]] ^stable  ";
  const source="---\r\nx: 1\r\n---\r\n"+raw+"\r\nAfter  \r\n";
  const r=edit(source,raw,{title:"Read two chapters"});
  assert.equal(r.text,source.replace("Read [[Notes|notes]]","Read two chapters"));
  assert.equal(parseTaskLine(r.rawText).start,"");assert.equal(parseTaskLine(r.rawText).due,"");
});
test("single dates and date-only tasks are not completed into a range",()=>{
  const raw="- [ ] Prepare [due:: 2099-01-10]";
  assert.equal(edit(raw,raw,{title:"Prepare slides"}).text,"- [ ] Prepare slides [due:: 2099-01-10]");
  assert.equal(edit("- [ ] Read","- [ ] Read",{scheduled:"2099-01-05"}).text,"- [ ] Read [scheduled:: 2099-01-05]");
});
test("clearing a date retains all other fields and block identity",()=>{
  const raw="- [ ] Read 🛫 2099-01-01 📅 2099-01-10 #tag ^stable  ";
  assert.equal(edit(raw,raw,{start:""}).text,"- [ ] Read  📅 2099-01-10 #tag ^stable  ");
});
test("task moves are found, ambiguous and externally edited tasks are rejected",()=>{
  const raw="- [ ] Read";
  assert.equal(edit("New paragraph\n"+raw,raw,{title:"Read more"}).line,1);
  assert.throws(()=>edit(raw+"\n"+raw,raw,{title:"Wrong"}),/ambiguous/);
  assert.throws(()=>edit("- [ ] Read changed",raw,{title:"Wrong"}),/not-found/);
});
test("code examples and comments cannot receive task edits",()=>{
  const source="```md\n- [ ] Read\n```\n%%\n- [ ] Read\n%%\n- [ ] Read\n";
  assert.equal(edit(source,"- [ ] Read",{title:"Read more"}).text,source.replace(/Read\n$/,"Read more\n"));
});
test("completion and reopen preserve line suffixes",()=>{
  const raw="- [/] Read [custom:: retain] ^block  ",done=edit(raw,raw,{status:"done"}).rawText;
  assert.equal(done,"- [x] Read [custom:: retain] [completion:: 2099-01-02] ^block  ");
  assert.equal(parseTaskLine(edit(done,done,{status:"todo"}).rawText).completion,"");
});
test("task insertion uses the existing section and does not cross a level-one heading",()=>{
  const source="## 任务\r\n\r\n- [ ] Existing\r\n\r\n# Appendix\r\nText  \r\n";
  assert.equal(appendProjectTask(source,"- [ ] Next").text,"## 任务\r\n\r\n- [ ] Existing\r\n\r\n- [ ] Next\r\n\r\n# Appendix\r\nText  \r\n");
  assert.throws(()=>appendProjectTask("## 任务\n\n## Tasks\n","- [ ] Next"),/ambiguous/);
});
test("invalid dates do not modify a task",()=>{
  assert.throws(()=>edit("- [ ] Read","- [ ] Read",{due:"2099-02-31"}),/invalid-date/);
});
test("advanced edits preserve unrelated metadata, links, block IDs and spacing",()=>{
  const raw="  - [ ] Read [[Book]] #old [priority:: high] [repeat:: every week] [onCompletion:: keep] [custom:: [[X]]] ^id  ";
  const changed=edit(raw,raw,{tags:"#reading #life",priority:"low",repeat:"every month"}).rawText;
  assert.equal(changed,"  - [ ] Read [[Book]] #reading #life [priority:: low] [repeat:: every month] [onCompletion:: keep] [custom:: [[X]]] ^id  ");
  assert.equal(parseTaskLine(changed).repeat,"every month");
});
test("emoji fields can be edited independently without consuming adjacent metadata",()=>{
  const raw="- [ ] Read ⏫ 🔁 every week 🆔 abc123 ⛔ xyz123 ➕ 2099-01-01 ✅ 2099-01-02 #read ^block";
  const p=parseTaskLine(raw);
  assert.equal(p.repeat,"every week");assert.equal(p.id,"abc123");assert.equal(p.dependsOn,"xyz123");
  const r=edit(raw,raw,{priority:"normal",repeat:"",created:"2099-01-03"}).rawText;
  assert.ok(r.includes("🆔 abc123 ⛔ xyz123 [created:: 2099-01-03] ✅ 2099-01-02 #read ^block"));
});
test("explicit completion date wins over the status default and no-op retains it",()=>{
  const raw="- [ ] Read [custom:: keep]";
  const r=edit(raw,raw,{status:"done",completion:"2099-01-01 15:30"}).rawText;
  assert.equal(r,"- [x] Read [custom:: keep] [completion:: 2099-01-01 15:30]");
  assert.equal(edit(r,r,{title:"Read",completion:"2099-01-01 15:30"}).rawText,r);
});
test("external status changes and reversed time ranges cannot be overwritten",()=>{
  assert.throws(()=>edit("- [x] Read","- [ ] Read",{title:"Read more"}),/task-changed/);
  assert.throws(()=>edit("- [ ] Read","- [ ] Read",{start:"2099-01-05 16:00",due:"2099-01-05 15:00"}),/end-before-start/);
});
test("comments and custom fields survive title edits",()=>{
  const line="- [ ] Read %%private%% [进度:: 2] <!-- keep -->";
  assert.equal(edit(line,line,{title:"Read more"}).text,line.replace("Read","Read more"));
});
test("nested list tasks can be edited while indented and nested fenced examples stay untouched",()=>{
  const task="    - [ ] Read";
  const source="- Reading\n"+task+"\n\nA paragraph\n\n    - [ ] Read\n\n- Examples\n    ```md\n    - [ ] Read\n    ```\n";
  assert.equal(edit(source,task,{title:"Read more"}).text,source.replace(task,"    - [ ] Read more"));
  assert.throws(()=>edit("    - [ ] Read",task,{title:"Wrong"}),/not-found/);
});
