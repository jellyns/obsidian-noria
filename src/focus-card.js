"use strict";
const {SuggestModal,Menu,Notice,setIcon}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const engine=require('./runtime/views/task-timeline/pomodoro-state.js');
const {hasFocusTaskDrag,takeFocusTaskDrag,resolveFocusTask}=require('./focus-task-drag.js');
const free={taskKey:'zp_free',path:'',lineHint:-1,textFingerprint:'free',title:''};
const text=plugin=>(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en;

class FocusTaskPicker extends SuggestModal {
  constructor(plugin,items,choose){super(plugin.app);this.items=items;this.choose=choose;this.t=text(plugin);this.setPlaceholder(this.t('搜索要专注的任务','Find a task to focus on'));}
  getSuggestions(query){const q=query.trim().toLocaleLowerCase();return [free,...this.items].filter(item=>!q||`${item.title} ${item.path}`.toLocaleLowerCase().includes(q)).slice(0,60);}
  renderSuggestion(item,el){el.createDiv({text:item.title||this.t('自由专注','Free focus')});if(item.path)el.createDiv({cls:'suggestion-note',text:item.path.replace(/\.md$/,'')});}
  onChooseSuggestion(item){void this.choose(item).catch(error=>new Notice(error.message));}
}
async function chooseFocusTask(plugin,choose){
  const service=await plugin.createDataService({});
  const result=await service.getTasks({status:'open',rangePolicy:'allFacts',source:{scopeId:'tasks'}});
  const items=(result.items||[]).map(task=>{
    const row=plugin.adaptDataTaskToRuntimeTask(task);
    return engine.taskPomodoroMeta({title:row.text,noria:{path:row.path,line:row.line,task:row}});
  }).filter(Boolean);
  new FocusTaskPicker(plugin,items,choose).open();
}
function todayFocusMs(state,now,timeZone){
  const {focusSegments,dayModel,displayDay}=require('./time-ring-model.js');
  return dayModel(focusSegments(state,now).rows,displayDay(now,timeZone),timeZone).totalMs;
}
function openTaskFocusMenu(plugin,meta,anchor){
  const t=text(plugin),timer=plugin.focusTimer,menu=new Menu();
  const state=timer.read(),key=engine.resolvePomodoroTaskKey(state,meta),active=state.active;
  const run=action=>void action().catch(error=>new Notice(error.message));
  if(active?.taskKey===key){
    menu.addItem(item=>item.setTitle(active.status==='running'?t('暂停','Pause'):t('继续','Resume')).setIcon(active.status==='running'?'pause':'play').onClick(()=>run(()=>active.status==='running'?timer.pause():timer.resume())));
    menu.addItem(item=>item.setTitle(t('结束并保留记录','Finish and keep the record')).setIcon('square').onClick(()=>run(()=>timer.stop())));
  }else{
    menu.addItem(item=>item.setTitle(`${t('番茄专注','Pomodoro')} · ${state.workLen} ${t('分钟','min')}`).setIcon('timer').onClick(()=>run(()=>timer.start(meta))));
    menu.addItem(item=>item.setTitle(t('自由计时','Free timer')).setIcon('play').onClick(()=>run(()=>timer.start(meta,{mode:'stopwatch'}))));
  }
  const rect=anchor.getBoundingClientRect();menu.showAtPosition({x:rect.left,y:rect.bottom});
}
function registerFocusCard(system){
  const plugin=system.plugin,t=text(plugin);
  system.register({id:'noria:focus',title:t('专注','Focus'),icon:'timer',description:t('番茄或自由计时，与任务和时间轴共用记录。','Pomodoro or free timer, shared with tasks and the timeline.'),fields:[],
    render:async({container,component,context,selection})=>{
      const timer=plugin.focusTimer;if(!timer)return;
      container.addClass('noria-focus-card');let mode=timer.read().preferredTimerMode==='stopwatch'?'stopwatch':'pomodoro',minutes=timer.read().workLen,busy=false,pending=null;
      const body=container.createDiv({cls:'noria-focus-body'});
      const footer=container.createDiv({cls:'noria-focus-footer'});
      const head=footer.createDiv({cls:'noria-focus-head'});
      const choose=head.createEl('button',{cls:'noria-focus-task',attr:{type:'button'}}),name=choose.createSpan();setIcon(choose.createSpan({cls:'noria-focus-chevron'}),'chevron-down');
      const modes=head.createEl('button',{cls:'noria-focus-mode',attr:{type:'button','aria-haspopup':'menu'}});
      const modeLabel=modes.createSpan();setIcon(modes.createSpan({cls:'noria-focus-chevron'}),'chevron-down');
      const tools=context?.preview?null:container.closest('.noria-diary-card,.dashboard-home-widget-shell')?.querySelector('.noria-diary-card-tools,.dashboard-guide-card__tools');
      const views=(tools||head).createDiv({cls:'noria-focus-views',attr:{role:'group','aria-label':t('专注视图','Focus view')}});
      if(tools){tools.classList.add('noria-focus-tools');tools.insertBefore(views,tools.querySelector('.noria-diary-card-menu,.dashboard-home-widget-shell-actions'));}
      component.register(()=>{views.remove();total.remove();tools?.classList.remove('noria-focus-tools');});
      let review=false;
      const viewButtons=[['timer',t('计时','Timer')],['review',t('回看','Review')]].map(([value,label])=>{const b=views.createEl('button',{text:label,attr:{type:'button'}});b.onclick=()=>{review=value==='review';paint();};return {b,value};});
      const reviewTools=footer.createDiv({cls:'noria-focus-review-tools'});reviewTools.hidden=true;
      modes.onclick=()=>{const menu=new Menu();for(const [value,label] of [['pomodoro',t('番茄','Pomodoro')],['stopwatch',t('自由','Free')]])menu.addItem(item=>item.setTitle(label).setChecked(mode===value).onClick(()=>{mode=value;paint();}));const r=modes.getBoundingClientRect();menu.showAtPosition({x:r.left,y:r.bottom});};
      const source=iconButton(head,'file-text',t('打开任务来源','Open task source'),()=>{const meta=selected(timer.read());if(meta.path)void plugin.openReviewSourceFile(meta.path,{line:meta.lineHint+1,newLeaf:true});});source.addClass('noria-focus-source');
      const total=(tools||head).createSpan({cls:'noria-focus-total'});if(tools)tools.insertBefore(total,views);
      const plot=body.createDiv({cls:'noria-focus-plot'});
      const center=plot.createDiv({cls:'noria-focus-center'}),dial=center.createDiv({cls:'noria-focus-dial'});
      const svg=container.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 200 200');svg.setAttribute('aria-hidden','true');dial.append(svg);
      const draw=(tag,attrs)=>{const el=container.ownerDocument.createElementNS(svg.namespaceURI,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));svg.append(el);return el;};
      draw('circle',{cx:100,cy:100,r:85,class:'noria-focus-orbit'});
      const arc=draw('circle',{cx:100,cy:100,r:85,pathLength:100,class:'noria-focus-arc',transform:'rotate(-90 100 100)'});
      for(let i=0;i<60;i++){const a=i*Math.PI/30;draw('line',{x1:100+Math.sin(a)*(i%5?73:70),y1:100-Math.cos(a)*(i%5?73:70),x2:100+Math.sin(a)*76,y2:100-Math.cos(a)*76,class:'noria-focus-tick'});}
      const readout=dial.createDiv({cls:'noria-focus-readout'}),clock=readout.createEl('button',{cls:'noria-focus-clock',attr:{type:'button','aria-label':t('调整专注时长','Change focus duration')}});
      const status=readout.createDiv({cls:'noria-focus-status',attr:{role:'status'}});status.append(modes);
      const reviewHost=plot.createDiv({cls:'noria-focus-review noria-property-stat'});reviewHost.hidden=true;
      const actions=footer.createDiv({cls:'noria-focus-actions noria-focus-controls'});
      const primary=actions.createEl('button',{cls:'noria-focus-primary mod-cta',attr:{type:'button'}}),symbol=primary.createSpan();
      const stop=iconButton(actions,'square',t('结束并保留记录','Finish and keep the record'),()=>run(()=>timer.stop()));
      const error=container.createDiv({cls:'noria-card-error',attr:{role:'alert'}});error.hidden=true;
      const dropHint=container.createDiv({cls:'noria-focus-drop-hint',text:t('松开开始专注','Drop to focus'),attr:{'aria-hidden':'true'}});
      const switchPanel=container.createDiv({cls:'noria-focus-switch',attr:{role:'group','aria-label':t('切换专注任务','Switch focus task')}});switchPanel.hidden=true;
      const switchTitle=switchPanel.createDiv({cls:'noria-focus-switch-title'});
      switchPanel.createDiv({cls:'noria-focus-switch-note',text:t('当前专注会结束，已用时间保留。','Your current focus will end and its time will be kept.')});
      const switchActions=switchPanel.createDiv({cls:'noria-focus-actions'});
      const cancel=switchActions.createEl('button',{text:t('取消','Cancel'),attr:{type:'button'}});
      const confirm=switchActions.createEl('button',{cls:'mod-cta',text:t('结束当前并开始','Finish and start'),attr:{type:'button'}});
      const recordNotice=container.createDiv({cls:'noria-focus-record-notice',attr:{role:'status'}}),recordMessage=recordNotice.createSpan();
      const recordRetry=recordNotice.createEl('button',{attr:{type:'button'}});recordNotice.hidden=true;
      recordRetry.onclick=()=>run(async()=>{const issue=timer.records?.errors()[0];if(issue)await plugin.app.workspace.openLinkText(issue.path,'',true);else await timer.retryRecords();});
      const selected=state=>{const key=state.active?.taskKey||state.activeAttachTaskKey;return key&&state.tasks[key]?{...state.tasks[key],title:state.tasks[key].titleSnapshot,taskKey:key}:free;};
      const run=async action=>{if(busy||context?.preview)return;busy=true;error.hidden=true;paint();try{await action();}catch(e){error.hidden=false;error.setText(e.message);}finally{busy=false;paint();if(pending)cancel.focus();}};
      const requestStart=async(meta,source=null,guardRevision=Number(timer.read().revision)||0)=>{
        const state=timer.read(),key=engine.resolvePomodoroTaskKey(state,meta);
        if(state.active?.mode==='WORK'&&state.active.taskKey===key)return;
        if(state.active){pending={meta,source,guardRevision};paint();cancel.focus();}
        else await timer.start(meta,{mode,minutes,guardRevision});
      };
      const dismiss=()=>{pending=null;paint();choose.focus({preventScroll:true});};
      cancel.onclick=dismiss;
      confirm.onclick=()=>run(async()=>{
        const request=pending;if(!request)return;
        const meta=request.source?await resolveFocusTask(plugin,request.source):request.meta;
        await timer.start(meta,{mode,minutes,guardRevision:request.guardRevision});pending=null;
      });
      choose.onclick=()=>run(()=>chooseFocusTask(plugin,meta=>run(async()=>{if(timer.read().active)await requestStart(meta);else await timer.select(meta);})));
      source.onclick=()=>{const meta=selected(timer.read());if(meta.path)void plugin.openReviewSourceFile(meta.path,{line:meta.lineHint+1,newLeaf:true});};
      primary.onclick=()=>run(()=>{const state=timer.read();return state.active?(state.active.status==='running'?timer.pause():timer.resume()):timer.start(selected(state),{mode,minutes});});
      clock.onclick=()=>{if(timer.read().active||mode==='stopwatch'||context?.preview)return;const menu=new Menu();for(const value of [15,25,45,50,60])menu.addItem(item=>item.setTitle(`${value} ${t('分钟','min')}`).setChecked(minutes===value).onClick(()=>{minutes=value;paint();}));const r=clock.getBoundingClientRect();menu.showAtPosition({x:r.left,y:r.bottom});};
      const clearDrop=()=>container.removeClass('is-drop-target');
      component.registerDomEvent(container,'dragover',event=>{
        if(busy||context?.preview||!hasFocusTaskDrag(plugin,event.dataTransfer))return;
        event.preventDefault();event.dataTransfer.dropEffect='copy';container.addClass('is-drop-target');
        dropHint.setText(timer.read().active?t('松开以切换任务','Drop to switch task'):t('松开开始专注','Drop to focus'));
      });
      component.registerDomEvent(container,'dragleave',event=>{if(!container.contains(event.relatedTarget))clearDrop();});
      component.registerDomEvent(container,'drop',event=>{
        clearDrop();if(busy||context?.preview)return;
        const source=takeFocusTaskDrag(plugin,event.dataTransfer);if(!source)return;
        event.preventDefault();event.stopPropagation();const guardRevision=Number(timer.read().revision)||0;
        void run(async()=>requestStart(await resolveFocusTask(plugin,source),source,guardRevision));
      });
      component.registerDomEvent(container.ownerDocument,'dragend',clearDrop);
      component.registerDomEvent(container.ownerDocument,'keydown',event=>{if(event.key==='Escape'){clearDrop();if(pending&&!busy){event.preventDefault();dismiss();}}});
      function paint(){
        const state=timer.read(),active=state.active,meta=selected(state),now=timer.now();
        for(const {b,value}of viewButtons){b.setAttribute('aria-pressed',String(review===(value==='review')));b.disabled=!!pending;}
        center.hidden=review;reviewHost.hidden=!review;head.hidden=review;reviewTools.hidden=!review;container.classList.toggle('is-review',review);
        if(active)mode=active.timerMode==='stopwatch'?'stopwatch':'pomodoro';
        const elapsed=engine.activeElapsedMs(active,now),remaining=active?Math.max(0,active.durationMin*60000-elapsed):minutes*60000;
        name.setText(meta.title||t('自由专注','Free focus'));choose.title=name.textContent;
        source.hidden=!meta.path;source.title=meta.path?`${t('打开','Open')} · ${meta.path.split('/').at(-1).replace(/\.md$/,'')}`:'';
        modeLabel.setText(mode==='stopwatch'?t('自由','Free'):t('番茄','Pomodoro'));modes.title=t('计时方式','Timer mode');modes.setAttribute('aria-label',`${t('计时方式','Timer mode')} · ${modeLabel.textContent}`);modes.disabled=!!active||busy||!!pending||!!context?.preview;
        clock.setText(engine.formatCountdown(mode==='stopwatch'?elapsed:remaining));clock.disabled=!!active||mode==='stopwatch'||!!context?.preview;
        const message=active?(active.mode==='BREAK'?t('休息','Break'):active.status==='paused'?t('已暂停','Paused'):t('专注中','Focusing')):t('待开始','Ready');
        modeLabel.setText(`${mode==='stopwatch'?t('自由','Free'):t('番茄','Pomodoro')} · ${message}`);
        const fraction=active&&mode!=='stopwatch'?Math.min(1,elapsed/(active.durationMin*60000)):0;
        arc.setAttribute('stroke-dasharray',`${fraction*100} 100`);arc.style.opacity=fraction>0?(active?.status==='paused'?'.45':'1'):'0';
        container.classList.toggle('is-stopwatch',mode==='stopwatch');
        const timeZone=require('./task-calendar-zone.js').timelineClock(plugin.settings.tasksCalendar).display;
        const sum=todayFocusMs(state,now,timeZone);total.setText(sum>0?`${t('今日','Today')} · ${sum<60000?`${Math.floor(sum/1000)} ${t('秒','sec')}`:`${Math.floor(sum/60000)} ${t('分钟','min')}`}`:'');
        if(review&&active)total.setText(`${message} · ${engine.formatCountdown(mode==='stopwatch'?elapsed:remaining)}`);
        total.hidden=!total.textContent;
        setIcon(symbol,active?.status==='running'?'pause':'play');const actionLabel=active?(active.status==='running'?t('暂停','Pause'):t('继续','Resume')):t('开始','Start');primary.title=actionLabel;primary.setAttribute('aria-label',actionLabel);
        primary.disabled=busy||!!context?.preview;choose.disabled=busy||!!context?.preview;stop.hidden=!active;stop.disabled=busy||!!context?.preview;
        container.classList.toggle('is-running',active?.status==='running');
        container.classList.toggle('is-paused',active?.status==='paused');
        switchPanel.hidden=!pending;switchTitle.setText(pending?`${t('开始','Start')} · ${pending.meta.title||t('自由专注','Free focus')}`:'');
        confirm.disabled=busy;cancel.disabled=busy;
        body.inert=!!pending;footer.inert=!!pending;
        const recordIssue=timer.records?.errors()[0];recordNotice.hidden=!timer.recordError&&!recordIssue;
        recordMessage.setText(recordIssue?t('专注记录格式需要检查','Check the focus record format'):t('计时已保存，笔记待写入','Timer saved; note write pending'));
        recordRetry.setText(recordIssue?t('查看记录','Open record'):t('重试','Retry'));recordRetry.disabled=busy||!!context?.preview;
      }
      component.register(timer.subscribe(paint));paint();
      await system.providers.get('noria:statistics').render({container:reviewHost,component,selection,config:{source:'focus',display:'time-ring',calculate:'sum',scope:selection?.mode?'follow':'all',initialDay:'today',showSchedule:true},context:{...context,ringTools:reviewTools}});
    }});
}
module.exports={registerFocusCard,chooseFocusTask,todayFocusMs,openTaskFocusMenu};
