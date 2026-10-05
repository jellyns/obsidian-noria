"use strict";
const {randomUUID}=require('node:crypto');
function draftFor(plugin,id){
 const models=plugin._interactionDrafts||(plugin._interactionDrafts=new Map());if(models.has(id))return models.get(id);
 const key='noria-interaction-draft-v1-'+id,listeners=new Set();let draft=plugin.app.loadLocalStorage(key)||null,source=null,error=null;
 if(draft&&(draft.version!==1||!draft.definition||!draft.answers||!draft.requestId))error=Error('无法读取已有草稿，请先检查本地草稿；未覆盖原内容');
 const emit=()=>{for(const fn of listeners)fn();};
 const persist=()=>{plugin.app.saveLocalStorage(key,draft);if(JSON.stringify(plugin.app.loadLocalStorage(key))!==JSON.stringify(draft))throw Error('草稿未保存，请保留输入并重试');};
 const model={
  get draft(){return draft;},get source(){return source;},get error(){return error;},
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  acceptSource(value){source=value;emit();},
  begin(){if(error)throw error;if(draft)return;draft={version:1,requestId:randomUUID(),sourceRevision:source.source.revision,definition:structuredClone(source.definition),answers:Object.fromEntries(source.definition.fields.filter(f=>f.default!==undefined).map(f=>[f.id,f.default]))};persist();emit();},
  set(id,value){if(error)throw error;this.begin();draft.answers[id]=value;persist();emit();},
  useCurrent(){if(error)throw error;const old=draft;draft=null;this.begin();if(old){draft.previous=require('./interaction-document.js').answerMarkdown(old.definition,old.answers);for(const field of draft.definition.fields){const before=old.definition.fields.find(f=>f.id===field.id);if(before?.type===field.type&&Object.hasOwn(old.answers,field.id)){try{const kept=require('./interaction-document.js').answersFor({fields:[{...field,required:false}]},{[field.id]:old.answers[field.id]});Object.assign(draft.answers,kept);}catch{}}}persist();emit();}},
  async submit(){if(error)throw error;const sent=structuredClone(draft);if(!sent)throw Error('请填写回答');const result=await plugin.api.interactions.submit({conversationId:id,requestId:sent.requestId,sourceRevision:sent.sourceRevision,answers:sent.answers});
   // A second view can keep editing while this write is in flight.
   if(JSON.stringify(draft)===JSON.stringify(sent)){draft=null;persist();}else if(draft){draft.requestId=randomUUID();persist();}source=result;emit();return result;}
 };
 models.set(id,model);return model;
}
module.exports={draftFor};
