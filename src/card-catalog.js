"use strict";
const {Modal, setIcon} = require("obsidian");
const {normalizeDiaryCards} = require("./card-layout-model.js");
const {iconButton} = require("./card-controls.js");
const clone=value=>JSON.parse(JSON.stringify(value));

class CardCatalog extends Modal {
  constructor(system,context,id){super(system.app);this.system=system;this.plugin=system.plugin;this.context=context;this.id=id;this.generation=0;this.untrack=system.trackModal(this);}
  text(zh,en){return this.system.text(zh,en);}
  get custom(){return this.context.page==="custom";}
  get widgets(){if(this.custom)return this.system.pages.get(this.context.pageId)?.widgets||[];return this.context.page==="home"?this.plugin.settings.home.widgets:this.system.layout(this.context.mode).widgets;}
  onOpen(){this.modalEl.addClass("noria-card-catalog");const widget=this.widgets.find(item=>item.id===this.id);widget?this.edit(widget):this.list();}
  clean(){++this.generation;clearTimeout(this.timer);this.cleanupPreview?.();this.cleanupPreview=null;this.contentEl.empty();this.errorEl=null;delete this.modalEl.dataset.statisticsEditor;this.dirty=false;}
  list(){
    this.clean();this.returnTo="cards";this.setTitle(this.text("添加卡片","Add a card"));
    const toolbar=this.contentEl.createDiv({cls:"noria-card-library-toolbar"});
    const search=toolbar.createEl("input",{cls:"noria-card-search",attr:{type:"search","aria-label":this.text("搜索卡片","Search cards"),placeholder:this.text("搜索用途或卡片名称","Search cards")}});search.value=this.cardSearch||"";
    const statistics=toolbar.createEl('button',{cls:'noria-stat-catalog-entry',attr:{type:'button'}});setIcon(statistics.createSpan(),'chart-no-axes-combined');statistics.createSpan({text:this.text('统计模板','Statistics templates')});statistics.onclick=()=>{this.statBaseWidget=null;this.statistics();};
    const list=this.contentEl.createDiv({cls:"noria-card-catalog-list"});
    const entries=[];
    const statisticsById=new Map(require('./statistic-templates.js').dashboardTemplates(this.plugin.buildRuntimeBridgeConfig().homeWidgetDefaults||[],(a,b)=>this.text(a,b)).map(t=>[t.builtinId,t]));
    const builtinInfo={
      'trends-range':['calendar-range',this.text('统一调整跟随本页的统计区间','Set the period for statistics following this page')],
      'today-tasks-card':['list-todo',this.text('今日重点与其他待办','Priorities and other tasks')],
      'inbox-card':['inbox',this.text('快速捕获与待整理内容','Capture and organize incoming notes')],
      'countdown-card':['calendar-clock',this.text('重要日期、进度与到期提醒','Important dates, progress and reminders')],
      'projects-card':['folder-kanban',this.text('查看项目与当前进展','Browse projects and their progress')],
      'moc-strip':['network',this.text('从主题地图进入相关笔记','Explore notes through topic maps')]
    };
    if(this.context.page==="home"||this.custom)for(const template of this.plugin.buildRuntimeBridgeConfig().homeWidgetDefaults||[]){
      if(!["builtin","stat"].includes(template.type)||["identity","today-actions","review-focus"].includes(template.id)||template.id==="trends-range"&&(!this.custom||this.widgets.some(w=>(w.builtinId||w.id)==="trends-range"&&w.enabled!==false)))continue;
      const statistic=statisticsById.get(template.id),info=builtinInfo[template.id];
      entries.push({name:this.system.title(template),description:statistic?.description||info?.[1]||this.text("Noria 内置卡片","Built-in Noria card"),icon:statistic?.icon||info?.[0]||"layout-panel-top",run:()=>this.edit({...clone(template),id:`card-${crypto.randomUUID()}`,builtinId:template.id,title:this.system.title(template),enabled:true,order:Date.now()})});
    }
    for(const provider of this.system.providers.values()){
      if(['noria:periodic-statistics','noria:statistics'].includes(provider.id))continue;
      if(this.context.page==="home"&&provider.id==="noria:countdown")continue;
      entries.push({name:provider.title,description:provider.description,icon:provider.icon||"blocks",provider,
        run:()=>{this.edit({id:`card-${crypto.randomUUID()}`,type:"extension",source:provider.id,title:provider.title,size:"medium",enabled:true,order:Date.now(),props:{}});}});
    }
    const hidden=this.context.page==="home"||this.custom?this.widgets.filter(w=>w.enabled===false):this.system.layout(this.context.mode).order.filter(id=>this.system.layout(this.context.mode).cards[id].hidden).map(id=>({id,title:this.diaryTitle(id)}));
    for(const item of hidden)entries.push({name:this.text("恢复 · ","Restore · ")+this.system.title(item),description:this.text("保留原内容和配置","Keeps the original contents and settings"),icon:"eye",run:async()=>{
      if(this.custom)await this.system.pages.saveCard(this.context.pageId,{...item,enabled:true});
      else if(this.context.page==="home")await this.system.saveHome({...item,enabled:true});
      else await this.system.updateLayout(this.context.mode,layout=>{layout.cards[item.id].hidden=false;return layout;});this.close(true);
    }});
    const paint=()=>{this.cardSearch=search.value;list.empty();const matches=entries.filter(e=>(e.name+" "+e.description).toLowerCase().includes(search.value.trim().toLowerCase()));
      if(!matches.length){const empty=list.createDiv({cls:'noria-card-catalog-empty',attr:{role:'status'}});empty.createSpan({text:this.text('没有匹配的卡片','No matching cards')});const clear=empty.createEl('button',{text:this.text('清除搜索','Clear search')});clear.onclick=()=>{search.value='';paint();search.focus();};}
      for(const item of matches){
      const button=list.createEl("button",{cls:"noria-card-choice"});setIcon(button.createSpan({cls:"noria-card-choice-icon"}),item.icon);
      const info=button.createDiv({cls:"noria-card-choice-info"});info.createEl("strong",{text:item.name});if(item.description)info.createDiv({cls:"noria-card-secondary",text:item.description});
      if(item.provider?.pluginId!=="noria"&&item.provider){const manifest=this.app.plugins.manifests[item.provider.pluginId];
        info.createDiv({cls:"noria-card-secondary",text:manifest?`${manifest.name} · ${this.app.plugins.plugins[manifest.id]?this.text("已启用","Enabled"):this.text("需启用","Enable to use")}`:this.text("需要安装插件","Requires plugin installation")});}
      button.onclick=()=>{Promise.resolve(item.run()).catch(e=>this.showError(e));};
    }};search.oninput=paint;paint();search.focus();
  }
  statistics(tab=this.statNavigation?.tab){require('./statistic-template-ui.js').templateGallery(this,tab);}
  diaryTitle(id){return this.widgets.find(w=>w.id===id)?.title||({focus:this.text("三件事","Priorities"),tasks:this.text("相关任务","Tasks"),habits:this.text("习惯记录","Habits")}[id]||id);}
  editScope(){
    if(this.custom)return this.text('仅修改此卡片','This card only');
    if(this.context.page==='home')return this.text('主页 · 仅修改此卡片','Home · This card only');
    const names={daily:['所有日记共用此卡片配置','Shared by all daily notes'],weekly:['所有周记共用此卡片配置','Shared by all weekly notes'],monthly:['所有月记共用此卡片配置','Shared by all monthly notes'],yearly:['所有年记共用此卡片配置','Shared by all yearly notes']};
    return this.text(...names[this.context.mode]);
  }
  showError(error){const el=this.errorEl||this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});el.setText(error?.message||String(error));el.hidden=false;}
  field(parent,label,type,value,onChange,choices,refresh=false){
    const wrap=parent.createEl("label",{cls:"noria-card-field"});wrap.createSpan({text:label});let input;
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
    if(['noria:statistics','noria:periodic-statistics'].includes(widget.source))this.modalEl.dataset.statisticsEditor='true';
    const head=this.contentEl.createDiv({cls:"noria-card-form-head"});const backLabel=this.returnTo==="statistics"?this.text("统计模板","Statistics templates"):this.text("全部卡片","All cards"),back=iconButton(head,"arrow-left",backLabel,()=>this.goBack());back.addClass("noria-card-back");back.createSpan({text:backLabel});
    head.createSpan({cls:"noria-card-secondary",text:this.editScope()});
    const grid=this.contentEl.createDiv({cls:"noria-card-config-grid"}),form=grid.createDiv({cls:"noria-card-form"});
    this.field(form,this.text("名称","Title"),"text",this.system.title(widget),value=>this.draft.title=value);
    let appearance=form;if(widget.source==='noria:statistics'){appearance=form.createEl('details',{cls:'noria-card-advanced'});appearance.createEl('summary',{text:this.text('卡片图样与宽度','Card picture and width')});}
    require("./picture-picker.js").pictureField(this.plugin,appearance,widget.props?.picture,value=>{this.draft.props={...this.draft.props,picture:value};this.dirty=true;this.schedulePreview();});
    this.field(appearance,this.text("宽度","Width"),"select",widget.size||"medium",value=>this.draft.size=value,["small","medium","wide","full"].map(value=>({value,label:this.system.t(value)})));
    const provider=this.system.providers.get(widget.source);
    if(['noria:statistics','noria:periodic-statistics'].includes(widget.source)||require('./statistic-templates.js').isDashboardStatistic(widget)){const choose=head.createEl('button',{cls:'noria-card-change-template',text:this.text('更换模板','Change template')});choose.onclick=()=>this.confirmDiscard(()=>{this.statBaseWidget=clone(this.draft);this.statistics();});}
    if(widget.type==="extension"){
      if(provider){
        if(provider.id==='noria:interaction')void require('./interaction-editor.js').interactionPicker(this.plugin,form,this);
        if(provider.templates&&provider.id!=='noria:statistics'){const templates=typeof provider.templates==='function'?provider.templates():provider.templates;
          const chooser=this.field(form,this.text('快速配置','Quick setup'),'select','',value=>{const template=templates.find(t=>t.id===value);if(!template)return;const draft=clone(this.draft);draft.props=clone(template.props);draft.title=template.title;this.edit(draft);this.dirty=true;},[{value:'',label:this.text('选择模板…','Choose a template…')},...templates.map(t=>({value:t.id,label:t.title}))]);chooser.dataset.statTemplates='true';}
        const fields=typeof provider.fields==="function"?provider.fields(this.draft.props):provider.fields;
        const advancedKeys=new Set(["recursive","tag","group","filterProperty","filterValue","unitProperty"]);
        let advanced;
        for(const field of fields||[]){
          if(field.section)form.createEl('h3',{cls:'noria-stat-config-section',text:field.section});
          if(widget.source==="noria:statistics"&&advancedKeys.has(field.key)&&!advanced){advanced=form.createEl("details",{cls:"noria-card-advanced"});advanced.createEl("summary",{text:this.text("更多筛选与分组","More filters and grouping")});}
          const parent=widget.source==="noria:statistics"&&advancedKeys.has(field.key)?advanced:form;
          if(this.draft.props[field.key]===undefined&&field.default!==undefined)this.draft.props[field.key]=field.default;
          if(widget.source==='noria:statistics'&&field.type==='select'&&field.options?.length&&!field.options.some(o=>o.value===this.draft.props[field.key]))this.draft.props[field.key]=field.default??field.options[0].value;
          const control=this.field(parent,field.label,field.type,this.draft.props[field.key],value=>{this.draft.props[field.key]=value;if(field.refresh){const draft=clone(this.draft),top=this.contentEl.scrollTop;queueMicrotask(()=>{this.edit(draft);this.dirty=true;this.contentEl.scrollTop=top;[...this.contentEl.querySelectorAll("[data-card-field]")].find(el=>el.dataset.cardField===field.key)?.focus({preventScroll:true});});}},field.options,field.refresh);control.dataset.cardField=field.key;
        }
        if(advanced)form.append(advanced);
        if(provider.pluginId!=="noria"){
          const info=form.createDiv({cls:"noria-card-dependency"});info.createDiv({text:provider.description||provider.title});
          const install=info.createEl("button",{text:this.text("插件详情 / 安装 / 管理","Plugin details / install / manage")});install.onclick=()=>this.system.openPlugin(provider.pluginId);
          const check=info.createEl("button",{text:this.text("重新检查","Check again")});check.onclick=()=>this.preview();
        }
      }else form.createEl("p",{text:this.text("启用提供此卡片的插件后可继续配置。","Enable this card's provider to configure it.")});
    }else if(widget.type!=="builtin"&&widget.type!=="stat")this.field(form,this.text("源文件","Source file"),"file",widget.source,value=>this.draft.source=value);
    if((widget.builtinId||widget.id)==="habit-history-card")this.field(form,this.text("显示天数","History days"),"select",String(widget.props?.historyDays||21),value=>this.draft.props.historyDays=Number(value),[7,14,21,30,60,90].map(v=>({value:String(v),label:String(v)})));
    require("./dashboard-statistic-settings.js").dashboardStatisticSettings(this,form);
    if(appearance!==form){require('./statistic-appearance-ui.js').appearanceEditor(this,form);form.append(appearance);}
    this.previewHost=grid.createDiv({cls:"noria-card-preview"});this.previewHost.setAttribute("aria-label",this.text("预览","Preview"));
    this.errorEl=this.contentEl.createDiv({cls:"noria-card-error",attr:{role:"alert"}});this.errorEl.hidden=true;
    this.footer=this.contentEl.createDiv({cls:"noria-card-form-footer"});
    const cancel=this.footer.createEl("button",{text:this.text("取消","Cancel")});cancel.onclick=()=>this.close();
    this.applyButton=this.footer.createEl("button",{text:this.text("应用","Apply"),cls:"mod-cta"});this.applyButton.onclick=()=>this.save();
    if(['noria:statistics','noria:periodic-statistics'].includes(widget.source)||require('./statistic-templates.js').isDashboardStatistic(widget))require('./statistic-template-ui.js').templateSaveAction(this);
    this.preview();
  }
  schedulePreview(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.preview(),250);}
  async preview(){
    const serial=++this.generation;this.cleanupPreview?.();this.cleanupPreview=null;this.previewHost.empty();
    const draft=clone(this.draft),host=this.previewHost.createDiv();
    const status=host.createDiv({cls:'noria-card-preview-label',text:this.text('正在更新预览…','Updating preview…'),attr:{role:'status'}});
    const body=host.createDiv();this.previewHost.inert=draft.type==='builtin';
    this.previewBlocked=false;
    try{
    require('./dashboard-statistic-settings.js').validateDashboardStatistic(draft,this.plugin,(zh,en)=>this.text(zh,en));
    if(['noria:statistics','noria:periodic-statistics'].includes(draft.source))body.createEl('h3',{cls:'noria-stat-preview-title',text:draft.title||this.text('统计','Statistics')});
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
    status.setText(['noria:statistics','noria:periodic-statistics'].includes(draft.source)?this.text('只读预览 · 尚未应用','Read-only preview · Not yet applied'):this.text('预览 · 尚未应用','Preview · Not yet applied'));
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
      if(this.custom)await this.system.pages.saveCard(this.context.pageId,draft);
      else if(this.context.page==="home")await this.system.saveHome(draft);
      else {const ok=await this.system.updateLayout(this.context.mode,layout=>{
        const index=layout.widgets.findIndex(w=>w.id===draft.id);if(index<0)layout.widgets.push(clone(draft));else layout.widgets[index]=clone(draft);
        layout=normalizeDiaryCards(layout);layout.cards[draft.id].size=draft.size;return layout;
      });if(!ok)return;}
      this.close(true);
    }catch(error){this.showError(validated?this.text('未能应用，修改已保留，可重试。','Could not apply. Your edits are kept; try again.')+' '+(error.message||String(error)):error);}
    finally{this.saving=false;this.contentEl.inert=false;this.applyButton.setText(this.text('应用','Apply'));this.applyButton.disabled=!!this.previewBlocked;}
  }
  async validateDraft(draft){
    require("./dashboard-statistic-settings.js").validateDashboardStatistic(draft,this.plugin,(zh,en)=>this.text(zh,en));
    const provider=this.system.providers.get(draft.source),fields=typeof provider?.fields==='function'?provider.fields(draft.props):provider?.fields||[];
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
