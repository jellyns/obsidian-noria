"use strict";
const T=require("./task-document.js");
const {saveTaskEditor}=require("./task-editor-writeback.js");
const {findTaskById}=require("./task-adoption-document.js");
const {scanAtxHeadings}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");

function appendDiaryTask(source,line,locale){
  const headings=scanAtxHeadings(source),candidates=headings.filter(h=>h.level===2&&/^(计划|Plan|待办|Tasks)$/i.test(h.title));
  let text=source,heading=candidates[0]?.title;
  if(!heading){heading=locale==="zh"?"待办":"Tasks";const eol=source.includes("\r\n")?"\r\n":"\n";text=source+(source&&!source.endsWith("\n")?eol:"")+eol+"## "+heading+eol;}
  return T.appendProjectTask(text,line,heading);
}
async function openDiaryTaskCreate(diary,anchor){
  const session=diary.session,selection={...diary.selection};
  const beforeSave=async()=>{await diary.flush();return session===diary.session&&!diary.disposed&&!session.dirty&&!session.blocked&&!session.needsAdoption;};
  return openTaskCreate(diary.plugin,selection,anchor,{beforeSave,onSaved:async saved=>{await diary.adoptOwnWrite(session,saved);await diary.refreshTasks();}});
}
async function openPeriodTaskCreate(plugin,{mode="daily",date=plugin.getLocalYmd(),anchor,schedule,calendarZone,tags="",restoreFocus}={}){
  if(!["daily","weekly","monthly","yearly"].includes(mode))throw Error("Invalid task period");
  return openTaskCreate(plugin,{mode,anchorDate:date},anchor,{schedule,calendarZone,tags,restoreFocus,onSaved:()=>plugin.requestNoriaRefresh("home","home:create-task",{immediate:true})});
}
async function openTaskCreate(plugin,selection,anchor,{beforeSave=async()=>true,onSaved,schedule,calendarZone,tags="",restoreFocus}={}){
  if(!await beforeSave())return;
  const zone=calendarZone?require('./task-calendar-zone.js').adapter(calendarZone):null;
  const spec=await plugin.resolveCalendarNoteSpecAsync(selection.mode,selection.anchorDate),key=`${selection.mode}:${spec.path}${zone?":"+zone.display:""}${tags?":"+tags:""}`;
  const drafts=plugin._diaryTaskDrafts||(plugin._diaryTaskDrafts=new Map()),draft=drafts.get(key);
  const id=draft?.operationId||globalThis.crypto.randomUUID().replace(/-/g,"");
  const initial=schedule||(selection.mode==="daily"?{start:selection.anchorDate}:null);
  const initialPatch={id,created:plugin.getLocalYmd(),...(tags?{tags}:{}),...(initial?{schedule:{...initial,action:"add"}}:{})};
  const line=T.patchTaskLine("- [ ] ",zone?zone.patch(initialPatch,"- [ ] "):initialPatch,plugin.getLocalYmd());
  let saved=null;
  await plugin.ensureTaskDateTimeEditorApi();
  if(!await beforeSave())return;
  globalThis.__noriaTasksCalendarApi.openTaskDateTimeEditorFromMarkdownLine({filePath:spec.path,lineIndex:0,rawLine:line,returnFocusEl:anchor,
    workbench:{create:true,timeZone:zone?.display,model:zone?zone.model(line):T.parseTaskLine(line),draft,anchor,presentation:"modal",restoreFocus:restoreFocus||(()=>anchor?.isConnected&&anchor.focus({preventScroll:true})),
      onDraft:value=>drafts.set(key,{...value,operationId:id}),onDiscard:()=>drafts.delete(key),
      onSave:async value=>{
        if(!saved){
          if(!await beforeSave())throw Error(plugin.t("workbench.conflict"));
          if(!String(value.patch?.title||"").trim())throw Error(plugin.getNoriaLocale()==="zh"?"请填写任务名称":"Enter a task name");
          const exists=!!plugin.app.vault.getAbstractFileByPath(spec.path),seed=exists?"":await plugin.buildCalendarNoteContent(spec);
          saved=await saveTaskEditor({identity:{path:spec.path},patch:zone?zone.patch(value.patch,line):value.patch,dependencies:value.dependencies,today:plugin.getLocalYmd(),
            createId:()=>globalThis.crypto.randomUUID().replace(/-/g,"").slice(0,8),
            create:{id,line,seed,append:(raw,task)=>{const result=appendDiaryTask(raw,task,plugin.getNoriaLocale());const row=findTaskById(result.text,id);if(!row)throw Error("task-create-missing");return {...result,line:row.line,rawText:row.text};}},
            read:path=>plugin.loadTextFromVault(path),process:(path,fn)=>plugin.processTextAtVaultPath(path,fn)});
        }
        drafts.delete(key);
        await onSaved?.(saved);
        await plugin.requestNoriaRefresh("tasks","diary:create-task:"+id,{immediate:true});
        return saved;
      }
    }});
}
module.exports={appendDiaryTask,openDiaryTaskCreate,openPeriodTaskCreate};
