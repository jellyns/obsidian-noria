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
  const plugin=diary.plugin,session=diary.session,selection={...diary.selection};
  await diary.flush();
  if(session!==diary.session||session.dirty||session.blocked||session.needsAdoption)return;
  const spec=await plugin.resolveCalendarNoteSpecAsync(selection.mode,selection.anchorDate),key=`${selection.mode}:${spec.path}`;
  const drafts=plugin._diaryTaskDrafts||(plugin._diaryTaskDrafts=new Map()),draft=drafts.get(key);
  const id=draft?.operationId||globalThis.crypto.randomUUID().replace(/-/g,"");
  const line=T.patchTaskLine("- [ ] ",{id,created:plugin.getLocalYmd(),...(selection.mode==="daily"?{scheduled:selection.anchorDate}:{})},plugin.getLocalYmd());
  let saved=null;
  await plugin.ensureTaskDateTimeEditorApi();
  if(session!==diary.session||diary.disposed)return;
  globalThis.__noriaTasksCalendarApi.openTaskDateTimeEditorFromMarkdownLine({filePath:spec.path,lineIndex:0,rawLine:line,returnFocusEl:anchor,
    workbench:{create:true,model:T.parseTaskLine(line),draft,anchor,presentation:"modal",restoreFocus:()=>anchor?.isConnected&&anchor.focus({preventScroll:true}),
      onDraft:value=>drafts.set(key,{...value,operationId:id}),onDiscard:()=>drafts.delete(key),
      onSave:async value=>{
        if(!saved){
          await diary.flush();
          if(session!==diary.session||session.dirty||session.blocked||session.needsAdoption)throw Error(plugin.t("workbench.conflict"));
          if(!String(value.patch?.title||"").trim())throw Error(plugin.getNoriaLocale()==="zh"?"请填写任务名称":"Enter a task name");
          const exists=!!plugin.app.vault.getAbstractFileByPath(spec.path),seed=exists?"":await plugin.buildCalendarNoteContent(spec);
          saved=await saveTaskEditor({identity:{path:spec.path},patch:value.patch,dependencies:value.dependencies,today:plugin.getLocalYmd(),
            createId:()=>globalThis.crypto.randomUUID().replace(/-/g,"").slice(0,8),
            create:{id,line,seed,append:(raw,task)=>{const result=appendDiaryTask(raw,task,plugin.getNoriaLocale());const row=findTaskById(result.text,id);if(!row)throw Error("task-create-missing");return {...result,line:row.line,rawText:row.text};}},
            read:path=>plugin.loadTextFromVault(path),process:(path,fn)=>plugin.processTextAtVaultPath(path,fn)});
        }
        drafts.delete(key);
        await diary.adoptOwnWrite(session,saved);
        await plugin.requestNoriaRefresh("tasks","diary:create-task:"+id,{immediate:true});
        await diary.refreshTasks();return saved;
      }
    }});
}
module.exports={appendDiaryTask,openDiaryTaskCreate};
