const test = require("node:test"), assert = require("node:assert/strict");
const {projectDiaryTasks, diaryRange, shiftPeriod} = require("../src/diary-tasks.js");
const {diaryNavigationItems}=require("../src/diary-tasks.js");
test("date strip stays in the selected week and crosses year boundaries",()=>{
  const items=diaryNavigationItems({mode:"daily",anchorDate:"2027-01-01"});
  assert.deepEqual(items.map(x=>x.anchorDate),["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"]);
});
test("period strips expose calendar months and adjacent weeks and years",()=>{
  assert.equal(diaryNavigationItems({mode:"monthly",anchorDate:"2026-09-30"}).length,12);
  for(const mode of ["weekly","yearly"]){const items=diaryNavigationItems({mode,anchorDate:"2026-09-22"});assert.equal(items.length,7);assert.equal(new Set(items.map(x=>x.period)).size,7);assert.equal(items[3].anchorDate,"2026-09-22");}
});
const tasks = [
  {path:"Project.md",line:2,text:"Earlier task",scheduled:"2026-09-01",priority:"high"},
  {path:"Project.md",line:3,text:"October",scheduled:"2026-10-02",priority:"highest"},
  {path:"Diary.md",line:1,text:"Undated in this note"},
  {path:"Project.md",line:5,text:"Finished",completed:true,completion:"2026-09-14"},
  {path:"Habits.md",line:1,text:"Read #habit",scheduled:"2026-09-01"}
];
test("current-period MIT does not limit regular historical or future tasks", () => {
  const run = (date,mode="daily") => projectDiaryTasks(tasks,{mode,anchorDate:date},"Diary.md","2026-09-14");
  assert.deepEqual(run("2026-09-14").focus.map(r=>r.title),["Earlier task","Undated in this note"]);
  for(const date of ["2026-09-13","2026-09-15"]) {
    const p=run(date);assert.equal(p.focus.length,0);assert(p.pending.some(r=>r.title==="Earlier task"));
  }
  assert(run("2026-09-20","weekly").current);
  assert(!run("2026-09-21","weekly").current);
  assert(run("2026-09-01","monthly").current);
  assert.equal(run("2026-01-01","yearly").focus[0].title,"October");
  assert.equal(run("2025-12-01","yearly").focus.length,0);
});
test("projection deduplicates source lines, keeps local undated and dated completions", () => {
  const p=projectDiaryTasks([...tasks,tasks[0]],{mode:"daily",anchorDate:"2026-09-14"},"Diary.md","2026-09-14");
  assert.equal(p.total,3);assert.equal(p.done[0].title,"Finished");
  assert(!p.focus.some(r=>r.task.path==="Habits.md"));
});

test("rescheduling a diary task retains its source but removes it from the earlier day's work",()=>{
 const source="Diary/2026-09-26.md",task={path:source,line:2,text:"Read [scheduled:: 2026-09-28]",scheduled:"2026-09-28"};
 const old=projectDiaryTasks([task],{mode:"daily",anchorDate:"2026-09-26"},source,"2026-09-26");
 assert.equal(old.total,0);
 const next=projectDiaryTasks([task],{mode:"daily",anchorDate:"2026-09-28"},"Diary/2026-09-28.md","2026-09-28");
 assert.equal(next.focus.length,1);assert.equal(next.focus[0].task.path,source);
});
test("ISO week, leap day and month boundaries use the selected period", () => {
  assert.deepEqual(diaryRange({mode:"weekly",anchorDate:"2027-01-01"}),{start:"2026-12-28",end:"2027-01-03"});
  assert.deepEqual(diaryRange({mode:"monthly",anchorDate:"2028-02-05"}),{start:"2028-02-01",end:"2028-02-29"});
  assert.equal(shiftPeriod({mode:"monthly",anchorDate:"2026-01-31"},1).anchorDate,"2026-02-28");
  assert.equal(shiftPeriod({mode:"yearly",anchorDate:"2028-02-29"},1).anchorDate,"2029-02-28");
});
test("MIT respects inline priorities when the task index reports normal",()=>{
  const rows=[{path:"P.md",line:0,text:"Earlier [due:: 2026-09-01]",priority:"normal"},{path:"P.md",line:1,text:"Important [priority:: highest] [due:: 2026-09-14]",priority:"normal"}];
  const result=projectDiaryTasks(rows,{mode:"daily",anchorDate:"2026-09-14"},"D.md","2026-09-14");
  assert.equal(result.focus[0].title,"Important");assert.equal(result.focus[0].priority,5);
});
