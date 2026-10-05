"use strict";
const {createHash,randomUUID}=require('node:crypto');
const {scanAtxHeadings}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
const fail=(code,message)=>Object.assign(Error(message),{code});
const clean=value=>String(value).replace(/\r\n?/g,'\n');
const PREFIX='<!-- noria:reply ';
const TEXT='<!-- noria:reply-text -->';
const SOURCE='<!-- noria:reply-source -->';
const END='<!-- noria:reply-end -->';
const RELOCATION='<!-- noria:reply-relocation ';
const idOk=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(id);

function parse(raw,source){
 if(!raw)return null;
 const text=clean(raw),header=/^<!-- noria:conversation (.+) -->\n/.exec(text);
 if(!header)throw fail('conflict','The reply note has an unknown format; its contents were preserved');
 let meta;try{meta=JSON.parse(header[1]);}catch{throw fail('conflict','Invalid reply note metadata');}
 if(meta.version!==1||!idOk(meta.id)||typeof meta.sourcePath!=='string'||source&&meta.date!==source.date)throw fail('conflict','Reply note belongs to another source or format');
 const originPath=meta.originPath||meta.sourcePath;let moved=!!meta.originPath;
 const readMoves=outside=>{for(const line of require('./suggestion-reply-events.js').applyEvents(outside,replies).split('\n')){if(!line.startsWith(RELOCATION)){if(line.includes('<!-- noria:reply'))throw fail('conflict','Unrecognized reply content');continue;}let move;try{if(!line.endsWith(' -->'))throw Error();move=JSON.parse(line.slice(RELOCATION.length,-4));}catch{throw fail('conflict','Invalid source relocation record');}if(move.from!==meta.sourcePath||move.date!==meta.date||typeof move.path!=='string')throw fail('conflict','Source relocation chain is inconsistent');meta.sourcePath=move.path;moved=true;}};
 const replies=[],seen=new Set();
 let rest=text.slice(header[0].length),offset=rest.indexOf(PREFIX);
 while(offset!==-1){
  readMoves(rest.slice(0,offset));
  rest=rest.slice(offset);const newline=rest.indexOf('\n');let entry;
  try{if(!rest.slice(0,newline).endsWith(' -->'))throw Error();entry=JSON.parse(rest.slice(PREFIX.length,newline-4));}catch{throw fail('conflict','Invalid reply metadata');}
  const start=rest.indexOf('\n'+TEXT+'\n'),split=rest.indexOf('\n'+SOURCE+'\n'),end=rest.indexOf('\n'+END);
  if(!idOk(entry.id)||seen.has(entry.id)||typeof entry.createdAt!=='string'||typeof entry.sourceRevision!=='string'||start<newline||split<=start||end<=split)throw fail('conflict','Reply boundaries are damaged; repair the note before adding a reply');
  const markdown=rest.slice(start+TEXT.length+2,split).replace(/\n$/,''),quoted=rest.slice(split+SOURCE.length+2,end).replace(/\n$/,'');
  if(!markdown.trim()||markdown.includes('<!-- noria:reply')||quoted.split('\n').some(line=>!line.startsWith('> ')))throw fail('conflict','Reply contents are damaged');
  const snapshot=quoted.split('\n').map(line=>line.slice(2)).join('\n');
  seen.add(entry.id);replies.push({...entry,markdown,sourceMarkdown:snapshot,state:'saved'});
  rest=rest.slice(end+END.length+1);offset=rest.indexOf(PREFIX);
 }
 readMoves(rest);if(source&&meta.sourcePath!==source.path)throw fail('conflict','Reply note belongs to another source');
 const events=require('./suggestion-reply-events.js');
 return {id:meta.id,meta:{...meta,...(moved?{originPath}:{})},replies:replies.map(r=>({...r,revision:events.revision(r),state:events.state(r)}))};
}

