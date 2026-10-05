"use strict";
const {Component, MarkdownRenderer, Modal, Notice} = require("obsidian");
const {normalizeDiaryCards, normalizePeriodLayouts, migrateDiaryLayouts, chooseLegacyLayout} = require("./card-layout-model.js");
const {openCardMenu,attachCardResize} = require("./card-controls.js");
const clone=value=>JSON.parse(JSON.stringify(value));
const LABELS={width:["宽度","Width"],small:["窄","Narrow"],medium:["中","Medium"],wide:["宽","Wide"],full:["整行","Full row"],
  up:["上移","Move up"],down:["下移","Move down"],collapse:["收起","Collapse"],expand:["展开","Expand"],
  autoHeight:["自动高度","Automatic height"],copy:["复制卡片","Duplicate card"],hide:["隐藏卡片","Hide card"],show:["显示卡片","Show card"],
  resizeWidth:["拖动调整宽度；方向键左右调整","Drag to resize width; use Left or Right keys"],undo:["撤销","Undo"],hidden:["卡片已隐藏","Card hidden"]};

// Settings own layouts and instance configuration. Source records remain in the vault.
class CardSystem {
  constructor(plugin) {
    this.plugin=plugin;this.app=plugin.app;this.listeners=new Set();this.statisticRangeListeners=new Map();this.providers=new Map();this.mounted=new Set();this.modals=new Set();this.queue=Promise.resolve();
    this.ready=new Promise(resolve=>{this.resolveReady=resolve;});
    this.pages=new (require("./workbench-pages.js").WorkbenchPages)(plugin);
    this.registerBuiltins();
    plugin.registerEvent(this.app.vault.on("rename",(file,oldPath)=>{
      const assets=require("./picture-model.js").renamedAssets(plugin.settings.pictureAssets,oldPath,file.path);
      const previousFolder=plugin.settings.pictureFolder,folder=previousFolder===oldPath?file.path:previousFolder?.startsWith(oldPath+"/")?file.path+previousFolder.slice(oldPath.length):previousFolder;
      if(JSON.stringify(assets)===JSON.stringify(plugin.settings.pictureAssets||{})&&folder===previousFolder)return;
      const previous=plugin.settings.pictureAssets;plugin.settings.pictureAssets=assets;
      plugin.settings.pictureFolder=folder;
      void plugin.saveSettings().then(()=>{this.emit();plugin.requestNoriaRefresh("home","picture:rename");}).catch(e=>{plugin.settings.pictureAssets=previous;plugin.settings.pictureFolder=previousFolder;new Notice(e.message);});
    }));
    this.app.workspace.onLayoutReady(()=>{void this.initialize().catch(error=>{console.error(error);this.resolveReady();});});
    let signature=this.dependencies();
    plugin.registerInterval(setInterval(()=>{const next=this.dependencies();if(next!==signature){signature=next;this.emit();}},1500));
  }
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  t(key){return this.text(...(LABELS[key]||[key,key]));}
  dependencies(){return Object.keys(this.app.plugins.plugins).sort().join("|");}
  async initialize(){
    if(this.disposed)return;
    const candidates=[];
    const visit=value=>{
      if(!value||typeof value!=="object")return;
      if(value.diaryCards)candidates.push({id:`window-${candidates.length+1}`,label:this.text("原窗口 ","Previous window ")+(candidates.length+1),layout:value.diaryCards});
      for(const [key,item] of Object.entries(value))if(key!=="diaryCards")visit(item);
    };
    visit(this.app.workspace.getLayout());
    let migratedHeight=false;
    for(const widget of this.plugin.settings.home?.widgets||[]){
      if(Object.prototype.hasOwnProperty.call(widget.props||{},"cardHeight"))continue;
      const key=({"today-tasks-card":"noria.tray.workbench.tasks.height","inbox-card":"noria.tray.workbench.inbox.height","countdown-card":"noria.tray.workbench.countdown.height","projects-card":"noria.tray.guide.entries.height","moc-strip":"noria.tray.guide.moc.height"})[widget.id];
      if(!key)continue;const height=Number(globalThis.localStorage?.getItem(key));if(Number.isFinite(height)&&height>0){widget.props={...widget.props,cardHeight:Math.max(120,Math.min(1200,height))};migratedHeight=true;}
    }
    const before=this.plugin.settings.cardLayouts;
    this.plugin.settings.cardLayouts=migrateDiaryLayouts(before,candidates);
    if(migratedHeight||JSON.stringify(before)!==JSON.stringify(this.plugin.settings.cardLayouts))await this.plugin.saveSettings();
    const avatarPath=this.plugin.settings.home?.identity?.avatarPath;
    const avatar=avatarPath && this.app.vault.getAbstractFileByPath(avatarPath);
    if(avatar && avatar.extension==="svg") {
      const {isLegacyDefaultAvatar}=require("./noria-identity.js");
      await this.app.vault.process(avatar,text=>isLegacyDefaultAvatar(text)?this.plugin.getSupportSeedText("homeAvatar"):text);
    }
    this.resolveReady();this.emit();this.app.workspace.trigger("noria:cards-ready",this);
  }
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  onStatisticRange(pageId,callback){
    let listeners=this.statisticRangeListeners.get(pageId);
    if(!listeners){listeners=new Set();this.statisticRangeListeners.set(pageId,listeners);}
    listeners.add(callback);
    return()=>{listeners.delete(callback);if(!listeners.size)this.statisticRangeListeners.delete(pageId);};
  }
  emitStatisticRange(pageId,range){
    for(const callback of this.statisticRangeListeners.get(pageId)||[])try{callback(range);}catch(error){console.warn("Noria statistic range refresh",error);}
  }
  emit(){for(const fn of this.listeners)try{fn();}catch(e){console.warn("Noria card refresh",e);}}
  layout(mode,legacy){return normalizeDiaryCards(this.plugin.settings.cardLayouts?.periods?.[mode]||legacy);}
  async ensureLayout(){
    await this.ready;
    const value=normalizePeriodLayouts(this.plugin.settings.cardLayouts);
    if(!value.legacy.length)return true;
    return new Promise(resolve=>{
      const modal=new Modal(this.app);let chosen=false;
      modal.setTitle(this.text("选择要沿用的日记布局","Choose a diary layout to keep"));
      modal.contentEl.createEl("p",{text:this.text("旧窗口保留了不同的布局。选择一份作为日、周、月、年的起点，其他版本仍会保留。","Previous windows have different layouts. Choose a starting layout for each period; the other versions will be retained.")});
      value.legacy.forEach(item=>{const button=modal.contentEl.createEl("button",{text:`${item.label || item.id} · ${item.layout.order.join(" / ")}`});button.onclick=async()=>{
        button.disabled=true;try{this.plugin.settings.cardLayouts=chooseLegacyLayout(this.plugin.settings.cardLayouts,item.id);await this.plugin.saveSettings();chosen=true;this.emit();modal.close();}catch(e){new Notice(String(e.message));button.disabled=false;}
      };});
      modal.onClose=()=>resolve(chosen);modal.open();
    });
  }
  async updateLayout(mode,mutate){
    if(!await this.ensureLayout())return false;
    const job=this.queue.catch(()=>{}).then(async()=>{
      const before=this.plugin.settings.cardLayouts;
      const next=normalizePeriodLayouts(before);
      next.periods[mode]=normalizeDiaryCards(mutate(this.layout(mode)));
      this.plugin.settings.cardLayouts=next;
      try{await this.plugin.saveSettings();}catch(error){this.plugin.settings.cardLayouts=before;throw error;}
      this.emit();return true;
    });this.queue=job;return job;
  }
  trackModal(modal){this.modals.add(modal);return()=>this.modals.delete(modal);}
  catalog(context={page:"home"},id){
    const {CardCatalog}=require("./card-catalog.js");new CardCatalog(this,context,id).open();
  }
  title(widget){
    const names={identity:"identity",metrics:"metrics","today-actions":"todayActions","today-tasks-card":"todayTasks","inbox-card":"inbox","countdown-card":"countdown","projects-card":"projects","moc-strip":"moc","review-focus":"review","trends-range":"trendsRange","note-trend-card":"noteTrend","task-trend-card":"taskTrend","habit-history-card":"habitHistory","habit-heatmap-card":"habitHeatmap","workload-heatmap-card":"workloadHeatmap","tag-distribution-card":"tagDistribution","daily-state-card":"dailyState"};
    const name=names[widget.builtinId||widget.id];return widget.title||(widget.titleKey?this.plugin.t(widget.titleKey):name?this.plugin.t("runtime.home.layoutEdit.widget."+name):widget.source||widget.id);
  }
  attachHomeResize(host,id){
    const widget=()=>this.plugin.settings.home.widgets.find(w=>w.id===id);if(!widget())return()=>{};
    const apply=()=>host.style.setProperty("--noria-card-height",widget()?.props?.cardHeight?`${widget().props.cardHeight}px`:"auto");
    const save=async value=>{const current=widget(),before=current.props.cardHeight;current.props.cardHeight=value==null?null:Math.max(120,Math.min(1200,value));
      try{await this.plugin.saveSettings();apply();}catch(e){current.props.cardHeight=before;throw e;}};
    host._noriaResetHeight=()=>save(null);apply();
    const decorate=()=>{const value=widget()?.props?.picture;if(!value)return;let title=host.querySelector(".dashboard-card-heading-icon,.noria-card-heading-icon,.dashboard-guide-card__dot");if(!title){const heading=host.querySelector(".dashboard-guide-card__title,.dashboard-panel-title");if(heading){title=heading.createSpan({cls:"noria-card-heading-icon"});heading.prepend(title);}}if(title&&title.dataset.pictureRef!==value){title.dataset.pictureRef=value;require("./picture-picker.js").renderPicture(this.plugin,title,value);}};
    const observer=new host.ownerDocument.defaultView.MutationObserver(decorate);observer.observe(host,{childList:true,subtree:true});decorate();
    const direct=require("./card-direct-controls.js").attachCardDirect(host,{
      state:()=>widget()||{},t:key=>this.t(key),
      header:()=>{
        const title=host.querySelector(widget()?.collapsed?".dashboard-home-widget-native-title-actions,.dashboard-guide-card__title,.callout-title-inner":".dashboard-guide-card__title,.dashboard-workbench-panel__title,.noria-card-heading,.dashboard-panel-title,.callout-title-inner,.dashboard-home-trends-habit-history__title,.dashboard-moc-heading");
        return title?.closest(".dashboard-guide-card__head,.dashboard-workbench-panel__head,.noria-card-heading,.callout-title,.dashboard-home-widget-native-title-actions,.dashboard-home-trends-habit-history__head,.dashboard-moc-heading")||title?.parentElement;
      },
      menu:()=>host.querySelector('[data-noria-widget-shell-action="menu"]'),
      size:value=>this.saveHome({...widget(),size:value,layout:{...widget().layout,...this.plugin.getHomeWidgetSizeLayout(value)}}),
      collapse:value=>this.plugin.setHomeWidgetCollapsed(id,value),reorder:(target,after)=>this.reorderHome(id,target,after)
    });
    const cleanup=attachCardResize(host,()=>widget()?.props?.cardHeight,save,this.text("调整卡片高度","Resize card height"));return()=>{observer.disconnect();direct();cleanup();};
  }
  async reorderHome(id,target,after){
    const job=this.queue.catch(()=>{}).then(async()=>{
      const before=clone(this.plugin.settings.home.widgets),sorted=[...before].sort((a,b)=>a.order-b.order);
      const ids=require("./card-layout-model.js").insertCard(sorted.map(w=>w.id),id,target,after);
      this.plugin.settings.home.widgets=ids.map((key,i)=>({...sorted.find(w=>w.id===key),order:(i+1)*10}));
      try{await this.plugin.saveSettings();}catch(e){this.plugin.settings.home.widgets=before;throw e;}
      await this.plugin.requestNoriaRefresh("home",`cards:reorder:${id}`,{immediate:true});
    });this.queue=job;return job;
  }
  async saveHome(widget){
    const before=clone(this.plugin.settings.home.widgets),index=before.findIndex(w=>w.id===widget.id);
    if(index<0)this.plugin.settings.home.widgets.push(clone(widget));else this.plugin.settings.home.widgets[index]=clone(widget);
    try{await this.plugin.saveSettings();}catch(e){this.plugin.settings.home.widgets=before;throw e;}
    await this.plugin.requestNoriaRefresh("home",`cards:configure:${widget.id}:${this.revision=(this.revision||0)+1}`,{immediate:true});
  }
  homeMenu(id,anchor,visibleIds){
    const widget=()=>this.plugin.settings.home.widgets.find(item=>item.id===id);
    if(!widget())return {ok:false};
    const scope=anchor.closest(".workspace-leaf-content")||anchor.ownerDocument;
    const getAnchor=()=>[...scope.querySelectorAll('[data-noria-widget-shell-action="menu"]')].find(item=>item.dataset.noriaWidgetId===id);
    const edit=(action,value)=>this.plugin.editHomeWidget({widgetId:id,action,value,...(action==="move"?{targetId:visibleIds[visibleIds.indexOf(id)+(value==="up"?-1:1)]}:{})});
    const actions=[{label:this.text("卡片设置","Card settings"),run:()=>this.catalog({page:"home"},id)}];
    const local=anchor.closest(".dashboard-home-widget-shell")?._noriaConfigureWidget;
    if(local)actions.unshift({label:this.text("管理内容","Manage contents"),run:local,icon:"list"});
    this.closeMenu=openCardMenu({anchor,title:this.title(widget()),getAnchor,t:key=>this.t(key),actions,
      state:()=>({...widget(),first:visibleIds.indexOf(id)===0,last:visibleIds.indexOf(id)===visibleIds.length-1}),
      size:value=>edit("size",value),move:value=>edit("move",value),hide:async()=>{
        const restore=widget().enabled===false;await edit("enabled",restore);
        if(!restore)require("./card-direct-controls.js").notifyHidden(anchor.ownerDocument,this.t("hidden"),()=>edit("enabled",true),this.t("undo"));
      },
      collapse:value=>this.plugin.setHomeWidgetCollapsed(id,value),
      height:async()=>{const reset=getAnchor()?.closest(".dashboard-home-widget-shell")?._noriaResetHeight;if(reset)await reset();},
      copy:async()=>{const copy=clone(widget());copy.id=`card-${crypto.randomUUID()}`;if(copy.type==="builtin")copy.builtinId=copy.builtinId||id;
        copy.title=this.title(copy)+this.text(" 副本"," copy");copy.order=Number(copy.order)+1;await this.saveHome(copy);}
    });return {ok:true};
  }
  register(provider){
    if(!provider || !/^[\w-]+:[\w-]+$/.test(provider.id) || typeof provider.render!=="function" || !provider.title)throw Error("Invalid Noria card provider");
    if(this.providers.has(provider.id))throw Error(`Card provider already registered: ${provider.id}`);
    const owner=provider.id.split(":")[0];
    const entry={...provider,pluginId:owner};this.providers.set(provider.id,entry);this.emit();
    return()=>{if(this.providers.get(provider.id)!==entry)return;this.providers.delete(provider.id);for(const mount of [...this.mounted])if(mount.provider===entry)mount.dispose();this.emit();};
  }
  registerBuiltins(){
    require("./interaction-card.js").registerInteractionCard(this);
    require("./activity-card.js").registerActivityCard(this);
    this.plugin.propertyStats?.register(this);
    require('./periodic-stat-cards.js').registerPeriodicStats(this,this.plugin);
    this.register({id:"noria:records",title:this.text("每日记录","Daily records"),icon:"notebook-pen",supportsDate:true,description:this.text("填写所选日期的记录项目。","Edit record fields for the selected date."),fields:[],
      render:async({container,selection,component})=>{
        if(selection?.mode&&selection.mode!=="daily"){container.createSpan({text:this.text("每日记录在日记中填写，周期回顾可添加统计卡。","Enter records in a daily note; use a statistics card for period summaries.")});return;}
        const date=selection?.anchorDate||this.plugin.getLocalYmd(),spec=await this.plugin.resolveCalendarNoteSpecAsync("daily",date);let generation=0;
        const paint=async()=>{const serial=++generation,raw=await this.plugin.loadTextFromVault(spec.path);if(serial!==generation)return;container.empty();container.createDiv({cls:"noria-card-secondary",text:date});this.plugin.records.render({host:container,date,raw,onSaved:paint});};
        await paint();component.registerEvent(this.app.metadataCache.on("changed",file=>{if(file.path===spec.path)void paint();}));component.register(()=>++generation);
      }});
    this.register({id:"noria:countdown",title:this.text("倒计时","Countdowns"),icon:"calendar-clock",description:this.text("重要日期、到期提醒与归档。","Important dates, deadlines and archives."),fields:[],render:({container})=>this.plugin.countdowns.render(container)});
    this.register({id:"noria:note",title:this.text("笔记与 Base","Note or Base"),icon:"file-text",description:this.text("嵌入已有笔记、查询或 Base。","Embed an existing note, query or Base."),fields:[{key:"path",label:this.text("源文件","Source file"),type:"file",required:true}],
      render:async({container,component,config})=>{
        const file=this.app.vault.getAbstractFileByPath(config.path);if(!file||!("extension" in file))throw Error(this.text("找不到源文件","Source file not found"));
        let child,generation=0;
        const paint=async()=>{const serial=++generation,content=file.extension==="md"?await this.app.vault.cachedRead(file):`![[${file.path}]]`;if(serial!==generation)return;
          if(child)component.removeChild(child);child=new Component();component.addChild(child);container.empty();await MarkdownRenderer.render(this.app,content,container,file.path,child);};
        await paint();component.registerEvent(this.app.vault.on("modify",changed=>{if(changed.path===file.path)void paint();}));component.register(()=>++generation);
        component.registerDomEvent(container,"click",event=>{const link=event.target.closest?.("a.internal-link");if(link&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();void this.app.workspace.openLinkText(link.dataset.href||link.getAttribute("href"),file.path,true);}},true);
      }});
    for(const [id,title] of [["dataview","Dataview"]]){
      this.register({id:`${id}:note`,title,icon:id==="dataview"?"database":"blocks",pluginId:id,
        description:this.text("展示含该插件组件的笔记；原记录仍由源插件管理。","Display a note containing this plugin's blocks; the source plugin owns its data."),
        fields:[{key:"path",label:this.text("含组件的笔记","Note containing a component"),type:"file",required:true}],
        render:context=>this.providers.get("noria:note").render(context)});
    }
  }
  async render(widget,container,selection){
    const component=new Component();component.load();let disposed=false;
    const provider=this.providers.get(widget.source);
    const instance={provider,dispose:()=>{if(disposed)return;disposed=true;component.unload();this.mounted.delete(instance);}};
    this.mounted.add(instance);
    const mount=container.createDiv({cls:"noria-card-embedded markdown-rendered"});
    try{
      if(require('./statistic-templates.js').isDashboardStatistic(widget)&&selection?.mode){
        await require('./diary-statistic-card.js').renderDiaryStatistic(this.plugin,widget,mount,selection,component);
        return instance.dispose;
      }
      if(!provider)throw Error(this.text("组件尚未注册，请启用提供它的插件。","Card is unavailable. Enable its provider plugin."));
      if(provider.pluginId!=="noria"&&!this.app.plugins.plugins[provider.pluginId]){
        mount.createDiv({cls:"noria-card-empty",text:this.text(`需要启用 ${provider.title}`,`Enable ${provider.title} to use this card`)});
        const button=mount.createEl("button",{text:this.text("安装或启用","Install or enable")});button.onclick=()=>this.openPlugin(provider.pluginId);return instance.dispose;
      }
      const config=clone(widget.props||{});
      const cleanup=await provider.render({app:this.app,container:mount,component,config,selection:provider.supportsDate?clone(selection||{}):null,
        openSource:path=>this.app.workspace.openLinkText(path,"",true)});
      if(typeof cleanup==="function"){if(disposed)cleanup();else component.register(cleanup);}
      if(disposed)mount.remove();
    }catch(error){if(!disposed){mount.empty();mount.createDiv({cls:"noria-card-empty",text:error.message||String(error)});}}
    return instance.dispose;
  }
  openPlugin(id){window.open(`obsidian://show-plugin?id=${encodeURIComponent(id)}`);}
  dispose(){this.disposed=true;for(const modal of [...this.modals]){modal.dirty=false;modal.close(true);}this.modals.clear();this.closeMenu?.(false);for(const item of [...this.mounted])item.dispose();this.listeners.clear();this.providers.clear();this.resolveReady();}
}
module.exports={CardSystem};
