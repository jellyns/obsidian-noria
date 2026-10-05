"use strict";
const {conversationFiles,draftSources,draftKey,validSource}=require('./suggestion-reply-library.js');
const conflict=message=>Object.assign(Error(message),{code:'conflict'});
function replyCoordinator(plugin){
 if(plugin._suggestionReplyCoordinator)return plugin._suggestionReplyCoordinator;
 let tail=Promise.resolve();const pending=[];
 const run=fn=>{const next=tail.then(async()=>{if(plugin._noriaPluginDisposed)throw Error('Noria unloaded');await require('./suggestion-reply-renames.js').reconcileMoves(plugin);return fn();});tail=next.catch(()=>{});return next;};
 async function migrate(event){
  const apply=(move,path)=>path===move.oldPath?move.newPath:path.startsWith(move.oldPath+'/')?move.newPath+path.slice(move.oldPath.length):path;
  const destination=path=>{let next=event.manual?(path===event.oldPath?event.newPath:path):apply(event,path);if(next===path)return null;if(!event.manual)for(const move of pending.slice(pending.indexOf(event)+1))next=apply(move,next);return next===path?null:next;};
  const groups=new Map(),known=[];
  const add=source=>{if(!destination(source.path)||(event.manual&&source.date!==event.date))return;const key=draftKey(source);if(!groups.has(key))groups.set(key,{source,records:[]});return groups.get(key);};
  for(const file of conversationFiles(plugin)){
   const raw=await plugin.loadTextFromVault(file.path),head=/^<!-- noria:conversation (.+) -->\r?\n/.exec(raw);if(!head)continue;
   let meta;try{meta=require('./suggestion-replies.js').parse(raw).meta;}catch{continue;}
   const source={path:meta.sourcePath,date:meta.date,originPath:meta.originPath};if(meta.kind||!validSource(source))continue;
   known.push({source,path:file.path});const group=add(source);if(group)group.records.push({path:file.path,id:meta.id});
  }
  for(const source of draftSources(plugin.app))add(source);
  for(const model of plugin._suggestionReplyDrafts?.values()||[])add(model.snapshot().source);
  const errors=[];let moved=0;
  for(const {source,records} of groups.values()){
   try{
    const target={path:destination(source.path),date:source.date,originPath:source.originPath||source.path};
    if(!validSource(target)||!plugin.app.vault.getAbstractFileByPath(target.path))throw conflict('Renamed source is unavailable');
    if(records.length>1||known.some(r=>r.source.path===target.path&&r.source.date===target.date))throw conflict('A conversation already uses the destination');
    const oldKey=draftKey(source),newKey=draftKey(target),model=plugin._suggestionReplyDrafts?.get(oldKey);
    const draft=model?.snapshot().draft||plugin.app.loadLocalStorage(oldKey),other=plugin._suggestionReplyDrafts?.get(newKey)?.snapshot().draft||plugin.app.loadLocalStorage(newKey);
    if(model?.snapshot().error==='draft-load'||draft!=null&&(draft.version!==1||typeof draft.markdown!=='string'||typeof draft.requestId!=='string'||typeof draft.sourceRevision!=='string'))throw conflict('Unreadable draft was preserved');
    if(other!=null&&(other.version!==1||typeof other.markdown!=='string'||typeof other.requestId!=='string'||typeof other.sourceRevision!=='string'))throw conflict('Unknown destination draft was preserved');
    if(other?.markdown&&(other.requestId!==draft?.requestId||other.markdown!==draft?.markdown))throw conflict('A different draft already uses the destination');
    const raw=await plugin.loadTextFromVault(target.path),state=require('./public-api.js').suggestionState;
    const next={...state(raw,target.path,target.date),originPath:target.originPath},before=state(raw,source.path,source.date);
    for(const record of records){
     const renames=require('./suggestion-reply-renames.js');renames.rememberMove(plugin.app,record.id,source,target);
     const link=event.manual?plugin.app.fileManager.generateMarkdownLink(plugin.app.vault.getAbstractFileByPath(target.path),record.path,'#建议'):null;
     await plugin.processTextAtVaultPath(record.path,text=>renames.rewriteSource(text,source,target)+(link?'\n当前来源：'+link+'\n':''));
    }
    const oldRevision=event.manual?null:before.revision;
    if(model){model.relocate(next,oldRevision);plugin._suggestionReplyDrafts.delete(oldKey);plugin._suggestionReplyDrafts.set(newKey,model);}
    else if(draft?.markdown)require('./suggestion-reply-draft.js').moveDraft(plugin.app,source,next,draft,oldRevision);
    moved++;
   }catch(error){errors.push({path:source.path,message:error.message});}
  }
  if(errors.length)throw Object.assign(conflict('Some replies could not follow the renamed source'),{details:errors});
  if(moved)plugin.requestNoriaRefresh?.('home','reply-source:rename');
  return {moved};
 }
 plugin._suggestionReplyCoordinator={run,
  previewRelink:(source,path)=>run(()=>require('./suggestion-reply-relink.js').previewRelink(plugin,source,path)),
  relink:preview=>run(async()=>{
   const latest=await require('./suggestion-reply-relink.js').previewRelink(plugin,preview.source,preview.target.path);
   if(latest.fingerprint!==preview.fingerprint)throw conflict('The preview changed; review the source again');
   const result=await migrate({oldPath:latest.source.path,newPath:latest.target.path,date:latest.source.date,manual:true});
   return {...result,source:latest.target};
  }),
  rename:(oldPath,newPath)=>{const event={oldPath,newPath};pending.push(event);return run(()=>migrate(event)).finally(()=>{pending.splice(pending.indexOf(event),1);});}};
 return plugin._suggestionReplyCoordinator;
}
module.exports={replyCoordinator};
