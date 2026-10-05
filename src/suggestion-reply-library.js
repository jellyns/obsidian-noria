"use strict";
const {createHash}=require('node:crypto');
const {dayNumber}=require('./countdown-document.js');
const {extractH2Section}=require('./public-api.js');
const DRAFT_INDEX='noria-reply-drafts-v1';
const draftKey=source=>'noria-reply-draft-v1-'+createHash('sha256').update(JSON.stringify([source.path,source.date])).digest('hex');
const validSource=s=>s&&typeof s.path==='string'&&s.path.endsWith('.md')&&!s.path.startsWith('/')&&!/[\\:]/.test(s.path)&&!s.path.split('/').some(p=>!p||p==='.'||p==='..')&&Number.isFinite(dayNumber(s.date));
function conversationFiles(plugin){
 const root=plugin.normalizePath(plugin.settings?.onboarding?.workspaceRoot||'Noria')+'/Conversations/';
 return (plugin.app.vault.getMarkdownFiles?.()||[]).filter(f=>f.path.startsWith(root)||/\d{4}-\d{2}-\d{2}-建议-[a-f0-9]{12}\.md$/.test(f.path));
}
function draftSources(app){
 const stored=app.loadLocalStorage(DRAFT_INDEX);
 if(stored==null)return [];
 if(!Array.isArray(stored)||stored.some(s=>!validSource(s)))throw Error('Draft index could not be read');
 return stored;
}
function indexDraft(app,source,present){
 if(!validSource(source))throw Error('Invalid draft source');
 const old=draftSources(app),key=draftKey(source),found=old.some(s=>draftKey(s)===key);
 if(found===present)return;
 const next=old.filter(s=>draftKey(s)!==key);if(present)next.push({path:source.path,date:source.date,...(source.originPath?{originPath:source.originPath}:{})});
 app.saveLocalStorage(DRAFT_INDEX,next);
 if(JSON.stringify(app.loadLocalStorage(DRAFT_INDEX))!==JSON.stringify(next))throw Error('Draft index could not be saved');
}
async function readReplyLibrary(plugin){
 await require('./suggestion-reply-lifecycle.js').replyCoordinator(plugin).run(()=>{});
 const app=plugin.app,groups=new Map(),unreadable=[];
 const group=source=>{const key=draftKey(source);if(!groups.has(key))groups.set(key,{...source,conversations:[],draft:null});return groups.get(key);};
 // Read Noria conversation candidates, never the body of unrelated vault notes.
 for(const file of conversationFiles(plugin)){
  try{
   const raw=await plugin.loadTextFromVault(file.path),header=/^<!-- noria:conversation (.+) -->\r?\n/.exec(raw);
   if(!header){if(raw.startsWith('<!-- noria:conversation')||/\d{4}-\d{2}-\d{2}-建议-[a-f0-9]{12}\.md$/.test(file.path))unreadable.push(file.path);continue;}
   const record=require('./suggestion-replies.js').parse(raw),meta=record.meta;if(meta.kind)continue;const source={path:meta.sourcePath,date:meta.date};if(!validSource(source))throw Error('Invalid source');
   const item=group(source);if(meta.originPath)item.originPath=meta.originPath;
   item.conversations.push({path:file.path,id:record.id,count:record.replies.length});
  }catch{unreadable.push(file.path);}
 }
 let draftError=false;
 try{for(const source of draftSources(app)){const item=group(source);if(source.originPath)item.originPath=source.originPath;}}catch{draftError=true;}
 for(const model of plugin._suggestionReplyDrafts?.values()||[]){const state=model.snapshot();if(state.draft.markdown)group({path:state.source.path,date:state.source.date});}
 // Existing saved conversations also locate drafts from the previous build.
 for(const item of groups.values()){
  try{const memory=plugin._suggestionReplyDrafts?.get(draftKey(item))?.snapshot(),draft=memory&&memory.error!=='draft-load'?memory.draft:app.loadLocalStorage(draftKey(item));if(draft?.markdown){if(draft.version!==1||typeof draft.markdown!=='string')throw Error('Unknown draft');item.draft=draft;}}catch{item.draftError=true;}
  if(!app.vault.getAbstractFileByPath(item.path)){item.sourceState='missing';continue;}
  try{
   const spec=await plugin.resolveCalendarNoteSpecAsync('daily',item.date);
   item.sourceState=spec.path!==item.path&&!item.originPath?'different-source':extractH2Section(await plugin.loadTextFromVault(item.path),'建议').found?(item.originPath?'relocated':'available'):'missing-section';
  }catch{item.sourceState='unreadable';}
 }
 return {items:[...groups.values()].filter(s=>s.draft||s.draftError||s.conversations.length).sort((a,b)=>b.date.localeCompare(a.date)||a.path.localeCompare(b.path)),unreadable,draftError};
}
module.exports={DRAFT_INDEX,draftKey,draftSources,indexDraft,readReplyLibrary,conversationFiles,validSource};
