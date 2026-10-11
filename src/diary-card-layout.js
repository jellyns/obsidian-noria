"use strict";
const {setIcon} = require("obsidian");
const {CARD_IDS,normalizeDiaryCards,changeDiaryCardLayout} = require("./card-layout-model.js");
const {iconButton,openCardMenu,addCardLayoutMenuItems,attachCardResize} = require("./card-controls.js");
const noteCards=require('./diary-cards-document.js');

class DiaryCardLayout {
  constructor(workbench,host){
    this.workbench=workbench;this.plugin=workbench.plugin;this.system=this.plugin.cards;this.host=host;this.cards=new Map();
    this.mode=workbench.selection.mode;this.layout=this.system.layout(this.mode,workbench.diaryCards);this.generation=0;
    this.unsubscribe=this.system.subscribe(()=>{
      const before=JSON.stringify(this.layout.cards.record.sections);
      const content=layout=>JSON.stringify([layout.widgets,layout.order.filter(id=>!CARD_IDS.includes(id)).sort().map(id=>[id,layout.cards[id].hidden,layout.cards[id].collapsed])]);
      const previous=content(this.layout);
      this.readLayout();this.apply();if(previous!==content(this.layout))void this.renderExtras();
      const diary=this.workbench.diary;
      if(before!==JSON.stringify(this.layout.cards.record.sections))diary?.refreshReadingScope();
      diary?.renderDailyState();
    });
  }
  readLayout(){
    const shared=this.system.layout(this.mode,this.workbench.diaryCards);
    try{this.noteItems=this.system.noteItems(this.workbench.diary?.session?.model.path,noteCards.readNoteCards(this.workbench.diary?.session?.body||'').items);this.noteError=null;}
    catch(error){this.noteItems=[];this.noteError=error;this.workbench.diary?.report(error);}
    this.layout=this.system.noteLayout(this.workbench.diary?.session?.model.path,noteCards.noteCardsLayout(shared,this.noteItems));
  }
  async refreshNoteCards(){
    const before=JSON.stringify(this.layout);this.readLayout();
    if(before!==JSON.stringify(this.layout)){this.apply();await this.renderExtras();}
  }
  catalogContext(){
    const session=this.workbench.diary?.session;
    const selection=session?.model.selection||this.selection;
    const layout=JSON.parse(JSON.stringify(this.layout)),items=JSON.parse(JSON.stringify(this.noteItems||[]));
    return {page:'diary',mode:selection?.mode||this.mode,selection:{...selection},noteCards:{
      layout:()=>session===this.workbench.diary?.session?this.layout:layout,
      items:()=>session===this.workbench.diary?.session?this.noteItems||[]:items,
      update:change=>this.updateNoteCards(change,session),
      configure:mutate=>this.updatePresentation(mutate,session),
      change:(id,action,value)=>this.change(id,action,value,session)
    }};
  }
  async updateNoteCards(change,session=this.workbench.diary?.session){
    const diary=this.workbench.diary;
    const job=(this.noteQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
      if(!session||session!==diary.session||!await diary.prepareLayoutConceal())throw Error(this.system.text('请先保存当前编辑，再调整本篇卡片','Save current edits before changing note cards'));
      if(session!==diary.session)throw Error(this.system.text('日记已切换，请重新打开设置','Diary changed; reopen settings'));
      const model=session.model,path=model.path;
      const legacy=noteCards.readNoteCards(session.body).items;
      await this.system.updateNoteCards(path,model.selection.mode,legacy,change);
      if(session===diary.session){this.readLayout();this.apply();await this.renderExtras();}
      return true;
    });this.noteQueue=job;return job;
  }
  async updatePresentation(mutate,session=this.workbench.diary?.session){
    if(!session||session!==this.workbench.diary.session)throw Error(this.system.text('日记已切换，请重新打开设置','Diary changed; reopen settings'));
    if(!await this.workbench.diary.prepareLayoutConceal()||session!==this.workbench.diary.session)throw Error(this.system.text('请先保存当前编辑','Save current edits first'));
    const result=await this.system.updateNoteLayout(session.model.path,this.layout,mutate);
    this.readLayout();this.apply();return result;
  }
  add(id,className=""){
    const host=this.host.createDiv({cls:`dashboard-guide-card dashboard-workbench-panel noria-diary-card ${className}`});
    host.dataset.diaryCard=id;host.hidden=true;host._noriaDiaryContext=()=>this.catalogContext();this.cards.set(id,{host,available:false});return host;
  }
  adopt(id,host,body,header,tools,button){
    host.classList.add("noria-diary-card");host.dataset.diaryCard=id;
    this.host.appendChild(host);
    const heading=header.querySelector('.noria-diary-section-heading');
    const card={host,body,tools,button,available:true,title:heading?.lastElementChild?.textContent,titleEl:heading?.lastElementChild,pictureEl:heading?.firstElementChild};this.cards.set(id,card);
    card.resizeCleanup=attachCardResize(host,()=>this.layout.cards[id]?.height,value=>this.change(id,"height",value),this.system.text("调整卡片高度","Resize card height"));
    card.directCleanup=require("./card-direct-controls.js").attachCardDirect(host,{
      state:()=>this.layout.cards[id],header:()=>header,menu:()=>host.querySelector('.noria-review-document-actions button[aria-haspopup="menu"]:last-child')||button,t:key=>this.system.t(key),
      width:value=>this.change(id,"width",value),reorder:(target,after)=>this.change(id,"reorder",{target,after}),stack:(target,after)=>this.change(id,'stack',{target,after})
    });
    this.apply();
  }
  addModuleMenuItems(menu,id){
    const getAnchor=()=>this.cards.get(id)?.host.querySelector('.noria-review-document-actions button[aria-haspopup="menu"]:last-child')||this.cards.get(id)?.button;
    const run=(action,value)=>this.change(id,action,value).catch(error=>{this.workbench.diary.report(error);return false;});
    menu.addSeparator();
    menu.addItem(item=>item.setTitle(this.system.text("卡片设置","Card settings")).setIcon("settings-2").onClick(()=>this.system.catalog(this.catalogContext(),id)));
    addCardLayoutMenuItems(menu,{
      state:()=>{const ids=this.visibleIds();return {...(this.layout.cards[id]),first:ids[0]===id,last:ids.at(-1)===id};},t:key=>this.system.t(key),
      ...this.compositionMenu(id),
      openWidth:()=>require("./card-width-picker.js").openCardWidth({anchor:getAnchor(),getAnchor,state:()=>this.layout.cards[id],width:value=>this.change(id,"width",value),t:key=>this.system.t(key)}),move:value=>this.change(id,"move",value),height:value=>this.change(id,"height",value),collapse:()=>this.workbench.diary.toggleModule(id),
      run:action=>Promise.resolve().then(action).catch(error=>this.workbench.diary.report(error)),
      remove:async()=>{
        if(!await this.workbench.diary.prepareLayoutConceal())return;
        if(await run("hidden",true)===false)return;
        require("./card-direct-controls.js").notifyHidden(this.host.ownerDocument,this.system.t("removed"),()=>this.change(id,"hidden",false),this.system.t("undo"));
      }
    });
  }
  setAvailable(id,value){const card=this.cards.get(id);if(card)card.available=value;this.apply();}
  section(id,title,count){
    const card=this.cards.get(id);card.resizeCleanup?.();card.directCleanup?.();card.host.empty();card.title=title;
    const head=card.host.createDiv({cls:"dashboard-guide-card__head noria-diary-card-head"});
    const label=head.createDiv({cls:"dashboard-guide-card__title"});
    const widget=this.layout.widgets.find(item=>item.id===id),provider=widget&&this.system.providers.get(widget.source);
    card.pictureEl=label.createSpan({cls:"noria-card-heading-icon"});card.renderedPicture=null;
    card.defaultPicture=widget?.props?.picture||({tasks:"list-todo",habits:"circle-check"})[id]||provider?.icon||require("./statistic-templates.js").dashboardStatisticIcon(widget)||"blocks";
    card.titleEl=label.createSpan({text:title});if(count!=null)label.createSpan({cls:"noria-diary-card-count",text:String(count)});
    const tools=head.createDiv({cls:"dashboard-guide-card__tools noria-diary-card-tools"});
    const menu=iconButton(tools,"ellipsis",this.plugin.t("workbench.cardLayout"),()=>this.openMenu(id,menu));
    menu.addClass("noria-diary-card-menu");menu.setAttribute("aria-haspopup","menu");card.button=menu;
    card.body=card.host.createDiv({cls:"noria-diary-card-body"});
    card.resizeCleanup=attachCardResize(card.host,()=>this.layout.cards[id]?.height,value=>this.change(id,"height",value),this.system.text("调整卡片高度","Resize card height"));
    card.directCleanup=require("./card-direct-controls.js").attachCardDirect(card.host,{
      state:()=>this.layout.cards[id],header:()=>head,menu:()=>menu,t:key=>this.system.t(key),
      width:value=>this.change(id,"width",value),
      reorder:(target,after)=>this.change(id,"reorder",{target,after}),stack:(target,after)=>this.change(id,'stack',{target,after})
    });
    this.apply();return {body:card.body,tools};
  }
  visibleIds(){return this.layout.order.filter(id=>this.cards.get(id)?.available&&!this.layout.cards[id].hidden);}
  compositionMenu(id){return {stackTargets:()=>this.visibleIds().filter(key=>key!==id).map(key=>({id:key,title:this.cards.get(key)?.title||key})),stack:(target,after)=>this.change(id,'stack',{target,after}),unstack:this.layout.cards[id]?.stack?()=>this.change(id,'unstack'):null};}
  openMenu(id,anchor){
    const widget=this.layout.widgets.find(item=>item.id===id),actions=[];
    const manage=this.cards.get(id)?.host._noriaConfigureWidget;
    if(manage)actions.push({label:this.system.text("管理内容","Manage contents"),icon:"list",run:manage});
    if(id==="habits")actions.push({label:this.system.text("管理习惯","Manage habits"),icon:"list",run:()=>this.workbench.diary.habitStore.manage()});
    actions.push({label:this.system.text("卡片设置","Card settings"),run:()=>this.system.catalog(this.catalogContext(),id)});
    const state=()=>{const visible=this.visibleIds();return {...(this.layout.cards[id]),first:visible.indexOf(id)===0,last:visible.indexOf(id)===visible.length-1};};
    this.closeMenu=openCardMenu({app:this.plugin.app,anchor,title:this.cards.get(id).title,getAnchor:()=>this.cards.get(id)?.button,t:key=>this.system.t(key),state,actions,
      ...this.compositionMenu(id),
      width:value=>this.change(id,"width",value),move:value=>this.change(id,"move",value),collapse:value=>this.change(id,"collapsed",value),
      remove:async()=>{await this.change(id,"hidden",true);require("./card-direct-controls.js").notifyHidden(anchor.ownerDocument,this.system.t("removed"),()=>this.change(id,"hidden",false),this.system.t("undo"));},
      height:value=>this.change(id,"height",value),copy:widget?async()=>{
        if(noteCards.localId(id)){await this.updateNoteCards(items=>noteCards.addNoteCard(items,{...widget,title:this.system.title(widget)+this.system.text(' 副本',' copy')}));return;}
        await this.updateNoteCards(items=>noteCards.addNoteCard(items,{...widget,title:this.system.title(widget)+this.system.text(' 副本',' copy')}));
      }:null});
  }
  async change(id,action,value,session=this.workbench.diary?.session){
    const visible=this.visibleIds();await this.updatePresentation(layout=>changeDiaryCardLayout(layout,id,action,value,visible),session);
    this.cards.get(id)?.button?.focus({preventScroll:true});
  }
  restore(value){this.readLayout();this.apply();}
  setEditing(value){this.editing=value===true;this.host.dataset.noriaLayoutEditing=String(this.editing);}
  async setSelection(selection){this.selection={...selection};this.mode=selection.mode;this.readLayout();this.apply();await this.renderExtras();}
  async renderExtras(){
    const serial=++this.generation;
    for(const [id,card] of this.cards)if(!CARD_IDS.includes(id)){card.cleanup?.();card.resizeCleanup?.();card.directCleanup?.();card.host.remove();this.cards.delete(id);}
    for(const widget of this.layout.widgets){
      this.add(widget.id);const card=this.cards.get(widget.id);card.available=true;
      const {body}=this.section(widget.id,this.system.title(widget));
      if(this.layout.cards[widget.id].hidden||this.layout.cards[widget.id].collapsed)continue;
      const cleanup=await this.system.render(widget,body,this.selection);
      if(serial!==this.generation){cleanup();return;}card.cleanup=cleanup;
    }this.apply();
  }
  apply(){
    // Full-width prose does not consume a slot in the compact card row.
    // Explicit widths remain under the user's control.
    const count=this.visibleIds().filter(id=>this.layout.cards[id].size==='medium').length;
    this.layout.order.forEach((id,index)=>{
      const card=this.cards.get(id);if(!card)return;
      const state=this.layout.cards[id],size=this.plugin.getHomeWidgetSizeLayout(state.size);
      if(card.titleEl){const title=state.title||card.title;if(card.titleEl.textContent!==title)card.titleEl.setText(title);if(["record","review"].includes(id))card.host.setAttribute("aria-label",title);}
      const picture=state.picture||card.defaultPicture||({record:"notebook-pen",review:"book-open"})[id];
      if(card.pictureEl&&picture!==card.renderedPicture){require("./picture-picker.js").renderPicture(this.plugin,card.pictureEl,picture);card.renderedPicture=picture;}
      card.host.hidden=!card.available||state.hidden;
      card.host.dataset.noriaWidgetSpan=String(state.span??(state.size==="medium"&&count?Math.max(size.span,12/Math.min(count,3)):size.span));
      card.host.style.setProperty("--noria-widget-span",card.host.dataset.noriaWidgetSpan);
      card.host.toggleAttribute("data-noria-custom-width",state.span!=null);
      card.host.dataset.noriaWidgetSize=state.size;card.host.dataset.collapsed=String(state.collapsed);
      card.host.toggleAttribute('data-noria-overview-paired',this.layout.widgets.find(w=>w.id===id)?.source==='noria:period-overview'&&this.selection?.mode==='daily'&&Number(card.host.dataset.noriaWidgetSpan)<12);
      card.host.style.setProperty("--noria-card-height",state.height&&!state.collapsed?`${state.height}px`:"auto");
      if(card.body)card.body.hidden=state.collapsed;
      if(card.tools){card.tools.hidden=state.collapsed;if(id==="review")card.button.hidden=!!this.workbench.diary?.review&&!state.collapsed;}
    });
    require('./card-composition-view.js').applyCardComposition(this.host,this.layout.order.filter(id=>this.cards.has(id)).map(id=>({id,host:this.cards.get(id).host,stack:this.layout.cards[id].stack,span:Number(this.cards.get(id).host.dataset.noriaWidgetSpan)})));
  }
  state(){return this.system.layout(this.mode,this.workbench.diaryCards);}
  dispose(){++this.generation;this.unsubscribe();this.closeMenu?.(false);for(const card of this.cards.values()){card.cleanup?.();card.resizeCleanup?.();card.directCleanup?.();}}
}
module.exports={DiaryCardLayout,normalizeDiaryCards,changeDiaryCardLayout};
