"use strict";
const {locateTask,parseTaskLine,editTaskDocument}=require("./task-document.js");
const {attachCitation,findTaskById}=require("./task-adoption-document.js");
const ids=value=>[...new Set(String(value||"").split(/[\s,]+/).filter(Boolean))];
const refKey=ref=>ref.path+"\n"+ref.rawText;

// Preflight every affected document. A new task is committed last so a failed
// dependency write cannot leave a newly created date note behind.
async function saveTaskEditor({read,process,identity,patch,dependencies,today,createId,create,citation}) {
  const files=new Map(), edits=new Map();
  async function include(ref){
    if(!ref.path)throw new Error("missing-task-path");
    if(!files.has(ref.path)){const text=await read(ref.path);files.set(ref.path,{before:text,text});}
    const file=files.get(ref.path),row=locateTask(file.before,ref),key=refKey(ref);
    if(!edits.has(key))edits.set(key,{ref,patch:{},model:parseTaskLine(row.text)});
    return edits.get(key);
  }
  let current;
  if(create){
    const before=await read(identity.path),existing=findTaskById(before,create.id);
    if(existing)return {path:identity.path,rawText:existing.text,line:existing.line,text:before,previousText:before,ok:true,retried:true};
    const insertion=create.append(before||create.seed,create.line);
    identity={...identity,rawText:insertion.rawText,text:insertion.rawText,line:insertion.line};
    files.set(identity.path,{before,text:insertion.text});
    current={ref:identity,patch:{},model:parseTaskLine(identity.rawText)};
    edits.set(refKey(identity),current);
  }else current=await include(identity);
  Object.assign(current.patch,patch);
  if(dependencies){
    const before=dependencies.before||[],after=dependencies.after||[],originalAfter=dependencies.originalAfter||[];
    for(const ref of [...before,...after,...originalAfter])if(ref.path)await include(ref);
    const reserved=new Set(dependencies.knownIds||[]);
    for(const edit of edits.values())if(edit.model.id)reserved.add(edit.model.id);
    const nextId=()=>{let id;do{id=createId();}while(reserved.has(id));reserved.add(id);return id;};
    const beforeIds=[];
    for(const ref of before){
      if(!ref.path){if(ref.id)beforeIds.push(ref.id);continue;}
      const edit=edits.get(refKey(ref));
      if(edit===current)throw new Error("task-depends-on-itself");
      const id=edit.model.id||edit.patch.id||nextId();
      if(!edit.model.id)edit.patch.id=id;
      beforeIds.push(id);
    }
    current.patch.dependsOn=[...new Set(beforeIds)].join(",");
    const currentId=current.model.id||(after.length?nextId():"");
    if(currentId&&!current.model.id)current.patch.id=currentId;
    const selected=new Set(after.map(refKey));
    if(currentId)for(const ref of new Map([...originalAfter,...after].map(ref=>[refKey(ref),ref])).values()){
      const edit=edits.get(refKey(ref));if(edit===current)throw new Error("task-depends-on-itself");
      const list=ids(edit.model.dependsOn).filter(id=>id!==currentId);
      if(selected.has(refKey(ref)))list.push(currentId);
      edit.patch.dependsOn=list.join(",");
    }
  }
  let result;
  for(const edit of edits.values()){
    const file=files.get(edit.ref.path),change=editTaskDocument(file.text,edit.ref,edit.patch,today);
    file.text=change.text;if(edit===current)result=change;
  }
  if(citation){
    const file=files.get(identity.path);
    file.text=attachCitation(file.text,{...identity,rawText:result.rawText,text:result.rawText},citation);
  }
  const written=[];
  try{
    const ordered=[...files].sort(([a],[b])=>create?Number(a===identity.path)-Number(b===identity.path):0);
    for(const [path,file] of ordered){
      if(file.text===file.before)continue;
      await process(path,currentText=>{if(currentText!==file.before)throw new Error("task-changed");return file.text;});
      written.push([path,file]);
    }
  }catch(error){
    const unrestored=[];
    for(const [path,file] of written.reverse())try{
      await process(path,currentText=>{if(currentText!==file.text)throw new Error("task-changed");return file.before;});
    }catch(_){unrestored.push(path);}
    if(unrestored.length)throw new Error("task-partial-write: "+unrestored.join(", "));
    throw error;
  }
  return {...result,text:files.get(identity.path).text,path:identity.path,previousText:files.get(identity.path).before,changed:files.get(identity.path).text!==files.get(identity.path).before,ok:true};
}
module.exports={saveTaskEditor};
