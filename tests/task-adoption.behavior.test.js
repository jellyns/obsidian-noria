const {test}=require("node:test");
const assert=require("node:assert/strict");
const D=require("../src/task-adoption-document.js");
const T=require("../src/task-document.js");
const {saveTaskEditor}=require("../src/task-editor-writeback.js");
const {normalizeReviewSelection}=require("../src/review-center-core.js");
const citation={label:"来源",link:"[[Diary/2026-W38#想继续的|2026-W38 · 复盘]]",quote:"整理散步照片"};
const target={path:"Project.md",rawText:"- [ ] 整理照片 [due:: 2026-09-20] ^photo"};
function environment(seed){
  const files=new Map(Object.entries(seed)),writes=[];
  return {files,writes,read:async path=>files.get(path)||"",process:async(path,fn)=>{const next=fn(files.get(path)||"");files.set(path,next);writes.push(path);}};
}
test("adoption locates the selected rendered passage without requiring fixed headings",()=>{
  const raw="---\ntitle: 保留\n---\n\n## 自己的编排\n\n整理 **散步照片**，再读 [[Books/河流|河流]]。\n\n# 后续\n完整保留。\n";
  const found=D.locateExcerpt(raw,"整理 散步照片，再读 河流。");
  assert.equal(found.heading,"自己的编排");assert.equal(found.task,undefined);
  assert.equal(raw.slice(found.start,found.end),"整理 **散步照片**，再读 [[Books/河流|河流]]。");
  assert.throws(()=>D.locateExcerpt("~~~\n- [ ] 示例\n~~~\n","示例"),/source-changed/);
});
test("an existing selected task is identified without a duplicate and ambiguous prose is rejected",()=>{
  const found=D.locateExcerpt("## 计划\n- [ ] 整理照片\n","整理照片",{taskSelection:true});
  assert.equal(found.task.text,"- [ ] 整理照片");
  assert.throws(()=>D.locateExcerpt("## 计划\n稍后处理。\n\n稍后处理。\n","稍后处理。"),/ambiguous/);
});
test("linking adds a native Markdown citation and preserves task fields and child content",()=>{
  const raw=target.rawText+"\r\n  - [ ] 子任务\r\n\r\n# 后续\r\n原文。  \r\n";
  const linked=D.attachCitation(raw,target,citation);
  assert.ok(linked.startsWith(target.rawText+"\r\n"));
  assert.ok(linked.endsWith("  - [ ] 子任务\r\n\r\n# 后续\r\n原文。  \r\n"));
  assert.equal(D.taskCitations(linked,target)[0].quote,citation.quote);
  assert.equal(D.attachCitation(linked,target,citation),linked);
  assert.equal(T.parseTaskLine(linked.split("\r\n")[0]).due,"2026-09-20");
});
test("quoted markup round-trips and removing a task removes only its provenance",()=>{
  const raw=target.rawText+"\n  - [ ] 子任务\n";
  const source=D.attachCitation(raw,target,{...citation,quote:"记住 *星号*、[方括号] 和 <文本>"});
  assert.equal(D.taskCitations(source,target)[0].quote,"记住 *星号*、[方括号] 和 <文本>");
  assert.equal(D.removeTaskWithCitations(source,target),"  - [ ] 子任务\n");
});
test("same-day adoption remains locatable after task title and citation repeat the passage",()=>{
  const raw="## 记录\n整理散步照片\n\n## 待办\n\n- [ ] 整理散步照片\n";
  const linked=D.attachCitation(raw,{rawText:"- [ ] 整理散步照片"},citation);
  assert.equal(D.locateExcerpt(linked,"整理散步照片",{taskSelection:false}).heading,"记录");
  assert.equal(D.locateExcerpt(raw+"- [ ] 重复\n- [ ] 重复\n","整理散步照片",{taskSelection:false}).heading,"记录");
});

test("identical prose in record and review stays scoped to the selected workspace",()=>{
  const source="## 记录\n再读一章。\n\n## 复盘\n### 下次试试\n再读一章。\n";
  const range={start:source.indexOf("### 下次试试"),end:source.length};
  assert.equal(D.locateExcerpt(source,"再读一章。",{range}).heading,"下次试试");
  assert.equal(D.locateExcerpt(source,"再读一章。",{excludeRange:range}).heading,"记录");
});

