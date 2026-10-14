"use strict";
const {createHash,randomUUID}=require("crypto");
const hash=text=>createHash("sha256").update(text).digest("hex");
const ids=["inboxQueue"];
const queues=new WeakMap();
const text=(plugin,zh,en)=>plugin.getNoriaLocale()==="zh"?zh:en;
function resource(plugin,id){
  if(!ids.includes(id))throw Error("Unsupported companion file");
  const path=plugin.getManagedPath(id);
  if(!path||/^[\\/]|^[A-Za-z]:|\\|(^|\/)\.\.?($|\/)/.test(path)||!path.endsWith(id==="inboxQueue"?".base":".md"))throw Error(text(plugin,"配套文件路径无效，请先检查设置。","Invalid companion path. Check settings first."));
  const content=plugin.getManagedNoteSeed(id);
  return {id,path,content,version:2,configHash:hash(JSON.stringify({locale:plugin.getNoriaLocale(),path}))};
}
function root(plugin){return `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/cache/companion-files`;}
async function readState(plugin){
  const adapter=plugin.app.vault.adapter,path=`${root(plugin)}/state.json`;
  if(!await adapter.exists(path))return {};
  const state=JSON.parse(await adapter.read(path));
  if(state.schema!==1||!state.files||typeof state.files!=="object")throw Error(text(plugin,"配套文件记录无法读取，原文件未修改。","Cannot read companion records. Original files were not changed."));
  return state.files;
}
async function mkdir(adapter,path){
  const parts=path.split("/");for(let i=1;i<=parts.length;i++){const p=parts.slice(0,i).join("/");if(!await adapter.exists(p))await adapter.mkdir(p);}
}
function serial(plugin,run){const pending=(queues.get(plugin)||Promise.resolve()).then(run);queues.set(plugin,pending.catch(()=>{}));return pending;}
async function saveRecord(plugin,item,backup,backupHash){
  const files=await readState(plugin);
  const previous=files[item.id]?.path===item.path?files[item.id]:{};
  files[item.id]={path:item.path,hash:hash(item.content),version:item.version,configHash:item.configHash,updatedAt:new Date().toISOString(),keep:false,backup:backup||previous.backup||null,backupHash:backupHash||previous.backupHash||null};
  await writeState(plugin,files);
}
async function writeState(plugin,files){
  await mkdir(plugin.app.vault.adapter,root(plugin));
  await plugin.app.vault.adapter.write(`${root(plugin)}/state.json`,JSON.stringify({schema:1,files},null,2)+"\n");
}
function active(plugin){if(plugin._noriaPluginDisposed)throw Error(text(plugin,"插件已停止，请重新打开后再操作。","Plugin stopped. Reopen it before continuing."));}
async function current(plugin,path){
  const file=plugin.app.vault.getAbstractFileByPath(path);
  if(file){if(!file.extension)throw Error(text(plugin,"目标路径是目录。","The target is a folder."));return {file,content:await plugin.app.vault.read(file)};}
  if(await plugin.app.vault.adapter.exists(path))throw Error(text(plugin,"文件尚未进入索引，请稍后重新检查。","File is not indexed yet. Check again shortly."));
  return {file:null,content:null};
}
async function preview(plugin){
  const state=await readState(plugin),items=[];
  for(const id of ids){
    const item=resource(plugin,id),now=await current(plugin,item.path),baseline=state[id];
    const known=baseline?.path===item.path&&baseline?.hash;
    const status=now.content===null?"missing":now.content===item.content?"current":known?(hash(now.content)===baseline.hash?"safe":"custom"):"unknown";
    const samePath=baseline?.path===item.path;
    const backup=samePath?baseline.backup:null;
    items.push({...item,before:now.content,status,tracked:!!known&&baseline.hash===hash(item.content),keep:!!(samePath&&baseline.keep),backup:backup||null,
      canRestore:!!(backup&&now.content!==null&&hash(now.content)===baseline.hash)});
  }
  return items;
}
function conflict(plugin){return Error(text(plugin,"文件或配置已变化。请重新检查更新后再应用。","File or settings changed. Check updates again before applying."));}
async function apply(plugin,item,{replaceCustom=false,automatic=false}={}){
  return serial(plugin,async()=>{
    active(plugin);
    const next=resource(plugin,item.id);
    if(next.path!==item.path||next.content!==item.content||next.configHash!==item.configHash)throw conflict(plugin);
    // Recompute classification; callers cannot turn unknown content into a safe update.
    const latest=(await preview(plugin)).find(entry=>entry.id===item.id);
    if(latest.before!==item.before)throw conflict(plugin);
    if(automatic&&(latest.keep||!["safe","current"].includes(latest.status)))return {changed:false,skipped:true};
    if(["custom","unknown"].includes(latest.status)&&!replaceCustom)throw Error(text(plugin,"请先查看差异并确认替换此文件。","Review the differences and confirm replacement first."));
    if(latest.status==="current"){
      if(!latest.tracked||latest.keep)await saveRecord(plugin,next);
      return {changed:false,backup:latest.backup};
    }
    let backup=null;
    if(item.before!==null){
      backup=`${root(plugin)}/backups/${new Date().toISOString().replace(/[:.]/g,"-")}-${item.id}-${randomUUID()}.txt`;
      await mkdir(plugin.app.vault.adapter,`${root(plugin)}/backups`);
      await plugin.app.vault.adapter.write(backup,item.before);
      if(await plugin.app.vault.adapter.read(backup)!==item.before)throw Error("Backup verification failed");
      const file=plugin.app.vault.getAbstractFileByPath(item.path);
      if(!file)throw conflict(plugin);
      // Obsidian process compares and updates inside the same vault operation.
      await plugin.app.vault.process(file,content=>{
        active(plugin);
        const fresh=resource(plugin,item.id);
        if(content!==item.before||fresh.path!==item.path||fresh.content!==item.content||fresh.configHash!==item.configHash)throw conflict(plugin);
        return item.content;
      });
    }else{
      await plugin.ensureVaultParent(item.path);
      const fresh=resource(plugin,item.id);
      if(fresh.path!==item.path||fresh.content!==item.content||fresh.configHash!==item.configHash)throw conflict(plugin);
      active(plugin);
      await plugin.app.vault.create(item.path,item.content);
    }
    try{await saveRecord(plugin,next,backup,item.before===null?null:hash(item.before));}catch(error){throw Error(text(plugin,"文件已更新，但生成记录保存失败；请重新检查。备份：","File updated, but tracking failed. Check again. Backup: ")+(backup||"—")+"\n"+error.message);}
    return {changed:true,backup};
  });
}
async function rememberCreated(plugin,id,path,content){
  if(!ids.includes(id))return;
  return serial(plugin,async()=>{const item=resource(plugin,id);if(item.path===path&&item.content===content)await saveRecord(plugin,item);});
}
// Ordinary maintenance never recreates deleted files or touches custom/unknown content.
async function syncUnchanged(plugin){
  active(plugin);
  const results=[];
  for(const item of await preview(plugin)){
    if(item.keep||!(item.status==="safe"||(item.status==="current"&&!item.tracked)))continue;
    try{results.push({id:item.id,...await apply(plugin,item,{automatic:true})});}
    catch(error){results.push({id:item.id,error:error.message});}
  }
  return results;
}
async function keepCurrent(plugin,item){
  return serial(plugin,async()=>{
    active(plugin);
    const latest=(await preview(plugin)).find(entry=>entry.id===item.id);
    if(latest.path!==item.path||latest.before!==item.before)throw conflict(plugin);
    const state=await readState(plugin),old=state[item.id]?.path===item.path?state[item.id]:{};
    state[item.id]={...old,path:item.path,keep:true};await writeState(plugin,state);
    return {changed:false};
  });
}
async function restore(plugin,item){
  return serial(plugin,async()=>{
    active(plugin);
    const latest=(await preview(plugin)).find(entry=>entry.id===item.id);
    if(!latest.canRestore||latest.path!==item.path||latest.before!==item.before||latest.backup!==item.backup)throw conflict(plugin);
    const prefix=`${root(plugin)}/backups/`;
    if(!item.backup.startsWith(prefix)||item.backup.slice(prefix.length).includes("/"))throw Error("Invalid backup path");
    const state=await readState(plugin),record=state[item.id],body=await plugin.app.vault.adapter.read(item.backup);
    if(record.backupHash&&hash(body)!==record.backupHash)throw Error(text(plugin,"备份内容已变化，未恢复文件。","The backup changed. The file was not restored."));
    // Persist the user's choice first: even an interrupted restore must not be auto-updated.
    record.keep=true;await writeState(plugin,state);
    const file=plugin.app.vault.getAbstractFileByPath(item.path);
    if(!file)throw conflict(plugin);
    await plugin.app.vault.process(file,current=>{
      active(plugin);
      if(current!==item.before||plugin.getManagedPath(item.id)!==item.path)throw conflict(plugin);
      return body;
    });
    record.backup=null;record.backupHash=null;
    try{await writeState(plugin,state);}catch(error){throw Error(text(plugin,"原文件已恢复，保留选择已保存；恢复记录未能保存，请重新查看。","File restored and keep choice saved; recovery record could not be saved. Refresh to check.")+"\n"+error.message);}
    return {changed:true};
  });
}
function signature(plugin){
  return JSON.stringify([plugin.getNoriaLocale(),plugin.getManagedPath("inboxRoot"),...ids.map(id=>plugin.getManagedPath(id))]);
}
function schedule(plugin){
  if(!plugin._companionReady||plugin._noriaPluginDisposed)return;
  const next=signature(plugin);if(next===plugin._companionSignature)return;
  plugin._companionSignature=next;
  clearTimeout(plugin._companionTimer);
  plugin._companionTimer=setTimeout(()=>{
    plugin._companionTimer=null;
    plugin._companionPending=syncUnchanged(plugin).then(results=>{
      plugin._companionSyncError=results.filter(r=>r.error).map(r=>r.error).join("\n");return results;
    }).catch(error=>{plugin._companionSyncError=error.message;return [];});
  },800);
}
function cancel(plugin){clearTimeout(plugin._companionTimer);plugin._companionTimer=null;plugin._companionReady=false;}
// A focused changed block avoids a quadratic line-diff dependency for two small files.
function changedBlock(before,after){
  const a=String(before??"").split("\n"),b=after.split("\n");let start=0,endA=a.length,endB=b.length;
  while(start<endA&&start<endB&&a[start]===b[start])start++;
  while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
  return {line:start+1,before:a.slice(start,endA).join("\n"),after:b.slice(start,endB).join("\n")};
}
module.exports={preview,apply,rememberCreated,changedBlock,syncUnchanged,keepCurrent,restore,schedule,cancel};
