"use strict";
const {Component, MarkdownRenderer, Modal, Notice, parseYaml, stringifyYaml} = require("obsidian");
const {normalizeDiaryCards, normalizePeriodLayouts, migrateDiaryLayouts, chooseLegacyLayout} = require("./card-layout-model.js");
const {openCardMenu,attachCardResize} = require("./card-controls.js");
const clone=value=>JSON.parse(JSON.stringify(value));
const LABELS={layout:["布局","Layout"],width:["宽度","Width"],small:["窄","Narrow"],medium:["中","Medium"],wide:["宽","Wide"],full:["整行","Full row"],
  up:["上移","Move up"],down:["下移","Move down"],collapse:["收起","Collapse"],expand:["展开","Expand"],
  stack:["叠放到…","Stack with…"],stackAbove:["放在上方","Place above"],stackBelow:["放在下方","Place below"],unstack:["独立排布","Place separately"],stackWidth:["组合宽度","Stack width"],
  remove:["移出本页","Remove from page"],delete:["删除卡片…","Delete card…"],removeHint:["移除本页卡片，保留来源内容","Remove this card; keep source contents"],removed:["卡片已移出本页","Card removed from this page"],
  autoHeight:["自动高度","Automatic height"],copy:["复制卡片","Duplicate card"],hide:["隐藏卡片","Hide card"],show:["显示卡片","Show card"],
  resizeWidth:["拖动调整宽度；方向键左右调整","Drag to resize width; use Left or Right keys"],undo:["撤销","Undo"],hidden:["卡片已隐藏","Card hidden"]};

