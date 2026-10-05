"use strict";
const {Component,MarkdownRenderer,setIcon,Notice,Menu}=require("obsidian");
const windows=require("./runtime/views/task-timeline/time-window.js");
const {normalizeFilter}=require("./timeline-stream-model.js");
const {renderWorkbenchTaskRow}=require("./task-row.js");
const {prepareReviewPreview}=require("./review-document.js");
const {commitSettingsChange}=require('./settings-change.js');
const {ContinuousTimeline}=require('./timeline-continuous.js');
const {timelineRecordPreview}=require('./timeline-record-preview.js');

class TimelineWorkspace {
  constructor(view){this.view=view;this.plugin=view.plugin;this.serial=0;this.scroll=0;this.dayLimits=new Map();this.expandedRecords=new Set(view._timelineExpandedRecords||[]);this.savedAnchor=view._verticalTimelineState||null;}
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  settings(){return this.plugin.settings.timelineView;}
  vertical(){return this.settings().orientation==="vertical";}
  button(parent,icon,label,run){const b=parent.createEl("button",{cls:"noria-tl-toolbar-icon-btn",attr:{type:"button","aria-label":label,title:label}});setIcon(b,icon);b.onclick=()=>{Promise.resolve().then(()=>run(b)).catch(e=>new Notice(e.message));};return b;}
  save(patch){const next=structuredClone(patch);return commitSettingsChange(this.plugin,['timelineView'],()=>Object.assign(this.settings(),next));}
  async panelSave(panel,run){
    if(panel.getAttribute('aria-busy')==='true')return false;
    const controls=[...panel.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);
    const status=panel.querySelector('.noria-settings-save-feedback')||panel.createDiv({cls:'noria-settings-save-feedback',attr:{role:'status'}});
    controls.forEach(([el])=>{el.disabled=true;});panel.setAttribute('aria-busy','true');status.textContent='';
    try{await run();return true;}catch(error){status.textContent=this.text('未能保存，请重试：','Could not save. Try again: ')+error.message;return false;}
    finally{controls.forEach(([el,disabled])=>{el.disabled=disabled;});panel.removeAttribute('aria-busy');}
  }
  toolbar(lead,trail){
    this.closePanel?.(false);
    this.view.appChromeEl.dataset.orientation=this.vertical()?"vertical":"horizontal";
    const dir=this.button(lead,this.vertical()?"list-tree":"gantt-chart",this.vertical()?this.text("当前竖排，切换横排","Vertical; switch to horizontal"):this.text("当前横排，切换竖排","Horizontal; switch to vertical"),async()=>{
      if(this.vertical())this.remember();this.backend?.flushWindow();
      await this.save({orientation:this.vertical()?"horizontal":"vertical"});this.view.renderTimelineAppChrome();this.present();
    });dir.dataset.action="timeline-orientation";dir.setAttribute("aria-pressed",String(this.vertical()));
    this.scaleButton=null;
    if(!this.vertical()){
    const scale=lead.createEl("button",{cls:"noria-tl-toolbar-link noria-tl-scale",attr:{type:"button","aria-haspopup":"dialog","aria-label":this.text("调整显示范围","Change visible range")}});
    this.scaleButton=scale;
    this.updateScaleLabel();
    scale.onclick=()=>this.scalePanel(scale);
    }
    if(this.vertical()){
      this.filterButton=this.button(trail,"sliders-horizontal",this.text("筛选竖版内容","Filter vertical timeline"),b=>this.filterPanel(b));
      this.filterButton.setAttribute("aria-haspopup","dialog");this.updateFilterState();
    }
  }
  updateScaleLabel(){
    if(!this.scaleButton)return;
    const window=this.backend?.getWindow()||this.settings().timeWindow,zh=this.plugin.getNoriaLocale()==="zh",label=windows.label(window,zh);
    const spec=windows.normalize(window)?.scale;
    this.scaleButton.textContent=spec?this.scaleName(spec):zh?label.replace(/\s+/g,""):label.replace(/^Custom · /,"");
    this.scaleButton.title=this.text("显示范围 · ","Visible range · ")+label;
    this.scaleButton.setAttribute("aria-label",this.scaleButton.title);
  }
  scaleName(spec){
    if(spec.amount===1&&["day","week","month"].includes(spec.unit))return this.text({day:"天",week:"周",month:"月"}[spec.unit],{day:"Day",week:"Week",month:"Month"}[spec.unit]);
    const label=windows.label(windows.at(Date.now(),spec),this.plugin.getNoriaLocale()==="zh");return this.plugin.getNoriaLocale()==="zh"?label.replace(/\s+/g,""):label;
  }
  updateFilterState(){const f=normalizeFilter(this.settings().verticalFilter),active=!f.tasks||!f.records||!f.showDone||f.ctime||f.mtime||!!f.query;this.filterButton?.classList.toggle("noria-tl-toolbar-link--on",active);this.filterButton?.setAttribute("data-filter-active",String(active));}
  morePanel(anchor,tools){
    const panel=this.panel(anchor,this.text("时间轴工具","Timeline tools"));
    for(const direction of [-1,1]){const b=panel.createEl("button",{text:direction<0?this.text("查看较早范围","Earlier range"):this.text("查看较晚范围","Later range")});b.onclick=()=>{this.move(direction);this.closePanel?.(true);};}
    if(!this.vertical()&&tools){
      panel.createEl("span",{cls:"noria-card-secondary",text:this.text("时间工具","Time tools")});
      const magnify=panel.createEl("button",{text:this.text("放大关注时段 · 2×","Magnify focus interval · 2×"),attr:{"aria-pressed":String(this.backend?.getFocusMagnification()!==false)}});
      magnify.title=this.text("拉开关注日期附近的时间，整体起止范围不变","Expand time near the focus date without changing the visible endpoints");
      magnify.onclick=()=>{this.backend?.setFocusMagnification(this.backend.getFocusMagnification()===false);this.backend?.flushWindow();magnify.setAttribute("aria-pressed",String(this.backend.getFocusMagnification()));};
      for(const original of tools.querySelectorAll("button")){
        const b=panel.createEl("button",{text:original.getAttribute("aria-label")||original.title});
        if(original.hasAttribute("aria-pressed"))b.setAttribute("aria-pressed",original.getAttribute("aria-pressed"));
        b.onclick=()=>{this.closePanel?.(false);original.click();};
        if(original.draggable){b.draggable=true;b.ondragstart=e=>{e.dataTransfer.effectAllowed="copy";e.dataTransfer.setData("text/plain","noria/timeline-timer-attach");e.dataTransfer.setData("application/x-noria-timer-attach","1");this.closePanel?.(false);};}
      }
    }
  }
  renderEdges(){
    this.edges?.remove();if(this.vertical()||!this.surface?.parentElement)return;
    this.edges=this.surface.parentElement.createDiv({cls:"noria-tl-range-edges"});this.edges.dataset.orientation=this.vertical()?"vertical":"horizontal";
    for(const direction of [-1,1]){const b=this.button(this.edges,direction<0?"chevron-left":"chevron-right",direction<0?this.text("查看较早范围","Earlier range"):this.text("查看较晚范围","Later range"),()=>this.move(direction));b.dataset.direction=String(direction);}
  }
  move(direction){const w=this.backend?.getWindow();if(w){this.scroll=0;this.limit=80;this.backend.setWindow(windows.shift(w,direction));}}
  setScale(spec){
    const w=this.backend?.getWindow();if(!w)return;
    const focus=this.backend.getFocus?.()??w.focusMs??(w.startMs+w.endMs)/2;
    this.backend.setWindow(windows.around(focus,spec));
  }
  panel(anchor,title){
    this.closePanel?.(false);const doc=anchor.ownerDocument,win=doc.defaultView;
    const panel=doc.body.createDiv({cls:"noria-tl-range-panel",attr:{role:"dialog","aria-label":title}});
    anchor.setAttribute("aria-expanded","true");
    const close=focus=>{doc.removeEventListener("pointerdown",outside,true);doc.removeEventListener("keydown",keys,true);win.removeEventListener("resize",position);panel.remove();anchor.setAttribute("aria-expanded","false");if(focus)anchor.focus();if(this.closePanel===close)this.closePanel=null;};
    const outside=e=>{if(!panel.contains(e.target)&&!anchor.contains(e.target))close(false);};
    const keys=e=>{if(e.key==="Escape"){e.preventDefault();close(true);}else if(e.key==="Tab"){const nodes=[...panel.querySelectorAll("button,input,select,summary")].filter(el=>!el.disabled&&el.checkVisibility({checkVisibilityCSS:true}));if(e.shiftKey&&doc.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&doc.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}};
    const position=()=>{
      const r=anchor.getBoundingClientRect(),bounds=this.view.appChromeEl.getBoundingClientRect();
      const left=Math.max(8,bounds.left),right=Math.min(win.innerWidth-8,bounds.right),width=Math.max(0,Math.min(300,right-left));
      panel.style.width=`${width}px`;panel.style.left=`${Math.max(left,Math.min(r.left,right-width))}px`;
      panel.style.top=`${Math.max(8,Math.min(r.bottom+6,win.innerHeight-panel.offsetHeight-8))}px`;
    };
    doc.addEventListener("pointerdown",outside,true);doc.addEventListener("keydown",keys,true);win.addEventListener("resize",position);panel.addEventListener("toggle",position,true);this.closePanel=close;
    panel.createEl("strong",{text:title});queueMicrotask(()=>{if(panel.isConnected){position();panel.querySelector("button,input,select")?.focus();}});return panel;
  }
  scalePanel(anchor){
    const panel=this.panel(anchor,this.text("一屏时长","Visible duration")),heading=panel.createDiv({cls:"noria-tl-panel-heading"});heading.append(panel.querySelector("strong"));
    const list=panel.createDiv({cls:"noria-tl-scale-list"});let editing=false;
    const paint=()=>{list.empty();const favorites=windows.favorites(this.settings().scaleFavorites);
      favorites.forEach((s,i)=>{const row=list.createDiv({cls:"noria-tl-scale-row"});const b=row.createEl("button",{text:this.scaleName(s)});const current=this.backend?.getWindow()?.scale;b.setAttribute("aria-pressed",String(current?.amount===s.amount&&current?.unit===s.unit));b.onclick=()=>{this.setScale(s);this.closePanel?.(true);};
        if(editing){const up=this.button(row,"arrow-up",this.text("上移","Move up"),()=>this.panelSave(panel,async()=>{const next=favorites.slice();[next[i-1],next[i]]=[next[i],next[i-1]];await this.save({scaleFavorites:next});paint();}));up.disabled=i===0;
          this.button(row,"x",this.text("移除快捷尺度","Remove favorite"),()=>this.panelSave(panel,async()=>{await this.save({scaleFavorites:favorites.filter((_,index)=>index!==i)});paint();}));}
      });
      if(!favorites.length)list.createDiv({cls:"noria-card-secondary",text:this.text("添加常用尺度，或临时指定范围。","Save favorite scales or choose a temporary range.")});
    };paint();
    const edit=this.button(heading,"pencil",this.text("编辑常用尺度","Edit favorites"),()=>{editing=!editing;edit.setAttribute("aria-pressed",String(editing));edit.title=editing?this.text("完成编辑","Finish editing"):this.text("编辑常用尺度","Edit favorites");edit.setAttribute("aria-label",edit.title);setIcon(edit,editing?"check":"pencil");restore.hidden=!editing;paint();});edit.setAttribute("aria-pressed","false");
    const restore=panel.createEl("button",{cls:"noria-tl-scale-edit",text:this.text("补回默认项","Restore defaults")});restore.hidden=true;restore.onclick=()=>this.panelSave(panel,async()=>{await this.save({scaleFavorites:windows.favorites([...this.settings().scaleFavorites,...windows.defaults])});paint();});
    const details=panel.createEl("details",{cls:"noria-tl-scale-details"});details.createEl("summary",{text:this.text("自定义时长","Custom duration")});
    const custom=details.createDiv({cls:"noria-tl-scale-custom"}),amount=custom.createEl("input",{attr:{type:"number",min:"1",max:"999",value:"1","aria-label":this.text("数量","Amount")}}),unit=custom.createEl("select",{attr:{"aria-label":this.text("时间单位","Time unit")}});
    windows.units.forEach((u,i)=>unit.createEl("option",{value:u,text:this.text(["小时","天","周","月","年"][i],u)}));unit.value="day";
    unit.onchange=()=>{amount.max=String({month:120,year:10}[unit.value]||999);};
    const current=this.backend?.getWindow()?.scale;if(current){amount.value=String(current.amount);unit.value=current.unit;}
    const error=details.createDiv({cls:"noria-task-row-error",attr:{role:"status"}});
    const chosen=()=>{const s=windows.scale({amount:amount.value,unit:unit.value});if(!s){error.textContent=this.text("请输入有效的正整数。","Enter a valid positive whole number.");amount.focus();}return s;};
    const actions=details.createDiv({cls:"noria-tl-scale-actions"});const apply=actions.createEl("button",{text:this.text("应用","Apply")});apply.onclick=()=>{const s=chosen();if(s){this.setScale(s);this.closePanel?.(true);}};
    const save=actions.createEl("button",{text:this.text("存为常用","Save favorite")});save.onclick=()=>{const s=chosen();if(s)return this.panelSave(panel,async()=>{await this.save({scaleFavorites:windows.favorites([...this.settings().scaleFavorites,s])});paint();});};
  }
  filterPanel(anchor){const panel=this.panel(anchor,this.text("竖版内容","Vertical contents")),f=normalizeFilter(this.settings().verticalFilter);
    const apply=patch=>this.panelSave(panel,async()=>{const next=normalizeFilter({...f,...patch});await this.save({verticalFilter:next});Object.assign(f,next);this.updateFilterState();this.remember();this.resetReader();void this.renderStream();});
    const pending=panel.createEl('button',{text:this.text('查看未安排任务','View unscheduled tasks')});pending.onclick=()=>{this.closePanel?.(false);this.showUnscheduled=true;void this.renderStream();};
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
    const reset=panel.createEl("button",{text:this.text("清除筛选","Clear filters")});reset.onclick=async()=>{if(await apply(normalizeFilter({})))this.filterPanel(anchor);};
  }
  captureAnchor(){
    const host=this.stream;if(!host||host.hidden||!host.isConnected)return this.savedAnchor;
    const top=host.getBoundingClientRect().top;
    const rows=[...host.querySelectorAll('.noria-tl-stream-item[data-anchor]')];
    const row=rows.find(el=>el.getBoundingClientRect().bottom>top+36)||[...host.querySelectorAll('h3[data-anchor]')].find(el=>el.getBoundingClientRect().bottom>top+2);
    return row?{id:row.dataset.anchor,date:row.dataset.date,offset:row.getBoundingClientRect().top-top}:this.savedAnchor;
  }
  remember(){this.savedAnchor=this.captureAnchor();this.view._verticalTimelineState=this.savedAnchor;this.plugin.app.workspace.requestSaveLayout?.();return this.savedAnchor;}
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
    if(!anchor)return;const host=this.stream;
    const nodes=[...host.querySelectorAll('[data-anchor]')],row=nodes.find(el=>el.dataset.anchor===anchor.id)||nodes.find(el=>el.dataset.date===anchor.date);
    // Sticky headings report the pinned position; jump to their natural section.
    const target=anchor.id?.startsWith('day:')&&row?.tagName==='H3'?row.parentElement:row;
    if(target)host.scrollTop+=target.getBoundingClientRect().top-host.getBoundingClientRect().top-(Number(anchor.offset)||0);
  }
  resetReader(){++this.serial;this.reader?.dispose();this.reader=null;this.readerReady=null;}
  async ensureReader(){
    if(!this.reader){this.reader=new ContinuousTimeline(this.plugin,this.model,normalizeFilter(this.settings().verticalFilter));this.readerReady=this.reader.init(this.savedAnchor?.date||this.plugin.getLocalYmd());}
    const reader=this.reader;
    try{await this.readerReady;}catch(e){if(this.reader===reader){reader.dispose();this.reader=null;this.readerReady=null;}throw e;}return reader;
  }
  attach(backend,model,events,surface){
    if(this.vertical()){this.remember();this.rememberFocus();}this.resetReader();
    this.stream?.remove();this.child?.unload();
    this.backend=backend;this.model=model;this.events=events;this.surface=surface;
    this.stream=surface.parentElement.createDiv({cls:'noria-tl-stream',attr:{'aria-label':this.text('混排时间轴','Mixed timeline'),tabindex:'0'}});
    this.stream.addEventListener('scroll',()=>{
      if(this.painting||this.stream.hidden)return;
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
  windowChanged(){this.updateScaleLabel();}
  async jumpToDate(date){
    this.showUnscheduled=false;this.savedAnchor={id:'day:'+date,date,offset:8};this.view._verticalTimelineState=this.savedAnchor;
    this.resetReader();await this.renderStream();this.stream?.focus({preventScroll:true});
  }
  focusToday(){void this.jumpToDate(this.plugin.getLocalYmd());return true;}
  checkBoundary(){
    if(this.loading||this.painting||!this.reader||this.showUnscheduled||!this.vertical())return;
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
  dateLabel(date){const today=this.plugin.getLocalYmd(),locale=this.plugin.getNoriaLocale()==='zh'?'zh-CN':'en',d=new Date(date+'T12:00:00'),weekday=new Intl.DateTimeFormat(locale,{weekday:'short'}).format(d);return (date===today?this.text('今天','Today'):new Intl.DateTimeFormat(locale,{...(date.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{}),month:'short',day:'numeric'}).format(d))+' · '+weekday;}
  async renderStream(){
    if(!this.stream?.isConnected||!this.vertical())return;
    const serial=++this.serial,host=this.stream,anchor=this.savedAnchor||{id:'day:'+this.plugin.getLocalYmd(),date:this.plugin.getLocalYmd(),offset:8};
    try{
      host.setAttribute('aria-busy','true');const reader=await this.ensureReader();
      if(serial!==this.serial||!host.isConnected||!this.vertical())return;
      const stream=reader.snapshot();this.rememberFocus();this.painting=true;this.child?.unload();this.child=new Component();this.child.load();host.empty();
      const timer=globalThis.noriaTaskTimeline?.pomodoroBinding;
      if(timer&&this.plugin.isPomodoroModuleEnabled())this.child.register(timer.installPomodoroDockTicker(host,this.timerOptions()));
      const boundary=direction=>{if(direction<0?!stream.earlier:!stream.later)return;const b=host.createEl('button',{cls:'noria-tl-stream-load',text:direction<0?this.text('较早内容','Earlier entries'):this.text('较晚内容','Later entries'),attr:{type:'button','data-load-direction':String(direction)}});b.onclick=()=>void this.loadBoundary(direction);};
      if(this.showUnscheduled){
        const header=host.createDiv({cls:'noria-tl-unscheduled-heading'});header.createEl('strong',{text:this.text('未安排任务','Unscheduled tasks')});const back=header.createEl('button',{text:this.text('返回时间轴','Back to timeline')});back.onclick=()=>{this.showUnscheduled=false;void this.renderStream();};
        for(const item of stream.unscheduled)this.taskRow(host,item);
        if(!stream.unscheduled.length)host.createDiv({cls:'noria-card-empty',text:this.text('没有符合筛选的未安排任务。','No unscheduled tasks match these filters.')});
      }else{
        boundary(-1);
        const byDate=new Map();for(const item of stream.items){if(!byDate.has(item.date))byDate.set(item.date,[]);byDate.get(item.date).push(item);}
        if(stream.dates.includes(this.plugin.getLocalYmd())&&!byDate.has(this.plugin.getLocalYmd()))byDate.set(this.plugin.getLocalYmd(),[]);
        if(stream.dates.includes(reader.anchor)&&!byDate.has(reader.anchor))byDate.set(reader.anchor,[]);
        for(const date of [...byDate.keys()].sort()){
          const group=host.createEl('section',{cls:'noria-tl-stream-day'}),heading=group.createEl('h3',{attr:{'data-anchor':'day:'+date,'data-date':date}});
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
      this.restoreAnchor(anchor);this.restoreFocus();host.setAttribute('aria-busy','false');this.painting=false;
      // Retain position when late images change size, without defeating user scroll.
      for(const img of host.querySelectorAll('img'))if(!img.complete){const before=this.captureAnchor();img.addEventListener('load',()=>{if(this.savedAnchor?.id===before?.id)this.restoreAnchor(before);},{once:true});}
    }catch(e){if(e.name!=='AbortError'&&serial===this.serial&&host.isConnected){const error=host.createDiv({cls:'noria-task-row-error',text:e.message});const b=error.createEl('button',{text:this.text('重试','Retry')});b.onclick=()=>{error.remove();void this.renderStream();};host.setAttribute('aria-busy','false');}}
    finally{if(serial===this.serial)this.painting=false;}
  }
  async renderItem(group,item,serial){
        const row=group.createDiv({cls:"noria-tl-stream-item",attr:{"data-kind":item.kind,"data-event-id":item.id}});
        row.dataset.focusMs=String(+new Date(item.date+"T"+(item.time||"00:00")+":00"));
        const timeLabel=item.continuation?this.text("延续","Ongoing"):item.time;
        if(timeLabel)row.createEl("time",{text:timeLabel,attr:{title:item.continuation?this.text("开始于当前范围之前，计划时间见任务下方","Started before this range; planned time is shown below"):item.time||this.text("未记录具体时间","Time not recorded")}});
        const content=row.createDiv({cls:"noria-tl-stream-content"});
        if(item.kind==="task")this.taskRow(content,item);
        else if(item.markdown){await this.renderRecord(content,item,serial);}
        else{content.createSpan({cls:"noria-card-secondary",text:this.text(item.kind==="note-created"?"创建笔记 · ":"最后修改 · ",item.kind==="note-created"?"Created · ":"Last modified · ")});const b=content.createEl("button",{cls:"noria-activity-link",text:item.title});b.dataset.tlFocus='source:'+item.id;b.onclick=()=>this.plugin.app.workspace.openLinkText(item.path,"",false);}
    row.dataset.anchor='item:'+item.id;row.dataset.date=item.date;
  }
  async taskSaved(row,task){
    row.classList.toggle('is-completed',!!task.completed);this.remember();
    // The shared editor has finished writing, while vault/index events may still
    // be queued. Invalidate before rebuilding so the old snapshot cannot win.
    const service=await this.plugin.createDataService();service.invalidate('timeline-task-saved','tasks');
    this.plugin.invalidateTaskSnapshots('tasks');await this.view.refreshTimelineRuntimeFromChrome();
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
  taskRow(parent,item){const row=renderWorkbenchTaskRow(this.plugin,parent,item.task,{onSaved:(_,task)=>this.taskSaved(row,task)});row.classList.toggle("is-completed",!!item.task.completed);
    row.addEventListener('change',()=>this.rememberFocus(),true);
    const mode=this.settings().verticalMetadata||'folder',folder=String(item.task.path||'').replace(/\\/g,'/').split('/').slice(0,-1).join('/');
    const tags=[...new Set((Array.isArray(item.task.tags)?item.task.tags:String(item.task.text||'').match(/#[\p{L}\p{N}_/-]+/gu)||[]).map(String).filter(t=>!/^#?tl(?:\/|$)/.test(t)))];
    const parts=[];if(['folder','both'].includes(mode)&&folder)parts.push(folder.split('/').at(-1));if(['tags','both'].includes(mode)&&tags.length)parts.push(tags.map(t=>t.startsWith('#')?t:'#'+t).join(' '));
    if(parts.length){const details=row.querySelector('.noria-diary-task-body').createEl('button',{cls:'noria-tl-task-source',text:parts.join(' · '),attr:{type:'button',title:folder||item.task.path,'aria-label':this.text('打开来源：','Open source: ')+item.task.path}});details.onclick=()=>this.plugin.app.workspace.openLinkText(item.task.path,'',false);}
    const meta=item.payload?.noria;if(meta?.endYmd){const same=meta.startYmd===meta.endYmd;const detail=parent.createDiv({cls:"noria-tl-task-range",text:same&&meta.startTime&&meta.endTime?`${meta.startTime}–${meta.endTime}`:`${meta.startYmd} ${meta.startTime} → ${meta.endYmd} ${meta.endTime}`});detail.title=this.text("计划时间","Planned time");}
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
