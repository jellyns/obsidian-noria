"use strict";
const {locateTask}=require("./task-document.js");
async function restoreTaskMove(receipt,process){
  return process(receipt.path,current=>{
    const row=locateTask(current,{rawText:receipt.after});
    if(row.text!==receipt.after)throw Error("task-changed");
    return current.slice(0,row.start)+receipt.before+current.slice(row.start+row.text.length);
  });
}
function showTaskMoveUndo(plugin,receipt,doc){
  const {Notice}=require("obsidian"),zh=plugin.getNoriaLocale()==="zh";
  plugin._taskMoveUndoNotice?.hide();
  const fragment=doc.createDocumentFragment(),label=doc.createElement("span"),button=doc.createElement("button");
  label.textContent=zh?"已调整安排 ":"Rescheduled ";button.textContent=zh?"撤销":"Undo";button.type="button";
  fragment.append(label,button);const notice=new Notice(fragment,12000);plugin._taskMoveUndoNotice=notice;
  button.onclick=async()=>{
    button.disabled=true;
    try{
      await restoreTaskMove(receipt,(path,fn)=>plugin.processTextAtVaultPath(path,fn));
      plugin.invalidateTaskSnapshots("tasks");
      const service=await plugin.createDataService();service.invalidate("timeline-drag-undo","tasks");
      plugin.requestNoriaRefresh("tasks","timeline-drag-undo",{immediate:true});notice.hide();
    }catch(error){
      label.textContent=/task-changed|not-found|ambiguous/.test(error.message)?(zh?"任务已再次修改，未覆盖新内容。":"The task changed again; newer content was kept."):error.message;
      button.disabled=false;
    }
  };
  plugin.register(()=>notice.hide());
}
module.exports={restoreTaskMove,showTaskMoveUndo};