// Settings own layouts and instance configuration. Source records remain in the vault.
class CardSystem {
  constructor(plugin) {
    this.plugin=plugin;this.app=plugin.app;this.listeners=new Set();this.statisticRangeListeners=new Map();this.providers=new Map();this.mounted=new Set();this.modals=new Set();this.queue=Promise.resolve();
    this.pageHeaders=new Map();
    this.ready=new Promise(resolve=>{this.resolveReady=resolve;});
    this.pages=new (require("./workbench-pages.js").WorkbenchPages)(plugin);
    this.registerBuiltins();
    plugin.registerEvent(this.app.vault.on("rename",(file,oldPath)=>{
      void this.renameNoteLayouts(oldPath,file.path).catch(error=>new Notice(error.message));
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
    const migratedStatistics=require('./card-statistics-migration.js').migrateStatisticCalendars(this.plugin.settings);
    await this.plugin.shortcuts.initialize();
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
    if(migratedStatistics||migratedHeight||JSON.stringify(before)!==JSON.stringify(this.plugin.settings.cardLayouts))await this.plugin.saveSettings();
    const avatarPath=this.plugin.settings.home?.identity?.avatarPath;
    const avatar=avatarPath && this.app.vault.getAbstractFileByPath(avatarPath);
    if(avatar && avatar.extension==="svg") {
      const {isLegacyDefaultAvatar}=require("./noria-identity.js");
      await this.app.vault.process(avatar,text=>isLegacyDefaultAvatar(text)?this.plugin.getSupportSeedText("homeAvatar"):text);
    }
    this.resolveReady();this.emit();this.app.workspace.trigger("noria:cards-ready",this);
  }
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  registerPageHeader(pageId,render){
    if(this.pageHeaders.has(pageId))throw Error('Page header already registered');
    this.pageHeaders.set(pageId,render);
    return()=>{if(this.pageHeaders.get(pageId)===render)this.pageHeaders.delete(pageId);};
  }
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
  noteLayout(path,layout){return require('./diary-note-layout.js').applyPresentation(layout,this.plugin.settings.cardLayouts?.notes?.[path]);}
  noteItems(path,legacy=[]){return clone(this.plugin.settings.cardLayouts?.notes?.[path]?.items??legacy);}
  async updateNoteCards(path,mode,legacy,mutate){
    if(!path)throw Error('Missing diary path');
    const job=this.queue.catch(()=>{}).then(async()=>{
      const before=this.plugin.settings.cardLayouts,next=normalizePeriodLayouts(before);
      const model=require('./diary-cards-document.js'),items=mutate(this.noteItems(path,legacy));
      const layout=this.noteLayout(path,model.noteCardsLayout(this.layout(mode),items));
      next.notes={...next.notes,[path]:{...require('./diary-note-layout.js').presentation(layout),items:items.map(model.cardDefinition)}};
      this.plugin.settings.cardLayouts=next;
      try{await this.plugin.saveSettings();}catch(error){this.plugin.settings.cardLayouts=before;throw error;}
      this.emit();return true;
    });this.queue=job;return job;
  }
  async updateNoteLayout(path,layout,mutate){
    if(!path)throw Error('Missing diary path');
    const job=this.queue.catch(()=>{}).then(async()=>{
      const before=this.plugin.settings.cardLayouts,next=normalizePeriodLayouts(before);
      next.notes={...next.notes};
      const items=next.notes[path]?.items;
      if(mutate===null){if(items)next.notes[path]={items};else delete next.notes[path];}
      else next.notes[path]={...require('./diary-note-layout.js').presentation(mutate(this.noteLayout(path,layout))),...(items?{items}: {})};
      this.plugin.settings.cardLayouts=next;
      try{await this.plugin.saveSettings();}catch(error){this.plugin.settings.cardLayouts=before;throw error;}
      this.emit();return true;
    });this.queue=job;return job;
  }
  async renameNoteLayouts(oldPath,newPath){
    const job=this.queue.catch(()=>{}).then(async()=>{
      const before=this.plugin.settings.cardLayouts,notes=before?.notes;
      if(!Object.keys(notes||{}).some(path=>path===oldPath||path.startsWith(oldPath+'/')))return;
      this.plugin.settings.cardLayouts={...before,notes:require('./diary-note-layout.js').renamedNotes(notes,oldPath,newPath)};
      try{await this.plugin.saveSettings();}catch(error){this.plugin.settings.cardLayouts=before;throw error;}
      this.emit();
    });this.queue=job;return job;
  }
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
    const name=names[widget.builtinId||widget.id];return widget.title||(widget.titleKey?this.plugin.t(widget.titleKey):name?this.plugin.t("runtime.home.layoutEdit.widget."+name):this.providers.get(widget.source)?.title||widget.source||widget.id);
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
      width:value=>this.composeHome(id,'width',value),
      reorder:(target,after)=>this.composeHome(id,'reorder',{target,after}),stack:(target,after)=>this.composeHome(id,'stack',{target,after})
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
  async composeHome(id,action,value){
    await require('./settings-change.js').commitSettingsChange(this.plugin,['home'],()=>{
      this.plugin.settings.home.widgets=require('./card-composition.js').composeWidgets(this.plugin.settings.home.widgets,id,action,value);
    });
    require('./card-composition-view.js').applyLiveWidgetComposition(this.plugin,'home',this.plugin.settings.home.widgets);
  }
  async changeHomeCards(change,reason){
    await require('./settings-change.js').commitSettingsChange(this.plugin,['home'],()=>change(this.plugin.settings.home));
    await this.plugin.requestNoriaRefresh("home",reason,{immediate:true});
  }
  async saveHome(widget){
    await this.changeHomeCards(home=>{
      const index=home.widgets.findIndex(w=>w.id===widget.id);
      const before=index>=0?home.widgets[index]:null;
      if(index<0)home.widgets.push(clone(widget));else home.widgets[index]=clone(widget);
      if(before?.layout?.stack&&require('./card-width.js').cardSpan(before)!==require('./card-width.js').cardSpan(widget))home.widgets=require('./card-composition.js').composeWidgets(home.widgets,widget.id,'width',require('./card-width.js').cardSpan(widget));
      if(home.removedWidgetIds)home.removedWidgetIds=home.removedWidgetIds.filter(id=>id!==widget.id);
    },`cards:configure:${widget.id}:${this.revision=(this.revision||0)+1}`);
  }
  async removeHome(id){
    await this.changeHomeCards(home=>{
      const widget=home.widgets.find(w=>w.id===id);if(widget)widget.enabled=false;
    },`cards:remove:${id}`);
    return ()=>this.changeHomeCards(home=>{
      const widget=home.widgets.find(w=>w.id===id);if(widget)widget.enabled=true;
    },`cards:restore:${id}`);
  }
  homeMenu(id,anchor,visibleIds){
    const widget=()=>this.plugin.settings.home.widgets.find(item=>item.id===id);
    if(!widget())return {ok:false};
    const scope=anchor.closest(".workspace-leaf-content")||anchor.ownerDocument;
    const getAnchor=()=>[...scope.querySelectorAll('[data-noria-widget-shell-action="menu"]')].find(item=>item.dataset.noriaWidgetId===id);
    const edit=(action,value)=>this.plugin.editHomeWidget({widgetId:id,action,value,...(action==="move"?{targetId:visibleIds[visibleIds.indexOf(id)+(value==="up"?-1:1)]}:{})});
    const actions=[{label:this.text("卡片设置","Card settings"),run:()=>this.catalog({page:"home"},id)}];
    const local=anchor.closest(".dashboard-home-widget-shell")?._noriaConfigureWidget;
    const grid=anchor.closest('.dashboard-home-root'),canStack=!!anchor.closest('.dashboard-home-widget-shell');
    if(local)actions.unshift({label:this.text("管理内容","Manage contents"),run:local,icon:"list"});
    this.closeMenu=openCardMenu({app:this.app,anchor,title:this.title(widget()),getAnchor,t:key=>this.t(key),actions,
      stackTargets:()=>canStack?visibleIds.filter(key=>key!==id&&[...grid.querySelectorAll('.dashboard-home-widget-shell')].some(host=>host.dataset.noriaWidgetId===key)).map(key=>({id:key,title:this.title(this.plugin.settings.home.widgets.find(w=>w.id===key)||{id:key})})):[],
      stack:(target,after)=>this.composeHome(id,'stack',{target,after}),unstack:widget().layout?.stack?()=>this.composeHome(id,'unstack'):null,
      state:()=>({...widget(),first:visibleIds.indexOf(id)===0,last:visibleIds.indexOf(id)===visibleIds.length-1}),
      width:value=>this.composeHome(id,'width',value),move:direction=>{const target=visibleIds[visibleIds.indexOf(id)+(direction==='up'?-1:1)];return target?this.composeHome(id,'reorder',{target,after:direction==='down',keepStack:true}):Promise.resolve();},
      remove:async()=>{const undo=await this.removeHome(id);require("./card-direct-controls.js").notifyHidden(anchor.ownerDocument,this.t("removed"),undo,this.t("undo"));},
      deleteCard:()=>require('./card-lifecycle.js').confirmDelete(this,this.title(widget()),()=>this.changeHomeCards(home=>{
        require('./card-placement.js').forgetWidget(home,id);
        home.removedWidgetIds=[...new Set([...(home.removedWidgetIds||[]),id])];
      },`cards:delete:${id}`)),
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
    require('./diary-section-card.js').registerDiarySection(this);
    require("./interaction-card.js").registerInteractionCard(this);
    require("./activity-card.js").registerActivityCard(this);
    require('./media-feature.js')?.register(this);
    require("./shortcut-card.js").registerShortcutCard(this);
    require('./focus-card.js').registerFocusCard(this);

    this.plugin.propertyStats?.register(this);
    require('./periodic-stat-cards.js').registerPeriodicStats(this,this.plugin);
    require('./period-overview-card.js').registerPeriodOverview(this,this.plugin);
    this.register({id:"noria:records",title:this.text("每日记录","Daily records"),icon:"notebook-pen",supportsDate:true,description:this.text("填写所选日期的记录项目。","Edit record fields for the selected date."),fields:[],
      render:async({container,selection,component,context})=>{
        if(selection?.mode&&selection.mode!=="daily"){container.createSpan({text:this.text("每日记录在日记中填写，周期回顾可添加统计卡。","Enter records in a daily note; use a statistics card for period summaries.")});return;}
        const date=selection?.anchorDate||this.plugin.getLocalYmd(),spec=await this.plugin.resolveCalendarNoteSpecAsync("daily",date);let generation=0;
        const paint=async()=>{const serial=++generation,raw=await this.plugin.loadTextFromVault(spec.path);if(serial!==generation)return;container.empty();container.createDiv({cls:"noria-card-secondary",text:date});this.plugin.records.render({host:container,date,raw,onSaved:paint,context});};
        await paint();let definitionsSignature=JSON.stringify(this.plugin.records.definitions());
        component.register(this.subscribe(()=>{const next=JSON.stringify(this.plugin.records.definitions());if(next!==definitionsSignature){definitionsSignature=next;void paint();}}));
        component.registerEvent(this.app.metadataCache.on("changed",file=>{if(file.path===spec.path)void paint();}));component.register(()=>++generation);
      }});
    this.register({id:"noria:countdown",title:this.text("倒计时","Countdowns"),icon:"calendar-clock",description:this.text("重要日期、到期提醒与归档。","Important dates, deadlines and archives."),fields:[],render:({container})=>this.plugin.countdowns.render(container)});
    this.register({id:"noria:note",title:this.text("笔记与 Base","Note or Base"),icon:"file-text",supportsDate:true,description:this.text("嵌入已有笔记、查询或 Base。","Embed an existing note, query or Base."),fields:[{key:"path",label:this.text("源文件","Source file"),type:"file",required:true}],
      render:async({container,component,config,selection,reportError})=>{
        const file=this.app.vault.getAbstractFileByPath(config.path);if(!file||!("extension" in file))throw Error(this.text("找不到源文件","Source file not found"));
        const sourcePath=file.extension==="base"&&selection?.mode
          ? (await this.plugin.resolveCalendarNoteSpecAsync(selection.mode,selection.anchorDate)).path : file.path;
        let child,generation=0,disposed=false;
        // Bases can render their groups after MarkdownRenderer has returned.
        const markEmptyGroups=()=>{
          for(const heading of container.querySelectorAll('.bases-group-heading')){
            const value=heading.querySelector('.bases-group-value');
            heading.classList.toggle('noria-empty-base-group',!!value&&value.children.length===0&&value.textContent==='');
          }
        };
        const groupObserver=file.extension==='base'&&selection?.mode&&typeof MutationObserver!=='undefined'
          ? new MutationObserver(markEmptyGroups):null;
        groupObserver?.observe(container,{childList:true,subtree:true,characterData:true});
        const shell=container.closest?.('.noria-diary-card,.dashboard-home-widget-shell');
        const configure=()=>this.app.workspace.openLinkText(file.path,"",true);
        const paint=async()=>{const serial=++generation;
          let content=file.extension==="md"?await this.app.vault.cachedRead(file):`![[${file.path}]]`,bound=null;
          if(file.extension==="base"&&selection?.mode){
            bound=require('./dated-notes.js').bindDatedBase(parseYaml(await this.app.vault.cachedRead(file)),selection,sourcePath);
            if(bound)content='```base\n'+stringifyYaml(bound)+'\n```';
          }
          if(disposed||serial!==generation)return;
          container.classList.toggle('noria-period-base',!!bound);
          if(shell){if(bound)shell._noriaConfigureWidget=configure;else if(shell._noriaConfigureWidget===configure)delete shell._noriaConfigureWidget;}
          if(child)component.removeChild(child);child=new Component();component.addChild(child);container.empty();await MarkdownRenderer.render(this.app,content,container,sourcePath,child);markEmptyGroups();};
        component.register(()=>{disposed=true;++generation;groupObserver?.disconnect();if(shell?._noriaConfigureWidget===configure)delete shell._noriaConfigureWidget;});
        await paint();component.registerEvent(this.app.vault.on("modify",changed=>{if(changed.path===file.path)void paint().catch(error=>{if(!disposed)reportError(error);});}));
        component.registerEvent(this.app.vault.on('delete',changed=>{if(changed===file)reportError(Error(this.text('找不到源文件','Source file not found')));}));
        component.registerDomEvent(container,"click",event=>{const link=event.target.closest?.("a.internal-link");if(link&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();void this.app.workspace.openLinkText(link.dataset.href||link.getAttribute("href"),file.path,true);}},true);
      }});
    for(const [id,title] of [["dataview","Dataview"]]){
      this.register({id:`${id}:note`,title,icon:id==="dataview"?"database":"blocks",pluginId:id,
        description:this.text("展示含该插件组件的笔记；原记录仍由源插件管理。","Display a note containing this plugin's blocks; the source plugin owns its data."),
        fields:[{key:"path",label:this.text("含组件的笔记","Note containing a component"),type:"file",required:true}],
        render:context=>this.providers.get("noria:note").render(context)});
    }
  }
  async render(widget,container,selection,context){
    context=context|| (selection?.pageId?{page:"custom",pageId:selection.pageId}:selection?.mode?{page:"diary",mode:selection.mode,selection}:{page:"home"});
    const mediaKind=require('./workbench-pages.js').mediaKind(context.pageId);
    if(context.pageId==='media'||mediaKind)context={...context,mediaPage:true,mediaKind};
    let component,mount,disposed=false,generation=0,busy=false,offRange,pendingRange=false;
    const domainRange=!!this.providers.get(widget.source)?.statistics&&(context.page==='home'||!!this.pages.get(context.pageId)?.statisticsView)&&!selection?.mode;
    const instance={provider:null,dispose:()=>{if(disposed)return;disposed=true;++generation;offRange?.();component?.unload();mount?.remove();this.mounted.delete(instance);}};
    this.mounted.add(instance);
    const attempt=async(restoreFocus=false)=>{
      if(disposed||busy)return;
      busy=true;const serial=++generation;component?.unload();mount?.remove();
      const current=new Component();component=current;current.load();
      const host=container.createDiv({cls:'noria-card-embedded markdown-rendered',attr:{'aria-busy':'true'}});mount=host;
      const provider=this.providers.get(widget.source);instance.provider=provider;
      let failed=false;
      const fail=error=>{
        if(disposed||serial!==generation||failed)return;failed=true;current.unload();host.empty();host.removeAttribute('aria-busy');
        const missing=!provider,owner=provider?.pluginId||widget.source?.split(':')[0],dependency=owner&&owner!=='noria'&&(missing||!this.app.plugins.plugins[owner]);
        const box=host.createDiv({cls:'noria-card-recovery',attr:{role:'status'}});
        box.createEl('strong',{text:missing||dependency?this.text('此卡片当前不可用','This card is unavailable'):this.text('暂时无法显示','Could not display this card')});
        box.createDiv({cls:'noria-card-recovery-message',text:missing?this.text('当前版本未提供此卡片，原配置仍保留。','This build does not provide this card. Its settings are kept.'):error.message||String(error)});
        const actions=box.createDiv({cls:'noria-card-recovery-actions'});
        const retry=actions.createEl('button',{text:this.text('重试','Retry'),attr:{type:'button'}});retry.onclick=()=>attempt(true);
        if(dependency){const enable=actions.createEl('button',{text:this.text('安装或启用','Install or enable'),attr:{type:'button'}});enable.onclick=()=>this.openPlugin(owner);}
        // A diary card must keep the note-scoped controller; never fall back to period defaults.
        const diaryHost=container.closest?.('.noria-diary-card');
        if(!missing&&!dependency&&!context.preview&&(diaryHost?._noriaDiaryContext||context.noteCards||context.page!=='diary')){
          const settings=actions.createEl('button',{text:this.text('卡片设置','Card settings'),attr:{type:'button'}});
          settings.onclick=()=>this.catalog(diaryHost?._noriaDiaryContext?.()||context,widget.id);
        }
      };
      try{
        if(require('./statistic-templates.js').isDashboardStatistic(widget)&&selection?.mode){
          await require('./diary-statistic-card.js').renderDiaryStatistic(this.plugin,widget,host,selection,current);
        }else{
          if(!provider)throw Error('Card provider unavailable');
          if(provider.pluginId!=='noria'&&!this.app.plugins.plugins[provider.pluginId])throw Error(this.text(`需要启用 ${provider.title}`,`Enable ${provider.title} to use this card`));
          let resolvedSelection=selection;
          if(domainRange){const requested=context.pageId?this.pages.get(context.pageId)?.trendsRange:this.plugin.settings.home?.trendsRange;const range=await(await this.plugin.createDataService()).resolveRange(requested||{mode:'last30'});resolvedSelection={...selection,range};}
          const cleanup=await provider.render({app:this.app,container:host,component:current,config:clone(widget.props||{}),widgetId:widget.id,context:clone(context),selection:provider.supportsDate?clone(resolvedSelection||{}):null,
            openSource:path=>this.app.workspace.openLinkText(path,'',true),reportError:fail});
          if(typeof cleanup==='function'){if(disposed||serial!==generation||failed)cleanup();else current.register(cleanup);}
        }
      }catch(error){fail(error);}
      finally{
        if(serial===generation){busy=false;host.removeAttribute('aria-busy');
          if(restoreFocus&&!disposed&&(host.ownerDocument.activeElement===host.ownerDocument.body||host.contains(host.ownerDocument.activeElement))){
            const target=host.querySelector('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')||host;
            if(target===host)host.tabIndex=-1;target.focus({preventScroll:true});
          }
        }
        if(disposed||serial!==generation)host.remove();
        else if(pendingRange){pendingRange=false;void attempt();}
      }
    };
    if(domainRange)offRange=this.onStatisticRange(context.pageId||'home',()=>{if(busy)pendingRange=true;else void attempt();});
    await attempt();
    return instance.dispose;
  }
  openPlugin(id){window.open(`obsidian://show-plugin?id=${encodeURIComponent(id)}`);}
  dispose(){this.disposed=true;for(const modal of [...this.modals]){modal.dirty=false;modal.close(true);}this.modals.clear();this.closeMenu?.(false);for(const item of [...this.mounted])item.dispose();this.listeners.clear();this.providers.clear();this.pageHeaders.clear();this.resolveReady();}
}
module.exports={CardSystem};
