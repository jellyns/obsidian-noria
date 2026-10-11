"use strict";
const { DiaryWorkspace } = require("./diary-workspace.js");
const {Menu,setIcon,setTooltip}=require("obsidian");
const {internal,pagePicture}=require("./workbench-pages.js");
const renderCardPage=(...args)=>require("./workbench-page-view.js").renderCardPage(...args);

// The workbench keeps one quiet navigation row above independent scroll areas.
// Home keeps its composition; date writing and review receive their own space.
// Obsidian colors, fonts and calendar geometry remain the visual authority.
class NoriaWorkbench {
  constructor(view, initial = {}) {
    this.view = view; this.plugin = view.plugin; this.host = view.hostEl;
    this.store=this.plugin.cards.pages;
    const config=this.store.read(),requested=initial.page==="review"?"diary":initial.page;
    const chosen=config.pages.find(p=>p.id===requested)||config.pages.find(p=>p.id===config.defaultPage);
    this.active=internal(chosen)?chosen.id:config.pages.find(p=>internal(p)&&!p.hidden).id;
    this.initialTarget=!requested&&!internal(chosen)?chosen.id:null;
    this.customEditing=false;this.customVersions=new Map();
    this.mediaKind=['book','movie','music','game'].includes(initial.mediaKind)?initial.mediaKind:'';
    this.mediaScrolls={...(initial.mediaScrolls||{})};
    this.intent = initial.page === "review" || initial.intent === "review" ? "review" : "record";
    this.selection = this.plugin.resolveReviewSelection(initial.selection || {});
    this.pages = new Map(); this.loads = new Map(); this.serial = 0;
    this.scrolls = {...(initial.scrolls || {})};
    this.diaryCards = initial.diaryCards;
    this.navigationId=`noria-pages-${crypto.randomUUID()}`;
    this.nav = this.host.createDiv({cls: "noria-workbench-nav", attr: {role: "navigation", "aria-labelledby": this.navigationId+"-label"}});
    this.nav.createSpan({text:this.t("navigation"),attr:{id:this.navigationId+"-label",hidden:""}});
    this.tabs=this.nav.createDiv({cls:"noria-workbench-tabs",attr:{role:"tablist","aria-labelledby":this.navigationId+"-label"}});
    this.body = this.host.createDiv({cls: "noria-workbench-pages"});
    this.syncNavigation();
    this.unsubscribePages=this.store.subscribe(event=>this.syncPages(event));
    this.navObserver=new this.host.ownerDocument.defaultView.ResizeObserver(()=>this.syncNavigation());
    this.navObserver.observe(this.host);
    this.finishLayoutButton=this.nav.createEl("button",{cls:"noria-workbench-finish-layout",attr:{type:"button","aria-label":this.text("完成布局调整","Finish arranging cards")}});
    setIcon(this.finishLayoutButton,"check");setTooltip(this.finishLayoutButton,this.text("完成布局调整","Finish arranging cards"));
    this.finishLayoutButton.onclick=()=>void this.setLayoutEditing(false).catch(e=>this.error(e));
    this.layoutButton=this.nav.createEl("button",{cls:"noria-workbench-layout",attr:{type:"button"}});
    this.layoutButton.onclick=()=>this.openLayoutMenu();this.updateLayoutButton();
    this.stopDayClock=this.plugin.dayClock?.watch(()=>this.refreshForDay(),this.host.ownerDocument?.defaultView);
  }
  syncNavigation(){
    const focused=this.host.ownerDocument.activeElement?.dataset.noriaPage;
    const config=this.store.read();
    for(const page of config.pages.filter(internal))if(!this.pages.has(page.id)){
      const panel=this.body.createDiv({cls:`noria-workbench-page noria-workbench-page--${page.id}`,attr:{id:`${this.navigationId}-${page.id}`,role:"tabpanel","data-page-id":page.id}});
      panel.hidden=page.id!==this.active;this.pages.set(page.id,{panel});
      panel.addEventListener('focusout',()=>queueMicrotask(()=>{
        const current=this.store.get(page.id);
        if(current?.widgets&&this.loads.has(page.id)&&this.customVersions.get(page.id)!==this.cardVersion(current))void this.refreshCustom(page.id).catch(e=>this.error(e));
      }));
    }
    const visible=config.pages.filter(p=>!p.hidden||p.id===this.active),capacity=Math.max(2,Math.floor((this.host.clientWidth-132)/38));
    const shown=visible.slice(0,capacity);if(!shown.some(p=>p.id===this.active)){const active=visible.find(p=>p.id===this.active);if(active)shown[shown.length-1]=active;}
    const signature=JSON.stringify([shown,visible,this.active]);if(signature===this.navSignature)return;this.navSignature=signature;
    this.navHint?.remove();this.navHint=null;this.tabs.empty();
    const choose=page=>void this.show(page.id).catch(e=>this.error(e));
    for(const page of shown){
      const button=this.tabs.createEl('button',{attr:{type:'button','data-noria-page':page.id,'aria-label':this.store.label(page)}});
      require('./picture-picker.js').renderPicture(this.plugin,button.createSpan({attr:{'aria-hidden':'true'}}),pagePicture(page));
      const name=this.store.label(page);setTooltip(button,name);
      button.onfocus=()=>{this.navHint?.remove();this.navHint=this.nav.createDiv({cls:'noria-workbench-nav-hint',text:name,attr:{'aria-hidden':'true'}});};
      button.onblur=()=>{this.navHint?.remove();this.navHint=null;};
      if(internal(page)){
        button.setAttribute('role','tab');button.setAttribute('aria-selected',String(page.id===this.active));
        button.setAttribute('aria-controls',`${this.navigationId}-${page.id}`);
        const refs=this.pages.get(page.id);refs.button=button;
        refs.panel.setAttribute('aria-label',this.store.label(page));
      }
      button.onclick=()=>choose(page);
      button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
        const index=shown.indexOf(page),next=event.key==='Home'?0:event.key==='End'?shown.length-1:(index+(event.key==='ArrowLeft'?shown.length-1:1))%shown.length;
        this.tabs.querySelectorAll('[data-noria-page]')[next]?.focus();};
    }
    const overflow=visible.filter(p=>!shown.includes(p));
    if(overflow.length){const more=this.tabs.createEl('button',{attr:{type:'button','aria-label':this.text('更多页面','More pages'),'aria-haspopup':'menu'}});
      setIcon(more,'ellipsis');setTooltip(more,this.text('更多页面','More pages'));
      more.onclick=()=>{const menu=new Menu();for(const page of overflow)menu.addItem(item=>item.setTitle(this.store.label(page)).onClick(()=>choose(page)));const r=more.getBoundingClientRect();menu.onHide(()=>more.focus({preventScroll:true}));menu.showAtPosition({x:r.left,y:r.bottom});};}
    if(focused)this.tabs.querySelector(`[data-noria-page="${focused}"]`)?.focus({preventScroll:true});
  }
  async syncPages({layoutOnly=false,pageId,previousPage}={}){
    if(this.disposed)return;
    if(layoutOnly&&previousPage){
      const id=pageId.split(':')[0],page=this.store.get(id);
      // A layout move must not invalidate live editors on the next focusout.
      // Only acknowledge it if no earlier content refresh is still pending.
      if(!this.loads.has(id)||this.customVersions.get(id)===this.cardVersion(previousPage)){
        if(this.loads.has(id))this.customVersions.set(id,this.cardVersion(page));
        return;
      }
    }
    const config=this.store.read(),current=config.pages.find(p=>p.id===this.active);
    if(!current||current.hidden){const fallback=config.pages.find(p=>p.id===config.defaultPage&&internal(p)&&!p.hidden)||config.pages.find(p=>internal(p)&&!p.hidden);await this.show(fallback.id);}
    this.syncNavigation();
    for(const [id,refs] of this.pages)if(!config.pages.some(p=>p.id===id)){
      refs.panel.__noriaHomeCleanup?.();refs.panel.remove();this.pages.delete(id);this.loads.delete(id);this.customVersions.delete(id);delete this.scrolls[id];
    }
    for(const page of config.pages)if(page.widgets&&this.loads.has(page.id)&&this.customVersions.get(page.id)!==this.cardVersion(page)){
      await this.refreshCustom(page.id);
    }
    this.view.app.workspace.requestSaveLayout?.();
  }
  async refreshCustom(id,force=false){
    const refs=this.pages.get(id),page=this.store.get(id);if(!refs||!page?.widgets||this.disposed)return;
    if(this.loads.has(id))await this.loads.get(id);
    if(!force&&!this.canReplace(refs.panel))return;
    const top=refs.panel.scrollTop;
    const pending=renderCardPage(this,id,refs.panel);this.loads.set(id,pending);
    try{await pending;this.customVersions.set(id,this.cardVersion(page));refs.panel.scrollTop=top;}
    catch(error){this.loads.delete(id);throw error;}
  }
  cardVersion(page){return JSON.stringify([page.widgets,page.trendsRange,page.dailyStateRange,page.mediaViews]);}
  canReplace(panel){return !(panel.contains(panel.ownerDocument.activeElement)&&panel.ownerDocument.activeElement?.matches('input,textarea,select,[contenteditable=true]'))&&
    ![...panel.querySelectorAll('textarea,input[type=text]')].some(input=>input.value!==input.defaultValue);}
  t(key) {return this.plugin.t("workbench." + key);}
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  isLayoutEditing(){return this.active==="home"?this.plugin._homeEditMode===true:(this.active==="diary"?this.diary?.cards.editing===true:this.customEditing);}
  updateLayoutButton(){
    if(!this.layoutButton)return;
    const editing=this.isLayoutEditing(),label=this.text("页面设置","Page settings");
    setIcon(this.layoutButton,"settings-2");setTooltip(this.layoutButton,label);
    this.layoutButton.setAttribute("aria-label",label);this.layoutButton.setAttribute("aria-haspopup","menu");
    this.layoutButton.removeAttribute("aria-pressed");
    this.finishLayoutButton.hidden=!editing;

  }
  async setLayoutEditing(value){
    if(this.layoutBusy)return;
    this.layoutBusy=true;this.layoutButton.disabled=true;this.finishLayoutButton.disabled=true;
    try{if(this.active==="home")await this.plugin.setHomeEditMode(value);
      else if(this.active==="diary")this.diary?.cards.setEditing(value);
      else {this.customEditing=value===true;await this.refreshCustom(this.active,true);}
    }finally{this.layoutBusy=false;this.layoutButton.disabled=false;this.finishLayoutButton.disabled=false;this.updateLayoutButton();}
  }
  openLayoutMenu(){
    const menu=new Menu();
    menu.addItem(item=>item.setTitle(this.text("添加本页卡片","Add a card to this page")).setIcon("plus").onClick(()=>{
      const selection=this.diary?.selection||this.selection;
      const context=this.active==="home"?{page:"home"}:this.active==="diary"?this.diary.cards.catalogContext():{page:"custom",pageId:this.active==='media'&&this.mediaKind?'media:'+this.mediaKind:this.active};this.plugin.cards.catalog(context);
    }));
    menu.addItem(item=>item.setTitle(this.isLayoutEditing()?this.text("完成布局调整","Finish arranging cards"):this.text("调整本页布局","Arrange cards on this page")).setIcon(this.isLayoutEditing()?"check":"layout-dashboard").onClick(()=>void this.setLayoutEditing(!this.isLayoutEditing()).catch(e=>this.error(e))));
    if(this.active==='diary'&&['daily','weekly','monthly','yearly'].includes(this.diary?.selection.mode)){
      const context=this.diary.cards.catalogContext();
      menu.addItem(item=>item.setTitle(this.text('默认卡片…','Default cards…')).setIcon('panels-top-left').onClick(()=>this.plugin.cards.catalog({page:'diary',mode:context.mode,selection:context.selection,defaults:true})));
      if(this.plugin.settings.cardLayouts?.notes?.[this.diary.session?.model.path])menu.addItem(item=>item.setTitle(this.text('恢复默认布局','Restore default layout')).setIcon('rotate-ccw').onClick(()=>void context.noteCards.configure(null).catch(e=>this.error(e))));
    }
    menu.addSeparator();
    menu.addItem(item=>item.setTitle(this.text("管理页面","Manage pages")).setIcon("panels-top-left").onClick(()=>new (require('./workbench-page-settings.js').PageSettings)(this).open()));
    this.layoutButton.setAttribute("aria-expanded","true");
    menu.onHide(()=>{this.layoutButton.setAttribute("aria-expanded","false");this.layoutButton.focus({preventScroll:true});});
    const rect=this.layoutButton.getBoundingClientRect();menu.showAtPosition({x:rect.right,y:rect.bottom});
  }
  error(error) {this.pages.get(this.active)?.panel.createDiv({cls: "noria-itemview-error", text: String(error?.message || error)});}
  async ensure(page) {
    if (this.loads.has(page)) return this.loads.get(page);
    this.syncNavigation();
    const panel = this.pages.get(page).panel;
    const load = (async () => {
      if (page === "home") await this.plugin.runNoriaView("dashboardHome", {workbench: true}, panel);
      if (this.store.get(page)?.widgets) {const before=this.store.get(page);await renderCardPage(this,page,panel);this.customVersions.set(page,this.cardVersion(before));}
      if (page === "diary") {this.diary = new DiaryWorkspace(this, panel); await this.diary.select(this.selection, this.intent);}
    })();
    this.loads.set(page, load);
    try {await load;} catch (error) {this.loads.delete(page); throw error;}
  }
  async show(page, selection, intent) {
    // Preserve old workspace destinations and explicit commands to hidden entries.
    if (page === "review") {page = "diary"; intent = "review";}
    if(!this.store.get(page)||this.disposed)return;
    if(page==='day'||page==='calendar'){
      if(this.active==='diary')await this.diary?.flush();
      return page==='day'?this.plugin.openTasksBoardLeaf():this.plugin.openCalendarLeaf(this.active==='diary'?(this.diary?.selection||this.selection):this.selection);
    }
    this.syncNavigation();
    const serial = ++this.serial;
    const previous = this.active;
    if (previous === "diary") {await this.diary?.flush(); this.selection = this.diary?.selection || this.selection;}
    if (serial !== this.serial) return;
    if (selection) this.selection = this.plugin.resolveReviewSelection(selection);
    if (intent) this.intent = intent;
    const old = this.pages.get(previous)?.panel;
    if (this.loads.has(previous)) this.scrolls[previous] = old?.scrollTop||0;
    if (old?.contains(this.host.ownerDocument.activeElement)) this.host.ownerDocument.activeElement.blur();
    this.active = page;
    for (const [name, refs] of this.pages) {
      refs.panel.hidden = name !== page;
      refs.button?.setAttribute("aria-selected", String(name === page));
      if(refs.button)refs.button.tabIndex = name === page ? 0 : -1;
    }
    this.syncNavigation();
    await this.ensure(page);
    if (serial !== this.serial) return;
    if (page === "diary") await this.diary.select(this.selection, this.intent);
    if (serial !== this.serial) return;
    this.updateLayoutButton();
    this.pages.get(page).panel.scrollTop = this.scrolls[page] || 0;
    if(page === "diary" && intent === "review")this.diary.reviewSection?.scrollIntoView({block:"start"});
    this.view.app.workspace.requestSaveLayout?.();
    if(this.initialTarget){const target=this.initialTarget;this.initialTarget=null;await this.show(target);}
  }
  state() {
    const selection = this.active === "diary" ? this.diary?.selection : this.selection;
    return {page: this.active, intent:this.diary?.intent || this.intent, selection: selection || this.selection,
      diaryCards: this.diary?.cards.state() || this.diaryCards,
      mediaKind:this.mediaKind,mediaScrolls:{...this.mediaScrolls},
      scrolls: {...this.scrolls, [this.active]: this.pages.get(this.active)?.panel.scrollTop||0}};
  }
  async refreshForDay(){
    const panel=this.pages.get("home").panel,doc=panel.ownerDocument;
    // Never replace controls while typing or while their anchored editor is open.
    const canReplace=()=>!(doc.querySelector(".modal-container,.noria-record-popover")||panel.querySelector('[aria-busy="true"],[inert]')||
      panel.contains(doc.activeElement)&&doc.activeElement?.matches("input,textarea,select,[contenteditable=true]")||
      [...panel.querySelectorAll("input,textarea")].some(el=>!["checkbox","radio","range","hidden","button","submit","reset","color"].includes(el.type)&&el.value!==el.defaultValue));
    return this.refreshHome(canReplace);
  }
  async refreshHome(canReplace=()=>true) {
    if (this.loads.has("home")) {
      await this.loads.get("home");
      if(!canReplace())return false;
      const panel = this.pages.get("home").panel, top = panel.scrollTop;
      panel.__noriaHomeCleanup?.(); panel.empty();
      await this.plugin.runNoriaView("dashboardHome", {workbench: true}, panel); panel.scrollTop = top;
    }
    return true;
  }
  async refresh() {
    await this.refreshHome();
    this.updateLayoutButton();
    if (this.active === "diary") await this.diary?.refresh();
    for(const page of this.store.read().pages)if(page.widgets&&this.loads.has(page.id))await this.refreshCustom(page.id);
  }
  async refreshTasks() {
    if (this.loads.has("home")) {
      await this.loads.get("home");
      await this.pages.get("home").panel.__noriaHomeTaskRefresh?.();
    }
    if (this.active === "diary") await this.diary?.refreshTasks();
    for(const page of this.store.read().pages)if(page.widgets&&this.loads.has(page.id))await this.pages.get(page.id)?.panel.__noriaHomeTaskRefresh?.();
  }
  dispose() {
    ++this.serial;this.disposed=true;this.unsubscribePages?.();this.navObserver?.disconnect();this.closeCardMenu?.(false);
    for(const page of this.store.read().pages)if(page.widgets)this.pages.get(page.id)?.panel.__noriaHomeCleanup?.();
    this.stopDayClock?.();
    this.diary?.dispose();
    this.pages.get("home").panel.__noriaHomeCleanup?.();
  }
}
module.exports = { NoriaWorkbench };
