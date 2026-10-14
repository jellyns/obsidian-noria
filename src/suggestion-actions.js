"use strict";
const {Modal,Notice,Menu,Component,MarkdownRenderer,setIcon}=require('obsidian');
const {suggestionEdit}=require('./suggestion-edit.js');
const {suggestionItems,replaceSuggestionItem,appendSuggestionItem}=require('./suggestion-items.js');
const {extractH2Section}=require('./public-api.js');
const {createReviewMarkdownEditor}=require('./review-markdown-editor.js');
const text=plugin=>(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en;
function errorText(plugin,error){return error.code==='conflict'?text(plugin)('建议已更新，未覆盖新内容。请打开来源核对。','Suggestions changed. New content was preserved; open the source to review.'):error.message;}
// A save can replace the card after the editor closes. Restore only abandoned
// focus, inside the original workspace, without interrupting another control.
function restoreSuggestionFocus(shell,index=-1){
 const doc=shell.ownerDocument,scope=shell.closest('.workspace-leaf-content')||doc,win=doc.defaultView,id=shell.dataset.noriaWidgetId||shell.dataset.diaryCard;
 const restore=()=>{
  if(doc.activeElement!==doc.body&&doc.activeElement?.isConnected)return;
  const card=[...scope.querySelectorAll('.dashboard-home-widget-shell,.noria-diary-card')].find(el=>(el.dataset.noriaWidgetId||el.dataset.diaryCard)===id);
  if(!card?.getClientRects().length)return;
  const rows=card.querySelectorAll('.noria-suggestion-item-more');
  if(index>=0&&!rows.length)return;
  (index<0?card.querySelector('.noria-suggestion-add'):rows[Math.min(index,rows.length-1)]||card.querySelector('.noria-suggestion-add'))?.focus({preventScroll:true});
 };
 const observer=new win.MutationObserver(restore);observer.observe(scope===doc?doc.body:scope,{childList:true,subtree:true});win.setTimeout(()=>observer.disconnect(),1000);win.requestAnimationFrame(restore);
}
function showUndo(plugin,change){
  if(!change.after.changed)return;
  const t=text(plugin),fragment=document.createDocumentFragment();fragment.append(document.createTextNode(t('建议已移除 ','Suggestions removed ')));
  const button=document.createElement('button');button.className='noria-review-text-action';button.textContent=t('撤销','Undo');fragment.append(button);
  const notice=new Notice(fragment,12000);
  button.onclick=async()=>{button.disabled=true;try{await change.undo();notice.hide();}catch(error){new Notice(errorText(plugin,error));button.disabled=false;}};
}
class SuggestionEditor extends Modal{
  constructor(plugin,source,item=null,returnFocus=null){super(plugin.app);this.plugin=plugin;this.source=source;this.item=item;this.returnFocus=returnFocus;this.t=text(plugin);this.model=suggestionEdit(plugin.api,source);this.key=source.path+'\n'+source.date+(item?'\n'+(item.add?'add':item.start+':'+item.end):'');this.drafts=plugin._suggestionEditDrafts||(plugin._suggestionEditDrafts=new Map());this.body=this.drafts.get(this.key)?.markdown??(item?.add?'- ':item?.markdown??source.markdown);this.busy=false;}
  onOpen(){
    const t=this.t;this.setTitle(this.item?.add?t('添加建议','Add suggestion'):t('修改建议','Edit suggestion'));this.modalEl.addClass('noria-suggestion-editor');this.release=this.plugin.cards.trackModal(this);
    const prior=this.drafts.get(this.key);this.conflicted=!!prior&&prior.revision!==this.source.revision;
    if(this.conflicted){const conflict=this.contentEl.createDiv({cls:'noria-suggestion-edit-conflict',text:t('建议已更新；下面保留你的草稿，请先核对来源。','Suggestions changed; your draft is retained below. Review the source first.')});const latest=conflict.createEl('button',{text:t('放弃草稿并载入最新','Discard draft and load latest')});latest.onclick=async()=>{latest.disabled=true;try{const source=await this.plugin.api.suggestions.read({date:this.source.date});if(source.path!==this.source.path)throw Object.assign(Error('Source moved'),{code:'conflict'});this.drafts.delete(this.key);this.close();new SuggestionEditor(this.plugin,source).open();}catch(error){new Notice(errorText(this.plugin,error));latest.disabled=false;}};}
    const location=this.contentEl.createDiv({cls:'noria-suggestion-edit-location'});
    location.createSpan({text:t('保存到：','Save to: ')});
    location.createSpan({text:this.source.path+' → ## 建议'});
    const host=this.contentEl.createDiv({cls:'noria-diary-editor'});
    this.editor=createReviewMarkdownEditor({app:this.app,container:host,file:this.app.vault.getAbstractFileByPath(this.source.path),value:this.body,onChange:body=>{this.body=body;this.drafts.set(this.key,{markdown:body,revision:prior?.revision||this.source.revision});},onSave:()=>void this.save(),onExit:()=>this.close()});
    this.error=this.contentEl.createDiv({cls:'noria-card-error',attr:{role:'alert'}});this.error.hidden=true;
    const actions=this.contentEl.createDiv({cls:'noria-suggestion-edit-actions'});
    const source=actions.createEl('button',{text:t('打开来源','Open source')});source.title=this.source.date+' · '+this.source.path;source.onclick=()=>{this.returnFocus=null;this.close();void openSource(this.plugin,this.source).catch(error=>new Notice(errorText(this.plugin,error)));};
    const cancel=actions.createEl('button',{text:t('取消','Cancel')});cancel.onclick=()=>this.close();
    this.submit=actions.createEl('button',{text:t('保存','Save'),cls:'mod-cta'});this.submit.disabled=this.conflicted;this.submit.onclick=()=>void this.save();
    this.editor.focus();
  }
  async save(){
    if(this.busy||this.conflicted||this.editor?.isComposing())return;
    this.busy=true;this.submit.disabled=true;this.error.hidden=true;
    try{
      if(this.item?.add&&!this.body.replace(/^\s*[-+*]\s*$/,'').trim())throw Error(this.t('请先填写建议。','Enter a suggestion first.'));
      const markdown=this.item?.add?appendSuggestionItem(this.source.markdown,this.body):this.item?replaceSuggestionItem(this.source.markdown,this.item,this.body):this.body;
      const change=await this.model.save(markdown);this.drafts.delete(this.key);if(!this.body.trim())showUndo(this.plugin,change);this.close();
    }
    catch(error){this.error.hidden=false;this.error.setText(errorText(this.plugin,error));}
    finally{this.busy=false;this.submit.disabled=this.conflicted;}
  }
  onClose(){this.editor?.dispose();this.release?.();this.contentEl.empty();this.returnFocus?.();}
}
async function openSource(plugin,source){
  const raw=await plugin.loadTextFromVault(source.path),section=extractH2Section(raw,'建议');
  return plugin.openReviewSourceFile(source.path,{line:section.line,newLeaf:true});
}
async function mountSuggestionActions(plugin,host,selection){
  const shell=host.closest('.dashboard-home-widget-shell,.noria-diary-card');if(!shell)return()=>{};
  const source=await plugin.api.suggestions.read({date:selection.date});
  if(source.path!==selection.path||source.markdown!==selection.markdown)return()=>{};
  const t=text(plugin),actions=source.exists?[
    {label:t('修改建议','Edit suggestions'),icon:'pencil',run:async()=>{const latest=await plugin.api.suggestions.read({date:source.date});if(latest.path!==source.path)throw Object.assign(Error(errorText(plugin,{code:'conflict'})),{code:'conflict'});new SuggestionEditor(plugin,latest).open();}},
    {label:t('打开建议来源','Open suggestion source'),icon:'file-text',run:()=>openSource(plugin,source)},
    {label:t('移除本次建议','Remove these suggestions'),icon:'circle-minus',run:async()=>showUndo(plugin,await suggestionEdit(plugin.api,source).save(''))}
  ]:[];
  actions.push({label:t('建议用法','Using suggestions'),icon:'circle-help',run:()=>plugin.openUserGuide('suggestions')});
  const cleanup=await mountItems(plugin,host,shell,source);
  shell._noriaRecordActions=[...shell._noriaRecordActions||[],...actions];
  return()=>{cleanup();shell._noriaRecordActions=(shell._noriaRecordActions||[]).filter(action=>!actions.includes(action));};
}

async function mountItems(plugin,host,shell,source){
  const content=host.querySelector('.dashboard-home-markdown-daily-section-content');if(!content)return()=>{};
  const t=text(plugin),component=new Component();component.load();let menu;
  const tools=shell.querySelector('.dashboard-guide-card__tools,.dashboard-home-widget-title-actions,.noria-diary-card-tools');
  tools?.classList.add('noria-suggestion-header-tools');
  const add=(tools||content).createEl('button',{cls:'clickable-icon noria-suggestion-add',attr:{'aria-label':t('添加建议','Add suggestion'),title:t('添加建议','Add suggestion')}});setIcon(add,'plus');
  if(tools)tools.insertBefore(add,tools.querySelector('.dashboard-home-widget-shell-actions,.noria-diary-card-menu'));
  add.onclick=async()=>{add.disabled=true;try{const latest=await plugin.api.suggestions.read({date:source.date});if(latest.path!==source.path)throw Object.assign(Error('Source moved'),{code:'conflict'});new SuggestionEditor(plugin,latest,{add:true},()=>restoreSuggestionFocus(shell)).open();}catch(error){new Notice(errorText(plugin,error));}finally{add.disabled=false;}};
  // Build off-DOM so a renderer failure leaves the original Markdown readable.
  const list=document.createElement('div');list.className='noria-suggestion-items';
  try{
    if(!source.markdown.trim()){
      const empty=list.createDiv({cls:'noria-capture-empty'});
      empty.createEl('small',{text:t('把自己或助手给出的建议放在这里，方便随时查看和调整。','Keep suggestions from yourself or an assistant here, ready to review and adjust.')});
      const actions=empty.createDiv({cls:'noria-suggestion-empty-actions'});
      const create=actions.createEl('button',{cls:'noria-capture-empty-action',text:t('添加建议','Add suggestion')});
      create.onclick=async()=>{create.disabled=true;try{await add.onclick();}finally{create.disabled=false;}};
      const guide=actions.createEl('button',{cls:'noria-review-text-action',text:t('如何使用','How it works')});
      guide.onclick=()=>plugin.openUserGuide('suggestions');
    }
    for(const [index,item] of suggestionItems(source.markdown).entries()){
      const row=list.createDiv({cls:'noria-suggestion-item'}),body=row.createDiv({cls:'noria-suggestion-item-body markdown-rendered'});
      await MarkdownRenderer.render(plugin.app,item.markdown,body,source.path,component);
      const more=row.createEl('button',{cls:'clickable-icon noria-suggestion-item-more',attr:{'aria-label':t('建议操作','Suggestion actions')+' · '+body.textContent.trim().slice(0,60),title:t('建议操作','Suggestion actions'),'aria-haspopup':'menu','aria-expanded':'false'}});setIcon(more,'ellipsis');
      more.onclick=()=>{
        menu?.hide();menu=new Menu();more.setAttribute('aria-expanded','true');menu.onHide(()=>{more.setAttribute('aria-expanded','false');if(more.isConnected)more.focus({preventScroll:true});});menu.addItem(action=>action.setTitle(t('修改','Edit')).setIcon('pencil').onClick(()=>new SuggestionEditor(plugin,source,item,()=>restoreSuggestionFocus(shell,index)).open()));
        menu.addItem(action=>action.setTitle(t('删除','Delete')).setIcon('trash-2').onClick(async()=>{try{showUndo(plugin,await suggestionEdit(plugin.api,source).save(replaceSuggestionItem(source.markdown,item,'')));restoreSuggestionFocus(shell,index);}catch(error){new Notice(errorText(plugin,error));}}));
        const r=more.getBoundingClientRect();menu.showAtPosition({x:r.left,y:r.bottom});
      };
    }
    content.replaceChildren(list);if(!tools)content.append(add);content.classList.add('noria-suggestion-content');host.classList.add('noria-suggestion-section');
  }catch(error){component.unload();add.remove();throw error;}
  return()=>{menu?.hide();component.unload();add.remove();tools?.classList.remove('noria-suggestion-header-tools');};
}
module.exports={mountSuggestionActions,SuggestionEditor};
