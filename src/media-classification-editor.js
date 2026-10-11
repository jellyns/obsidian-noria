"use strict";
const {Notice}=require('obsidian');
const {recordPopover}=require('./record-popover.js');
const {updateMediaClassification}=require('./media-record.js');
const {storedTags,identity}=require('./media-classification.js');
const {mediaDistribution}=require('./media-distribution-model.js');
function classificationEditor(plugin,anchor,snapshot,{items=[],onSaved}={}){
 const text=(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en;
 return recordPopover(anchor,text('分类','Categories'),(host,close)=>{
  host.addClass('noria-media-classification-editor');const form=host.createEl('form'),fields=[];let busy=false;
  let tags,tagError;try{tags=storedTags(snapshot.properties.tags).filter(v=>!identity(v));}catch(e){tags=[];tagError=e.message;}
  const entries=[['tags',text('标签','Tags'),tags]];
  const genre=snapshot.properties.genre;
  if(genre!=null&&genre!==''&&(!Array.isArray(genre)||genre.length))entries.push(['genre',text('类型（属性）','Genre property'),genre]);
  for(const [key,label,raw] of entries){
   const row=form.createDiv({cls:'noria-card-field'}),id='noria-classification-'+crypto.randomUUID();row.createEl('label',{text:label,attr:{for:id}});
   const invalid=raw!=null&&(Array.isArray(raw)?raw.some(v=>typeof v!=='string'):typeof raw!=='string');
   const initial=invalid?JSON.stringify(raw):Array.isArray(raw)?raw.join('；'):raw||'';
   const input=row.createEl('input',{attr:{id,type:'text','aria-label':label,placeholder:text(key==='genre'?'例如：科幻；冒险':'例如：主题/成长；推荐',key==='genre'?'e.g. Science fiction; Adventure':'e.g. topics/growth; favorites')}});input.value=initial;
   const datalist=row.createEl('datalist',{attr:{id:id+'-options'}});input.setAttribute('list',datalist.id);
   const names=mediaDistribution(items,{dimension:key==='genre'?'genre':'tag'}).result.groups.map(g=>g.key);
   const suggestions=()=>{datalist.empty();const parts=input.value.split(/[；;\n]/),prefix=parts.slice(0,-1).join('；'),selected=new Set(parts.slice(0,-1).map(v=>v.trim()));for(const name of names)if(!selected.has(name))datalist.createEl('option',{attr:{value:(prefix?prefix+'；':'')+name}});};suggestions();
   if(invalid)row.createDiv({cls:'noria-card-secondary',text:text('原值格式异常；修改后按文本列表保存。','The existing value has an invalid format. Editing replaces it with a text list.')});
   if(key==='tags'&&tagError){input.disabled=true;row.createDiv({cls:'noria-card-secondary',text:text('标签格式异常，请先在原笔记修正。','Repair the tags format in the source note first.')});}
   const restore=row.createEl('button',{cls:'noria-media-classification-restore',text:text('还原','Restore'),attr:{type:'button','aria-label':text('还原','Restore ')+label}});restore.hidden=true;
   const field={key,input,initial,restore,locked:key==='tags'&&!!tagError};fields.push(field);
   input.oninput=()=>{suggestions();refresh();};restore.onclick=()=>{input.value=initial;suggestions();refresh();input.focus();};
  }
  form.createDiv({cls:'noria-card-secondary',text:text('多项用分号分隔，可选择已有分类。','Separate entries with semicolons, or choose existing categories.')});
  if(snapshot.inlineTags.length)form.createDiv({cls:'noria-media-inline-tags noria-card-secondary',text:text('正文标签：','Tags in note: ')+snapshot.inlineTags.join(' · ')});
  if(snapshot.inlineTags.length||tagError){const source=form.createEl('button',{cls:'noria-media-classification-source',text:text('在原笔记中修改标签','Edit tags in source note'),attr:{type:'button'}});source.onclick=()=>{close();void plugin.app.workspace.openLinkText(snapshot.path,'',true);};}
  const error=form.createDiv({cls:'noria-card-error',attr:{role:'alert'}}),actions=form.createDiv({cls:'noria-record-actions'}),cancel=actions.createEl('button',{text:text('取消','Cancel'),attr:{type:'button'}}),save=actions.createEl('button',{cls:'mod-cta',text:text('保存','Save'),attr:{type:'submit'}});
  cancel.onclick=()=>close();const changed=()=>fields.filter(f=>!f.locked&&f.input.value!==f.initial);
  function refresh(){for(const f of fields)f.restore.hidden=f.input.value===f.initial;save.disabled=busy||!changed().length;}refresh();
  form.onsubmit=async event=>{event.preventDefault();if(busy||!changed().length)return;
   const patch=Object.fromEntries(changed().map(f=>[f.key,f.input.value.split(/[；;\n]/).map(v=>v.trim()).filter(Boolean)]));busy=true;error.setText('');for(const el of form.querySelectorAll('input,button'))el.disabled=true;
   try{const result=await updateMediaClassification(plugin,{path:snapshot.path,revision:snapshot.classificationRevision,patch});const reveal=host.isConnected;await onSaved?.(result,reveal);if(!reveal)new Notice(text('分类已保存','Classification saved'));close();}
   catch(e){const message=e.code==='conflict'?text('分类已在别处修改，当前输入尚未保存。请核对原笔记后重新打开。','Classification changed elsewhere. Your input is retained; check the source note and reopen.'):e.message;if(host.isConnected)error.setText(message);else new Notice(message);}
   finally{busy=false;for(const el of form.querySelectorAll('input,button'))el.disabled=false;for(const f of fields)f.input.disabled=f.locked;refresh();}
  };
 });
}
module.exports={classificationEditor};
