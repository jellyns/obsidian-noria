"use strict";
const {createHash}=require('node:crypto');
const {conversationFiles,draftSources,draftKey,validSource}=require('./suggestion-reply-library.js');
const conflict=message=>Object.assign(Error(message),{code:'conflict'});

// A preview is explicit, exact-path evidence; never infer a move from similar text.
async function previewRelink(plugin,source,path){
 if(!validSource(source)||!validSource({path,date:source.date})||source.path===path)throw conflict('Invalid source');
 if(plugin.app.vault.getAbstractFileByPath(source.path))throw conflict('The original source is available again');
 if(!plugin.app.vault.getAbstractFileByPath(path))throw conflict('The selected source is unavailable');
 const records=[],target={path,date:source.date};
 for(const file of conversationFiles(plugin)){
  if(file.path===path)throw conflict('A conversation cannot be its own source');
  const raw=await plugin.loadTextFromVault(file.path);let parsed;
  try{parsed=require('./suggestion-replies.js').parse(raw);}catch{
   const header=/^<!-- noria:conversation (.+) -->/.exec(raw);let meta;try{meta=JSON.parse(header?.[1]);}catch{}
   if(meta?.date===source.date&&[source.path,path].includes(meta.sourcePath))throw conflict('An affected conversation could not be read');
   continue;
  }
  if(!parsed||parsed.meta.date!==source.date)continue;
  if(parsed.meta.sourcePath===path)throw conflict('A conversation already uses the destination');
  if(parsed.meta.sourcePath===source.path)records.push({path:file.path,id:parsed.id,raw,originPath:parsed.meta.originPath});
 }
 if(records.length>1)throw conflict('More than one conversation uses this source');
 const index=draftSources(plugin.app),model=plugin._suggestionReplyDrafts?.get(draftKey(source))?.snapshot();
 if(model?.busy||model?.error==='draft-load')throw conflict('The original draft is not ready');
 const draft=model?.draft||plugin.app.loadLocalStorage(draftKey(source));
 if(draft!=null&&(draft.version!==1||typeof draft.markdown!=='string'||typeof draft.requestId!=='string'||typeof draft.sourceRevision!=='string'))throw conflict('Unreadable draft was preserved');
 if(!records.length&&!draft?.markdown)throw conflict('No conversation or draft remains at this source');
 const otherModel=plugin._suggestionReplyDrafts?.get(draftKey(target))?.snapshot(),other=otherModel?.draft||plugin.app.loadLocalStorage(draftKey(target));
 if(otherModel?.busy||otherModel?.error==='draft-load'||other!=null&&(other.version!==1||typeof other.markdown!=='string'||typeof other.requestId!=='string'||typeof other.sourceRevision!=='string'||other.markdown.trim()))throw conflict('A destination draft was preserved');
 const current=require('./public-api.js').suggestionState(await plugin.loadTextFromVault(path),path,source.date);
 if(!current.exists)throw conflict('The selected note has no Suggestions section');
 const originPath=records[0]?.originPath||index.find(s=>draftKey(s)===draftKey(source))?.originPath||model?.source.originPath||source.path;
 const from={path:source.path,date:source.date,originPath};
 const fingerprint=createHash('sha256').update(JSON.stringify({from,records,draft,other,revision:current.revision})).digest('hex');
 return {source:from,target:{...current,originPath},fingerprint,count:records.length?require('./suggestion-replies.js').parse(records[0].raw).replies.length:0,draft:!!draft?.markdown};
}
module.exports={previewRelink};
