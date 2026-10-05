"use strict";
const {randomUUID}=require('node:crypto');
const {draftKey,indexDraft}=require('./suggestion-reply-library.js');
function moveDraft(app,source,target,draft,oldRevision){
 const from=draftKey(source),to=draftKey(target),existing=app.loadLocalStorage(to);
 if(existing!=null&&(existing.version!==1||typeof existing.markdown!=='string'||typeof existing.requestId!=='string'||typeof existing.sourceRevision!=='string'))throw Object.assign(Error('Unknown destination draft was preserved'),{code:'conflict'});
 if(existing?.markdown&&(existing.requestId!==draft.requestId||existing.markdown!==draft.markdown))throw Object.assign(Error('A different draft already uses the destination'),{code:'conflict'});
 const next={...draft};if(!next.attempted&&next.sourceRevision===oldRevision)next.sourceRevision=target.revision;
 indexDraft(app,target,!!next.markdown.trim());app.saveLocalStorage(to,next);
 if(JSON.stringify(app.loadLocalStorage(to))!==JSON.stringify(next))throw Error('Moved draft could not be saved');
 app.saveLocalStorage(from,null);if(app.loadLocalStorage(from)!=null)throw Error('Original draft could not be retired');
 indexDraft(app,source,false);return next;
}
function createReplyDraft({app,source,getApi}){
 const listeners=new Set();let key=draftKey(source),current=source,busy=false,error='',history=null;
 const empty=()=>({version:1,markdown:'',requestId:randomUUID(),sourceRevision:current.revision,expanded:false,attempted:false});
 let draft=empty();
 function readDraft(){try{const stored=app.loadLocalStorage(key);if(stored){if(stored.version!==1||typeof stored.markdown!=='string'||typeof stored.requestId!=='string'||typeof stored.sourceRevision!=='string')throw Error();draft=stored;if(draft.markdown.trim())indexDraft(app,current,true);}error='';}catch{error='draft-load';}}
 readDraft();
 const notify=()=>{for(const listener of listeners)listener();};
 function persist(){
  try{if(draft.markdown.trim())indexDraft(app,current,true);app.saveLocalStorage(key,draft);if(JSON.stringify(app.loadLocalStorage(key))!==JSON.stringify(draft))throw Error();if(!draft.markdown.trim())indexDraft(app,current,false);if(error==='draft-save')error='';}
  catch{error='draft-save';throw Object.assign(Error('Draft could not be saved on this device'),{code:'draft-save'});}
  finally{notify();}
 }
 return {
  snapshot:()=>({draft:{...draft},busy,error,history,source:{...current},stale:!!draft.markdown&&draft.sourceRevision!==current.revision}),
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  reloadDraft(){if(error==='draft-load'){readDraft();notify();}},
  setSource(value){current=value;notify();},
  setHistory(value){history=value;notify();},
  relocate(target,oldRevision){if(error==='draft-load')throw Error('Unreadable draft was preserved');draft=moveDraft(app,current,target,draft,oldRevision);current=target;key=draftKey(target);notify();},
  edit(markdown){if(busy)return;if(error==='draft-load')throw Error('Existing draft could not be read');if(!draft.markdown&&!draft.attempted)draft={...draft,sourceRevision:current.revision};if(draft.attempted&&markdown!==draft.markdown)draft={...draft,requestId:randomUUID(),attempted:false};draft={...draft,markdown,expanded:true};persist();},
  expand(expanded){if(busy||error==='draft-load')return;draft={...draft,expanded};persist();},
  rebase(){if(busy||error==='draft-load')return;draft={...draft,sourceRevision:current.revision,requestId:randomUUID(),attempted:false};error='';persist();},
  async save(){
   if(busy)return;if(error==='draft-load')throw Error('Existing draft could not be read');
   if(!draft.markdown.trim())return;
   busy=true;error='';draft={...draft,attempted:true};
   try{
    persist();const receipt=await getApi().suggestionReplies.submit({date:current.date,sourcePath:current.path,sourceRevision:draft.sourceRevision,requestId:draft.requestId,markdown:draft.markdown});
    history=receipt;draft=empty();persist();return receipt;
   }catch(e){error=e.code||'io-error';throw e;}finally{busy=false;notify();}
  }
 };
}
module.exports={createReplyDraft,draftKey,moveDraft};
