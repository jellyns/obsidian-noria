"use strict";
const {Modal, setIcon} = require("obsidian");
const {CARD_IDS,normalizeDiaryCards} = require("./card-layout-model.js");
const {iconButton} = require("./card-controls.js");
const {isStatistic} = require('./statistic-templates.js');
const clone=value=>JSON.parse(JSON.stringify(value));

class CardCatalog extends Modal {
  constructor(system,context,id){super(system.app);this.system=system;this.plugin=system.plugin;this.context={...context};if(typeof context.noteCards?.update!=='function')delete this.context.noteCards;this.id=id;this.generation=0;this.untrack=system.trackModal(this);}
  text(zh,en){return this.system.text(zh,en);}
  get custom(){return this.context.page==="custom";}
  get diaryLayout(){return this.context.noteCards?.layout()||this.system.layout(this.context.mode);}
  get widgets(){return (this.custom?(this.system.pages.get(this.context.pageId)?.widgets||[]):this.context.page==="home"?this.plugin.settings.home.widgets:this.diaryLayout.widgets).filter(require('./build-profile.js').cardAvailable);}
  onOpen(){
    this.modalEl.addClass("noria-card-catalog");const widget=this.widgets.find(item=>item.id===this.id);
    if(widget)this.edit(widget);
    else if(this.context.page==="diary"&&CARD_IDS.includes(this.id)){
      const state=this.diaryLayout.cards[this.id];
      const picture=state.picture||({focus:"star",tasks:"list-todo",habits:"circle-check",record:"notebook-pen",review:"book-open"})[this.id];
      this.edit({id:this.id,type:"diary-core",title:this.diaryTitle(this.id),props:{picture,...(this.id==='record'&&Array.isArray(state.sections)?{sections:[...state.sections]}:{})}});
    }else this.list();
  }
  clean(){++this.generation;clearTimeout(this.timer);this.cleanupPreview?.();this.cleanupPreview=null;this.contentEl.empty();this.errorEl=null;delete this.modalEl.dataset.statisticsEditor;delete this.modalEl.dataset.coreCardEditor;this.dirty=false;}
  list(){
    this.clean();this.returnTo="cards";this.setTitle(this.context.defaults?this.text('默认卡片','Default cards'):this.text("添加卡片","Add a card"));
    if(this.context.page==='diary')this.scopeControl(this.contentEl.createDiv({cls:'noria-card-library-scope'}));
    const toolbar=this.contentEl.createDiv({cls:"noria-card-library-toolbar"});
    const search=toolbar.createEl("input",{cls:"noria-card-search",attr:{type:"search","aria-label":this.text("搜索卡片","Search cards"),placeholder:this.text("搜索用途或卡片名称","Search cards")}});search.value=this.cardSearch||"";
    const statistics=toolbar.createEl('button',{cls:'noria-stat-catalog-entry',attr:{type:'button'}});setIcon(statistics.createSpan(),'chart-no-axes-combined');statistics.createSpan({text:this.text('统计模板','Statistics templates')});statistics.onclick=()=>{this.statBaseWidget=null;this.statistics();};
    const list=this.contentEl.createDiv({cls:"noria-card-catalog-list"});
    const entries=[];
    // Deleted inherited cards are available as fresh defaults, not as removed instances.
    if(this.context.noteCards)for(const id of this.diaryLayout.deleted||[]){
      const shared=this.system.layout(this.context.mode),widget=shared.widgets.find(w=>w.id===id);
      if(!CARD_IDS.includes(id)&&!widget)continue;
      entries.push({name:widget?this.system.title(widget):this.diaryTitle(id),description:this.text('添加默认卡片','Add the default card'),icon:'plus',run:async()=>{
        await this.context.noteCards.configure(layout=>{const next={...layout,deleted:(layout.deleted||[]).filter(key=>key!==id),cards:{...layout.cards}};delete next.cards[id];return next;});this.close(true);
      }});
    }
    if(this.context.defaults){
      for(const id of CARD_IDS)entries.push({name:this.diaryTitle(id),description:this.text('同类日记的默认设置','Defaults for this diary period'),icon:'settings-2',run:()=>{
        const state=this.diaryLayout.cards[id];this.edit({id,type:'diary-core',title:this.diaryTitle(id),props:{picture:state.picture,...(id==='record'&&state.sections?{sections:state.sections}:{})}});
      }});
      for(const widget of this.widgets)entries.push({name:this.system.title(widget),description:this.text('同类日记的默认卡片','Default card for this diary period'),icon:'settings-2',run:()=>this.edit(widget)});
    }
    const statisticsById=new Map(require('./statistic-templates.js').dashboardTemplates(this.plugin.buildRuntimeBridgeConfig().homeWidgetDefaults||[],(a,b)=>this.text(a,b)).map(t=>[t.builtinId,t]));
    const builtinInfo={
      'trends-range':['calendar-range',this.text('统一调整跟随本页的统计区间','Set the period for statistics following this page')],
      'today-tasks-card':['list-todo',this.text('今日重点与其他待办','Priorities and other tasks')],
      'inbox-card':['inbox',this.text('快速捕获与待整理内容','Capture and organize incoming notes')],
      'countdown-card':['calendar-clock',this.text('重要日期、进度与到期提醒','Important dates, progress and reminders')],
      'projects-card':['folder-kanban',this.text('查看项目与当前进展','Browse projects and their progress')],
      'moc-strip':['network',this.text('从主题地图进入相关笔记','Explore notes through topic maps')]
    };
    const advice=this.context.page==='home'?(this.widgets.find(w=>w.id==='daily-advice')||this.plugin.buildRuntimeBridgeConfig().homeWidgetDefaults?.find(w=>w.id==='daily-advice')):null;
    if(advice){
      const present=this.widgets.some(w=>w.id===advice.id&&w.enabled!==false);
      entries.push({name:this.text('建议','Suggestions'),description:present?this.text('已在本页','Already on this page'):this.text('显示日记中的建议，可修改或移除','Suggestions from your daily notes, ready to edit or remove'),icon:'sparkles',disabled:present,run:async()=>{await this.system.saveHome({...clone(advice),enabled:true});this.close(true);}});
    }
    if(this.context.page==="home"||this.custom)for(const template of this.plugin.buildRuntimeBridgeConfig().homeWidgetDefaults||[]){
      if(!["builtin","stat"].includes(template.type)||["identity","today-actions","review-focus"].includes(template.id)||template.id==="trends-range"&&(!this.custom||this.widgets.some(w=>(w.builtinId||w.id)==="trends-range"&&w.enabled!==false)))continue;
      const statistic=statisticsById.get(template.id),info=builtinInfo[template.id];
      entries.push({name:this.system.title(template),description:statistic?.description||info?.[1]||this.text("Noria 内置卡片","Built-in Noria card"),icon:statistic?.icon||info?.[0]||"layout-panel-top",run:()=>this.edit({...clone(template),id:`card-${crypto.randomUUID()}`,builtinId:template.id,title:this.system.title(template),enabled:true,order:Date.now()})});
    }
    for(const provider of this.system.providers.values()){
      if(provider.id==='noria:diary-section'&&this.context.page!=='diary')continue;
      if(['noria:periodic-statistics','noria:statistics'].includes(provider.id))continue;
      if(this.context.page==="home"&&provider.id==="noria:countdown")continue;
      entries.push({name:provider.title,description:provider.description,icon:provider.icon||"blocks",provider,
        run:()=>{this.edit({id:`card-${crypto.randomUUID()}`,type:"extension",source:provider.id,title:provider.title,size:provider.defaultSize||"medium",enabled:true,order:Date.now(),props:{}});}});
    }
    const replaced=new Set(this.widgets.map(w=>w.replaces).filter(Boolean));
    const hidden=this.context.page==="home"||this.custom?this.widgets.filter(w=>w.enabled===false):this.diaryLayout.order.filter(id=>this.diaryLayout.cards[id].hidden&&!replaced.has(id)).map(id=>({id,title:this.diaryTitle(id)}));
    const restored=[];
    for(const item of hidden.filter(item=>item.id!==advice?.id&&!this.diaryLayout?.deleted?.includes(item.id)))restored.push({name:this.text("恢复 · ","Restore · ")+this.system.title(item),description:this.text("保留原内容和配置","Keeps the original contents and settings"),icon:"eye",run:async()=>{
      if(this.custom)await this.system.pages.saveCard(this.context.pageId,{...item,enabled:true});
      else if(this.context.page==="home")await this.system.saveHome({...item,enabled:true});
      else if(this.context.noteCards)await this.context.noteCards.change(item.id,'hidden',false);
      else await this.system.updateLayout(this.context.mode,layout=>{layout.cards[item.id].hidden=false;return layout;});this.close(true);
    }});
    const paint=()=>{this.cardSearch=search.value;list.empty();const match=e=>(e.name+" "+e.description).toLowerCase().includes(search.value.trim().toLowerCase()),removed=restored.filter(match),matches=entries.filter(match);
      let restoredList;
      if(removed.length){const section=list.createEl('details',{cls:'noria-card-removed'});section.open=!!search.value;section.createEl('summary',{text:this.text('已移出','Removed')+' · '+removed.length});restoredList=section.createDiv({cls:'noria-card-catalog-list'});}
      if(!matches.length){const empty=list.createDiv({cls:'noria-card-catalog-empty',attr:{role:'status'}});empty.createSpan({text:this.text('没有匹配的卡片','No matching cards')});const clear=empty.createEl('button',{text:this.text('清除搜索','Clear search')});clear.onclick=()=>{search.value='';paint();search.focus();};}
      for(const item of [...removed,...matches]){
      const button=(removed.includes(item)?restoredList:list).createEl("button",{cls:"noria-card-choice"});button.disabled=!!item.disabled;setIcon(button.createSpan({cls:"noria-card-choice-icon"}),item.icon);
      const info=button.createDiv({cls:"noria-card-choice-info"});info.createEl("strong",{text:item.name});if(item.description)info.createDiv({cls:"noria-card-secondary",text:item.description});
      if(item.provider?.pluginId!=="noria"&&item.provider){const manifest=this.app.plugins.manifests[item.provider.pluginId];
        info.createDiv({cls:"noria-card-secondary",text:manifest?`${manifest.name} · ${this.app.plugins.plugins[manifest.id]?this.text("已启用","Enabled"):this.text("需启用","Enable to use")}`:this.text("需要安装插件","Requires plugin installation")});}
      button.onclick=()=>{Promise.resolve(item.run()).catch(e=>this.showError(e));};
    }};search.oninput=paint;paint();search.focus();
  }
  statistics(tab=this.statNavigation?.tab){require('./statistic-template-ui.js').templateGallery(this,tab);}
  diaryTitle(id){return this.diaryLayout.cards[id]?.title||this.widgets.find(w=>w.id===id)?.title||({tasks:this.text("待办","Tasks"),habits:this.text("习惯记录","Habits"),record:this.text("记录","Record"),review:this.text("复盘","Review")}[id]||id);}
  editScope(){
    if(this.custom)return this.text('仅修改此卡片','This card only');
    if(this.context.page==='home')return this.text('主页 · 仅修改此卡片','Home · This card only');
    if(this.context.noteCards)return [this.text('仅此篇','This note'),this.context.selection?.period||this.context.selection?.anchorDate].filter(Boolean).join(' · ');
    const names={daily:['日记默认','Daily note defaults'],weekly:['周记默认','Weekly note defaults'],monthly:['月记默认','Monthly note defaults'],yearly:['年记默认','Yearly note defaults']};
    return this.text(...names[this.context.mode]);
  }
  scopeControl(head,widget){
    head.createSpan({cls:'noria-card-secondary',text:this.editScope(),attr:{title:this.context.noteCards?this.text('只调整这篇日记，其他日期与默认卡片不变。','Only this note changes. Other dates and default cards stay unchanged.'):this.context.page==='diary'?this.text('同类日记的默认设置，单篇设置优先；不影响其他周期。','Defaults for this period. Individual note settings take precedence; other periods stay unchanged.'):this.editScope()}});
  }
  showError(error){const el=this.errorEl||this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});el.setText(error?.message||String(error));el.hidden=false;}
  field(parent,label,type,value,onChange,choices,refresh=false){
    const wrap=parent.createEl("label",{cls:type==="checkbox"?"noria-card-field noria-card-field-check":"noria-card-field"});wrap.createSpan({text:label});let input;
    if(type==="select"){input=wrap.createEl("select");for(const item of choices||[])input.createEl("option",{text:item.label||item.value,value:item.value});}
    else input=wrap.createEl("input",{attr:{type:["number","checkbox","date","color"].includes(type)?type:"text"}});
    if(type==="checkbox")input.checked=!!value;else input.value=value??"";
    input.addEventListener(type==="select"||type==="checkbox"||refresh?"change":"input",()=>{onChange(type==="checkbox"?input.checked:type==="number"?(input.value===""?null:Number(input.value)):input.value);this.dirty=true;this.schedulePreview();});
    if(type==="file")this.plugin.attachHomeWidgetSourceSuggest(input,()=>this.draft?.source==="noria:note"?"note-base":"markdown");
    if(type==="property"||type==="folder"){
      const id=`noria-field-${crypto.randomUUID()}`,list=wrap.createEl("datalist",{attr:{id}});input.setAttribute("list",id);
      const values=type==="folder"?this.app.vault.getAllLoadedFiles().filter(f=>f.children).map(f=>f.path):[...new Set(this.plugin.filesUnderRoots(this.plugin.getScopeSpec("notes").roots,[".md"]).flatMap(f=>Object.keys(this.app.metadataCache.getFileCache(f)?.frontmatter||{})).filter(k=>k!=="position"))];
      for(const value of values.sort())list.createEl("option",{value});
    }return input;
  }
  edit(widget){
    if(widget.source==='noria:statistics'&&widget.props?.display==='trend')widget={...widget,props:{...widget.props,display:'columns'}};
    this.clean();this.original=clone(widget);this.draft=clone(widget);this.setTitle(this.text("卡片设置","Card settings"));
    if(widget.type==='extension'&&isStatistic(widget,this.system.providers))this.modalEl.dataset.statisticsEditor='true';
    const head=this.contentEl.createDiv({cls:"noria-card-form-head"});const backLabel=this.returnTo==="statistics"?this.text("统计模板","Statistics templates"):this.text("全部卡片","All cards"),back=iconButton(head,"arrow-left",backLabel,()=>this.goBack());back.addClass("noria-card-back");back.createSpan({text:backLabel});
    this.scopeControl(head,widget);
    this.originalNote=this.context.noteCards?.items().find(item=>'note:'+item.id===widget.id);
    if(this.originalNote)this.originalNote=clone(this.originalNote);
    const core=widget.type==="diary-core";
    if(core)this.modalEl.dataset.coreCardEditor="true";
    const grid=this.contentEl.createDiv({cls:core?"noria-card-core-config":"noria-card-config-grid"}),form=grid.createDiv({cls:"noria-card-form"});
    this.field(form,this.text("名称","Title"),"text",this.system.title(widget),value=>this.draft.title=value);
    let appearance=form;if(widget.source==='noria:statistics'){appearance=form.createEl('details',{cls:'noria-card-advanced'});appearance.createEl('summary',{text:this.text('卡片图样','Card picture')});}
    require("./picture-picker.js").pictureField(this.plugin,appearance,widget.props?.picture,value=>{this.draft.props={...this.draft.props,picture:value};this.dirty=true;this.schedulePreview();});
    if(core&&widget.id==='record')require('./diary-record-settings.js').recordScopeSettings(this,form);
    const provider=this.system.providers.get(widget.source);
    if(isStatistic(widget,this.system.providers)){const choose=head.createEl('button',{cls:'noria-card-change-template',text:this.text('更换模板','Change template')});choose.onclick=()=>this.confirmDiscard(()=>{this.statBaseWidget=clone(this.draft);this.statistics();});}
    if(widget.type==="extension"){
      if(provider){
        if(provider.id==='noria:interaction')void require('./interaction-editor.js').interactionPicker(this.plugin,form,this);
        if(provider.templates&&provider.id!=='noria:statistics'){const templates=typeof provider.templates==='function'?provider.templates():provider.templates;
          const chooser=this.field(form,this.text('快速配置','Quick setup'),'select','',value=>{const template=templates.find(t=>t.id===value);if(!template)return;const draft=clone(this.draft);draft.props=clone(template.props);draft.title=template.title;this.edit(draft);this.dirty=true;},[{value:'',label:this.text('选择模板…','Choose a template…')},...templates.map(t=>({value:t.id,label:t.title}))]);chooser.dataset.statTemplates='true';}
        const fields=typeof provider.fields==="function"?provider.fields(this.draft.props,{widgetId:widget.id,context:this.context}):provider.fields;
        const advancedKeys=new Set(["recursive","tag","group","filterProperty","filterValue","unitProperty"]);
        let advanced;
        for(const [index,field] of (fields||[]).entries()){
          const nextSection=(fields||[]).findIndex((next,i)=>i>index&&next.section);
          const visibleGroup=(fields||[]).slice(index,nextSection<0?undefined:nextSection).filter(item=>!advancedKeys.has(item.key));
          if(field.section&&(widget.source!=="noria:statistics"||visibleGroup.length>1))form.createEl('h3',{cls:'noria-stat-config-section',text:field.section});
          if(widget.source==="noria:statistics"&&advancedKeys.has(field.key)&&!advanced){advanced=form.createEl("details",{cls:"noria-card-advanced"});advanced.createEl("summary",{text:this.text("更多筛选与分组","More filters and grouping")});}
          const parent=widget.source==="noria:statistics"&&advancedKeys.has(field.key)?advanced:form;
          if(this.draft.props[field.key]===undefined&&field.default!==undefined)this.draft.props[field.key]=field.default;
          if(widget.source==='noria:statistics'&&field.type==='select'&&field.options?.length&&!field.options.some(o=>o.value===this.draft.props[field.key]))this.draft.props[field.key]=field.default??field.options[0].value;
          const control=this.field(parent,field.label,field.type,this.draft.props[field.key],value=>{this.draft.props[field.key]=value;if(field.refresh){const draft=clone(this.draft),top=this.contentEl.scrollTop;queueMicrotask(()=>{this.edit(draft);this.dirty=true;this.contentEl.scrollTop=top;[...this.contentEl.querySelectorAll("[data-card-field]")].find(el=>el.dataset.cardField===field.key)?.focus({preventScroll:true});});}},field.options,field.refresh);control.dataset.cardField=field.key;
        }
        if(advanced)form.append(advanced);
        if(provider.id==='noria:diary-section')void require('./diary-section-card.js').sectionSuggestions(this.plugin,form.querySelector('[data-card-field="heading"]'),this.context.selection).catch(e=>this.showError(e));
        if(provider.pluginId!=="noria"){
          const info=form.createDiv({cls:"noria-card-dependency"});info.createDiv({text:provider.description||provider.title});
          const install=info.createEl("button",{text:this.text("插件详情 / 安装 / 管理","Plugin details / install / manage")});install.onclick=()=>this.system.openPlugin(provider.pluginId);
          const check=info.createEl("button",{text:this.text("重新检查","Check again")});check.onclick=()=>this.preview();
        }
      }else form.createEl("p",{text:this.text("启用提供此卡片的插件后可继续配置。","Enable this card's provider to configure it.")});
    }else if(!core&&widget.type!=="builtin"&&widget.type!=="stat")this.field(form,this.text("源文件","Source file"),"file",widget.source,value=>this.draft.source=value);
    if((widget.builtinId||widget.id)==="habit-history-card")this.field(form,this.text("历史范围","History range"),"select",String(widget.props?.historyDays||21),value=>this.draft.props.historyDays=Number(value),[7,14,21,30,60,90,180,365].map(v=>({value:String(v),label:String(v)})));
    require("./dashboard-statistic-settings.js").dashboardStatisticSettings(this,form);
    if(appearance!==form){require('./statistic-appearance-ui.js').appearanceEditor(this,form);form.append(appearance);}
    this.previewHost=core?null:grid.createDiv({cls:"noria-card-preview"});this.previewHost?.setAttribute("aria-label",this.text("预览","Preview"));this.previewBlocked=false;
    this.errorEl=this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});this.errorEl.hidden=true;
    this.footer=this.contentEl.createDiv({cls:"noria-card-form-footer"});
    const cancel=this.footer.createEl("button",{text:this.text("取消","Cancel")});cancel.onclick=()=>this.close();
    this.applyButton=this.footer.createEl("button",{text:this.text("应用","Apply"),cls:"mod-cta"});this.applyButton.onclick=()=>this.save();
    if(isStatistic(widget,this.system.providers))require('./statistic-template-ui.js').templateSaveAction(this);
    this.preview();
  }
  schedulePreview(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.preview(),250);}
  async preview(){
    if(this.draft.type==="diary-core")return;
    const serial=++this.generation;this.cleanupPreview?.();this.cleanupPreview=null;this.previewHost.empty();
    const draft=clone(this.draft),host=this.previewHost.createDiv();
    const status=host.createDiv({cls:'noria-card-preview-label',text:this.text('正在更新预览…','Updating preview…'),attr:{role:'status'}});
    const body=host.createDiv();this.previewHost.inert=draft.type==='builtin';
    this.previewBlocked=false;
    try{
    require('./dashboard-statistic-settings.js').validateDashboardStatistic(draft,this.plugin,(zh,en)=>this.text(zh,en));
    if(['noria:statistics','noria:periodic-statistics','noria:period-overview'].includes(draft.source))body.createEl('h3',{cls:'noria-stat-preview-title',text:draft.title||this.text('统计','Statistics')});
    if(draft.type==="extension"||this.context.page==='diary'){
      const provider=this.system.providers.get(draft.source);
      this.previewBlocked=draft.type==='builtin'?false:!provider||(provider.pluginId!=="noria"&&!this.app.plugins.plugins[provider.pluginId]);
      this.applyButton.disabled=!!this.saving||this.previewBlocked;
      const selection=this.custom?{...this.context.selection,pageId:`preview:${draft.id}`,range:this.system.pages.get(this.context.pageId)?.trendsRange||this.plugin.settings.home?.trendsRange}:this.context.selection;
      const cleanup=await this.system.render(draft,body,selection,{...this.context,preview:true});
      if(serial!==this.generation)cleanup();else this.cleanupPreview=cleanup;
    }else{
      const mount=body.createDiv({cls:"noria-card-builtin-preview"});mount.inert=true;
      const cleanup=()=>mount.__noriaHomeCleanup?.();this.cleanupPreview=cleanup;
      const bridge=this.plugin.buildRuntimeBridgeConfig();
      bridge.statisticsPageId=`preview:${draft.id}`;
      if(this.custom){const page=this.system.pages.get(this.context.pageId);bridge.homeSettings={...bridge.homeSettings,...(page?.trendsRange?{trendsRange:page.trendsRange}:{})};}
      await this.plugin.runNoriaView(".obsidian/plugins/noria/views/dashboard/home",{workbench:true,noriaBridge:bridge,previewWidget:{...draft,props:{...draft.props,lazy:false}}},mount);
      if(serial!==this.generation)cleanup();
    }
    status.setText(['noria:statistics','noria:periodic-statistics','noria:period-overview','noria:media'].includes(draft.source)?this.text('只读预览 · 尚未应用','Read-only preview · Not yet applied'):this.text('预览 · 尚未应用','Preview · Not yet applied'));
    }catch(error){
      if(serial!==this.generation)return;
      this.previewBlocked=true;body.empty();status.setText(this.text('无法预览','Preview unavailable'));
      body.createDiv({cls:'noria-card-error',text:error.message||String(error),attr:{role:'alert'}});
    }finally{if(serial===this.generation)this.applyButton.disabled=!!this.saving||this.previewBlocked;}
  }
  async save(){
    if(this.saving)return;
    const draft=clone(this.draft);this.saving=true;clearTimeout(this.timer);
    this.errorEl.hidden=true;this.applyButton.disabled=true;this.applyButton.setText(this.text('正在应用…','Applying…'));this.contentEl.inert=true;
    let validated=false;
    try{
      await this.validateDraft(draft);validated=true;
      if(draft.type==="diary-core"){
        const update=this.context.noteCards?.configure||((mutate)=>this.system.updateLayout(this.context.mode,mutate));
        const ok=await update(layout=>{
          const state=layout.cards[draft.id];state.title=draft.title.trim();state.picture=draft.props.picture;
          if(draft.id==='record'){if(Array.isArray(draft.props.sections))state.sections=[...draft.props.sections];else delete state.sections;}
          return layout;
        });if(!ok)return;
      }else if(this.custom)await this.system.pages.saveCard(this.context.pageId,draft);
      else if(this.context.page==="home")await this.system.saveHome(draft);
      else if(this.context.noteCards){
        const model=require('./diary-cards-document.js');
        const replacing=this.widgets.some(w=>w.id===draft.id);
        await this.context.noteCards.update(items=>model.localId(draft.id)?model.editNoteCard(items,draft,this.originalNote):model.addNoteCard(items,{...draft,...(replacing?{replaces:draft.id}:{})}));
      }
      else {const ok=await this.system.updateLayout(this.context.mode,layout=>{
        const index=layout.widgets.findIndex(w=>w.id===draft.id);if(index<0)layout.widgets.push(clone(draft));else layout.widgets[index]=clone(draft);
        layout=normalizeDiaryCards(layout);
        layout.cards[draft.id].size=draft.size;return layout;
      });if(!ok)return;}
      this.close(true);
    }catch(error){this.showError(validated?this.text('未能应用，修改已保留，可重试。','Could not apply. Your edits are kept; try again.')+' '+(error.message||String(error)):error);}
    finally{this.saving=false;this.contentEl.inert=false;this.applyButton.setText(this.text('应用','Apply'));this.applyButton.disabled=!!this.previewBlocked;}
  }
  async validateDraft(draft){
    if(draft.type==='diary-core'&&draft.id==='record'&&Array.isArray(draft.props.sections)&&!draft.props.sections.length)throw Error(this.text('请选择至少一个章节，或改为整篇。','Select at least one section, or choose Full note.'));
    require("./dashboard-statistic-settings.js").validateDashboardStatistic(draft,this.plugin,(zh,en)=>this.text(zh,en));
    const provider=this.system.providers.get(draft.source),fields=typeof provider?.fields==='function'?provider.fields(draft.props,{widgetId:draft.id,context:this.context}):provider?.fields||[];
    for(const field of fields)if(field.required&&!String(draft.props[field.key]??'').trim())throw Error(this.text('请填写：','Required: ')+field.label);
    for(const field of fields)if(field.type==='file'&&draft.props[field.key]&&!this.app.vault.getAbstractFileByPath(draft.props[field.key]))throw Error(this.text('找不到源文件','Source file not found'));
    await provider?.validate?.(draft.props,{selection:this.context.selection});
  }
  confirmDiscard(action){
    if(!this.dirty){action();return;}
    if(this.discardEl?.isConnected)return;
    this.discardEl=this.contentEl.createDiv({cls:"noria-card-discard",attr:{role:"alert"}});
    this.discardEl.createSpan({text:this.text("还有未应用的修改。","You have unapplied changes.")});
    const keep=this.discardEl.createEl("button",{text:this.text("继续编辑","Keep editing")});keep.onclick=()=>this.discardEl.remove();
    const discard=this.discardEl.createEl("button",{text:this.text("放弃修改","Discard changes")});discard.onclick=()=>{this.dirty=false;action();};keep.focus();
  }
  goBack(){this.confirmDiscard(()=>this.returnTo==="statistics"?this.statistics():this.list());}
  close(force=false){if(this.saving&&!force)return;if(force){this.dirty=false;super.close();}else this.confirmDiscard(()=>super.close());}
  onClose(){this.clean();this.untrack?.();}
}
module.exports={CardCatalog};
