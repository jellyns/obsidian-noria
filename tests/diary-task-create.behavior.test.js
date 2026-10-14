const test=require("node:test"),assert=require("node:assert/strict");
const {appendDiaryTask,openDiaryTaskCreate}=require("../src/diary-task-create.js");
test("new tasks enter the plan section and do not get appended into a review",()=>{
  const source="## 计划\n\nPlan\n\n## 复盘\nResult";
  const result=appendDiaryTask(source,"- [ ] Task [id:: test]","zh");assert.ok(result.text.indexOf("- [ ] Task")<result.text.indexOf("## 复盘"));assert.ok(result.text.endsWith("Result"));
  const noPlan=appendDiaryTask("## 复盘\nResult","- [ ] Task","zh");assert.match(noPlan.text,/Result\n\n## 待办\n\n- \[ \] Task/);
});
test("diary task creation stays bound to the selected note and retry never duplicates a saved task",async()=>{
  let request,writes=0;const old=globalThis.__noriaTasksCalendarApi;globalThis.__noriaTasksCalendarApi={openTaskDateTimeEditorFromMarkdownLine:value=>request=value};
  const files={"Diary/2026-09-14.md":"## 计划\n"},selection={mode:"daily",anchorDate:"2026-09-14"};
  const plugin={getLocalYmd:()=>"2026-09-22",getNoriaLocale:()=>"zh",t:k=>k,resolveCalendarNoteSpecAsync:async()=>({path:"Diary/2026-09-14.md"}),ensureTaskDateTimeEditorApi:async()=>{},app:{vault:{getAbstractFileByPath:path=>files[path]?{path}:null}},loadTextFromVault:async path=>files[path]||"",processTextAtVaultPath:async(path,fn)=>{files[path]=fn(files[path]||"");writes++;},requestNoriaRefresh:async()=>{}};
  const diary={plugin,selection,session:{},flush:async()=>{},adoptOwnWrite:async()=>{},refreshTasks:async()=>{}};
  try{await openDiaryTaskCreate(diary,null);assert.equal(request.workbench.model.schedules[0].start,"2026-09-14");assert.equal(request.workbench.model.created,"2026-09-22");assert.equal(request.workbench.model.due,"");
    const save=request.workbench.onSave;await save({patch:{title:"Read"}});await save({patch:{title:"Read"}});assert.equal(writes,1);assert.match(files[request.filePath],/Read/);
  }finally{globalThis.__noriaTasksCalendarApi=old;}
});
test("unsaved diary conflict prevents opening the task creator",async()=>{
  const diary={plugin:{},session:{dirty:true},selection:{mode:"daily"},flush:async()=>{}};await openDiaryTaskCreate(diary,null);
});
const {openPeriodTaskCreate}=require('../src/diary-task-create.js');
test('home period creation uses the calendar note and separates scheduling from deadlines',async()=>{
  const previous=globalThis.__noriaTasksCalendarApi;let request;
  globalThis.__noriaTasksCalendarApi={openTaskDateTimeEditorFromMarkdownLine:value=>request=value};
  const files={},plugin={getLocalYmd:()=> '2026-10-06',getNoriaLocale:()=> 'zh',resolveCalendarNoteSpecAsync:async(mode)=>({path:`Diary/${mode}.md`}),ensureTaskDateTimeEditorApi:async()=>{},app:{vault:{getAbstractFileByPath:path=>files[path]?{path}:null}},buildCalendarNoteContent:async()=> '## 计划\n',loadTextFromVault:async path=>files[path]||'',processTextAtVaultPath:async(path,fn)=>{files[path]=fn(files[path]||'');},requestNoriaRefresh:async()=>{}};
  try{for(const mode of ['daily','weekly','monthly','yearly']){
    await openPeriodTaskCreate(plugin,{mode});assert.equal(request.filePath,`Diary/${mode}.md`);assert.equal(request.workbench.model.due,'');assert.equal(request.workbench.model.schedules[0]?.start||'',mode==='daily'?'2026-10-06':'');
    await request.workbench.onSave({patch:{title:'Read',due:'2026-10-10'}});assert.match(files[request.filePath],/Read/);assert.match(files[request.filePath],/2026-10-10/);
  }}finally{globalThis.__noriaTasksCalendarApi=previous;}
});

test('calendar creation carries an explicit overnight slot into the shared editor and source write',async()=>{
 const previous=globalThis.__noriaTasksCalendarApi;let request,text='## 计划\n';
 globalThis.__noriaTasksCalendarApi={openTaskDateTimeEditorFromMarkdownLine:value=>request=value};
 const plugin={getLocalYmd:()=> '2026-10-07',getNoriaLocale:()=> 'zh',resolveCalendarNoteSpecAsync:async()=>({path:'Diary/2026-10-08.md'}),ensureTaskDateTimeEditorApi:async()=>{},app:{vault:{getAbstractFileByPath:()=>({})}},loadTextFromVault:async()=>text,processTextAtVaultPath:async(path,fn)=>{text=fn(text)},requestNoriaRefresh:async()=>{}};
 try{
  await openPeriodTaskCreate(plugin,{date:'2026-10-08',schedule:{start:'2026-10-08 23:00',end:'2026-10-09 07:00'}});
  assert.equal(request.workbench.model.schedules[0].end,'2026-10-09 07:00');assert.equal(request.workbench.model.due,'');
  await request.workbench.onSave({patch:{title:'Sleep'}});
  assert.match(text,/\[schedule:: 2026-10-08 23:00 \/ 2026-10-09 07:00\]/);assert.doesNotMatch(text,/\[(?:start|due)::/);
 }finally{globalThis.__noriaTasksCalendarApi=previous;}
});

test('calendar creation keeps source-zone times while its editor uses the selected zone',async()=>{
 const previous=globalThis.__noriaTasksCalendarApi;let request,text='## 计划\n';
 globalThis.__noriaTasksCalendarApi={openTaskDateTimeEditorFromMarkdownLine:value=>request=value};
 const plugin={getLocalYmd:()=> '2026-10-10',getNoriaLocale:()=> 'zh',resolveCalendarNoteSpecAsync:async()=>({path:'Diary/2026-10-10.md'}),ensureTaskDateTimeEditorApi:async()=>{},app:{vault:{getAbstractFileByPath:()=>({})}},loadTextFromVault:async()=>text,processTextAtVaultPath:async(path,fn)=>{text=fn(text)},requestNoriaRefresh:async()=>{}};
 try{
  await openPeriodTaskCreate(plugin,{date:'2026-10-10',calendarZone:{source:'Asia/Shanghai',display:'Asia/Tokyo'},schedule:{start:'2026-10-10 10:00',end:'2026-10-10 11:00'}});
  assert.equal(request.workbench.model.schedules[0].start,'2026-10-10 10:00');assert.ok(request.rawLine.includes('2026-10-10 09:00'));
  await request.workbench.onSave({patch:{title:'Read',schedule:{action:'update',index:0,start:'2026-10-10 10:30',end:'2026-10-10 11:30'}}});
  assert.match(text,/\[schedule:: 2026-10-10 09:30 \/ 2026-10-10 10:30\]/);
 }finally{globalThis.__noriaTasksCalendarApi=previous;}
});

test('tagged plan creation keeps its own draft, saves one ordinary task and restores its entry focus',async()=>{
 const previous=globalThis.__noriaTasksCalendarApi;let request,text='## 计划\n',writes=0,focus=0;
 globalThis.__noriaTasksCalendarApi={openTaskDateTimeEditorFromMarkdownLine:value=>request=value};
 const plugin={getLocalYmd:()=> '2026-10-12',getNoriaLocale:()=> 'zh',resolveCalendarNoteSpecAsync:async()=>({path:'Diary/2026-10-13.md'}),ensureTaskDateTimeEditorApi:async()=>{},app:{vault:{getAbstractFileByPath:()=>({})}},loadTextFromVault:async()=>text,processTextAtVaultPath:async(path,fn)=>{text=fn(text);writes++;},requestNoriaRefresh:async()=>{}};
 try{
  await openPeriodTaskCreate(plugin,{date:'2026-10-13'});request.workbench.onDraft({patch:{title:'Private draft'}});
  await openPeriodTaskCreate(plugin,{date:'2026-10-13',tags:'#运动',restoreFocus:()=>focus++});
  assert.equal(request.workbench.draft,undefined);assert.equal(request.workbench.model.tags,'#运动');assert.equal(writes,0);
  await request.workbench.onSave({patch:{title:'轻松跑'}});await request.workbench.onSave({patch:{title:'轻松跑'}});request.workbench.restoreFocus();
  assert.equal(writes,1);assert.equal(focus,1);assert.match(text,/#运动/);assert.match(text,/\[schedule:: 2026-10-13\]/);assert.doesNotMatch(text,/Private draft/);
 }finally{globalThis.__noriaTasksCalendarApi=previous;}
});