function createSuggestionReplies(plugin,readSource){
 const active=()=>{if(plugin._noriaPluginDisposed)throw fail('unsupported','Noria is unloaded; reconnect');};
 const location=(source,attempt=0)=>{
  const root=plugin.normalizePath(plugin.settings?.onboarding?.workspaceRoot||'Noria');
  if(!root||root.startsWith('/')||root.includes(':')||root.split('/').some(x=>!x||x==='.'||x==='..'))throw fail('invalid-input','Invalid Noria workspace root');
  const identity=[source.path,source.date,'suggestions'];if(attempt)identity.push(attempt);
  const key=createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,12);
  return `${root}/Conversations/${source.date}-建议-${key}.md`;
 };
 async function existing(source){
  const matches=[];
  for(const file of require('./suggestion-reply-library.js').conversationFiles(plugin)){
   const raw=await plugin.loadTextFromVault(file.path),head=/^<!-- noria:conversation (.+) -->\r?\n/.exec(raw);if(!head)continue;
   let meta;try{meta=parse(raw).meta;}catch{const moves=require('./suggestion-reply-renames.js').readMoves(plugin.app);let header;try{header=JSON.parse(head[1]);}catch{continue;}if(header.sourcePath===source.path||moves.some(m=>m.id===header.id&&m.path===source.path))throw fail('conflict','The reply note is damaged; its contents were preserved');continue;}
   if(!meta.kind&&meta.sourcePath===source.path&&meta.date===source.date)matches.push({path:file.path,meta});
  }
  if(matches.length>1)throw fail('conflict','Multiple conversations refer to this source; keep both and resolve the conflict');
  return matches[0];
 }
 async function resolveSource(request){
  const configured=await readSource(request);
  const target={path:request.sourcePath||configured.path,date:configured.date},lib=require('./suggestion-reply-library.js');
  if(!lib.validSource(target))throw fail('invalid-input','Invalid reply source');
  const found=await existing(target),indexed=lib.draftSources(plugin.app).find(s=>s.path===target.path&&s.date===target.date);
  const originPath=found?.meta.originPath||indexed?.originPath;
  if(target.path===configured.path)return {...configured,...(originPath?{originPath}:{})};
  if(!originPath)throw fail('conflict','The configured diary source changed; read it again');
  return {...require('./public-api.js').suggestionState(await plugin.loadTextFromVault(target.path),target.path,target.date),originPath};
 }
 const locate=async source=>{
  const found=await existing(source);if(found)return found.path;
  // A renamed source can leave its stable conversation filename at the old hash.
  for(let attempt=0;;attempt++){
   const path=location(source,attempt),raw=await plugin.loadTextFromVault(path);if(!raw)return path;
   const head=/^<!-- noria:conversation (.+) -->\r?\n/.exec(raw);if(!head)return path;
   let meta;try{meta=parse(raw).meta;}catch{return path;}
   if(meta.sourcePath===source.path&&meta.date===source.date)return path;
  }
 };
 const state=(raw,path,source)=>{const stored=parse(raw,source);return {path,source,sourcePath:source.path,date:source.date,exists:!!stored,id:stored?.id||null,replies:(stored?.replies||[]).map(r=>({...r,sourceChanged:r.sourceRevision!==source.revision}))};};
 return Object.freeze({
  async read(request){active();const source=await resolveSource(request),path=await locate(source);active();return state(await plugin.loadTextFromVault(path),path,source);},
  async submit(request){
   active();
   if(!idOk(request?.requestId)||typeof request?.markdown!=='string'||!request.markdown.trim()||request.markdown.length>12000||request.markdown.includes('<!-- noria:reply'))throw fail('invalid-input','Supply a stable requestId and a nonempty reply up to 12000 characters');
   if(typeof request.sourcePath!=='string'||typeof request.sourceRevision!=='string')throw fail('invalid-input','Use the source path and revision from suggestions.read');
   const source=await resolveSource(request),path=await locate(source),markdown=clean(request.markdown).trim();
   const headings=scanAtxHeadings(`## noria-reply-start\n${markdown}\n\n## noria-reply-boundary\n`);
   if(headings.at(-1)?.title!=='noria-reply-boundary')throw fail('invalid-input','Close Markdown code blocks and comments before saving');
   if(request.sourcePath!==source.path)throw fail('conflict','The configured diary source changed; read it again');
   let changed=false;
   await plugin.processTextAtVaultPath(path,raw=>{
    active();const stored=parse(raw,source),existing=stored?.replies.find(r=>r.id===request.requestId);
    if(existing){
     if(existing.markdown!==markdown||existing.sourceRevision!==request.sourceRevision)throw fail('conflict','This requestId already belongs to a different reply');
     return raw;
    }
    if(!source.exists)throw fail('not-found','The Suggestions section no longer exists');
    if(source.revision!==request.sourceRevision)throw fail('conflict','Suggestions changed before submission; keep the draft and read them again');
    const meta={version:1,id:stored?.id||randomUUID(),sourcePath:source.path,date:source.date,...(source.originPath?{originPath:source.originPath}:{})};
    const base=raw||`<!-- noria:conversation ${JSON.stringify(meta)} -->\n\n## 建议交流\n\n来源：[[${source.path.replace(/\.md$/,'')}#建议]]\n`;
    const entry={id:request.requestId,createdAt:new Date().toISOString(),sourceRevision:source.revision};
    const snapshot=source.markdown.split('\n').map(line=>'> '+line).join('\n');
    changed=true;
    return base+(base.endsWith('\n\n')?'':base.endsWith('\n')?'\n':'\n\n')+`${PREFIX}${JSON.stringify(entry)} -->\n## 我的补充 · ${entry.createdAt}\n\n${TEXT}\n${markdown}\n\n${SOURCE}\n${snapshot}\n\n${END}\n`;
   });
   active();const latest=await resolveSource(request),result=state(await plugin.loadTextFromVault(path),path,source);
   result.replies=result.replies.map(r=>({...r,sourceChanged:r.sourceRevision!==latest.revision}));
   return {ok:true,changed,...result};
  }
 });
}
module.exports={createSuggestionReplies,parse};
