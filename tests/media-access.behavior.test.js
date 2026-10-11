const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const filename=path.resolve(__dirname,'../src/media-access.js'),moduleCopy={exports:{}},local=createRequire(filename);
const parseYaml=raw=>Object.fromEntries(raw.split(/\r?\n/).flatMap(line=>{const m=/^([^:#]+):\s*(.+)$/.exec(line);if(!m)return [];try{return [[m[1].replace(/^"|"$/g,""),JSON.parse(m[2])]];}catch{return [[m[1].replace(/^"|"$/g,""),m[2]]];}}));
vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:moduleCopy,require:id=>id==='obsidian'?{parseYaml}:local(id),structuredClone,console});
const {readAccess,saveAccess,openReading,openMediaLink,linkedNotes,createRelatedNote}=moduleCopy.exports;
function fixture(){
 let raw='---\nstatus: "进行中"\n# Personal comment\n---\n## My words\n',exists=true;
 const file={path:'Media/Work.md',extension:'md'},opened=[];
 const plugin={settings:{home:{widgets:[]}},registerEvent(){},saveSettings:async()=>{},requestNoriaRefresh:async()=>{},app:{
  vault:{on(){},getAbstractFileByPath:p=>exists&&p===file.path?file:null,read:async()=>raw,process:async(f,fn)=>{raw=fn(raw);}},
  metadataCache:{getFirstLinkpathDest:p=>p==='Read.pdf'?{path:p}:null},workspace:{openLinkText:async(...args)=>opened.push(args)}}};
 return {plugin,opened,get raw(){return raw},set raw(v){raw=v},remove:()=>exists=false};
}
test('reading entry preserves personal prose and rejects competing entry edits',async()=>{
 const f=fixture(),before=await readAccess(f.plugin,'Media/Work.md');f.raw+='A later paragraph.\n';
 await saveAccess(f.plugin,before,'[[Read.pdf#page=12]]');assert.match(f.raw,/# Personal comment/);assert.ok(f.raw.endsWith('A later paragraph.\n'));
 await assert.rejects(saveAccess(f.plugin,before,'https://example.org/read'),/changed elsewhere/);
 assert.equal(await openReading(f.plugin,'Media/Work.md'),true);assert.deepEqual(f.opened,[['Read.pdf#page=12','Media/Work.md',true]]);
 const fresh=await readAccess(f.plugin,'Media/Work.md');await saveAccess(f.plugin,fresh,'');assert.equal(await openReading(f.plugin,'Media/Work.md'),false);
});
test('unavailable or invalid reading entries never overwrite the work',async()=>{
 const f=fixture(),before=await readAccess(f.plugin,'Media/Work.md'),raw=f.raw;
 await assert.rejects(saveAccess(f.plugin,before,'Missing.pdf'),/not found/);
 await assert.rejects(saveAccess(f.plugin,before,'javascript:alert(1)'));assert.equal(f.raw,raw);
 f.remove();await assert.rejects(saveAccess(f.plugin,before,'https://example.org'),/not found/);assert.equal(f.raw,raw);
});

test('returning to an open reader keeps its position and explicit anchors navigate in that leaf',async()=>{
 const f=fixture(),existing={view:{file:{path:'Read.pdf'}}},other={view:{file:{path:'Other.pdf'}}},revealed=[],activated=[];
 f.plugin.app.workspace.iterateAllLeaves=visit=>[other,existing].forEach(visit);
 f.plugin.app.workspace.revealLeaf=async leaf=>revealed.push(leaf);
 f.plugin.app.workspace.setActiveLeaf=leaf=>activated.push(leaf);
 f.raw='---\nmedia-open: "[[Read.pdf]]"\n---\n';
 await openReading(f.plugin,'Media/Work.md');await openReading(f.plugin,'Media/Work.md');
 assert.deepEqual(revealed,[existing,existing]);assert.equal(f.opened.length,0);
 assert.deepEqual(activated,[existing,existing]);
 await openMediaLink(f.plugin,'Read.pdf#page=7','Media/Work.md');assert.deepEqual(f.opened,[['Read.pdf#page=7','Media/Work.md',false]]);
});

test('linked notes keep explicit heading and block targets and recognize anchored related backlinks',()=>{
 const work={path:'Books/Work.md',basename:'Work',extension:'md'},note={path:'Notes/Reading.md',basename:'Reading',extension:'md'},incoming={path:'Notes/Thought.md',basename:'Thought',extension:'md'};
 const files=new Map([work,note,incoming].map(file=>[file.path,file]));
 const cache={getFirstLinkpathDest:link=>files.get(link.endsWith('.md')?link:link+'.md'),getFileCache:file=>file===work?{links:[{link:'Notes/Reading#结论'}]}:file===incoming?{frontmatter:{related:['[[Books/Work#^summary]]']}}:{},resolvedLinks:{[incoming.path]:{[work.path]:1}}};
 const rows=linkedNotes({app:{metadataCache:cache,vault:{getAbstractFileByPath:path=>files.get(path)}}},work.path);
 assert.equal(rows.find(row=>row.path===note.path).link,'Notes/Reading.md#结论');
 assert.equal(rows.find(row=>row.path===incoming.path).incoming,false);
 cache.getFileCache=file=>file===work?{frontmatterLinks:[{key:'related',link:'Notes/Reading#^idea'}]}:{};
 assert.equal(linkedNotes({app:{metadataCache:cache,vault:{getAbstractFileByPath:path=>files.get(path)}}},work.path).find(row=>row.path===note.path).link,'Notes/Reading.md#^idea');
});

test('broken destinations carry a repair signal without disguising work or opening failures',async()=>{
 const f=fixture();
 for(const target of ['[[Missing.pdf]]','javascript:alert(1)',42]){
  f.raw='---\nmedia-open: '+JSON.stringify(target)+'\n---\nOriginal prose';const before=f.raw;
  await assert.rejects(openReading(f.plugin,'Media/Work.md'),e=>e.code==='media-destination');assert.equal(f.raw,before);
 }
 f.raw='---\nmedia-open: "[[Read.pdf]]"\n---\n';
 const failed=Error('Cannot open workspace');f.plugin.app.workspace.openLinkText=async()=>{throw failed;};
 await assert.rejects(openReading(f.plugin,'Media/Work.md'),e=>e===failed&&e.code===undefined);
 f.remove();await assert.rejects(openReading(f.plugin,'Media/Work.md'),e=>e.code!== 'media-destination');
});

test('unchanged destinations preserve exact frontmatter spelling and comments',async()=>{
 for(const entry of ['', 'https://example.org/listen', '[[Read.pdf#page=12|Continue]]']){
  const f=fixture();if(entry)f.raw=f.raw.replace('status:',`media-open: ${JSON.stringify(entry)}\n# Keep this comment\nstatus:`);
  const before=f.raw,snapshot=await readAccess(f.plugin,'Media/Work.md');
  await saveAccess(f.plugin,snapshot,entry);assert.equal(f.raw,before);
 }
});

test('linked notes separate real filename dates from titles, retain undated themes and deduplicate associations',()=>{
 const names=['Books/原子习惯.md','Books/2026-10-08 阅读笔记.md','Notes/习惯与环境.md','Notes/2026-10-08 2130 夜读.md','Diary/2026-10-08.md'];
 const files=new Map(names.map(path=>[path,{path,name:path.split('/').at(-1),basename:path.split('/').at(-1).slice(0,-3),extension:'md'}]));
 const cache=new Map([
  [names[0],{frontmatterLinks:[{key:'related',link:names[1]},{key:'related',link:names[2]},{key:'media-open',link:'Read.pdf'}]}],
  [names[1],{frontmatter:{related:['[[Books/原子习惯]]']}}],
  [names[2],{frontmatter:{title:'降低启动阻力'}}],
  [names[3],{frontmatter:{related:['[[Books/原子习惯]]']}}]
 ]);
 const plugin={app:{vault:{getAbstractFileByPath:p=>files.get(p)},metadataCache:{
  getFileCache:file=>cache.get(file.path),getFirstLinkpathDest:link=>files.get(link.endsWith('.md')?link:link+'.md'),
  resolvedLinks:{[names[1]]:{[names[0]]:1},[names[3]]:{[names[0]]:1},[names[4]]:{[names[0]]:1}}
 }}};
 const rows=linkedNotes(plugin,names[0]);assert.equal(rows.length,4);
 assert.deepEqual(Array.from(rows,r=>r.path),[names[3],names[1],names[2],names[4]]);
 assert.equal(rows[0].title,'夜读');assert.equal(rows[0].date,'2026-10-08');assert.equal(rows[0].time,'21:30');
 assert.equal(rows[2].title,'降低启动阻力');assert.equal(rows[2].date,'');assert.equal(rows[2].incoming,false);
 assert.equal(rows[3].incoming,true);assert.equal(rows[3].date,'');
});

test('new linked notes use the chosen stable or dated name and do not touch the work',async()=>{
 const f=fixture(),files=new Map(),before=f.raw;
 const get=f.plugin.app.vault.getAbstractFileByPath;
 f.plugin.app.vault.getAbstractFileByPath=p=>get(p)||files.get(p);
 f.plugin.app.vault.create=async(path,raw)=>{if(files.has(path))throw Error('exists');files.set(path,{path,raw});};
 const note=await createRelatedNote(f.plugin,'Media/Work.md','降低启动阻力');
 assert.equal(note.path,'Media/降低启动阻力.md');assert.match(files.get(note.path).raw,/related: \["\[\[Media\/Work\]\]\"\]/);
 assert.match(files.get(note.path).raw,/## 降低启动阻力/);assert.doesNotMatch(files.get(note.path).raw,/tags:|uuid:|date:|time:/);assert.equal(f.raw,before);
 const dated=await createRelatedNote(f.plugin,'Media/Work.md','2026-10-08 阅读感想');assert.match(files.get(dated.path).raw,/## 阅读感想/);
 await assert.rejects(createRelatedNote(f.plugin,'Media/Work.md','降低启动阻力'),/exists/);
 for(const name of ['../outside','a/b','NUL','COM1.txt','bad: title',''])await assert.rejects(createRelatedNote(f.plugin,'Media/Work.md',name));
 assert.equal(files.size,2);
});
