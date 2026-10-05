const test=require("node:test"),assert=require("node:assert/strict");
const {habitRecords,writeHabitMarkdown,withoutHabitRecords}=require("../src/diary-habits.js");
test("today check-ins reject a stale day before writing, including a queued midnight rollover; explicit history stays dated",async()=>{
  const {DiaryHabitStore}=require("../src/diary-habits.js");
  for(const rollover of ["already","queued","history"]){
    let today=rollover==="already"?"2026-09-24":"2026-09-23",written=null;
    const p={getLocalYmd:()=>today,getNoriaLocale:()=>"zh",t:()=>"习惯记录",app:{vault:{getAbstractFileByPath:()=>({})}},
      resolveCalendarNoteSpecAsync:async()=>({path:"day.md"}),buildCalendarNoteContent:async()=>"",
      processTextAtVaultPath:async(_,fn)=>{today="2026-09-24";written=fn("Original prose\n");},requestNoriaRefresh(){}};
    const request={date:"2026-09-23",expectedToday:rollover==="history"?undefined:"2026-09-23",config:{name:"散步"},done:true};
    if(rollover==="history"){await new DiaryHabitStore(p).write(request);assert.match(written,/2026-09-23/);assert.ok(written.startsWith("Original prose\n"));}
    else{await assert.rejects(()=>new DiaryHabitStore(p).write(request),/日期|day/i);assert.equal(written,null);}
  }
});
test("habit first use templates a missing note but respects an existing empty file",async()=>{
  const {DiaryHabitStore}=require("../src/diary-habits.js");
  for(const existed of [false,true]){
    let written;
    const p={getLocalYmd:()=>"2098-01-01",t:()=>"习惯记录",app:{vault:{getAbstractFileByPath:()=>existed?{}:null}},
      resolveCalendarNoteSpecAsync:async()=>({path:"one.md"}),buildCalendarNoteContent:async()=>"## 记录\n\n## 计划\n\n",
      processTextAtVaultPath:async(_,fn)=>{written=fn("");},requestNoriaRefresh(){}};
    await new DiaryHabitStore(p).write({date:"2098-01-01",config:{name:"散步"},done:true});
    assert.equal(written.includes("## 记录"),!existed);assert.match(written,/散步/);
  }
});
test("habit recording and withdrawal preserve custom prose, fences, and review",()=>{
  const raw="---\r\ncustom: kept\r\n---\r\n## 记录\r\n第一行  \r\n第二行\r\n```md\r\n- [x] 阅读 #habit [due:: 2026-09-14]\r\n```\r\n%% noria:review:start %%\r\n## 复盘\r\n原文\r\n%% noria:review:end %%\r\n";
  const request={config:{name:"阅读",type:"number",unit:"分钟",target:"20"},date:"2026-09-14",done:true,value:"25"};
  const once=writeHabitMarkdown(raw,request),twice=writeHabitMarkdown(once,request);
  assert.equal(once,twice);assert(once.startsWith(raw));assert.equal(habitRecords(once,request.date,"Diary.md").length,1);
  const withdrawn=writeHabitMarkdown(once,{...request,done:false,value:""});
  assert(withdrawn.startsWith(raw));assert.equal(habitRecords(withdrawn,request.date,"")[0].done,false);
});
test("ambiguous records and invalid values never silently replace data",()=>{
  const raw="- [x] 阅读 #habit [due:: 2026-09-14]\n- [ ] 阅读 #habit [due:: 2026-09-14]\n";
  const request={config:{name:"阅读",type:"number"},date:"2026-09-14",done:true,value:"2"};
  assert.throws(()=>writeHabitMarkdown(raw,request),/Duplicate/);
  assert.throws(()=>writeHabitMarkdown("",{...request,value:"wrong"}),/Invalid/);
});
test("habit preview removes only repeated controls, preserving authored context and code",()=>{
  const row="- [x] 阅读 #habit [due:: 2026-09-14]\n";
  const source="## 记录\n正文\n\n## 习惯记录\n\n"+row+"\n## 其他\n原样\n";
  assert.equal(withoutHabitRecords(source,"2026-09-14"),"## 记录\n正文\n\n## 其他\n原样\n");
  const contextual="## 习惯记录\n今天读的是一本散文。\n"+row+"\n```md\n"+row+"```\n";
  const displayed=withoutHabitRecords(contextual,"2026-09-14");
  assert.match(displayed,/今天读的是一本散文/);assert.ok(displayed.includes("```md\n"+row+"```"));
  assert.equal(withoutHabitRecords(source,"2026-09-15"),source);
});
test("updating a habit preserves unrelated tags, notes, block IDs, and Markdown hard breaks",()=>{
  const raw="## 习惯记录\r\n* [ ] 阅读 #habit #context/quiet [due:: 2026-09-14] [note:: 保留这条备注] ^reading  \r\n";
  const request={config:{name:"阅读",type:"number",target:"20"},date:"2026-09-14",done:true,value:"25"};
  const next=writeHabitMarkdown(raw,request);
  assert.match(next,/#context\/quiet/);assert.match(next,/\[note:: 保留这条备注\]/);
  assert.ok(next.endsWith(" ^reading  \r\n"));assert.ok(next.startsWith("## 习惯记录\r\n* [x]"));
  assert.equal(writeHabitMarkdown(next,request),next);
  const withdrawn=writeHabitMarkdown(next,{...request,done:false,value:""});
  assert.ok(withdrawn.endsWith(" ^reading  \r\n"));
  assert.equal(habitRecords(withdrawn,request.date,"").length,1);
  assert.equal(habitRecords(withdrawn,request.date,"")[0].done,false);
  assert.match(withdrawn,/\[note:: 保留这条备注\]/);
});
