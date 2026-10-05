"use strict";
const {Modal,Menu,Component,MarkdownRenderer}=require('obsidian');
const {randomUUID}=require('node:crypto');
const {iconButton}=require('./card-controls.js');
class InteractionEditor extends Modal{
 constructor(plugin,record,onSaved){super(plugin.app);this.plugin=plugin;this.record=record;this.onSaved=onSaved;this.draft=structuredClone(record?.definition||{title:'',markdown:'',fields:[]});this.id=record?.id||randomUUID();this.requestId=randomUUID();this.dirty=false;this.untrack=plugin.cards.trackModal(this);}
 t(zh,en){return this.plugin.getNoriaLocale()==='zh'?zh:en;}
 input(parent,label,type,value,change){const wrap=parent.createEl('label',{cls:'noria-card-field'});wrap.createSpan({text:label});const input=wrap.createEl(type==='textarea'?'textarea':'input',{attr:type==='textarea'?{rows:'3'}:{type}});if(type==='checkbox')input.checked=!!value;else input.value=value??'';input.oninput=()=>{change(type==='checkbox'?input.checked:input.value);this.dirty=true;};return input;}
 onOpen(){this.modalEl.addClass('noria-interaction-editor');this.setTitle(this.t('编辑交互','Edit interaction'));this.paint();}
 paint(){
  this.contentEl.empty();
  this.body=this.contentEl.createDiv({cls:'noria-interaction-editor-body'});
  this.controls=this.body.createEl('fieldset',{cls:'noria-interaction-editor-controls'});
  const title=this.input(this.controls,this.t('标题','Title'),'text',this.draft.title,v=>this.draft.title=v);title.required=true;title.maxLength=120;title.setAttribute('aria-label',this.t('标题','Title'));
  const section=this.controls.createDiv({cls:'noria-interaction-content-editor'}),head=section.createDiv({cls:'noria-interaction-section-head'});
  const label=head.createEl('label',{text:this.t('正文','Content'),attr:{for:'interaction-content-'+this.id}});
  this.previewButton=head.createEl('button',{text:this.t('预览','Preview'),cls:'noria-interaction-quiet',attr:{type:'button','aria-pressed':'false'}});
  this.markdown=section.createEl('textarea',{attr:{id:label.htmlFor,rows:'8',placeholder:this.t('说明背景，也可以引用笔记或某个小节。','Add context, or embed a note or section.')}});
  this.markdown.maxLength=12000;this.markdown.value=this.draft.markdown||'';this.markdown.oninput=()=>{this.draft.markdown=this.markdown.value;this.dirty=true;};
  this.preview=section.createDiv({cls:'noria-interaction-content-preview markdown-rendered'});this.preview.hidden=true;
  this.previewButton.onclick=()=>this.togglePreview();
  const questionHead=this.controls.createDiv({cls:'noria-interaction-section-head noria-interaction-questions-head'});
  questionHead.createSpan({text:this.t('问题','Questions')});
  this.addButton=questionHead.createEl('button',{text:this.t('添加问题','Add question'),cls:'noria-interaction-quiet',attr:{type:'button'}});
  this.addButton.onclick=()=>{const field={id:randomUUID(),label:'',type:'text',required:false};this.draft.fields.push(field);this.dirty=true;this.paintFields(field.id);};
  this.fieldsEl=this.controls.createDiv({cls:'noria-interaction-fields'});this.paintFields();
  this.error=this.body.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
  const footer=this.contentEl.createDiv({cls:'noria-card-form-footer'}),cancel=footer.createEl('button',{text:this.t('取消','Cancel')});cancel.onclick=()=>this.close();
  this.saveButton=footer.createEl('button',{text:this.t('保存','Save'),cls:'mod-cta'});this.saveButton.onclick=()=>this.save();
 }
 async togglePreview(){
  const show=this.preview.hidden;this.preview.hidden=!show;this.markdown.hidden=show;
  this.previewButton.setText(show?this.t('编辑正文','Edit content'):this.t('预览','Preview'));this.previewButton.setAttribute('aria-pressed',String(show));
  this.previewOwner?.unload();this.previewOwner=null;this.preview.empty();
  if(!show){this.markdown.focus();return;}
  const owner=this.previewOwner=new Component();owner.load();
  if(!this.draft.markdown.trim()){this.preview.createSpan({cls:'noria-card-secondary',text:this.t('正文为空','No content yet')});return;}
  const renderHost=this.preview.createDiv();
  try{await MarkdownRenderer.render(this.app,this.draft.markdown,renderHost,this.record?.source?.path||'',owner);}
  catch(e){if(this.previewOwner===owner)this.preview.setText(e.message);}
 }
 paintFields(focusId){
  const fields=this.fieldsEl;fields.empty();this.addButton.disabled=this.draft.fields.length>=12;
  if(!this.draft.fields.length)fields.createDiv({cls:'noria-card-secondary',text:this.t('需要对方回答时，再添加问题。','Add a question when you need a response.')});
  for(const [index,field] of this.draft.fields.entries()){
   const row=fields.createDiv({cls:'noria-interaction-definition-field'});
   const head=row.createDiv({cls:'noria-interaction-field-head'});
   const label=head.createEl('input',{cls:'noria-interaction-question-label',attr:{type:'text','aria-label':this.t('问题 ','Question ')+(index+1),placeholder:this.t('输入问题…','Your question…')}});label.required=true;label.maxLength=120;label.value=field.label;label.oninput=()=>{field.label=label.value;this.dirty=true;};
   const type=head.createEl('select',{attr:{'aria-label':this.t('回答方式','Answer type')}});
   for(const [value,zh,en] of [['single','单选','Single choice'],['multi','多选','Multiple choice'],['text','文本','Text'],['number','数字','Number'],['date','日期','Date']])type.createEl('option',{value,text:this.t(zh,en)});
   type.value=field.type;type.onchange=()=>{field.type=type.value;delete field.default;if(['single','multi'].includes(field.type))field.options=field.options||[{id:randomUUID(),label:''}];else delete field.options;this.dirty=true;this.paintFields(field.id);};
   const more=iconButton(head,'ellipsis',this.t('问题选项','Question options'),()=>{
    const menu=new Menu();
    for(const [delta,zh,en,icon] of [[-1,'上移','Move up','arrow-up'],[1,'下移','Move down','arrow-down']])menu.addItem(item=>item.setTitle(this.t(zh,en)).setIcon(icon).setDisabled(index+delta<0||index+delta>=this.draft.fields.length).onClick(()=>{[this.draft.fields[index+delta],this.draft.fields[index]]=[field,this.draft.fields[index+delta]];this.dirty=true;this.paintFields(field.id);}));
    menu.addSeparator();menu.addItem(item=>item.setTitle(this.t('删除问题','Delete question')).setIcon('trash-2').onClick(()=>{this.draft.fields.splice(index,1);this.dirty=true;this.paintFields(this.draft.fields[Math.min(index,this.draft.fields.length-1)]?.id);if(!this.draft.fields.length)this.addButton.focus();}));
    const box=more.getBoundingClientRect();menu.showAtPosition({x:box.left,y:box.bottom});
   });
   if(field.options){
    for(const [optionIndex,option] of field.options.entries()){
     const entry=row.createDiv({cls:'noria-interaction-option-edit'});entry.createSpan({cls:'noria-interaction-option-marker',text:field.type==='single'?'○':'□',attr:{'aria-hidden':'true'}});
     const input=entry.createEl('input',{attr:{type:'text','aria-label':this.t('选项 ','Option ')+(optionIndex+1),placeholder:this.t('选项内容','Option text')}});input.required=true;input.maxLength=160;input.value=option.label;input.oninput=()=>{option.label=input.value;this.dirty=true;defaultsLabels.get(option.id)?.setText(input.value||this.t('未命名','Untitled'));};
     iconButton(entry,'x',this.t('移除选项','Remove option'),()=>{field.options=field.options.filter(o=>o!==option);if(field.type==='single'&&field.default===option.id)delete field.default;if(field.type==='multi'&&field.default)field.default=field.default.filter(id=>id!==option.id);this.dirty=true;this.paintFields(field.id);}).disabled=field.options.length===1;
    }
    const add=row.createEl('button',{text:this.t('添加选项','Add option'),cls:'noria-interaction-quiet'});add.disabled=field.options.length>=20;add.onclick=()=>{field.options.push({id:randomUUID(),label:''});this.dirty=true;this.paintFields();const rows=[...fields.children];[...rows[index].querySelectorAll('.noria-interaction-option-edit input')].at(-1)?.focus();};
   }
   const tail=row.createDiv({cls:'noria-interaction-defaults'}),required=tail.createEl('label',{cls:'noria-interaction-choice'}),check=required.createEl('input',{attr:{type:'checkbox'}});check.checked=!!field.required;required.createSpan({text:this.t('必填','Required')});check.onchange=()=>{field.required=check.checked;this.dirty=true;};
   const defaults=row.createEl('details',{cls:'noria-interaction-field-default'}),summary=defaults.createEl('summary');
   const summaryText=()=>summary.setText(this.t('默认回答','Default answer')+(field.default!==undefined&&field.default!==''&&(!Array.isArray(field.default)||field.default.length)?this.t(' · 已设置',' · Set'):''));summaryText();
   const defaultsLabels=new Map();
   if(field.type==='single'||field.type==='multi'){
    for(const option of field.options){const wrap=defaults.createEl('label',{cls:'noria-interaction-choice'}),input=wrap.createEl('input',{attr:{type:field.type==='single'?'radio':'checkbox',name:field.id+'-default'}});defaultsLabels.set(option.id,wrap.createSpan({text:option.label||this.t('未命名','Untitled')}));input.checked=field.type==='single'?field.default===option.id:(field.default||[]).includes(option.id);input.onchange=()=>{field.default=field.type==='single'?option.id:input.checked?[...(field.default||[]),option.id]:(field.default||[]).filter(id=>id!==option.id);this.dirty=true;summaryText();};}
    const clear=defaults.createEl('button',{text:this.t('不预选','No default'),cls:'noria-interaction-quiet'});clear.onclick=()=>{delete field.default;defaults.querySelectorAll('input').forEach(input=>input.checked=false);this.dirty=true;summaryText();};
   }else this.input(defaults,this.t('默认值（可选）','Default (optional)'),field.type==='text'?'text':field.type,field.default,v=>{if(v==='')delete field.default;else field.default=field.type==='number'?Number(v):v;summaryText();});
   if(focusId===field.id)label.focus();
  }
 }
 async save(){if(this.saving)return;this.error.empty();
  const missing=[...this.controls.querySelectorAll('input[required]')].find(input=>!input.value.trim());
  if(missing){this.error.setText(this.t('请填写','Please fill in ')+missing.getAttribute('aria-label')+this.t('。','.'));missing.focus();return;}
  this.saving=true;this.saveButton.disabled=true;this.controls.disabled=true;try{
  const record=await this.plugin.api.interactions.publish({conversationId:this.id,requestId:this.requestId,revision:this.record?.source.revision||null,date:this.record?.date||this.plugin.getLocalYmd(),definition:structuredClone(this.draft)});this.dirty=false;this.close(true);await this.onSaved?.(record);
 }catch(e){this.error.setText(e.message);this.error.scrollIntoView({block:'nearest'});}finally{this.saving=false;this.saveButton.disabled=false;this.controls.disabled=false;}}
 close(force=false){if(this.saving&&!force)return;if(this.dirty&&!force){if(this.discard?.isConnected)return;this.discard=this.contentEl.createDiv({cls:'noria-card-discard'});this.discard.createSpan({text:this.t('放弃未保存的修改？','Discard unsaved changes?')});const keep=this.discard.createEl('button',{text:this.t('继续编辑','Keep editing')});keep.onclick=()=>this.discard.remove();const discard=this.discard.createEl('button',{text:this.t('放弃','Discard')});discard.onclick=()=>this.close(true);return;}super.close();}
 onClose(){this.previewOwner?.unload();this.previewOwner=null;this.untrack?.();this.contentEl.empty();}
}
async function interactionPicker(plugin,parent,catalog){
 const serial=catalog.generation,wrap=parent.createDiv({cls:'noria-card-field'});wrap.createSpan({text:catalog.text('交互内容','Interaction')});
 const select=wrap.createEl('select',{attr:{'aria-label':catalog.text('选择交互','Choose interaction')}}),create=wrap.createEl('button',{text:catalog.text('新建交互','New interaction')});
 const choose=id=>{catalog.draft.props.conversationId=id;catalog.dirty=true;catalog.schedulePreview();};
 const load=async()=>{const {items,truncated,unreadable}=await plugin.api.interactions.list({limit:100});if(serial!==catalog.generation)return;select.empty();select.createEl('option',{value:'',text:catalog.text('选择已有内容…','Choose existing content…')});for(const item of items)select.createEl('option',{value:item.id,text:item.title});select.value=catalog.draft.props.conversationId||'';if(truncated||unreadable.length)wrap.createSpan({cls:'noria-card-secondary',text:catalog.text('仅显示已读取的前 100 项；源目录中可能还有内容。','Showing up to 100 readable items; check the source directory for more.')});};
 select.onchange=()=>choose(select.value);create.onclick=()=>new InteractionEditor(plugin,null,async record=>{if(serial!==catalog.generation)return;choose(record.id);await load();}).open();
 try{await load();}catch(e){wrap.createSpan({cls:'noria-card-error',text:e.message});}
}
module.exports={InteractionEditor,interactionPicker};
