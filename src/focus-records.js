"use strict";
const {dayOf,anchor,focusLine,readFocusDocument,appendFocusRecord}=require('./focus-document.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const refKey=ref=>ref?.path+'#'+ref?.id;
const hash=value=>{let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
function documentDay(file,cache){
  const named=file.path.match(/(?:^|\/)(\d{4}-\d{2}-\d{2})(?:[^\d]|$)/)?.[1];if(named)return named;
  const stamp=Object.keys(cache?.blocks||{}).map(id=>/^focus-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/.exec(id)).find(Boolean);
  return stamp?dayOf(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}.${stamp[7]}Z`):'';
}

// Finished records live in diary Markdown. Settings retain a reference and a
// rebuildable cache, while an unfinished clock stays recoverable in settings.
class FocusRecords {
  constructor(plugin,changed){this.plugin=plugin;this.changed=changed;this.documents=new Map();this.generations=new Map();this.disposed=false;
    if(plugin.app?.vault?.on){
      for(const event of ['modify','create','delete'])plugin.registerEvent(plugin.app.vault.on(event,file=>{
        if(this.documents.has(file.path))void this.load(file.path,this.documents.get(file.path).day).then(()=>changed()).catch(error=>console.warn('[noria] focus record refresh',error));
      }));
    }
    const cache=plugin.app?.metadataCache;
    if(cache?.on){
      plugin.registerEvent(cache.on('changed',file=>{void this.discoverFile(file).then(found=>{if(found)changed();}).catch(error=>console.warn('[noria] focus discovery',error));}));
      plugin.registerEvent(cache.on('resolved',()=>{void this.discover().then(()=>changed()).catch(error=>console.warn('[noria] focus discovery',error));}));
    }
  }
  async initialize(state){const refs=new Map();for(const record of Object.values(state.tasks||{}))for(const session of record.sessions||[])if(session.recordRef)refs.set(session.recordRef.path,session.recordRef.day);
    await Promise.all([...refs].map(([path,day])=>this.load(path,day)));
    for(const path of this.documents.keys())if(!refs.has(path)){this.documents.delete(path);this.generations.set(path,(this.generations.get(path)||0)+1);}
    await this.discover();
  }
  async discoverFile(file){
    if(this.disposed||file?.extension!=='md')return false;
    const cache=this.plugin.app.metadataCache?.getFileCache(file);
    if(!Object.keys(cache?.blocks||{}).some(id=>id.startsWith('focus-')))return false;
    const day=this.documents.get(file.path)?.day||documentDay(file,cache);if(!day)return false;
    if(file.stat?.mtime&&this.documents.get(file.path)?.mtime===file.stat.mtime)return false;
    await this.load(file.path,day);return true;
  }
  async discover(){
    // Use Obsidian's block index; ordinary notes without focus anchors are not read.
    for(const file of this.plugin.app.vault.getMarkdownFiles?.()||[])await this.discoverFile(file);
  }
  async load(path,day){
    const generation=(this.generations.get(path)||0)+1;this.generations.set(path,generation);
    const file=this.plugin.app.vault.getAbstractFileByPath(path);
    let result;
    try{const raw=file?await this.plugin.app.vault.read(file):'';result={day,mtime:file?.stat?.mtime,...readFocusDocument(raw,day)};}
    catch(error){result={day,records:new Map(),errors:new Map([['',error.message||String(error)]])};}
    if(!this.disposed&&this.generations.get(path)===generation)this.documents.set(path,result);
    return result;
  }
  project(raw){
    const state=clone(raw);
    const referenced=new Set();
    const pending=new Set(Object.values(state.tasks||{}).flatMap(record=>(record.sessions||[]).filter(session=>session.recording).map(anchor)));
    for(const record of Object.values(state.tasks||{})){
      const sessions=[];
      for(const session of record.sessions||[]){
        const ref=session.recordRef,document=ref&&this.documents.get(ref.path);
        if(ref)referenced.add(refKey(ref));
        if(!ref||!document){sessions.push(session);continue;}
        if(session.mode==='WORK'&&session.completed)record.actual=Math.max(0,record.actual-1);
        const parsed=document.records.get(ref.id);if(!parsed)continue;
        if(parsed.mode==='WORK'&&parsed.completed)record.actual++;
        sessions.push({...session,...parsed,recordRef:ref});
      }
      record.sessions=sessions;
    }
    for(const [path,document]of this.documents)for(const [id,parsed]of document.records){
      const ref={path,id,day:document.day};if(referenced.has(refKey(ref))||pending.has(id))continue;
      const key='zp_md_'+hash(refKey(ref));
      state.tasks[key]={path:parsed.sourcePath||path,lineHint:-1,titleSnapshot:parsed.title,textFingerprint:'',actual:parsed.mode==='WORK'&&parsed.completed?1:0,expected:0,sessions:[{...parsed,recordRef:ref}]};
    }
    return state;
  }
  prepare(next,previous){
    const state=clone(next);
    // Keep references when a source entry is deleted or malformed. Their cached
    // values are excluded by project(), and a native undo can restore the entry.
    for(const [key,old] of Object.entries(previous.tasks||{})){
      const refs=(old.sessions||[]).filter(s=>s.recordRef);if(!refs.length)continue;
      const record=state.tasks[key]||(state.tasks[key]={...old,actual:0,sessions:[]});
      for(const session of refs)if(!record.sessions.some(s=>s.recordRef&&refKey(s.recordRef)===refKey(session.recordRef))){
        record.sessions.push(clone(session));if(session.mode==='WORK'&&session.completed)record.actual++;
      }
      // The engine's unfinished session stays last, even after a historical
      // source entry was edited to a later date and then deleted.
      record.sessions.sort((a,b)=>Number(!a.end)-Number(!b.end)||Date.parse(a.start)-Date.parse(b.start));
    }
    return state;
  }
  async flush(raw){
    const state=clone(raw);let changed=false;
    for(const record of Object.values(state.tasks||{}))for(const session of record.sessions||[]){
      if(!session.recording||!session.end)continue;
      if(!session.segments?.length||!focusLine(record,session,dayOf(session.start))){delete session.recording;changed=true;continue;}
      const day=dayOf(session.start),spec=await this.plugin.resolveCalendarNoteSpecAsync('daily',day);
      await this.plugin.createCalendarNoteIfMissing(spec);
      await this.plugin.processTextAtVaultPath(spec.path,current=>appendFocusRecord(current,{record,session,day,heading:state.recordHeading||'专注'}));
      session.recordRef={path:spec.path,id:anchor(session),day};delete session.recording;changed=true;
      await this.load(spec.path,day);
    }
    return {state,changed};
  }
  errors(){return [...this.documents.entries()].flatMap(([path,doc])=>[...doc.errors].map(([id,error])=>({path,id,error})));}
  dispose(){this.disposed=true;this.documents.clear();}
}
module.exports={FocusRecords};
