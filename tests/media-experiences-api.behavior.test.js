const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),{createRequire}=require('module');
const {createAgentConnection}=require('../src/agent-mcp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf(':');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
function load(name,stubs){const file=path.resolve(__dirname,'../src/'+name),m={exports:{}},local=createRequire(file);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,require:id=>Object.hasOwn(stubs,id)?stubs[id]:local(id)});return m.exports;}
const service=load('media-experiences.js',{obsidian:{parseYaml:parse},'./media-record.js':{readMedia:async(p,{path})=>{if(!p.app.vault.getAbstractFileByPath(path))throw Error('Missing work');return {path,title:'Book',kinds:['book']};}}});
const {createPublicApi}=load('public-api.js',{'./media-experiences.js':service});
function fixture(){
 const files=new Map([['Media/Book.md','My work note.'],['Diary/2026-10-08.md','## 记录\nKeep my prose.\n']]);
 const get=p=>files.has(p)?{path:p,name:p.split('/').at(-1),basename:p.split('/').at(-1).replace(/\.md$/,''),extension:'md'}:null;
 const p={getLocalYmd:()=> '2026-10-08',getNoriaLocale:()=> 'zh',requestNoriaRefresh(){},app:{vault:{
 getAbstractFileByPath:get,getMarkdownFiles:()=>[...files.keys()].map(get),read:async f=>files.get(f.path),
 create:async(p,raw)=>{if(files.has(p))throw Error('exists');files.set(p,raw);return get(p);}
 },metadataCache:{getFirstLinkpathDest:link=>get(link.endsWith('.md')?link:link+'.md')}}};
 return {p,files,api:createPublicApi(p)};
}
const work='Media/Book.md',date='2026-10-08';

test('experience discovery never reads undated, invalid or out-of-range note bodies',async()=>{
 const {api,p,files}=fixture(),read=p.app.vault.read,reads=[];
 files.set('Elsewhere/2026-10-08 Thought.md','---\nrelated: ["[[Media/Book]]"]\n---\n\nThought.');
 for(const name of ['Undated.md','2026-10-07 Earlier.md','2026-10-09 Later.md','2026-02-30 Invalid.md'])files.set('Elsewhere/'+name,'Must not be read.');
 p.app.vault.read=async f=>{reads.push(f.path);return read(f);};
 await api.media.listExperiences({path:work,start:date,end:date});
 assert.deepEqual(reads,['Elsewhere/2026-10-08 Thought.md']);
 reads.length=0;
 await assert.rejects(api.media.listExperiences({path:work,start:'2025-01-01',end:date}),e=>e.code==='invalid-input');
 assert.deepEqual(reads,[]);
});

test('cross-folder experiences follow explicit work links, including duplicate basenames, without treating mentions as experiences',async()=>{
 const {api,files}=fixture();
 const note=(related,body='Recorded.')=>'---\ntags: ["media/experience"]\nrelated: '+JSON.stringify([related])+'\n---\n\n## Reading\n\n'+body+'\n';
 files.set('Areas/2026-10-08 Reading.md',note('[[Media/Book|Book]]','First.'));
 files.set('Archives/2026-10-08 2130 Reading.md',note('[[Media/Book]]','Later.'));
 files.set('Other/Book.md','Another edition.');
 files.set('Other/2026-10-08 Reading.md',note('[[Other/Book]]'));
 files.set('Areas/2026-10-08 Mention.md','A normal mention [[Media/Book]].');
 files.set('Areas/2026-02-30 Invalid.md',note('[[Media/Book]]'));
 const before=new Map(files),result=await api.media.listExperiences({path:work,start:date,end:date});
 assert.deepEqual(Array.from(result.items,i=>i.path),['Areas/2026-10-08 Reading.md','Archives/2026-10-08 2130 Reading.md']);
 assert.equal(result.items[0].time,null);assert.equal(result.items[1].time,'21:30');
 assert.deepEqual(files,before,'reading does not relocate or rewrite notes');
 const current=await api.media.readExperiences({path:work,date});
 files.set('Areas/2026-10-08 Reading.md',files.get('Areas/2026-10-08 Reading.md')+'Changed.');
 await assert.rejects(api.media.addExperience({path:work,date,revision:current.revision,body:'stale'}),e=>e.code==='conflict');
});

test('moving the work and experience independently keeps association when links are maintained',async()=>{
 const {api,files}=fixture(),ref=await api.media.readExperiences({path:work,date});
 const saved=await api.media.addExperience({path:work,date,revision:ref.revision,body:'Thought.'});
 const movedWork='Elsewhere/Renamed.md',movedNote='Notes/2026-10-08 Thought.md';
 files.set(movedWork,files.get(work));files.delete(work);
 files.set(movedNote,files.get(saved.path).replace('Media/Book','Elsewhere/Renamed'));files.delete(saved.path);
 const result=await api.media.readExperiences({path:movedWork,date});
 assert.equal(result.items.length,1);assert.equal(result.items[0].path,movedNote);
 const next=await api.media.addExperience({path:movedWork,date,revision:result.revision,body:'Next.'});
 assert.equal(next.path,'Elsewhere/2026-10-08 Book感受.md');
});

