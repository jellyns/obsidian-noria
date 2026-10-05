// Usage: node scripts/preview-diary-handoff.cjs private-config.json
// Emits before/after copies and a manifest outside the source vault; no apply mode.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {removeBuiltInViews,planHabitHistory,plainTemplate}=require('./diary-handoff-plan.cjs');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
function under(root,relative){
  const target=path.resolve(root,relative),prefix=path.resolve(root)+path.sep;
  if(!target.toLowerCase().startsWith(prefix.toLowerCase()))throw new Error('Path outside configured root: '+relative);
  return target;
}
function preview(config){
  const vault=path.resolve(config.vault),out=path.resolve(config.output);
  if(out.toLowerCase()===vault.toLowerCase()||out.toLowerCase().startsWith((vault+path.sep).toLowerCase()))throw new Error('Output must be outside the source vault');
  if(fs.existsSync(out))throw new Error('Use a new output directory to preserve earlier evidence');
  const originals=new Map(),candidates=new Map(),steps=[],warnings=[];
  const read=relative=>{if(!originals.has(relative)){const file=under(vault,relative);originals.set(relative,fs.existsSync(file)?fs.readFileSync(file,'utf8'):null);}return originals.get(relative);};
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.isFile()&&/^\d{4}(?:-\d{2}(?:-\d{2})?|-W\d{2})?\.md$/.test(e.name)?[path.join(dir,e.name)]:[]);
  for(const file of walk(under(vault,config.diaryRoot))){const relative=path.relative(vault,file).replaceAll('\\','/');candidates.set(relative,read(relative));}
  // Compose the earlier review proposal only against its exact, unchanged source.
  if(config.reviewManifest){
    const previous=JSON.parse(fs.readFileSync(config.reviewManifest,'utf8'));
    for(const entry of previous.changed){
      const relative=entry.relative,before=read(relative),next=fs.readFileSync(entry.after,'utf8');
      if(before===null||sha(before)!==entry.beforeSha256||sha(next)!==entry.afterSha256)throw new Error('Earlier review proposal is stale: '+relative);
      candidates.set(relative,next);
    }
    steps.push({kind:'existing review proposal',files:previous.changed.length,manifest:config.reviewManifest});
  }
  let removedViews=0;
  for(const [relative,raw] of candidates){
    const result=removeBuiltInViews(raw,config.registry);candidates.set(relative,result.text);removedViews+=result.removed.length;
    if(result.retained.length)warnings.push({path:relative,retainedViews:result.retained});
  }
  const templateCandidates=config.templates.map(relative=>{const before=read(relative);if(before===null)throw new Error('Missing template '+relative);return {relative,text:plainTemplate(before)};});
  const dailyTemplate=templateCandidates[0].text;
  const pathForDate=date=>config.dailyPath.replaceAll('{year}',date.slice(0,4)).replaceAll('{date}',date);
  // Load configured destinations too, including notes outside the scanned naming pattern.
  const registry=read(config.registry);if(registry===null)throw new Error('Missing habit registry');
  const dates=[...registry.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m=>m[0]);
  for(const date of new Set(dates)){const relative=pathForDate(date),raw=read(relative);if(raw!==null&&!candidates.has(relative))candidates.set(relative,raw);}
  const history=planHabitHistory(registry,candidates,pathForDate,()=>dailyTemplate);
  for(const [relative,raw] of history.notes)candidates.set(relative,raw);
  candidates.set(config.registry,history.registryAfter);
  for(const entry of templateCandidates)candidates.set(entry.relative,entry.text);
  const appearancePath='.obsidian/appearance.json',appearance=read(appearancePath);
  if(appearance){
    const next=JSON.parse(appearance),before=next.enabledCssSnippets||[];
    next.enabledCssSnippets=before.filter(name=>name!==config.retiredSnippet);
    if(next.enabledCssSnippets.length!==before.length)candidates.set(appearancePath,JSON.stringify(next,null,2)+'\n');
  }
  const changed=[];
  for(const [relative,after] of candidates){
    const before=read(relative);if(before===after)continue;
    for(const [folder,text] of [['before',before],['after',after]])if(text!==null){const file=under(out,folder+'/'+relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
    changed.push({path:relative,beforeSha256:before===null?null:sha(before),afterSha256:sha(after),created:before===null});
  }
  // Recheck the entire read set after planning; this is evidence, not a production write.
  for(const [relative,before] of originals){const file=under(vault,relative),now=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;if(now!==before)throw new Error('Source changed while previewing: '+relative);}
  const manifest={vault,output:out,productionWrites:0,steps,changed,removedViews,
    habits:{moved:history.moved,retained:history.retained},warnings,
    sourceFiles:[...originals].map(([relative,raw])=>({path:relative,sha256:raw===null?null:sha(raw)})),
    styling:{retireSnippet:config.retiredSnippet,keepSnippetFile:true,source:'Noria styles.css'}};
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(require.main===module){const result=preview(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify({files:result.changed.length,views:result.removedViews,habitsMoved:result.habits.moved.length,retainedGroups:result.habits.retained.length,productionWrites:0}));}
module.exports={preview};
