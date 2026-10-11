"use strict";
const {taskPomodoroMeta}=require('./runtime/views/task-timeline/pomodoro-state.js');
const {resolveTaskCategory}=require('./task-category.js');
function focusCategories(state,tasks,palette){
 const seen=new Set();
 const candidates=tasks.map(task=>({task,meta:taskPomodoroMeta({title:task.text,noria:{path:task.path||task.source?.path,line:task.line??task.source?.line,task}})})).filter(row=>{if(!row.meta)return false;const key=row.meta.path+'#'+row.meta.lineHint+'#'+row.meta.textFingerprint;if(seen.has(key))return false;seen.add(key);return true;});
 const result=new Map();
 for(const [key,record]of Object.entries(state.tasks||{})){
   const samePath=candidates.filter(c=>c.meta.path===record.path);
   let matches=record.taskId?samePath.filter(c=>c.meta.taskId===record.taskId):record.textFingerprint?samePath.filter(c=>c.meta.textFingerprint===record.textFingerprint||c.meta.legacyTextFingerprint===record.textFingerprint):samePath.filter(c=>c.meta.title===record.titleSnapshot);
   // A stale line must never transfer a color to an unrelated task. Ambiguous
   // duplicates remain neutral; line numbers alone are not durable identity.
   if(matches.length!==1)continue;
   result.set(key,resolveTaskCategory(matches[0].task,palette));
 }
 return result;
}
module.exports={focusCategories};
