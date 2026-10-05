const test=require("node:test"),assert=require("node:assert/strict");
const {activityBody,taskActivities,fileActivities,loadActivityPage}=require("../src/activity-model.js");
const {createActivityReader}=require("../src/activity-model.js");
const range={start:"2026-09-01",end:"2026-09-30"};
test("activity records retain prose and captures but exclude review, task rows and nested task details",()=>{
  const raw="---\nprivate: value\n---\n## 记录\nNarrative\n- [ ] task\n  private task details\n\n## Inbox\n- [12:10] Capture\n\n%% noria:review:start %%\nLegacy capture\n\n## 复盘\nConfirmed result\n%% noria:review:end %%\n";
  const body=activityBody(raw,"复盘");assert.match(body,/Narrative/);assert.match(body,/Capture/);assert.match(body,/Legacy capture/);assert.doesNotMatch(body,/private|Confirmed result|\[ \]/);
  assert.equal(activityBody("## 记录\n\n## Inbox\n","复盘"),"");
});
test("code examples are not removed as task records and ambiguous review boundaries fail closed",()=>{
  assert.match(activityBody("## 记录\n```md\n- [ ] example\n```","复盘"),/example/);
  assert.throws(()=>activityBody("%% noria:review:start %%\nambiguous","复盘"),/range/);
});
test("task activities use explicit creation and completion dates, never planned dates or file timestamps",()=>{
  const task={path:"Tasks.md",line:4,text:"Read [created:: 2026-09-02]",completed:true,completion:"2026-09-05"};
  const events=taskActivities([task,task,{path:"Tasks.md",line:5,text:"Plan",due:"2026-09-03",completed:true},{path:"Tasks.md",line:6,text:"#habit Drink [created:: 2026-09-02]"},{path:"Tasks.md",line:7,text:"Future [created:: 2026-09-29]"}],range,"2026-09-22");
  assert.deepEqual(events.map(e=>[e.kind,e.date]),[["task-created","2026-09-02"],["task-done","2026-09-05"]]);
  assert.ok(events.every(e=>e.time===undefined));
});
test("file activity has only one last-modified event and is off unless explicitly enabled",()=>{
  const file={path:"A.md",basename:"A",stat:{ctime:Date.parse("2026-09-01T12:00:00Z"),mtime:Date.parse("2026-09-03T12:00:00Z")}},date=d=>d.toISOString().slice(0,10);
  assert.deepEqual(fileActivities([file],range,{},date,"2026-09-22"),[]);
  const events=fileActivities([file,file],range,{mtime:true},date,"2026-09-22");assert.equal(events.length,1);assert.equal(events[0].kind,"note-modified");assert.equal(events[0].date,"2026-09-03");
});
function plugin(){
  const reads=[],files=new Map(Array.from({length:20},(_,i)=>[`Diary/2026-09-${String(i+1).padStart(2,"0")}.md`,`## 记录\nNote ${i+1}`]));
  return {reads,files,getLocalYmd:()=>"2026-09-22",getCalendarSettings:()=>({}),resolveCalendarNoteSpec:(_mode,date)=>({path:`Diary/${date}.md`}),app:{vault:{getAbstractFileByPath:path=>files.has(path)?{path}:null}},loadTextFromVault:async path=>{reads.push(path);return files.get(path)||"";},getReviewFinalSectionHeading:()=>"复盘",getRuntimeTaskRows:async()=>[],filesUnderRoots:()=>assert.fail("No vault scan when file activity is disabled")};
}
test("ascending source pages merge task-only dates and never reread an earlier page",async()=>{
  const p=plugin(),reader=await createActivityReader(p,{range,config:{tasks:false},order:"asc",includeDates:["2026-09-25"]});
  assert.equal(p.reads.length,0);
  const a=await reader.next(7);assert.equal(p.reads.length,7);assert.equal(a.through,"2026-09-07");assert.equal(a.groups[0].date,"2026-09-01");
  const b=await reader.next(7);assert.equal(p.reads.length,14);assert.equal(b.through,"2026-09-14");
  const c=await reader.next(7);assert.equal(p.reads.length,20);assert.equal(c.through,"2026-09-25");assert.equal(c.hasMore,false);
  assert.equal(new Set(p.reads).size,p.reads.length);assert.equal((await reader.next()).groups.length,0);
});
test("cancelled source reading stops before the next note",async()=>{
  const p=plugin(),controller=new AbortController(),read=p.loadTextFromVault;
  p.loadTextFromVault=async path=>{const value=await read(path);controller.abort();return value;};
  const reader=await createActivityReader(p,{range,config:{tasks:false},signal:controller.signal});
  await assert.rejects(()=>reader.next(7),{name:"AbortError"});assert.equal(p.reads.length,1);
});
test("failed page retries without rereading successful sources or skipping its date",async()=>{
  const p=plugin(),read=p.loadTextFromVault;let fail=true;
  p.loadTextFromVault=async path=>{if(fail&&path.endsWith("02.md")){fail=false;throw Error("disk unavailable");}return read(path);};
  const reader=await createActivityReader(p,{range,config:{tasks:false},order:"asc"});
  await assert.rejects(()=>reader.next(3),/disk unavailable/);
  const page=await reader.next(3);assert.deepEqual(page.groups.map(g=>g.date),["2026-09-01","2026-09-02","2026-09-03"]);assert.equal(p.reads.length,3);
});
test("activity pagination reads only its batch and excludes the already rendered diary by source path",async()=>{
  const p=plugin(),options={selection:{mode:"monthly",anchorDate:"2026-09-22"},excludePaths:["Diary/2026-09-20.md"],limit:7};
  const page=await loadActivityPage(p,options);assert.equal(p.reads.length,7);assert.equal(page.groups.length,7);assert.equal(page.groups[0].date,"2026-09-19");assert.equal(page.hasMore,true);assert.equal(p.reads.includes(options.excludePaths[0]),false);
  const more=await loadActivityPage(p,{...options,limit:30});assert.equal(more.groups.length,19);assert.equal(more.hasMore,false);
});
test("date-path collisions are not displayed multiple times or assigned an invented day",async()=>{
  const p=plugin();p.files.set("Shared.md","## 记录\nShared");p.resolveCalendarNoteSpec=()=>({path:"Shared.md"});
  const page=await loadActivityPage(p,{selection:{mode:"weekly",anchorDate:"2026-09-22"}});assert.equal(page.groups.length,0);assert.equal(page.ambiguous,1);assert.equal(p.reads.length,0);
});
test("all disabled activity sources perform no note reads or task queries",async()=>{
  const p=plugin();p.getRuntimeTaskRows=()=>assert.fail("Tasks disabled");const page=await loadActivityPage(p,{selection:{mode:"yearly",anchorDate:"2026-09-22"},config:{records:false,tasks:false}});assert.equal(page.groups.length,0);assert.equal(p.reads.length,0);
});
