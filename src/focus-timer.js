"use strict";
const engine=require('./runtime/views/task-timeline/pomodoro-state.js');
const {FocusRecords}=require('./focus-records.js');

// Settings hold the running clock. All views submit to this single owner.
class FocusTimer {
  constructor(plugin,{now=()=>new Date().toISOString(),interval=1000}={}){
    this.plugin=plugin;this.now=now;this.listeners=new Set();this.queue=Promise.resolve();this.disposed=false;
    this.records=plugin.processTextAtVaultPath?new FocusRecords(plugin,()=>this.emit()):null;
    this.ready=this.records?this.records.initialize(plugin.settings.pomodoro):Promise.resolve();
    if(interval)this.interval=setInterval(()=>void this.tick().catch(error=>console.warn('[noria] timer tick',error)),interval);
    if(plugin.app?.vault?.on)plugin.registerEvent(plugin.app.vault.on('rename',(file,oldPath)=>{
      void this.enqueue(async()=>{
        // Rename the stored references too, including entries temporarily
        // missing from Markdown. Projection intentionally omits those entries.
        const state=this.plugin.normalizePomodoroState(this.plugin.settings.pomodoro);
        for(const record of Object.values(state.tasks)){
          if(record.path===oldPath)record.path=file.path;
          else if(record.path?.startsWith(oldPath+'/'))record.path=file.path+record.path.slice(oldPath.length);
          for(const session of record.sessions||[])if(session.recordRef){
            if(session.recordRef.path===oldPath)session.recordRef.path=file.path;
            else if(session.recordRef.path.startsWith(oldPath+'/'))session.recordRef.path=file.path+session.recordRef.path.slice(oldPath.length);
          }
        }
        await this.records?.initialize(state);
        try{return await this.persist(state,{preserveReferences:false});}
        catch(error){await this.records?.initialize(this.plugin.settings.pomodoro);throw error;}
      }).catch(error=>console.warn('[noria] timer source rename',error));
    }));
  }
  read(){return this.plugin.getPomodoroState();}
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  emit(){for(const fn of this.listeners){try{fn(this.read());}catch(error){console.warn('[noria] timer view',error);}}}
  enqueue(action){const result=this.queue.then(()=>this.ready).then(()=>{if(this.disposed)throw Error('Timer unloaded');return action();});this.queue=result.catch(()=>{});return result;}
  async persist(next,{preserveReferences=true}={}){
    const previous=this.plugin.settings.pomodoro;
    const state=this.plugin.normalizePomodoroState(this.records&&preserveReferences?this.records.prepare(next,previous):next);
    state.revision=(Number(previous?.revision)||0)+1;
    this.plugin.settings.pomodoro=state;
    try{await this.plugin.saveSettings();}
    catch(error){if(this.plugin.settings.pomodoro?.revision===state.revision)this.plugin.settings.pomodoro=previous;throw error;}
    if(globalThis.__noriaRuntimeBridge?.getPomodoroState)globalThis.__noriaRuntimeBridge.pomodoro=this.read();
    if(this.records)await this.flushRecords();
    this.emit();this.plugin.app?.workspace?.trigger('noria:pomodoro-change');
    return {ok:true,pomodoro:this.read()};
  }
  save(next){return this.enqueue(()=>{
    if((Number(next?.revision)||0)!==(Number(this.read().revision)||0))throw Error(this.plugin.getNoriaLocale?.()==='zh'?'计时已在其他位置更新，请重试。':'The timer changed in another view. Please try again.');
    return this.persist(next);
  });}
  change(update){return this.enqueue(async()=>{
    const before=this.read(),signature=JSON.stringify(before),next=update(before,this.now());
    if(signature===JSON.stringify(next))return {ok:true,pomodoro:before};
    return this.persist(next);
  });}
  start(meta,{mode='pomodoro',minutes,guardRevision}={}){return this.change((state,now)=>{
    if(guardRevision!=null){
      if(state.active?.mode==='WORK'&&state.active.taskKey===engine.resolvePomodoroTaskKey(state,meta))return state;
      if((Number(state.revision)||0)!==guardRevision)throw Error(this.plugin.getNoriaLocale?.()==='zh'?'计时已在其他位置更新，请重新选择任务。':'The timer changed in another view. Select the task again.');
    }
    const current=engine.advancePomodoroState(state,now);
    current.preferredTimerMode=mode==='stopwatch'?'stopwatch':'pomodoro';
    if(minutes!=null)current.workLen=Math.max(1,Math.min(240,Math.round(minutes)));
    return engine.startPomodoroWorkState(current,{...(meta||{taskKey:'zp_free',path:'',lineHint:-1,textFingerprint:'free',title:''}),timerMode:mode},now);
  });}
  select(meta){return this.change(state=>{
    const next=engine.attachPomodoroState(state,meta);
    next.activeAttachTaskKey=engine.resolvePomodoroTaskKey(next,meta);
    return next;
  });}
  rebindTask(before,after){return this.enqueue(async()=>{
    // The editor supplies an exact before/after pair. Keep the internal key and
    // source-record references; no identifier is inserted into the task note.
    const state=this.plugin.normalizePomodoroState(this.plugin.settings.pomodoro);
    const key=engine.resolvePomodoroTaskKey(state,before),record=state.tasks[key];
    if(!record)return;
    Object.assign(record,{path:after.path,lineHint:after.lineHint,textFingerprint:after.textFingerprint,taskId:after.taskId||record.taskId,titleSnapshot:after.title});
    return this.persist(state);
  });}
  pause(){return this.change((state,now)=>engine.pausePomodoroState(engine.advancePomodoroState(state,now),now));}
  resume(){return this.change((state,now)=>engine.resumePomodoroState(state,now));}
  stop(){return this.change((state,now)=>engine.stopPomodoroState(engine.advancePomodoroState(state,now),now));}
  async tick(){if(this.disposed)return;if(this.read().active?.status==='running')await this.change((state,now)=>engine.advancePomodoroState(state,now));if(!this.disposed)this.emit();}
  async flushRecords(){
    try{
      const {state,changed}=await this.records.flush(this.plugin.settings.pomodoro);
      if(changed){const pending=this.plugin.settings.pomodoro;this.plugin.settings.pomodoro=this.plugin.normalizePomodoroState(state);
        try{await this.plugin.saveSettings();}catch(error){this.plugin.settings.pomodoro=pending;throw error;}}
      this.recordError='';
    }catch(error){this.recordError=error.message||String(error);}
  }
  retryRecords(){return this.enqueue(async()=>{await this.flushRecords();this.emit();});}
  dispose(){this.disposed=true;clearInterval(this.interval);this.listeners.clear();this.records?.dispose();}
}
module.exports={FocusTimer};
