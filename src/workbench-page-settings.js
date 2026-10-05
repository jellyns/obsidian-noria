"use strict";
const {Modal,Menu}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const {BUILTINS,internal,pagePicture}=require('./workbench-pages.js');
const {PicturePicker,renderPicture}=require('./picture-picker.js');

class PageSettings extends Modal {
  constructor(workbench){super(workbench.plugin.app);this.workbench=workbench;this.plugin=workbench.plugin;this.store=this.plugin.cards.pages;this.base=this.store.read();this.draft=structuredClone(this.base);this.dirty=false;this.saving=false;this.untrack=this.plugin.cards.trackModal(this);}
  text(zh,en){return this.store.text(zh,en);}
  onOpen(){this.modalEl.addClass('noria-page-settings');this.setTitle(this.text('管理页面','Manage pages'));this.paint();}
  paint(){
    this.contentEl.empty();
    const list=this.contentEl.createDiv({cls:'noria-page-settings-list'});
    for(const [index,page] of this.draft.pages.entries()){
      const row=list.createDiv({cls:'noria-page-settings-row',attr:{'data-page-id':page.id}});
      const picture=iconButton(row,'image',this.text('更换图样','Change picture'),()=>new PicturePicker(this.plugin,page.picture,value=>{page.picture=value;this.dirty=true;this.paint();}).open());
      renderPicture(this.plugin,picture.createSpan(),pagePicture(page));picture.querySelector(':scope > svg')?.remove();
      const name=row.createEl('input',{attr:{type:'text',maxlength:'40','aria-label':this.text('页面名称','Page name'),placeholder:this.store.label({...page,title:''})}});name.value=page.title;
      name.oninput=()=>{page.title=name.value;this.dirty=true;};
      const controls=row.createDiv({cls:'noria-page-settings-actions'});
      const visible=controls.createEl('label',{cls:'noria-page-visibility'}),check=visible.createEl('input',{attr:{type:'checkbox'}});check.checked=!page.hidden;
      visible.createSpan({text:this.text('显示','Show')});check.onchange=()=>{page.hidden=!check.checked;if(page.hidden&&page.id===this.draft.defaultPage)this.draft.defaultPage=this.draft.pages.find(p=>internal(p)&&!p.hidden)?.id||'home';this.dirty=true;this.paint();};
      if(page.id===this.draft.defaultPage)controls.createSpan({cls:'noria-card-secondary',text:this.text('默认','Default')});
      const menu=iconButton(controls,'ellipsis',this.text('页面操作','Page actions'),()=>{
        const actions=new Menu(),item=(label,icon,fn,disabled=false)=>actions.addItem(entry=>entry.setTitle(label).setIcon(icon).setDisabled(disabled).onClick(()=>{fn();this.dirty=true;this.paint();}));
        item(this.text('设为默认入口','Set as default'),'star',()=>{page.hidden=false;this.draft.defaultPage=page.id;},page.id===this.draft.defaultPage);
        item(this.text('上移','Move up'),'arrow-up',()=>{[this.draft.pages[index-1],this.draft.pages[index]]=[page,this.draft.pages[index-1]];},index===0);
        item(this.text('下移','Move down'),'arrow-down',()=>{[this.draft.pages[index+1],this.draft.pages[index]]=[page,this.draft.pages[index+1]];},index===this.draft.pages.length-1);
        if(!BUILTINS.includes(page.id))item(this.text('移除页面（保留源笔记）','Remove page (keep source notes)'),'trash',()=>{this.draft.pages=this.draft.pages.filter(p=>p!==page);if(this.draft.defaultPage===page.id)this.draft.defaultPage='home';});
        const rect=menu.getBoundingClientRect();actions.showAtPosition({x:rect.right,y:rect.bottom});
      });
    }
    const create=this.contentEl.createEl('form',{cls:'noria-page-create'});
    const name=create.createEl('input',{attr:{type:'text',maxlength:'40',placeholder:this.text('新页面名称','New page name'),'aria-label':this.text('新页面名称','New page name')}});
    const template=create.createEl('select',{attr:{'aria-label':this.text('起始布局','Starting layout')}});
    for(const [value,label] of [['empty',this.text('空白页面','Blank page')],['trends',this.text('趋势与统计','Trends and statistics')]])template.createEl('option',{value,text:label});
    create.createEl('button',{text:this.text('新增','Add'),attr:{type:'submit'}});
    create.onsubmit=event=>{event.preventDefault();if(!name.value.trim()){name.focus();return;}
      const ids=['task-trend-card','habit-history-card','note-trend-card','daily-state-card'];
      const widgets=template.value==='trends'?(this.plugin.buildRuntimeBridgeConfig().homeWidgetDefaults||[]).filter(w=>ids.includes(w.id)).map((w,i)=>({...structuredClone(w),id:`card-${crypto.randomUUID()}`,builtinId:w.id,enabled:true,order:i*10})):[];
      const id=`page-${crypto.randomUUID()}`;this.draft.pages.push({id,title:name.value.trim(),picture:template.value==='trends'?'chart-no-axes-combined':'panels-top-left',hidden:false,widgets});this.created=id;this.dirty=true;this.paint();};
    this.error=this.contentEl.createDiv({cls:'noria-card-error',attr:{role:'alert'}});
    const footer=this.contentEl.createDiv({cls:'noria-card-form-footer'});
    const cancel=footer.createEl('button',{text:this.text('取消','Cancel')});cancel.onclick=()=>this.close();
    this.apply=footer.createEl('button',{text:this.text('应用','Apply'),cls:'mod-cta'});this.apply.onclick=()=>this.save();
  }
  async save(){
    if(this.saving)return;this.saving=true;this.apply.disabled=true;this.error.setText('');
    try{
      await this.workbench.diary?.flush();
      await this.store.configure(this.draft,this.base);this.dirty=false;this.close(true);
      if(this.created)await this.workbench.show(this.created);
    }catch(error){this.error.setText(error.message||String(error));}
    finally{this.saving=false;this.apply.disabled=false;}
  }
  close(saved=false){
    if(this.saving&&!saved)return;
    if(this.dirty&&!saved){if(this.discard?.isConnected){this.discard.querySelector('button')?.focus();return;}
      this.discard=this.contentEl.createDiv({cls:'noria-card-discard'});this.discard.createSpan({text:this.text('放弃未应用的更改？','Discard unapplied changes?')});
      const back=this.discard.createEl('button',{text:this.text('继续编辑','Keep editing')});back.onclick=()=>this.discard.remove();
      const discard=this.discard.createEl('button',{text:this.text('放弃','Discard')});discard.onclick=()=>{this.dirty=false;this.close();};return;
    }super.close();
  }
  onClose(){this.untrack?.();this.contentEl.empty();}
}
module.exports={PageSettings};
