"use strict";
const {MarkdownRenderer,Component}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const {draftFor}=require('./interaction-draft.js');
const {timelineRecordPreview}=require('./timeline-record-preview.js');
async function renderInteraction(plugin,{container,component,config,openSource}){
 const t=(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en,id=config.conversationId;
 if(!id){container.createDiv({cls:'noria-card-secondary',text:t('在卡片设置中选择或新建交互。','Choose or create an interaction in card settings.')});return;}
 const model=draftFor(plugin,id),area=container.createDiv({cls:'noria-interaction'});
 const toolbar=area.createDiv({cls:'noria-interaction-toolbar'}),title=toolbar.createEl('strong');
 const actions=toolbar.createDiv({cls:'noria-interaction-actions'});
 const shell=container.closest('.dashboard-home-widget-shell,.noria-diary-card');
 const outerTitle=shell?.querySelector('.callout-title-inner,.dashboard-guide-card__title');
 const outerActions=shell?.querySelector('.dashboard-home-widget-title-actions,.dashboard-guide-card__tools');
 if(outerActions){outerActions.addClass('noria-interaction-header-actions');outerActions.prepend(actions);component.register(()=>{actions.remove();outerActions.removeClass('noria-interaction-header-actions');});component.registerDomEvent(actions,'click',e=>e.stopPropagation());}
 iconButton(actions,'file-text',t('打开交互记录','Open interaction record'),()=>model.source&&openSource(model.source.path));
 iconButton(actions,'pencil',t('编辑问题','Edit questions'),()=>model.source&&new (require('./interaction-editor.js').InteractionEditor)(plugin,model.source,refresh).open());
 const promptSection=area.createDiv({cls:'noria-interaction-question'}),promptLabel=promptSection.createDiv({cls:'noria-interaction-byline',text:t('新问题','New question')}),prompt=promptSection.createDiv({cls:'noria-interaction-prompt'}),readingError=area.createDiv({cls:'noria-card-error',attr:{role:'alert'}}),history=area.createDiv({cls:'noria-interaction-history'}),body=area.createDiv(),error=area.createDiv({cls:'noria-card-error',attr:{role:'alert'}});promptLabel.hidden=true;
 const expandedAnswers=new Set(),historyFolds=new Map();
 let stopped=false,serial=0,bodyKey='',historyKey='',promptKey='',controls=[],submitting=false,paintQueue=Promise.resolve(),historyComponent,expiryTimer;const renderers=new WeakMap();
 const report=e=>{error.setText(e?(e.message||String(e)):'');};
 const reportReading=e=>{readingError.setText(e?(e.message||String(e)):'');};
 const renderMd=async(text,host,owner=component,keepReading=false)=>{
  const folds=keepReading?[...host.querySelectorAll('.callout.is-collapsible')].map(el=>el.classList.contains('is-collapsed')):[];
  const old=renderers.get(host);if(old)owner.removeChild(old);const child=new Component();owner.addChild(child);renderers.set(host,child);host.empty();
  await MarkdownRenderer.render(plugin.app,text,host,model.source.path,child);
  if(stopped||renderers.get(host)!==child)return;
  for(const [index,el] of [...host.querySelectorAll('.callout.is-collapsible')].entries())if(folds[index]!==undefined&&folds[index]!==el.classList.contains('is-collapsed'))el.querySelector(':scope > .callout-title')?.click();
  require('./interaction-reading.js').attachInteractionReading(plugin,{host,component:child,sourcePath:model.source.path,report:reportReading,reload:()=>renderMd(text,host,owner,true)});
 };
 function historyDetails(parent,key,label){
  const details=parent.createEl('details');details.dataset.historyKey=key;details.open=historyFolds.get(key)||false;details.createEl('summary',{text:label});return details;
 }
 async function renderRound(reply,parent,{previous=false}={}){
  const owner=historyComponent;
  const round=parent.createEl('section',{cls:'noria-interaction-round',attr:{'aria-label':t('一轮交流','Exchange')}});round.dataset.replyId=reply.id;
  const heading=round.createDiv({cls:'noria-interaction-byline'});heading.createSpan({text:previous?t('上一轮交流','Previous exchange'):t('我的回答','My answer')});
  const date=new Date(reply.createdAt);heading.createEl('time',{text:date.toLocaleString(plugin.getNoriaLocale()==='zh'?'zh-CN':'en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}),attr:{datetime:reply.createdAt}});
  const questions=historyDetails(round,'question:'+reply.id,t('当时的问题','Original questions'));questions.addClass('noria-interaction-original');await renderMd(reply.sourceMarkdown,questions.createDiv(),owner);
  if(previous)round.createDiv({cls:'noria-interaction-byline',text:t('我的回答','My answer')});
  const answer=round.createDiv({cls:'noria-interaction-answer'}),preview=timelineRecordPreview(reply.markdown,{maxChars:360,previewChars:160});
  const renderAnswer=async()=>{if(preview.long&&!expandedAnswers.has(reply.id)&&preview.plain){const old=renderers.get(answer);if(old)owner.removeChild(old);renderers.delete(answer);answer.empty();answer.createDiv({text:preview.plain});}else await renderMd(expandedAnswers.has(reply.id)?reply.markdown:preview.markdown,answer,owner);};
  await renderAnswer();
  if(preview.long){
   const toggle=round.createEl('button',{cls:'noria-interaction-read-more',attr:{type:'button'}});toggle.dataset.historyFocus='answer:'+reply.id;
   const label=()=>{const expanded=expandedAnswers.has(reply.id);toggle.setText(expanded?t('收起全文','Collapse'):t('展开全文','Read more'));toggle.setAttribute('aria-expanded',String(expanded));};label();
   toggle.onclick=async()=>{toggle.disabled=true;try{if(expandedAnswers.has(reply.id))expandedAnswers.delete(reply.id);else expandedAnswers.add(reply.id);await renderAnswer();label();}catch(e){report(e);}finally{toggle.disabled=false;}};
  }
  if(reply.response){round.createDiv({cls:'noria-interaction-byline',text:reply.response.agent||'Agent'});await renderMd(reply.response.markdown,round.createDiv({cls:'noria-interaction-response'}),owner);}
  else round.createDiv({cls:'noria-card-secondary',text:reply.state==='claimed'?t('已被 Agent 领取','Claimed by an Agent'):reply.state==='uncertain'?t('处理结果待核对','Outcome needs review'):t('回答已保存','Answer saved')});
 }
 function paintForm(){
  const source=model.source;if(!source)return;const draft=model.draft,key=JSON.stringify([draft?.sourceRevision||source.source.revision,source.source.revision,!draft&&source.replies.some(r=>r.sourceRevision===source.source.revision),draft?.previous||'']);
  const mismatch=draft&&draft.sourceRevision!==source.source.revision;
  const focused=controls.find(c=>c.input===body.ownerDocument.activeElement),selection=focused&&{field:focused.field.id,option:focused.option?.id,start:focused.input.selectionStart,end:focused.input.selectionEnd};
  if(key!==bodyKey){bodyKey=key;body.empty();controls=[];
   if(model.error){report(model.error);return;}
   if(mismatch){const notice=body.createDiv({cls:'noria-interaction-changed'});notice.createSpan({text:t('问题已更新，你的输入已保留。','Questions changed; your draft is preserved.')});const use=notice.createEl('button',{text:t('核对并使用新问题','Review and use new questions')});use.onclick=()=>{try{model.useCurrent();}catch(e){report(e);}};}
   const submitted=source.replies.some(r=>r.sourceRevision===source.source.revision);
   if(!draft&&submitted){const again=body.createEl('button',{text:t('补充回答','Add an answer')});again.onclick=()=>{try{model.begin();}catch(e){report(e);}};return;}
   const definition=draft?.definition||source.definition;
   if(!definition.fields.length)return;
   if(draft?.previous){const prior=body.createEl('details');prior.createEl('summary',{text:t('更新前的回答','Answers before update')});prior.createEl('pre',{cls:'noria-interaction-previous',text:draft.previous});}
   const form=body.createEl('form',{cls:'noria-interaction-form'});
   for(const field of definition.fields){
    const row=form.createEl('fieldset');row.createEl('legend',{text:field.label+(field.required?' *':'')});
    const change=value=>{try{model.set(field.id,value);error.setText('');}catch(e){report(e);}};
    if(field.options){const options=row.createDiv({cls:'noria-interaction-choices'});for(const option of field.options){const label=options.createEl('label',{cls:'noria-interaction-choice'}),input=label.createEl('input',{attr:{type:field.type==='single'?'radio':'checkbox',name:area.dataset.instance+'-'+field.id}});label.createSpan({text:option.label});input.onchange=()=>{const values=model.draft?.answers[field.id]??field.default??[];change(field.type==='single'?option.id:input.checked?[...values,option.id]:values.filter(id=>id!==option.id));};controls.push({field,input,option});}}
    else{const input=row.createEl(field.type==='text'?'textarea':'input',{attr:{...(field.type==='text'?{rows:'2'}:{type:field.type,step:field.type==='number'?'any':undefined}),'aria-label':field.label}});input.oninput=()=>change(field.type==='number'&&input.value!==''?Number(input.value):input.value);controls.push({field,input});}
   }
   const submit=form.createEl('button',{cls:'mod-cta',text:t('保存回答','Save answer'),attr:{type:'submit'}});submit.disabled=!!mismatch||submitting;
   form.onsubmit=async event=>{event.preventDefault();if(submitting||mismatch)return;submitting=true;submit.disabled=true;try{model.begin();await model.submit();error.setText('');}catch(e){report(e);}finally{submitting=false;submit.disabled=false;}};
  }
  for(const {field,input,option} of controls){const value=draft?.answers[field.id]??field.default;if(option)input.checked=field.type==='single'?value===option.id:(value||[]).includes(option.id);else if(input!==input.ownerDocument.activeElement)input.value=value??'';}
  if(selection&&!focused.input.isConnected){const control=controls.find(c=>c.field.id===selection.field&&c.option?.id===selection.option);if(control){control.input.focus({preventScroll:true});if(selection.start!=null&&control.field.type==='text')control.input.setSelectionRange(selection.start,selection.end);}}
 }
 async function paint(){
  if(stopped||!model.source)return;const source=model.source;title.setText(source.definition.title);
  title.hidden=outerTitle?.textContent.trim()===source.definition.title.trim();toolbar.hidden=title.hidden&&!!outerActions;
  if(promptKey!==source.source.revision){promptKey=source.source.revision;await renderMd(source.definition.markdown,prompt);}
  const latest=source.replies.at(-1),newQuestion=!!latest&&latest.sourceRevision!==source.source.revision;
  promptLabel.hidden=!newQuestion;promptSection.toggleClass('is-new-question',newQuestion);
  if(newQuestion)area.insertBefore(history,promptSection);else area.insertBefore(history,body);
  const next=JSON.stringify([source.source.revision,source.replies]);
  if(historyKey!==next){historyKey=next;
   for(const details of history.querySelectorAll('details[data-history-key]'))historyFolds.set(details.dataset.historyKey,details.open);
   history.empty();if(historyComponent)component.removeChild(historyComponent);historyComponent=new Component();component.addChild(historyComponent);
   const older=source.replies.slice(0,-1);
   if(older.length){const details=historyDetails(history,'older',t('此前交流','Earlier exchanges')+` · ${older.length}`);details.addClass('noria-interaction-earlier');for(const r of older)await renderRound(r,details);}
   if(latest)await renderRound(latest,history,{previous:newQuestion});
  }
  paintForm();
 }
 async function refresh(){const token=++serial;try{const value=await plugin.api.interactions.read({conversationId:id});if(!stopped&&token===serial){model.acceptSource(value);clearTimeout(expiryTimer);const expires=value.replies.filter(r=>r.state==='claimed').map(r=>Date.parse(r.claim.expiresAt));if(expires.length)expiryTimer=setTimeout(refresh,Math.max(20,Math.min(...expires)-Date.now()+20));}}catch(e){if(!stopped)report(e);}}
 area.dataset.instance=require('node:crypto').randomUUID();
 component.register(model.subscribe(()=>{paintForm();paintQueue=paintQueue.then(paint).catch(report);}));
 component.registerEvent(plugin.app.vault.on('modify',file=>{if(file.path===model.source?.path)void refresh();}));
 component.registerEvent(plugin.app.vault.on('rename',(file,oldPath)=>{if(oldPath===model.source?.path)void refresh();}));
 component.register(()=>{stopped=true;++serial;clearTimeout(expiryTimer);});await refresh();
}
function registerInteractionCard(system){system.register({id:'noria:interaction',title:system.text('交互','Interaction'),icon:'messages-square',description:system.text('问题、你的回答和 Agent 回应。','Questions, your answers and Agent responses.'),fields:[],validate:config=>system.plugin.api.interactions.read({conversationId:config.conversationId}),render:context=>renderInteraction(system.plugin,context)});}
module.exports={registerInteractionCard,renderInteraction};
