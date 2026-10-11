"use strict";
const {cleanTaskTitle,getTaskDate} = require("./runtime/views/dashboard/core/utils/task-display.js");
const {parseTaskLine,readTaskScheduling} = require("./task-document.js");
const {bindFocusTaskDrag}=require('./focus-task-drag.js');
function renderWorkbenchTaskRow(plugin,parent,task,options={}) {
  const zone=options.calendarZone?require('./task-calendar-zone.js').adapter(options.calendarZone):null;
  const wrap=parent.createDiv({cls:"noria-diary-task-row noria-workbench-task-row"});
  wrap.dataset.sourcePath=task.path;wrap.dataset.sourceLine=String(task.line);
  const checkbox=wrap.createEl("input",{cls:"task-list-item-checkbox noria-themed-checkbox",attr:{type:"checkbox","aria-label":cleanTaskTitle(task.text)}});
  const body=wrap.createDiv({cls:"noria-diary-task-body"}),line=body.createDiv({cls:"noria-diary-task-line"});
  const title=line.createEl("button",{cls:"noria-diary-task-title",attr:{type:"button","aria-haspopup":"dialog"}});
  bindFocusTaskDrag(plugin,title,()=>task);
  const date=line.createEl("span",{cls:"noria-diary-task-date"});
  const error=body.createDiv({cls:"noria-task-row-error",attr:{role:"status"}});
  const sync=()=>{
    checkbox.checked=!!task.completed;title.textContent=cleanTaskTitle(task.text);
    const timing=zone?zone.model(task.rawText||task.text):readTaskScheduling(task),schedules=timing.schedules.filter(s=>!s.error).map(s=>s.start.slice(0,10)).sort();
    const day=key=>zone?String(timing[key]||'').slice(0,10):getTaskDate(task,key),today=zone?zone.now().slice(0,10):plugin.getLocalYmd();
    const due=day('due'),value=due||schedules.find(d=>d>=today)||schedules.at(-1)||day('scheduled')||day('start');
    date.textContent=value?((due?plugin.t("workbench.due")+" ":"")+value.slice(5)):"";
    date.classList.toggle("is-overdue",!!due&&due<today&&!task.completed);
    wrap.dataset.sourceLine=String(task.line);wrap.dataset.taskCompleted=String(!!task.completed);
  };
  const updated=async (result,control="title")=>{
    if(result.rawText){
      const parsed=parseTaskLine(result.rawText);
      Object.assign(task,{rawText:result.rawText,text:result.rawText,line:result.line,completed:parsed.status==="done",status:parsed.status,checkboxState:parsed.status,checkbox:{mark:parsed.mark,state:parsed.status}});
      delete task.start;delete task.due;delete task.scheduled;
    }
    sync();
    try {await options.onSaved?.(result,task,control);}
    catch(cause){error.textContent=plugin.t("workbench.taskRefreshFailed");}
  };
  title.addEventListener("click",async()=>{
    error.textContent="";
    try{await plugin.openTaskDetails(task,{anchor:title,calendarZone:options.calendarZone,beforeEdit:options.beforeWrite,beforeSave:options.beforeWrite,onSaved:updated});}
    catch(e){error.textContent=plugin.t("workbench.taskUpdateFailed");}
  });
  checkbox.addEventListener("change",async()=>{
    const requested=checkbox.checked;checkbox.disabled=true;error.textContent="";
    try {
      await options.beforeWrite?.();
      const result=await plugin.updateTaskCheckboxStatus({...task,done:requested,recordCompletion:true,captureWrite:true});
      if(!result?.ok)throw new Error("task-update-failed");
      if(result.text)result.rawText=result.text.split(/\r?\n/)[result.line];
      task.completed=requested;await updated(result,"checkbox");checkbox.disabled=false;checkbox.focus({preventScroll:true});
      plugin.requestNoriaRefresh("tasks","workbench-task-toggle");
    }catch(e){checkbox.checked=!requested;error.textContent=plugin.t("workbench.taskUpdateFailed");}
    finally{checkbox.disabled=false;}
  });
  sync();return wrap;
}
module.exports={renderWorkbenchTaskRow};