test('unreadable cross-folder dates stay explicit, block stale writes, and recover without changing existing records',async()=>{
 const {api,p,files}=fixture(),ref=await api.media.readExperiences({path:work,date});
 const saved=await api.media.addExperience({path:work,date,revision:ref.revision,body:'Thought.'});
 const elsewhere='Areas/2026-10-08 Reading.md';files.set(elsewhere,files.get(saved.path));files.delete(saved.path);
 const read=p.app.vault.read;p.app.vault.read=async f=>{if(f.path===elsewhere)throw Error('unreadable');return read(f);};
 const incomplete=await api.media.readExperiences({path:work,date});
 assert.deepEqual(Array.from(incomplete.unreadable,x=>x.path),[elsewhere]);
 const before=new Map(files);
 await assert.rejects(api.media.addExperience({path:work,date,revision:incomplete.revision,body:'Do not write'}),e=>e.code==='conflict');
 assert.deepEqual(files,before);p.app.vault.read=read;
 const recovered=await api.media.readExperiences({path:work,date});assert.equal(recovered.items.length,1);assert.equal(recovered.unreadable.length,0);
});
test('public API saves beside work, no diary mutation or subdirectory; repeated day can use a different title or known time',async()=>{
 const {api,files}=fixture(),before=await api.media.readExperiences({path:work,date});
 assert.equal(before.items.length,0);
 const saved=await api.media.addExperience({path:work,date,revision:before.revision,body:'First view.'});
 assert.equal(saved.path,'Media/2026-10-08 Book感受.md');assert.equal(saved.write,undefined);
 let fresh=await api.media.readExperiences({path:work,date});
 await assert.rejects(api.media.addExperience({path:work,date,revision:fresh.revision,body:'Duplicate.'}),e=>e.code==='conflict'&&e.reason==='filename');
 await api.media.addExperience({path:work,date,revision:fresh.revision,body:'Second view.',title:'重读'});
 fresh=await api.media.readExperiences({path:work,date});
 await api.media.addExperience({path:work,date,revision:fresh.revision,body:'Later view.',time:'21:30'});
 const history=await api.media.listExperiences({path:work,start:date,end:date});
 assert.equal(history.items.length,3);assert.equal(history.items.filter(i=>i.time===null).length,2);
 assert.equal(files.get(work),'My work note.');assert.equal(files.get('Diary/'+date+'.md'),'## 记录\nKeep my prose.\n');
 assert.equal([...files.keys()].some(p=>p.includes('/记录/')),false);
});
test('concurrent additions and changed source conflict; nonexperience notes and independent edits do not affect revision',async()=>{
 const {api,files}=fixture(),ref=await api.media.readExperiences({path:work,date});
 files.set('Media/2026-10-08 unrelated.md','Mention [[Media/Book]]');
 const results=await Promise.allSettled(['One','Two'].map(body=>api.media.addExperience({path:work,date,revision:ref.revision,body})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'conflict');
 const fresh=await api.media.readExperiences({path:work,date}),record=fresh.items[0].path;
 files.set(record,files.get(record)+'\nManually changed.');
 await assert.rejects(api.media.addExperience({path:work,date,revision:fresh.revision,body:'Stale.',title:'new'}),e=>e.code==='conflict');
});
test('backfill stays untimed; malformed input and future dates create no notes; refresh failure does not report failed save',async()=>{
 const {api,p,files}=fixture(),past='2026-09-01',ref=await api.media.readExperiences({path:work,date:past}),count=files.size;
 for(const extra of [{body:' '},{title:'../escape'},{time:'24:01'},{rating:5}]){
  await assert.rejects(api.media.addExperience({path:work,date:past,revision:ref.revision,body:'Text.',...extra}),e=>e.code==='invalid-input');
 }
 for(const d of ['2026-02-30','2026-10-09'])await assert.rejects(api.media.addExperience({path:work,date:d,revision:'x',body:'No'}));
 assert.equal(files.size,count);
 p.requestNoriaRefresh=()=>{throw Error('refresh unavailable');};
 const saved=await api.media.addExperience({path:work,date:past,revision:ref.revision,body:'Remembered.'});
 assert.equal(saved.ok,true);assert.ok(saved.refreshWarning);
 const record=await api.media.readExperiences({path:work,date:past});assert.equal(record.items[0].time,null);
});
test('updated work link after rename remains readable; unreadable candidate is explicit and prevents unsafe write',async()=>{
 const {api,p,files}=fixture(),ref=await api.media.readExperiences({path:work,date});
 const saved=await api.media.addExperience({path:work,date,revision:ref.revision,body:'Thought.'});
 files.set('Media/Renamed.md',files.get(work));files.delete(work);
 files.set(saved.path,files.get(saved.path).replace('Media/Book','Media/Renamed'));
 const result=await api.media.readExperiences({path:'Media/Renamed.md',date});assert.equal(result.items.length,1);
 p.app.vault.read=async()=>{throw Error('unreadable');};
 const bad=await api.media.readExperiences({path:'Media/Renamed.md',date});assert.equal(bad.unreadable.length,1);
 await assert.rejects(api.media.addExperience({path:'Media/Renamed.md',date,revision:bad.revision,body:'No.'}),e=>e.code==='conflict');
});
test('real MCP forwards title and optional time to the shared note flow',async t=>{
 const {api}=fixture(),connection=createAgentConnection({getApi:()=>api,version:'1'});t.after(()=>connection.dispose());
 const endpoint=await connection.start(),client=new Client({name:'media-experience-test',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));t.after(()=>client.close());
 const ref=(await client.callTool({name:'noria_media_experiences_read',arguments:{path:work,date}})).structuredContent;
 const saved=await client.callTool({name:'noria_media_experiences_add',arguments:{path:work,date,revision:ref.revision,body:'User text.',title:'Later',time:'21:30'}});
 assert.equal(saved.isError,undefined);assert.equal(saved.structuredContent.path,'Media/2026-10-08 2130 Later.md');
 const list=(await client.callTool({name:'noria_media_experiences_list',arguments:{path:work,start:date,end:date}})).structuredContent;
 assert.equal(list.items[0].body,'User text.');
});
