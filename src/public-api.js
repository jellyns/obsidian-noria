"use strict";
const {createHash}=require('crypto');
const {scanAtxHeadings}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
const {dayNumber}=require('./countdown-document.js');
const {saveTaskEditor}=require('./task-editor-writeback.js');
const {locateTask}=require('./task-document.js');

const fail=(code,message)=>Object.assign(new Error(message),{code});
const taskKeys=['start','due','scheduled','status'];
function section(raw,title='建议'){
  const headings=scanAtxHeadings(raw),matches=headings.filter(h=>h.level===2&&h.title.toLowerCase()===title.toLowerCase());
  if(matches.length>1)throw fail('conflict','More than one Suggestions section');
  const heading=matches[0];
  return heading?{exists:true,line:heading.line,start:heading.start,contentStart:heading.end,end:headings.find(h=>h.start>heading.start&&h.level<=2)?.start??raw.length}:{exists:false,start:raw.length,contentStart:raw.length,end:raw.length};
}
const clean=value=>value.replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'');
function suggestionState(raw,path,date){
  const part=section(raw),markdown=part.exists?clean(raw.slice(part.contentStart,part.end)):'';
  const revision='suggestions-v1-'+createHash('sha256').update(JSON.stringify([path,date,part.exists,raw.slice(part.start,part.end)])).digest('hex');
  return {path,date,exists:part.exists,markdown,revision};
}
function bodyText(markdown){
  if(typeof markdown!=='string')throw fail('invalid-input','markdown must be a string');
  const body=clean(markdown);
  // A generated section must not escape into another section, an open fence or comment.
  const sample='## 建议\n'+body+'\n\n## noria-api-boundary\n',headings=scanAtxHeadings(sample);
  if(headings.filter(h=>h.level<=2).length!==2||headings.at(-1)?.title!=='noria-api-boundary'||/%%\s*noria:review:(?:start|end)\b/.test(body))throw fail('invalid-input','Use section body with headings at level 3 or deeper and closed code/comment blocks');
  return body;
}
function createPublicApi(plugin){
  const active=()=>{if(plugin._noriaPluginDisposed)throw fail('unsupported','Noria is unloaded; reconnect to the current plugin instance');};
  const run=async fn=>{active();try{return await fn();}catch(error){
    if(['invalid-input','not-found','conflict','unsupported','io-error'].includes(error.code))throw error;
    const reason=error.message;
    const code=['task-changed','task-not-found','ambiguous-task'].includes(reason)?'conflict':
      ['invalid-date','end-before-start','unsupported-task-status','missing-task-identity'].includes(reason)?'invalid-input':'io-error';
    throw fail(code,reason||'Operation failed');
  }};
  const dateOf=request=>{if(typeof request?.date!=='string'||!Number.isFinite(dayNumber(request.date)))throw fail('invalid-input','Specify date as YYYY-MM-DD');return request.date;};
  const notePath=async request=>{const date=dateOf(request),spec=await plugin.resolveCalendarNoteSpecAsync('daily',date);return {date,spec,path:spec.path};};
  const refOf=item=>item.source?.rawLine?{path:item.identity.sourcePath,line:item.source.line,rawText:item.source.rawLine}:null;
  const api={
    version:1,
    capabilities(){active();return {version:1,operations:[
      {name:'tasks.list',effect:'read',input:'Existing Data API getTasks request',output:'Existing task result with items[].ref; null ref means not writable'},
      {name:'tasks.update',effect:'write',input:{required:['ref','patch'],ref:{path:'vault-relative Markdown path',line:'zero-based hint',rawText:'exact original task line'},patch:{start:'YYYY-MM-DD[ HH:mm] or empty',due:'YYYY-MM-DD[ HH:mm] or empty',scheduled:'YYYY-MM-DD[ HH:mm] or empty',status:'todo | in_progress | done | cancelled'}},output:'{ok, changed, ref}'},
      {name:'records.fields',effect:'read',input:{},output:'{items}: configured field IDs, property names, types, choices, units and presentation; disabled fields remain readable'},
      {name:'records.read',effect:'read',input:{required:['date'],date:'YYYY-MM-DD'},output:'{date, path, exists, items:[{fieldId, value, revision}]}; daily values, no note creation'},
      {name:'records.update',effect:'write',input:{required:['date','fieldId','revision','value'],value:'number | string | boolean | null; must match the field type'},output:'{ok, changed, date, path, fieldId, value, revision}; replaces one actual daily value through the UI write path, including bound habits; no invented entries or Agent execution'},
      {name:'suggestions.read',effect:'read',input:{required:['date'],date:'YYYY-MM-DD'},output:'{path, date, exists, markdown, revision}'},
      {name:'suggestions.update',effect:'write',input:{required:['date','revision','markdown'],date:'YYYY-MM-DD',revision:'from suggestions.read',markdown:'body of the level-2 建议 section'},output:'{ok, changed, path, date, exists, markdown, revision}'},
      {name:'suggestionReplies.read',effect:'read',input:{required:['date']},output:'Readable saved replies for this exact suggestion source; does not create a note'},
      {name:'suggestionReplies.submit',effect:'write',input:{required:['date','sourcePath','sourceRevision','requestId','markdown']},output:'Saved reply only; no Agent delivery or execution is implied'},
      {name:'suggestionReplies.list',effect:'read',input:{required:['start','end'],optional:['limit','status']},output:'Saved or uncertain replies in a bounded date range; no drafts'},
      {name:'suggestionReplies.claim',effect:'write',input:{required:['conversationId','replyId','replyRevision','sourceRevision','requestId','agent']},output:'Five-minute claim; renew with the same requestId while active. An expired claim needs outcome review and acknowledgeUncertain:true'},
      {name:'suggestionReplies.respond',effect:'write',input:{required:['conversationId','replyId','replyRevision','sourceRevision','claimId','requestId','markdown']},output:'Idempotent response to one claimed reply; not proof of business-operation success'}
    ].concat(['list','read','publish','submit','claim','respond'].map(name=>({name:'interactions.'+name,effect:['list','read'].includes(name)?'read':'write',input:'See docs/AGENT-API.md and noria_interactions_'+name+' MCP schema',output:'Stable interaction ID; definitions and submissions stored in Noria/Conversations Markdown. No implicit Agent invocation.'}))),errors:['invalid-input','not-found','conflict','unsupported','io-error'],requires:'Obsidian running with Noria loaded'};},
    tasks:Object.freeze({
      list(request={}){return run(async()=>{const service=await plugin.createDataService(),result=await service.getTasks(request);return {...result,items:result.items.map(item=>({...item,ref:refOf(item)}))};});},
      update(request){return run(async()=>{
        const {ref,patch}=request||{};
        if(!ref||typeof ref.path!=='string'||!ref.path.endsWith('.md')||ref.path!==plugin.normalizePath(ref.path)||ref.path.startsWith('/')||ref.path.split('/').includes('..')||typeof ref.rawText!=='string'||!/^\s*[-*+]\s+\[[^\]]\]/.test(ref.rawText))throw fail('invalid-input','Use a task ref returned by tasks.list');
        if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!taskKeys.includes(k))||Object.values(patch).some(v=>typeof v!=='string'))throw fail('invalid-input','Supply supported task date or status fields');
        const exists=()=>{if(!plugin.app.vault.getAbstractFileByPath(ref.path))throw fail('not-found','Task source no longer exists');};
        const exact=text=>{const row=locateTask(text,ref);if(row.text!==ref.rawText)throw fail('conflict','Task source changed; read it again');};
        exists();
        const result=await saveTaskEditor({identity:ref,patch,today:plugin.getLocalYmd(),read:async path=>{const text=await plugin.loadTextFromVault(path);exact(text);return text;},process:(path,transform)=>plugin.processTextAtVaultPath(path,text=>{active();exists();return transform(text);})});
        if(result.changed)plugin.requestNoriaRefresh('tasks','api:task-update');
        return {ok:true,changed:result.changed,ref:{path:result.path,line:result.line,rawText:result.rawText}};
      });}
    }),
    records:Object.freeze({
      fields(){return run(async()=>({items:JSON.parse(JSON.stringify(plugin.records.definitions()))}));},
      read(request){return run(async()=>{
        const {date,path}=await notePath(request),raw=await plugin.loadTextFromVault(path);
        return {date,path,exists:!!plugin.app.vault.getAbstractFileByPath(path),items:plugin.records.definitions().map(field=>plugin.records.snapshot(date,path,raw,field))};
      });},
      update(request){return run(async()=>{
        const date=dateOf(request);
        if(date>plugin.getLocalYmd())throw fail('invalid-input','Actual records cannot be entered for a future date');
        if(typeof request.fieldId!=='string'||typeof request.revision!=='string'||!request.revision||!Object.hasOwn(request,'value')||request.value===undefined)throw fail('invalid-input','Supply a fieldId, revision and value from records.read; use null to clear');
        const field=plugin.records.definitions().find(field=>field.id===request.fieldId);
        if(!field)throw fail('not-found','Record field no longer exists; read records.fields again');
        try{require('./record-properties.js').validateValue(field,request.value);}catch(error){throw fail('invalid-input',error.message);}
        const current=await api.records.read({date}),item=current.items.find(row=>row.fieldId===field.id);
        if(!item||item.revision!==request.revision)throw fail('conflict','Record or field definition changed; read it again');
        if(JSON.stringify(item.value)===JSON.stringify(request.value))return {ok:true,changed:false,date,path:current.path,...item};
        const result=await plugin.records.save(date,field,request.value,{expected:{revision:request.revision}});
        return {ok:true,changed:result.write.text!==result.write.previousText,date,path:result.path,...plugin.records.snapshot(date,result.path,result.write.text,field)};
      });}
    }),
    suggestions:Object.freeze({
      read(request){return run(async()=>{const {date,path}=await notePath(request);return suggestionState(await plugin.loadTextFromVault(path),path,date);});},
      update(request){return run(async()=>{
        if(typeof request?.revision!=='string'||!request.revision)throw fail('invalid-input','Read the suggestions revision before updating');
        const markdown=bodyText(request.markdown),{date,path,spec}=await notePath(request);
        const seed=plugin.app.vault.getAbstractFileByPath(path)?'':await plugin.buildCalendarNoteContent(spec);let changed=false,state;
        await plugin.processTextAtVaultPath(path,raw=>{
          active();const current=suggestionState(raw,path,date);
          if(current.exists&&current.markdown===markdown){state=current;return raw;}
          if(current.revision!==request.revision)throw fail('conflict','Suggestions changed; read them again');
          if(!current.exists&&!markdown){state=current;return raw;}
          const source=raw||(!plugin.app.vault.getAbstractFileByPath(path)?seed:''),part=section(source),eol=/\r\n|\n|\r/.exec(source)?.[0]||'\n';
          const body=markdown.replace(/\n/g,eol),replacement='## 建议'+eol+eol+body+eol+eol;
          const next=part.exists?source.slice(0,part.start)+replacement+source.slice(part.end):source+(source?(source.endsWith(eol+eol)?'':source.endsWith(eol)?eol:eol+eol):'')+replacement;
          state=suggestionState(next,path,date);
          if(!state.exists||state.markdown!==markdown)throw fail('conflict','Suggestions cannot be isolated in this source; repair its Markdown boundaries first');
          changed=next!==raw;return next;
        });
        if(changed)plugin.requestNoriaRefresh('home','api:suggestions-update');
        return {ok:true,changed,...state};
      });}
    })
  };
  const replies=require('./suggestion-replies.js').createSuggestionReplies(plugin,request=>api.suggestions.read(request));
  const coordinator=require('./suggestion-reply-lifecycle.js').replyCoordinator(plugin);
  const exchange=require('./suggestion-reply-exchange.js').createReplyExchange(plugin,replies);
  api.suggestionReplies=Object.freeze({read:request=>run(()=>coordinator.run(()=>replies.read(request))),submit:request=>run(()=>coordinator.run(()=>replies.submit(request))),
   list:request=>run(()=>coordinator.run(()=>exchange.list(request))),claim:request=>run(()=>coordinator.run(()=>exchange.claim(request))),respond:request=>run(()=>coordinator.run(()=>exchange.respond(request)))});
  const interactions=require('./interactions.js').createInteractions(plugin);
  api.interactions=Object.freeze(Object.fromEntries(Object.entries(interactions).map(([name,fn])=>[name,request=>run(()=>coordinator.run(()=>fn(request)))])));
  return Object.freeze(api);
}
function extractH2Section(raw,title){const part=section(raw,title);return {found:part.exists,text:part.exists?clean(raw.slice(part.contentStart,part.end)):'',line:part.exists?part.line+1:0};}
module.exports={createPublicApi,extractH2Section,suggestionState};
