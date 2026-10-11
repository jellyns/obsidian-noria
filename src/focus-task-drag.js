"use strict";
const {locateTask,parseTaskLine}=require('./task-document.js');
const engine=require('./runtime/views/task-timeline/pomodoro-state.js');
const MIME='application/x-noria-focus-task';
// Only a drag originating in this plugin instance can start a timer.
const drags=new WeakMap();
function bindFocusTaskDrag(plugin,handle,getTask){
  handle.draggable=true;
  handle.addEventListener('dragstart',event=>{
    const task=getTask();
    if(!event.dataTransfer||task.completed){event.preventDefault();return;}
    const source={path:task.path||task._page?.file?.path,rawText:task.rawLine||task.source?.rawLine||task.rawText||task.text,line:task.line};
    if(!source.path||typeof source.rawText!=='string'){event.preventDefault();return;}
    drags.set(plugin,source);event.dataTransfer.setData(MIME,'task');event.dataTransfer.effectAllowed='copy';
  });
  handle.addEventListener('dragend',()=>drags.delete(plugin));
}
function hasFocusTaskDrag(plugin,transfer){return !!drags.get(plugin)&&Array.from(transfer?.types||[]).includes(MIME);}
function takeFocusTaskDrag(plugin,transfer){
  if(!hasFocusTaskDrag(plugin,transfer))return null;
  const source=drags.get(plugin);drags.delete(plugin);return source;
}
async function resolveFocusTask(plugin,source){
  const zh=plugin.getNoriaLocale()==='zh';
  const file=plugin.app.vault.getAbstractFileByPath(source.path);
  if(!file)throw Error(zh?'任务来源已移动，请刷新后重试。':'The task source moved. Refresh and try again.');
  let row;
  try{row=locateTask(await plugin.app.vault.read(file),source);}
  catch(_){throw Error(zh?'任务已改变或无法唯一定位，请刷新后重试。':'The task changed or is ambiguous. Refresh and try again.');}
  const parsed=parseTaskLine(row.text);
  if(['done','cancelled'].includes(parsed.status))throw Error(zh?'这个任务已结束，请选择其他任务。':'This task is closed. Choose another task.');
  return engine.taskPomodoroMeta({title:parsed.title,noria:{path:source.path,line:row.line,task:{rawLine:row.text}}});
}
module.exports={bindFocusTaskDrag,hasFocusTaskDrag,takeFocusTaskDrag,resolveFocusTask};
