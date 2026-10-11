"use strict";
const {Component,MarkdownRenderer,setIcon,Notice,Menu}=require("obsidian");
const windows=require("./runtime/views/task-timeline/time-window.js");
const {normalizeFilter,taskTimeLabel}=require("./timeline-stream-model.js");
const {renderWorkbenchTaskRow}=require("./task-row.js");
const {prepareReviewPreview}=require("./review-document.js");
const {commitSettingsChange}=require('./settings-change.js');
const {ContinuousTimeline}=require('./timeline-continuous.js');
const {timelineRecordPreview}=require('./timeline-record-preview.js');

class TimelineWorkspace {
  constructor(view){this.view=view;this.plugin=view.plugin;this.serial=0;this.scroll=0;this.dayLimits=new Map();this.expandedRecords=new Set(view._timelineExpandedRecords||[]);this.savedAnchor=view._verticalTimelineState||null;}
  get windows(){return windows.withClock(require("./task-calendar-zone.js").timelineClock(this.plugin.settings.tasksCalendar));}
  get clock(){return require("./task-calendar-zone.js").timelineClock(this.plugin.settings.tasksCalendar);}
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  settings(){return this.plugin.settings.timelineView;}
  vertical(){return this.settings().orientation==="vertical";}
  button(parent,icon,label,run){const b=parent.createEl("button",{cls:"noria-tl-toolbar-icon-btn",attr:{type:"button","aria-label":label,title:label}});setIcon(b,icon);b.onclick=()=>{Promise.resolve().then(()=>run(b)).catch(e=>new Notice(e.message));};return b;}
  save(patch){const next=structuredClone(patch);return commitSettingsChange(this.plugin,['timelineView'],()=>Object.assign(this.settings(),next));}
  async panelSave(panel,run){
    if(panel.getAttribute('aria-busy')==='true')return false;
    const doc=panel.ownerDocument,active=doc?.activeElement;
    const controls=[...panel.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);
    const status=panel.querySelector('.noria-settings-save-feedback')||panel.createDiv({cls:'noria-settings-save-feedback',attr:{role:'status'}});
    controls.forEach(([el])=>{el.disabled=true;});panel.setAttribute('aria-busy','true');status.textContent='';
    try{await run();return true;}catch(error){status.textContent=this.text('未能保存，请重试：','Could not save. Try again: ')+error.message;return false;}
    finally{controls.forEach(([el,disabled])=>{el.disabled=disabled;});panel.removeAttribute('aria-busy');if(active?.isConnected&&panel.contains(active)&&doc.activeElement===doc.body)active.focus({preventScroll:true});}
  }
  toolbar(lead,trail){
    const keepFilter=this.vertical()&&this.panelKind==='filter';
    if(!keepFilter)this.closePanel?.(false);
    this.view.appChromeEl.dataset.orientation=this.vertical()?"vertical":"horizontal";
    const dir=this.button(lead,this.vertical()?"list-tree":"gantt-chart",this.vertical()?this.text("当前竖排，切换横排","Vertical; switch to horizontal"):this.text("当前横排，切换竖排","Horizontal; switch to vertical"),async()=>{
      if(this.vertical())this.remember();this.backend?.flushWindow();
      await this.save({orientation:this.vertical()?"horizontal":"vertical"});
      if(this.view._timelineInlineMode)this.view.closeTimelineInlinePanel();else this.view.renderTimelineAppChrome();
      this.present();this.view.appChromeEl.querySelector?.('[data-action="timeline-orientation"]')?.focus({preventScroll:true});
    });dir.dataset.action="timeline-orientation";dir.setAttribute("aria-pressed",String(this.vertical()));
    if(this.vertical()){
      this.filterButton=this.button(trail,"filter",this.text("筛选竖版内容","Filter vertical timeline"),b=>this.filterPanel(b));
      this.filterButton.setAttribute("aria-haspopup","dialog");this.updateFilterState();
      if(keepFilter)this.reanchorPanel?.(this.filterButton);
    }
  }
  scaleName(spec){
    if(spec.amount===1&&["day","week","month"].includes(spec.unit))return this.text({day:"天",week:"周",month:"月"}[spec.unit],{day:"Day",week:"Week",month:"Month"}[spec.unit]);
    const label=this.windows.label(this.windows.at(Date.now(),spec),this.plugin.getNoriaLocale()==="zh");return this.plugin.getNoriaLocale()==="zh"?label.replace(/\s+/g,""):label;
  }
  updateFilterState(){const f=normalizeFilter(this.settings().verticalFilter),active=!f.tasks||!f.records||!f.showDone||f.ctime||f.mtime||!!f.query;this.filterButton?.classList.toggle("noria-tl-toolbar-link--on",active);this.filterButton?.setAttribute("data-filter-active",String(active));}
  morePanel(anchor){
    this.closePanel?.(false);
    const menu=new Menu(),capture=this.view._timelineInlineMode==='capture';
    const add=(icon,label,run,checked)=>menu.addItem(item=>{
      item.setIcon(icon).setTitle(label);if(typeof checked==='boolean')item.setChecked(checked);
      item.onClick(()=>Promise.resolve().then(run).catch(error=>new Notice(error.message)));
    });
    if(capture){
      add('pencil',this.text('继续输入','Continue writing'),()=>this.view._timelineCaptureComposer?.input?.focus());
      add('arrow-left',this.text('返回时间轴','Return to timeline'),()=>this.view.closeTimelineInlinePanel());
    }else{
      add('bookmark',this.text('保存与管理视图','Save and manage views'),()=>{
        const panel=this.panel(anchor,this.text('视图','Views'));
        const saved=this.view.renderTimelineSavedViews(panel);saved.open=true;
        saved.querySelector(':scope > summary')?.setAttribute('style','display:none');
        const editor=saved.querySelector('.noria-tl-filter-saved-view-editor');
        if(editor){editor.open=true;editor.querySelector(':scope > summary')?.setAttribute('style','display:none');}
      });
      if(!this.vertical()&&this.view._timelineFilterState?.groupBy!=='projects'){
        add('scan-line',this.text('框选标注','Select annotations'),()=>this.view.toggleTimelineAnnotationSelection(),this.view._timelineFilterState?.markMode===true);
      }
      if(!this.vertical())menu.addItem(item=>{
        item.setIcon('panel-bottom').setTitle(this.text('缩略导航','Overview navigation'));
        const submenu=item.setSubmenu();
        for(const [value,zh,en] of [['auto','自动','Automatic'],['show','显示','Show'],['hide','隐藏','Hide']])submenu.addItem(option=>option.setTitle(this.text(zh,en)).setChecked((this.settings().overviewVisibility||'auto')===value).onClick(async()=>{
          try{await this.save({overviewVisibility:value});this.backend?.setOverviewVisibility(value);}catch(error){new Notice(error.message);}
        }));
      });
    }
    menu.addSeparator();
    add('settings-2',this.text('Noria 设置','Noria settings'),()=>this.plugin.openNoriaSettings(capture?'home':'timeline'));
    const rect=anchor.getBoundingClientRect();menu.showAtPosition({x:rect.left,y:rect.bottom});
  }
  renderEdges(){
    this.edges?.remove();if(this.vertical()||!this.surface?.parentElement)return;
    this.edges=this.surface.parentElement.createDiv({cls:"noria-tl-range-edges"});this.edges.dataset.orientation=this.vertical()?"vertical":"horizontal";
    for(const direction of [-1,1]){const b=this.button(this.edges,direction<0?"chevron-left":"chevron-right",direction<0?this.text("查看较早范围","Earlier range"):this.text("查看较晚范围","Later range"),()=>this.move(direction));b.dataset.direction=String(direction);}
  }
  move(direction){const w=this.backend?.getWindow();if(w){this.scroll=0;this.limit=80;this.backend.setWindow(this.windows.shift(w,direction));}}
  setScale(spec){
    const w=this.backend?.getWindow();if(!w)return;
    const focus=this.backend.getFocus?.()??w.focusMs??(w.startMs+w.endMs)/2;
    this.backend.setWindow(this.windows.around(focus,spec));
  }
  bindPanelPosition(panel,anchor){
    const win=anchor.ownerDocument.defaultView,root=this.view.hostEl;let frame;
    const position=()=>{
      frame=null;if(!panel.isConnected||!anchor.isConnected)return;
      const r=root.getBoundingClientRect(),bounds={left:Math.max(8,r.left+8),right:Math.min(win.innerWidth-8,r.right-8),top:Math.max(8,r.top+8),bottom:Math.min(win.innerHeight-8,r.bottom-8)};
      panel.style.width=`${Math.max(0,Math.min(320,bounds.right-bounds.left))}px`;panel.style.maxHeight=`${Math.max(0,bounds.bottom-bounds.top)}px`;
      const rect=require('./pane-popover.js').popupRect(anchor.getBoundingClientRect(),panel.getBoundingClientRect(),bounds);
      panel.style.left=`${rect.left}px`;panel.style.top=`${rect.top}px`;
    };
    const schedule=()=>{if(frame==null)frame=win.requestAnimationFrame(position);};
    const observer=new win.ResizeObserver(schedule);observer.observe(root);observer.observe(panel);
    win.addEventListener('resize',schedule);win.addEventListener('scroll',schedule,true);position();
    return ()=>{observer.disconnect();win.cancelAnimationFrame(frame);win.removeEventListener('resize',schedule);win.removeEventListener('scroll',schedule,true);};
  }
  panel(anchor,title){
    this.closePanel?.(false);const doc=anchor.ownerDocument;
    let trigger=anchor;
    const panel=doc.body.createDiv({cls:"noria-tl-range-panel",attr:{role:"dialog","aria-label":title}});
    anchor.setAttribute("aria-expanded","true");
    const close=focus=>{doc.removeEventListener("pointerdown",outside,true);doc.removeEventListener("keydown",keys,true);cleanup();panel.remove();trigger.setAttribute("aria-expanded","false");if(focus&&trigger.isConnected)trigger.focus({preventScroll:true});if(this.closePanel===close){this.closePanel=null;this.reanchorPanel=null;this.panelKind=null;}};
    const outside=e=>{if(!panel.contains(e.target)&&!trigger.contains(e.target))close(false);};
    const keys=e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(panel.contains(doc.activeElement)||doc.activeElement===trigger);}else if(e.key==="Tab"&&panel.contains(doc.activeElement)){const nodes=[...panel.querySelectorAll("button,input,select,summary")].filter(el=>!el.disabled&&el.checkVisibility({checkVisibilityCSS:true}));if(e.shiftKey&&doc.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&doc.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}};
    let cleanup=this.bindPanelPosition(panel,anchor);
    this.reanchorPanel=next=>{cleanup();trigger.setAttribute('aria-expanded','false');trigger=next;trigger.setAttribute('aria-expanded','true');cleanup=this.bindPanelPosition(panel,trigger);};
    doc.addEventListener("pointerdown",outside,true);doc.addEventListener("keydown",keys,true);this.closePanel=close;
    panel.createEl("strong",{text:title});queueMicrotask(()=>{if(panel.isConnected)panel.querySelector('input[type="search"],button,input,select')?.focus({preventScroll:true});});return panel;
  }
  renderScaleOptions(panel,close){
    const fit=panel.createEl('button',{cls:'noria-tl-fit-tasks',text:this.text('显示全部安排','Show all scheduled tasks'),attr:{type:'button'}});
    fit.disabled=!this.backend?.canFitTasks?.();
    fit.title=fit.disabled?this.text('当前筛选下没有已安排任务','No scheduled tasks in the current filter'):this.text('按当前筛选的任务日期调整范围','Fit the dates of tasks in the current filter');
    fit.onclick=()=>{if(this.backend?.fitTasks?.()){this.backend.flushWindow();close();}};
    const heading=panel.createDiv({cls:"noria-tl-panel-heading"});
    const window=this.backend?.getWindow()||this.settings().timeWindow;
    heading.createSpan({cls:"noria-card-secondary",text:this.windows.label(window,this.plugin.getNoriaLocale()==="zh")});
    const list=panel.createDiv({cls:"noria-tl-scale-list"});let editing=false;
    const paint=()=>{list.empty();list.classList.toggle('is-editing',editing);const favorites=windows.favorites(this.settings().scaleFavorites);
      favorites.forEach((s,i)=>{const row=list.createDiv({cls:"noria-tl-scale-row"});const b=row.createEl("button",{text:this.scaleName(s)});const current=this.backend?.getWindow()?.scale;b.setAttribute("aria-pressed",String(current?.amount===s.amount&&current?.unit===s.unit));b.onclick=()=>{this.setScale(s);close();};
        if(editing){const up=this.button(row,"arrow-up",this.text("上移","Move up"),()=>this.panelSave(panel,async()=>{const next=favorites.slice();[next[i-1],next[i]]=[next[i],next[i-1]];await this.save({scaleFavorites:next});paint();}));up.disabled=i===0;
          this.button(row,"x",this.text("移除快捷尺度","Remove favorite"),()=>this.panelSave(panel,async()=>{await this.save({scaleFavorites:favorites.filter((_,index)=>index!==i)});paint();}));}
      });
      if(!favorites.length)list.createDiv({cls:"noria-card-secondary",text:this.text("添加常用尺度，或临时指定范围。","Save favorite scales or choose a temporary range.")});
    };paint();
    panel.appendChild(fit);
    const edit=this.button(heading,"pencil",this.text("编辑常用尺度","Edit favorites"),()=>{editing=!editing;edit.setAttribute("aria-pressed",String(editing));edit.title=editing?this.text("完成编辑","Finish editing"):this.text("编辑常用尺度","Edit favorites");edit.setAttribute("aria-label",edit.title);setIcon(edit,editing?"check":"pencil");restore.hidden=!editing;paint();});edit.setAttribute("aria-pressed","false");
    const restore=panel.createEl("button",{cls:"noria-tl-scale-edit",text:this.text("补回默认项","Restore defaults")});restore.hidden=true;restore.onclick=()=>this.panelSave(panel,async()=>{await this.save({scaleFavorites:windows.favorites([...this.settings().scaleFavorites,...windows.defaults])});paint();});
    const details=panel.createEl("details",{cls:"noria-tl-scale-details"});details.createEl("summary",{text:this.text("自定义时长","Custom duration")});
    const custom=details.createDiv({cls:"noria-tl-scale-custom"}),amount=custom.createEl("input",{attr:{type:"number",min:"1",max:"999",value:"1","aria-label":this.text("数量","Amount")}}),unit=custom.createEl("select",{attr:{"aria-label":this.text("时间单位","Time unit")}});
    windows.units.forEach((u,i)=>unit.createEl("option",{value:u,text:this.text(["小时","天","周","月","年"][i],u)}));unit.value="day";
    unit.onchange=()=>{amount.max=String({month:120,year:10}[unit.value]||999);};
    const current=this.backend?.getWindow()?.scale;if(current){amount.value=String(current.amount);unit.value=current.unit;}
    const error=details.createDiv({cls:"noria-task-row-error",attr:{role:"status"}});
    const chosen=()=>{const s=windows.scale({amount:amount.value,unit:unit.value});if(!s){error.textContent=this.text("请输入有效的正整数。","Enter a valid positive whole number.");amount.focus();}return s;};
    const actions=details.createDiv({cls:"noria-tl-scale-actions"});const apply=actions.createEl("button",{text:this.text("应用","Apply")});apply.onclick=()=>{const s=chosen();if(s){this.setScale(s);close();}};
    const save=actions.createEl("button",{text:this.text("存为常用","Save favorite")});save.onclick=()=>{const s=chosen();if(s)return this.panelSave(panel,async()=>{await this.save({scaleFavorites:windows.favorites([...this.settings().scaleFavorites,s])});paint();});};
  }
  filterPanel(anchor){const panel=this.panel(anchor,this.text("竖版内容","Vertical contents")),f=normalizeFilter(this.settings().verticalFilter);this.panelKind='filter';
    const apply=patch=>this.panelSave(panel,async()=>{const next=normalizeFilter({...f,...patch});await this.save({verticalFilter:next});Object.assign(f,next);this.updateFilterState();this.remember();this.resetReader();void this.renderStream();}).then(ok=>{reset.disabled=!f.query&&f.tasks&&f.records&&f.showDone&&!f.ctime&&!f.mtime;return ok;});
    const pending=panel.createEl('button',{cls:'noria-tl-filter-pending',text:this.text('查看未安排任务','View unscheduled tasks')});pending.onclick=()=>{this.closePanel?.(false);void this.setUnscheduled(true);};
    const search=panel.createEl("input",{attr:{type:"search",placeholder:this.text("搜索内容或标签","Search text or tags"),"aria-label":this.text("搜索内容或标签","Search text or tags")}});search.value=f.query;search.onchange=()=>apply({query:search.value});search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void apply({query:search.value});}};
    const advanced=panel.createEl("details");advanced.createEl("summary",{text:this.text("笔记活动","Note activity")});advanced.open=!!(f.ctime||f.mtime);
    for(const [key,zh,en] of [["tasks","任务","Tasks"],["records","记录与闪念","Notes and captures"],["showDone","保留已完成任务","Keep completed tasks"],["ctime","笔记创建","Note creation"],["mtime","最后修改（非历史）","Last modification (not history)"]]){
      const label=(key==="ctime"||key==="mtime"?advanced:panel).createEl("label",{cls:"noria-tl-filter-choice"}),input=label.createEl("input",{attr:{type:"checkbox"}});input.checked=f[key];label.createSpan({text:this.text(zh,en)});input.onchange=async()=>{if(!await apply({[key]:input.checked}))input.checked=f[key];};}
    panel.appendChild(advanced);
    const metaLabel=panel.createEl('label',{cls:'noria-tl-filter-choice',text:this.text('任务下方显示','Below each task')}),meta=metaLabel.createEl('select',{attr:{'aria-label':this.text('任务来源信息','Task source details')}});
    for(const [value,zh,en] of [['none','不显示','None'],['folder','目录','Folder'],['tags','标签','Tags'],['both','目录与标签','Folder and tags']])meta.createEl('option',{value,text:this.text(zh,en)});
    meta.value=this.settings().verticalMetadata||'folder';meta.onchange=async()=>{
      const value=meta.value;
      if(!await this.panelSave(panel,async()=>{await this.save({verticalMetadata:value});void this.renderStream();}))meta.value=this.settings().verticalMetadata||'folder';
    };
    const actions=panel.createDiv({cls:'noria-tl-filter-footer'});actions.appendChild(pending);
    const reset=actions.createEl("button",{text:this.text("清除筛选","Clear filters")});reset.disabled=!f.query&&f.tasks&&f.records&&f.showDone&&!f.ctime&&!f.mtime;reset.onclick=async()=>{if(await apply(normalizeFilter({})))this.filterPanel(this.filterButton);};
  }
  async setUnscheduled(show){
    const doc=this.stream?.ownerDocument,previous=doc?.activeElement;
    if(show){this.remember();this.unscheduledScroll=0;}
    this.showUnscheduled=show;
    await this.renderStream();
    if(this.showUnscheduled!==show||!doc)return;
    const active=doc.activeElement;
    if(active&&active!==doc.body&&active!==previous&&!this.stream?.contains(active))return;
    const target=show?this.stream?.querySelector('[data-tl-focus="unscheduled-back"]'):this.filterButton;
    target?.focus({preventScroll:true});
  }
  captureAnchor(){
    const host=this.stream;if(!host||host.hidden||!host.isConnected||this.view._timelineInlineMode)return this.savedAnchor;
    const top=host.getBoundingClientRect().top;
    const rows=[...host.querySelectorAll('.noria-tl-stream-item[data-anchor]')];
    const row=rows.find(el=>el.getBoundingClientRect().bottom>top+36)||[...host.querySelectorAll('h3[data-anchor]')].find(el=>el.getBoundingClientRect().bottom>top+2);
    return row?{id:row.dataset.anchor,date:row.dataset.date,offset:row.getBoundingClientRect().top-top}:this.savedAnchor;
  }
  remember(){if(this.view._timelineInlineMode)return this.savedAnchor;if(this.showUnscheduled){if(this.stream?.isConnected&&!this.stream.hidden)this.unscheduledScroll=this.stream.scrollTop;return this.savedAnchor;}this.savedAnchor=this.captureAnchor();this.view._verticalTimelineState=this.savedAnchor;this.plugin.app.workspace.requestSaveLayout?.();return this.savedAnchor;}
  rememberFocus(){
    const host=this.stream,doc=host?.ownerDocument,active=doc?.activeElement;
    if(!host||!doc)return;
    if(!host.contains(active)){if(active&&active!==doc.body)this.pendingFocus=null;return;}
    const key=active.dataset?.tlFocus;if(!key)return;
    const controls=[...host.querySelectorAll('[data-tl-focus]')],index=controls.indexOf(active);
    this.pendingFocus={key,next:controls[index+1]?.dataset.tlFocus,previous:controls[index-1]?.dataset.tlFocus};
  }
  restoreFocus(){
    const pending=this.pendingFocus,host=this.stream;if(!pending||!host?.isConnected)return;
    const doc=host.ownerDocument,active=doc.activeElement;this.pendingFocus=null;
    // A user may have moved into a dialog, the toolbar or another pane while
    // content was loading. Background refresh must not take that focus back.
    if(active&&active!==doc.body&&active!==host&&!host.contains(active))return;
    const controls=[...host.querySelectorAll('[data-tl-focus]')];
    const target=[pending.key,pending.next,pending.previous].filter(Boolean).map(key=>controls.find(el=>el.dataset.tlFocus===key&&!el.disabled)).find(Boolean);
    (target||host).focus({preventScroll:true});
  }
  restoreAnchor(anchor){
    if(!anchor||this.view._timelineInlineMode)return;const host=this.stream;if(!host?.isConnected||host.hidden)return;
    const nodes=[...host.querySelectorAll('[data-anchor]')],row=nodes.find(el=>el.dataset.anchor===anchor.id)||nodes.find(el=>el.dataset.date===anchor.date);
    // Sticky headings report the pinned position; jump to their natural section.
    const target=anchor.id?.startsWith('day:')&&row?.tagName==='H3'?row.parentElement:row;
    if(target)host.scrollTop+=target.getBoundingClientRect().top-host.getBoundingClientRect().top-(Number(anchor.offset)||0);
  }
  resetReader(){++this.serial;this.reader?.dispose();this.reader=null;this.readerReady=null;}
  async ensureReader(){
    if(!this.reader){this.reader=new ContinuousTimeline(this.plugin,this.model,normalizeFilter(this.settings().verticalFilter));this.readerReady=this.reader.init(this.savedAnchor?.date||this.clock.day(Date.now()));}
    const reader=this.reader;
    try{await this.readerReady;}catch(e){if(this.reader===reader){reader.dispose();this.reader=null;this.readerReady=null;}throw e;}return reader;
  }
  renderProjectScope(panel,state,apply){
    const row=panel.createEl('label',{cls:'noria-tl-project-scope'});
    row.createSpan({text:this.text('项目','Project')});
    const select=row.createEl('select',{attr:{'aria-label':this.text('筛选项目','Filter projects'),'data-noria-action-kind':'project-scope'}});
    select.createEl('option',{value:'',text:this.text('全部项目','All projects')});
    if(state.projectRoot)select.createEl('option',{value:state.projectRoot,text:state.projectRoot.split('/').pop().replace(/\.md$/i,'')});
    select.value=state.projectRoot||'';select.disabled=true;
    const status=row.createSpan({cls:'noria-card-secondary',attr:{role:'status'}});
    select.onchange=()=>{
      if(select.value===state.projectRoot)return;
      apply({...state,projectRoot:select.value,expandedProjects:select.value?[...new Set([...state.expandedProjects,select.value])]:state.expandedProjects});
    };
    void (async()=>{
      try{
        const service=await this.plugin.createDataService();
        const snapshot=await service.getSnapshot({include:['projects']});
        if(!row.isConnected)return;
        const projects=(snapshot?.domains?.projects?.items||[]).filter(p=>p.stage!=='hidden'&&p.root);
        const seen=new Set([...select.options].map(o=>o.value));
        for(const p of projects){
          if(seen.has(p.root))continue;
          const duplicate=projects.some(other=>other.root!==p.root&&other.name===p.name);
          select.createEl('option',{value:p.root,text:duplicate?`${p.name} · ${p.root}`:p.name});seen.add(p.root);
        }
        select.disabled=false;
      }catch(error){if(row.isConnected){status.textContent=this.text('项目暂时无法读取','Projects could not be loaded');status.title=error.message;select.disabled=false;}}
      if(panel.isConnected&&panel.dataset.pendingFocus==='project-scope'){
        delete panel.dataset.pendingFocus;
        if(panel.ownerDocument.activeElement===panel.ownerDocument.body)select.focus({preventScroll:true});
      }
    })();
    return row;
  }
  attach(backend,model,events,surface){
    clearTimeout(this.scrollTimer);
    if(this.vertical()){this.remember();this.rememberFocus();}this.resetReader();
    this.stream?.remove();this.child?.unload();
    this.backend=backend;this.model=model;this.events=events;this.surface=surface;
    if(this.horizontalState)backend.restoreViewState(this.horizontalState);
    this.stream=surface.parentElement.createDiv({cls:'noria-tl-stream',attr:{'aria-label':this.text('混排时间轴','Mixed timeline'),tabindex:'0'}});
    this.stream.addEventListener('scroll',()=>{
      if(this.painting||this.stream.hidden||this.view._timelineInlineMode)return;
      clearTimeout(this.scrollTimer);this.scrollTimer=setTimeout(()=>{this.remember();this.checkBoundary();},100);
    },{passive:true});
    this.stream.addEventListener('wheel',e=>{
      if(this.loading||this.painting||this.showUnscheduled||!this.reader)return;
      const s=this.reader.snapshot();
      if(e.deltaY<0&&this.stream.scrollTop<100&&s.earlier&&!this.edgeErrors?.[-1])void this.loadBoundary(-1);
      else if(e.deltaY>0&&this.stream.scrollHeight-this.stream.clientHeight-this.stream.scrollTop<160&&s.later&&!this.edgeErrors?.[1])void this.loadBoundary(1);
    },{passive:true});
    this.present();this.view.renderTimelineAppChrome();
  }
  present(){if(!this.surface)return;this.surface.style.visibility=this.vertical()?'hidden':'';this.surface.inert=this.vertical();this.stream.hidden=!this.vertical();this.renderEdges();if(this.vertical())void this.renderStream();else{++this.serial;this.reader?.dispose();this.reader=null;this.readerReady=null;}}
  rememberHorizontal(){
    if(!this.backend?.host?.isConnected)return;
    this.backend.flushWindow();
    const state=this.backend.captureViewState();
    if(state){
      this.horizontalState=this.resetHorizontalScroll?{...state,scrollTop:0,projectKey:'',projectOffset:0}:state;
      this.resetHorizontalScroll=false;
    }
  }
  async jumpToDate(date){
    this.showUnscheduled=false;this.savedAnchor={id:'day:'+date,date,offset:8};this.view._verticalTimelineState=this.savedAnchor;
    this.resetReader();await this.renderStream();this.stream?.focus({preventScroll:true});
  }
  focusToday(){void this.jumpToDate(this.clock.day(Date.now()));return true;}
  checkBoundary(){
    if(this.loading||this.painting||!this.reader||this.showUnscheduled||!this.vertical()||this.view._timelineInlineMode)return;
    const host=this.stream,s=this.reader.snapshot();
    if(host.scrollTop<100&&s.earlier&&!this.edgeErrors?.[-1])void this.loadBoundary(-1);
    else if(host.scrollHeight-host.clientHeight-host.scrollTop<160&&s.later&&!this.edgeErrors?.[1])void this.loadBoundary(1);
  }
  async loadBoundary(direction){
    if(this.loading||!this.reader)return;const reader=this.reader;this.loading=true;this.remember();
    const button=this.stream.querySelector(`[data-load-direction="${direction}"]`);if(button){button.disabled=true;button.textContent=this.text('正在读取…','Loading…');}
    try{await reader.load(direction);if(this.reader!==reader||!this.vertical())return;this.edgeErrors={};await this.renderStream();}
    catch(e){if(e.name!=='AbortError'&&this.reader===reader){(this.edgeErrors||(this.edgeErrors={}))[direction]=e.message;if(button){button.disabled=false;button.textContent=this.text('读取失败，点击重试','Could not load. Retry');button.title=e.message;}}}
    finally{this.loading=false;}
  }
  dateLabel(date){const today=this.clock.day(Date.now()),locale=this.plugin.getNoriaLocale()==='zh'?'zh-CN':'en',d=new Date(date+'T12:00:00'),weekday=new Intl.DateTimeFormat(locale,{weekday:'short'}).format(d);return (date===today?this.text('今天','Today'):new Intl.DateTimeFormat(locale,{...(date.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{}),month:'short',day:'numeric'}).format(d))+' · '+weekday;}
  async renderStream(){
    if(!this.stream?.isConnected||!this.vertical())return;
    const serial=++this.serial,host=this.stream,anchor=this.savedAnchor||{id:'day:'+this.clock.day(Date.now()),date:this.clock.day(Date.now()),offset:8};
    try{
      host.setAttribute('aria-busy','true');const reader=await this.ensureReader();
      if(serial!==this.serial||!host.isConnected||!this.vertical())return;
      const stream=reader.snapshot();this.rememberFocus();this.painting=true;this.child?.unload();this.child=new Component();this.child.load();host.empty();
      const timer=globalThis.noriaTaskTimeline?.pomodoroBinding;
      if(timer&&this.plugin.isPomodoroModuleEnabled())this.child.register(timer.installPomodoroDockTicker(host,this.timerOptions()));
      const boundary=direction=>{if(direction<0?!stream.earlier:!stream.later)return;const b=host.createEl('button',{cls:'noria-tl-stream-load',text:direction<0?this.text('较早内容','Earlier entries'):this.text('较晚内容','Later entries'),attr:{type:'button','data-load-direction':String(direction)}});b.onclick=()=>void this.loadBoundary(direction);};
      if(this.showUnscheduled){
        const header=host.createDiv({cls:'noria-tl-unscheduled-heading'});header.createEl('strong',{text:this.text('未安排任务','Unscheduled tasks')});const back=header.createEl('button',{text:this.text('返回时间轴','Back to timeline'),attr:{'data-tl-focus':'unscheduled-back'}});back.onclick=()=>void this.setUnscheduled(false);
        for(const item of stream.unscheduled)this.taskRow(host,item);
        if(!stream.unscheduled.length)host.createDiv({cls:'noria-card-empty',text:this.text('没有符合筛选的未安排任务。','No unscheduled tasks match these filters.')});
      }else{
        boundary(-1);
        const byDate=new Map();for(const item of stream.items){if(!byDate.has(item.date))byDate.set(item.date,[]);byDate.get(item.date).push(item);}
        if(stream.dates.includes(this.clock.day(Date.now()))&&!byDate.has(this.clock.day(Date.now())))byDate.set(this.clock.day(Date.now()),[]);
        if(stream.dates.includes(reader.anchor)&&!byDate.has(reader.anchor))byDate.set(reader.anchor,[]);
        for(const date of [...byDate.keys()].sort()){
          const group=host.createEl('section',{cls:'noria-tl-stream-day'}),heading=group.createEl('h3',{attr:{'data-anchor':'day:'+date,'data-date':date}});
          if(date===this.clock.day(Date.now()))heading.setAttribute('aria-current','date');
          const label=heading.createEl('button',{text:this.dateLabel(date),attr:{type:'button',title:this.text('在侧栏日历中跳转','Jump using the sidebar calendar')}});
          label.onclick=()=>void this.plugin.openCalendarLeaf({mode:'daily',anchorDate:date,timelineTarget:this});
          const items=byDate.get(date),limit=this.dayLimits.get(date)||100;
          for(const item of items.slice(0,limit)){
            await this.renderItem(group,item,serial);if(serial!==this.serial)return;
          }
          if(items.length>limit){const b=group.createEl('button',{cls:'noria-tl-stream-load',text:this.text('展开更多 · ','Show more · ')+(items.length-limit)});b.onclick=()=>{this.remember();this.dayLimits.set(date,limit+100);void this.renderStream();};}
          if(!items.length){const empty=group.createDiv({cls:'noria-tl-day-empty',text:this.text('这天还没有符合筛选的内容','No matching entries on this day')});const add=empty.createEl('button',{text:this.text('添加任务','Add task')});add.onclick=()=>void this.plugin.addCalendarDateTask({date});}
        }
        boundary(1);
      }
      if(stream.ambiguous)host.createDiv({cls:'noria-card-secondary',text:this.text('日记路径未包含完整年月日，无法按日期展开。','The diary pattern lacks a full date and cannot be expanded.')});
      if(this.showUnscheduled)host.scrollTop=this.unscheduledScroll||0;else this.restoreAnchor(anchor);
      this.restoreFocus();host.setAttribute('aria-busy','false');this.painting=false;
      // Retain position when late images change size, without defeating user scroll.
      for(const img of host.querySelectorAll('img'))if(!img.complete){const before=this.captureAnchor();img.addEventListener('load',()=>{if(this.savedAnchor?.id===before?.id)this.restoreAnchor(before);},{once:true});}
    }catch(e){if(e.name!=='AbortError'&&serial===this.serial&&host.isConnected){const error=host.createDiv({cls:'noria-task-row-error',text:e.message});const b=error.createEl('button',{text:this.text('重试','Retry')});b.onclick=()=>{error.remove();void this.renderStream();};host.setAttribute('aria-busy','false');}}
    finally{if(serial===this.serial)this.painting=false;}
  }
  async renderItem(group,item,serial){
        const row=group.createDiv({cls:"noria-tl-stream-item",attr:{"data-kind":item.kind,"data-event-id":item.id}});
    row.dataset.focusMs=String(item.kind==='task'?Date.parse(item.start):+new Date(item.date+'T'+(item.time||'00:00')+':00'));
        const task=item.kind==='task',locale=this.plugin.getNoriaLocale()==='zh'?'zh-CN':'en';
        const timeLabel=task?taskTimeLabel(item,locale):item.time;
        if(timeLabel)row.createEl("time",{text:timeLabel,attr:{title:task?this.text('计划时间 · ','Planned time · ')+taskTimeLabel(item,locale,''):timeLabel}});
        const content=row.createDiv({cls:"noria-tl-stream-content"});
        if(item.kind==="task"){
          const category=require('./task-category.js').resolveTaskCategory(item.task,this.plugin.settings.colorPalette);
          if(category.color){row.style.setProperty('--noria-task-category',category.color);row.dataset.taskCategory=category.tag;}
          this.taskRow(content,item);
        }
        else if(item.markdown){await this.renderRecord(content,item,serial);}
        else{content.createSpan({cls:"noria-card-secondary",text:this.text(item.kind==="note-created"?"创建笔记 · ":"最后修改 · ",item.kind==="note-created"?"Created · ":"Last modified · ")});const b=content.createEl("button",{cls:"noria-activity-link",text:item.title});b.dataset.tlFocus='source:'+item.id;b.onclick=()=>this.plugin.app.workspace.openLinkText(item.path,"",false);}
    row.dataset.anchor='item:'+item.id;row.dataset.date=item.date;
  }
  async taskSaved(row,task){
    row.classList.toggle('is-completed',!!task.completed);this.remember();
    // The shared editor has finished writing, while vault/index events may still
    // be queued. Invalidate before rebuilding so the old snapshot cannot win.
    const service=await this.plugin.createDataService();service.invalidate('timeline-task-saved','tasks');
    this.plugin.invalidateTaskSnapshots('tasks');
    // Saving is complete. A full mount must not keep its source editor busy.
    void this.view.refreshTimelineRuntimeFromChrome().then(()=>this.renderStream()).catch(()=>{
      new Notice(this.plugin.t('workbench.taskRefreshFailed'));
    });
  }
  async renderRecord(content,item,serial){
    const markdown=prepareReviewPreview(item.markdown,{sourcePath:item.path}),preview=timelineRecordPreview(markdown);
    const body=content.createDiv({cls:'noria-tl-record-body'});body.tabIndex=-1;body.dataset.tlFocus='record:'+item.id;
    let recordChild,busy=false,open=preview.long&&this.expandedRecords.has(item.id);
    const current=()=>serial===this.serial&&content.isConnected;
    const owner=this.child;
    const render=async expanded=>{
      if(recordChild)owner.removeChild(recordChild);recordChild=new Component();owner.addChild(recordChild);body.empty();
      if(!expanded&&preview.plain)body.createDiv({cls:'noria-tl-record-excerpt',text:preview.plain});
      else{const prose=body.createDiv({cls:'markdown-rendered'});await MarkdownRenderer.render(this.plugin.app,expanded?markdown:preview.markdown,prose,item.path,recordChild);if(!current())return;
        prose.querySelectorAll('input[type="checkbox"]').forEach(el=>el.disabled=true);
        prose.addEventListener('click',e=>{const link=e.target.closest?.('a.internal-link');if(link?.dataset.href){e.preventDefault();void this.plugin.app.workspace.openLinkText(link.dataset.href,item.path,true).catch(error=>new Notice(error.message));}});
      }
    };
    await render(open);if(!current())return;
    if(preview.long){
      const toggle=content.createEl('button',{cls:'noria-tl-record-toggle',attr:{type:'button','aria-expanded':String(open)}});toggle.dataset.tlFocus='expand:'+item.id;
      const label=()=>{toggle.textContent=open?this.text('收起全文','Collapse'):this.text('展开全文','Read more');toggle.setAttribute('aria-expanded',String(open));};label();
      const error=content.createDiv({cls:'noria-task-row-error',attr:{role:'status'}});
      toggle.onclick=async()=>{
        if(busy)return;
        const anchor=this.remember(),next=!open,hadFocus=content.contains(content.ownerDocument.activeElement);
        busy=true;toggle.disabled=true;error.textContent='';body.setAttribute('aria-busy','true');
        try{await render(next);if(!current())return;open=next;
          if(open){this.expandedRecords.delete(item.id);this.expandedRecords.add(item.id);while(this.expandedRecords.size>100)this.expandedRecords.delete(this.expandedRecords.values().next().value);}else this.expandedRecords.delete(item.id);
          label();toggle.disabled=false;const own=anchor?.id==='item:'+item.id;
          this.restoreAnchor(!open&&own&&anchor.offset<0?{...anchor,offset:40}:anchor);
          const active=content.ownerDocument.activeElement;
          if(hadFocus&&(active===content.ownerDocument.body||content.contains(active)))(open?body:toggle).focus({preventScroll:true});
          this.remember();
        }catch(e){if(current()){await render(open).catch(()=>{});error.textContent=this.text('无法展开，请重试：','Could not open. Try again: ')+e.message;}}
        finally{busy=false;if(current()){toggle.disabled=false;body.removeAttribute('aria-busy');}}
      };
    }
    const source=this.button(content,'file-text',this.text('打开来源','Open source'),()=>this.plugin.app.workspace.openLinkText(item.path,'',false));source.dataset.tlFocus='source:'+item.id;
  }
  taskRow(parent,item){const row=renderWorkbenchTaskRow(this.plugin,parent,item.task,{calendarZone:require('./task-calendar-zone.js').zoneContext(this.plugin.settings.tasksCalendar),onSaved:(_,task)=>this.taskSaved(row,task)});row.classList.toggle("is-completed",!!item.task.completed);
    row.addEventListener('change',()=>this.rememberFocus(),true);
    const mode=this.settings().verticalMetadata||'folder',folder=String(item.task.path||'').replace(/\\/g,'/').split('/').slice(0,-1).join('/');
    const tags=[...new Set((Array.isArray(item.task.tags)?item.task.tags:String(item.task.text||'').match(/#[\p{L}\p{N}_/-]+/gu)||[]).map(String).filter(t=>!/^#?tl(?:\/|$)/.test(t)))];
    const parts=[];if(['folder','both'].includes(mode)&&folder)parts.push(folder.split('/').at(-1));if(['tags','both'].includes(mode)&&tags.length)parts.push(tags.map(t=>t.startsWith('#')?t:'#'+t).join(' '));
    if(parts.length){const details=row.querySelector('.noria-diary-task-body').createEl('button',{cls:'noria-tl-task-source',text:parts.join(' · '),attr:{type:'button',title:folder||item.task.path,'aria-label':this.text('打开来源：','Open source: ')+item.task.path}});details.onclick=()=>this.plugin.app.workspace.openLinkText(item.task.path,'',false);}
    if(this.showUnscheduled){const label=taskTimeLabel(item,this.plugin.getNoriaLocale()==='zh'?'zh-CN':'en','');if(label)row.querySelector('.noria-diary-task-body').createDiv({cls:'noria-tl-task-range',text:label});}
    if(this.plugin.isPomodoroModuleEnabled()&&item.payload?.noria){
      const api=globalThis.noriaTaskTimeline?.pomodoroBinding,event={noria:item.payload.noria,title:item.title};
      const dock=api?.decorateTaskPomodoroDropTargets([row],event,this.timerOptions());
      const more=this.button(row,"ellipsis",this.text("任务操作","Task actions"),anchor=>{
        const menu=new Menu();
        menu.addItem(entry=>entry.setTitle(this.text("编辑任务","Edit task")).setIcon("pencil").onClick(()=>row.querySelector(".noria-diary-task-title")?.click()));
        const label=dock?.summary?.running?this.text("暂停番茄钟","Pause Pomodoro"):dock?.summary?.paused?this.text("继续番茄钟","Resume Pomodoro"):this.text("开始番茄钟","Start Pomodoro");
        menu.addItem(entry=>entry.setTitle(label).setIcon("timer").onClick(async()=>{
          try{if(!api)throw Error(this.text("计时器尚未就绪","Timer is not ready"));const meta=api.taskPomodoroMeta(event);const next=api.startOrTogglePomodoroState(this.plugin.getPomodoroState(),meta,new Date().toISOString());await this.plugin.savePomodoroState(next);this.remember();void this.renderStream();}
          catch(error){new Notice(error.message);}
        }));
        const rect=anchor.getBoundingClientRect();menu.showAtPosition({x:rect.left,y:rect.bottom});
      });more.classList.add("noria-tl-task-more");more.setAttribute("aria-haspopup","menu");
    }
    for(const control of row.querySelectorAll('button,input'))control.dataset.tlFocus=JSON.stringify([item.task.path,item.task.line,control.className]);
    return row;
  }
  timerOptions(){return {readPomodoroState:()=>this.plugin.getPomodoroState(),savePomodoroState:state=>this.plugin.savePomodoroState(state),requestRefresh:()=>{this.remember();void this.renderStream();}};}
  dispose(){this.remember();++this.serial;clearTimeout(this.scrollTimer);this.reader?.dispose();this.closePanel?.(false);this.child?.unload();this.stream?.remove();this.edges?.remove();}
}
module.exports={TimelineWorkspace};