test("reading selection can distinguish identical text under different custom headings",()=>{
  const source="## 周复盘\n\n### 想继续的\n再试一次。\n\n### 想放下的\n再试一次。\n";
  assert.equal(D.locateExcerpt(source,"再试一次。",{heading:"想放下的"}).start,source.lastIndexOf("再试一次。"));
});
test("daily insertion preserves unrelated bytes and stops before later level-one headings",()=>{
  const raw="## 记录\r\n原文。  \r\n\r\n## 待办\r\n\r\n### 今日任务\r\n- [ ] 已有\r\n\r\n# 后续\r\n保留。  \r\n";
  const inserted=D.appendDailyTask(raw,"- [ ] 新任务 [id:: unique]","zh").text;
  assert.ok(inserted.indexOf("新任务")<inserted.indexOf("# 后续"));
  assert.ok(inserted.startsWith("## 记录\r\n原文。  \r\n"));assert.ok(inserted.endsWith("# 后续\r\n保留。  \r\n"));
  const withoutSection="## 自定\n最后的两个空格。  \n";
  assert.ok(D.appendDailyTask(withoutSection,"- [ ] 新任务","zh").text.startsWith(withoutSection));
});
test("creating a task reuses guarded advanced-field saving and leaves dates empty",async()=>{
  const e=environment({"Diary.md":"## 记录\n整理散步照片\n"}),source=e.files.get("Diary.md");
  const create={id:"operation-1",line:"- [ ] 整理散步照片 [id:: operation-1]",seed:"## 计划\n",append:T.appendProjectTask};
  const options={...e,identity:{path:"Project.md"},create,citation,patch:{title:"选出六张照片",priority:"high",tags:"#生活"},today:"2026-09-15"};
  const result=await saveTaskEditor(options);
  assert.equal(e.files.get("Diary.md"),source);
  assert.match(result.rawText,/选出六张照片/);assert.match(result.rawText,/\[priority:: high\]/);
  assert.equal(T.parseTaskLine(result.rawText).start,"");assert.equal(T.parseTaskLine(result.rawText).due,"");
  assert.equal(D.taskCitations(result.text,result).length,1);
  const retried=await saveTaskEditor(options);assert.equal(retried.retried,true);assert.equal(e.writes.length,1);
});
test("new task dependencies commit before creation and roll back if creation fails",async()=>{
  const e=environment({"Before.md":"- [ ] 前置任务\n"});
  const before={path:"Before.md",rawText:"- [ ] 前置任务"};
  const create={id:"new-id",line:"- [ ] 新任务 [id:: new-id]",seed:"",append:T.appendProjectTask};
  await assert.rejects(saveTaskEditor({...e,identity:{path:"New.md"},create,patch:{},dependencies:{before:[before]},createId:()=>"before-id",
    process:async(path,fn)=>{if(path==="New.md")throw Error("disk-failure");return e.process(path,fn);}}),/disk-failure/);
  assert.equal(e.files.get("Before.md"),"- [ ] 前置任务\n");assert.equal(e.files.has("New.md"),false);
});
test("association cannot overwrite a concurrently changed task",async()=>{
  const original=target.rawText+"\n",e=environment({"Project.md":original});
  await assert.rejects(saveTaskEditor({...e,identity:target,patch:{},citation,process:async(path,fn)=>{
    e.files.set(path,original.replace("整理照片","本人修改"));
    return e.process(path,fn);
  }}),/task-changed/);
  assert.equal(e.files.get("Project.md"),original.replace("整理照片","本人修改"));
});

test("back to a historical citation supplies its date as well as its period",async()=>{
  const fs=require("node:fs"),path=require("node:path"),source=fs.readFileSync(path.join(__dirname,"../src/main.js"),"utf8");
  const method=source.slice(source.indexOf("  async openTaskRecordOrigin("),source.indexOf("  async appendTaskToProject("));
  for(const [mode,period,date,format] of [["daily","2003-02-03","2003-02-03","YYYY-MM-DD"],["weekly","2020-W53","2020-12-28","GGGG-[W]WW"],["monthly","2003-02","2003-02-01","YYYY-MM"],["yearly","2003","2003-01-01","YYYY"]]){
    const moment=(value,pattern,strict)=>{assert.equal(value,period);assert.equal(pattern,format);assert.equal(strict,true);return {format:()=>date};};
    const open=new Function("globalThis","citationPath","reviewDocument","return ({"+method+"}).openTaskRecordOrigin")({moment},()=>({path:"Diary.md",subpath:"#自定"}),{});
    let target;
    const plugin={resolveReviewSelection:input=>normalizeReviewSelection(input,{today:"2026-09-15"}),resolveCalendarNoteSpecAsync:async()=>({path:"Diary.md"}),openDiaryInHome:async input=>{target=input;return {};}};
    await open.call(plugin,[{label:period+" · 记录",quote:"原句"}],"Tasks.md");
    assert.equal(target.selection.mode,mode);assert.equal(target.selection.period,period);assert.equal(target.selection.anchorDate,date);
  }
});
