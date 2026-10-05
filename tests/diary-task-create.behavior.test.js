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
  try{await openDiaryTaskCreate(diary,null);assert.equal(request.workbench.model.scheduled,"2026-09-14");assert.equal(request.workbench.model.created,"2026-09-22");assert.equal(request.workbench.model.due,"");
    const save=request.workbench.onSave;await save({patch:{title:"Read"}});await save({patch:{title:"Read"}});assert.equal(writes,1);assert.match(files[request.filePath],/Read/);
  }finally{globalThis.__noriaTasksCalendarApi=old;}
});
test("unsaved diary conflict prevents opening the task creator",async()=>{
  const diary={plugin:{},session:{dirty:true},selection:{mode:"daily"},flush:async()=>{}};await openDiaryTaskCreate(diary,null);
});
