const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const {createAgentConnection}=require('../src/agent-mcp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).flatMap(line=>{const m=/^(?:"([^"]+)"|([^:\s]+)):\s*(.+)$/.exec(line);if(!m)return [];try{return [[m[1]||m[2],JSON.parse(m[3])]];}catch{return [[m[1]||m[2],m[3]]];}}));
function load(name,stubs){const filename=path.resolve(__dirname,'../src/'+name),module={exports:{}},local=createRequire(filename);vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:id=>id in stubs?stubs[id]:local(id)});return module.exports;}
const service=load('media-record.js',{obsidian:{parseYaml:parse}});
const {createPublicApi}=load('public-api.js',{'./media-feature.js':require('./media-api-fixture.cjs').mediaFeature({'./media-record.js':service})});
function fixture(kind='book'){
 const file={path:'Media/Work.md',basename:'Work',extension:'md'};
 let raw=`---\r\ntags: ["#${kind}"]\r\nstatus: "进行中"\r\npageprogress: 20\r\npagecount: 0\r\nrating: 0\r\n# Keep the original comment\r\nother: "keep"\r\n---\r\n## My notes\r\nKeep my own words.\r\n`,queue=Promise.resolve(),exists=true;
 const plugin={normalizePath:p=>p.replaceAll('\\','/'),app:{metadataCache:{getFileCache:()=>({tags:[]})},vault:{getAbstractFileByPath:p=>exists&&p===file.path?file:null,read:async()=>raw,process:(_,mutate)=>{const job=queue.catch(()=>{}).then(()=>{if(!exists)throw Error('removed');raw=mutate(raw);});queue=job;return job;}}}};
 return {plugin,file,api:createPublicApi(plugin),get raw(){return raw},set raw(value){raw=value},remove:()=>{exists=false}};
}

test('classification updates support every media kind and preserve identity, body and unrelated properties',async()=>{
 for(const kind of ['book','movie','music','game']){
  const f=fixture(kind),before=await service.readMedia(f.plugin,{path:f.file.path});
  f.raw+='Later prose.\r\n';
  const changed=await service.updateMediaClassification(f.plugin,{path:f.file.path,revision:before.classificationRevision,patch:{genre:['成长','成长','心理'],tags:['#topic/生活','topic/生活']}});
  assert.deepEqual(JSON.parse(JSON.stringify(changed.properties.genre)),['成长','心理']);
  assert.deepEqual(JSON.parse(JSON.stringify(changed.properties.tags)),['#'+kind,'topic/生活']);
  assert.match(f.raw,/rating: 0\r\n# Keep the original comment\r\nother: "keep"/);assert.ok(f.raw.endsWith('Later prose.\r\n'));
  const clear=await service.updateMediaClassification(f.plugin,{path:f.file.path,revision:changed.classificationRevision,patch:{genre:[],tags:[]}});
  assert.equal(clear.properties.genre,null);assert.deepEqual(JSON.parse(JSON.stringify(clear.properties.tags)),['#'+kind]);
 }
});

test('editing category tags does not introduce genre or overwrite an existing genre property',async()=>{
 for(const genre of ['', 'genre: ["Action"]\r\n']){
  const f=fixture();f.raw=f.raw.replace('status:',genre+'status:');
  const before=await service.readMedia(f.plugin,{path:f.file.path});
  await service.updateMediaClassification(f.plugin,{path:f.file.path,revision:before.classificationRevision,patch:{tags:['科幻']}});
  assert.ok(f.raw.includes('genre:')===!!genre);
  if(genre)assert.ok(f.raw.includes(genre));
  assert.ok(f.raw.endsWith('Keep my own words.\r\n'));
 }
});

test('classification conflicts retain competing edits while independent status and prose changes survive',async()=>{
 const f=fixture(),before=await service.readMedia(f.plugin,{path:f.file.path});
 await service.updateMedia(f.plugin,{path:f.file.path,revision:before.revision,patch:{status:'已读'}});
 const saved=await service.updateMediaClassification(f.plugin,{path:f.file.path,revision:before.classificationRevision,patch:{genre:['心理']}});
 assert.equal(saved.properties.status,'已读');const raw=f.raw;
 await assert.rejects(service.updateMediaClassification(f.plugin,{path:f.file.path,revision:before.classificationRevision,patch:{tags:['topic/new']}}),e=>e.code==='conflict');assert.equal(f.raw,raw);
 const current=await service.readMedia(f.plugin,{path:f.file.path});f.file.path='Media/Renamed.md';
 await assert.rejects(service.updateMediaClassification(f.plugin,{path:f.file.path,revision:current.classificationRevision,patch:{genre:['成长']}}));assert.equal(f.raw,raw);
});

test('invalid tags and attempted identity changes cannot write, and untouched malformed fields remain intact',async()=>{
 const f=fixture(),before=await service.readMedia(f.plugin,{path:f.file.path}),raw=f.raw;
 for(const tags of [['movie'],['arts/games'],['bad tag'],['topic//bad'],['123'],[{}]]){
  await assert.rejects(service.updateMediaClassification(f.plugin,{path:f.file.path,revision:before.classificationRevision,patch:{tags}}),e=>e.code==='invalid-input');assert.equal(f.raw,raw);
 }
 f.raw=f.raw.replace('["#book"]','["#book",42]');const malformed=await service.readMedia(f.plugin,{path:f.file.path});
 const changed=await service.updateMediaClassification(f.plugin,{path:f.file.path,revision:malformed.classificationRevision,patch:{genre:['成长']}});
 assert.deepEqual(JSON.parse(JSON.stringify(changed.properties.tags)),['#book',42]);
 const preserved=f.raw;await assert.rejects(service.updateMediaClassification(f.plugin,{path:f.file.path,revision:changed.classificationRevision,patch:{tags:[]}}),e=>e.code==='invalid-input');assert.equal(f.raw,preserved);
});

test('inline identity and topic tags stay in prose when editable classifications are cleared',async()=>{
 const f=fixture();f.raw=f.raw.replace('tags: ["#book"]\r\n','')+'#book #topic/正文\r\n';f.plugin.app.metadataCache.getFileCache=()=>({tags:[{tag:'#book'},{tag:'#topic/正文'}]});
 const before=await service.readMedia(f.plugin,{path:f.file.path});assert.deepEqual(JSON.parse(JSON.stringify(before.inlineTags)),['topic/正文']);
 const result=await service.updateMediaClassification(f.plugin,{path:f.file.path,revision:before.classificationRevision,patch:{tags:[],genre:['成长']}});
 assert.ok(f.raw.endsWith('#book #topic/正文\r\n'));assert.equal(result.kinds[0],'book');
});

test('media updates preserve unrelated properties, comments, prose and date absence without inventing reading volume',async()=>{
 const f=fixture(),before=await f.api.media.read({path:f.file.path});assert.equal(before.properties.pagecount,0);assert.equal(before.markdown,undefined);
 f.raw+='My later paragraph.\r\n';
 const result=await f.api.media.update({path:before.path,revision:before.revision,patch:{status:'已读',pageprogress:32}});
 assert.equal(result.changed,true);assert.equal(result.properties.pageprogress,32);assert.equal(result.properties.status,'已读');
 assert.ok(f.raw.includes('rating: 0\r\n# Keep the original comment\r\nother: "keep"'));
 assert.ok(f.raw.endsWith('Keep my own words.\r\nMy later paragraph.\r\n'));assert.doesNotMatch(f.raw,/finishedAt|viewtime|reading_volume/);
 const same=f.raw;assert.equal((await f.api.media.update({path:result.path,revision:result.revision,patch:{pageprogress:32}})).changed,false);assert.equal(f.raw,same);
 const cleared=await f.api.media.update({path:result.path,revision:result.revision,patch:{status:null,pageprogress:null}});assert.equal(cleared.properties.status,null);assert.equal(cleared.properties.pageprogress,null);
});

test('completion dates are explicit, validated and guarded without inventing one on status changes',async()=>{
 const f=fixture(),ref=await f.api.media.read({path:f.file.path});
 for(const finishedAt of ['2026-02-30','tomorrow','2026-1-2'])await assert.rejects(f.api.media.update({path:ref.path,revision:ref.revision,patch:{finishedAt}}),e=>e.code==='invalid-input');
 const dated=await f.api.media.update({path:ref.path,revision:ref.revision,patch:{finishedAt:'2026-10-08'}});
 assert.equal(dated.properties.finishedAt,'2026-10-08');assert.equal(dated.properties.status,'进行中');
 await assert.rejects(f.api.media.update({path:ref.path,revision:ref.revision,patch:{finishedAt:'2026-10-07'}}),e=>e.code==='conflict');
 const cleared=await f.api.media.update({path:dated.path,revision:dated.revision,patch:{finishedAt:null}});assert.equal(cleared.properties.finishedAt,null);
 assert.match(f.raw,/Keep my own words/);
});

test('media writes detect competing edits and never recreate a deleted or moved source',async()=>{
 const f=fixture(),ref=await f.api.media.read({path:f.file.path});
 const results=await Promise.allSettled([25,30].map(pageprogress=>f.api.media.update({path:ref.path,revision:ref.revision,patch:{pageprogress}})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'conflict');
 const fresh=await f.api.media.read({path:f.file.path}),raw=f.raw;f.file.path='Media/Moved.md';
 await assert.rejects(f.api.media.update({path:fresh.path,revision:fresh.revision,patch:{status:'已读'}}),e=>e.code==='not-found');assert.equal(f.raw,raw);
 f.remove();await assert.rejects(f.api.media.read({path:f.file.path}),e=>e.code==='not-found');assert.equal(f.raw,raw);
});

test('media writes reject invalid data, unsupported fields and page edits for nonbooks',async()=>{
 const f=fixture(),ref=await f.api.media.read({path:f.file.path}),raw=f.raw;
 for(const patch of [{},{rating:5},{pageprogress:-1},{pageprogress:1.5},{pageprogress:'24'},{status:''},{status:'a\nb'}])await assert.rejects(f.api.media.update({path:ref.path,revision:ref.revision,patch}),e=>e.code==='invalid-input');
 assert.equal(f.raw,raw);const game=fixture('game'),g=await game.api.media.read({path:game.file.path});
 await assert.rejects(game.api.media.update({path:g.path,revision:g.revision,patch:{pageprogress:5}}),e=>e.code==='invalid-input');
 f.plugin._noriaPluginDisposed=true;await assert.rejects(f.api.media.update({path:ref.path,revision:ref.revision,patch:{status:'已读'}}),e=>e.code==='unsupported');
});

test('actual MCP media read and update share source-preserving write and conflict behavior',async t=>{
 const f=fixture(),connection=createAgentConnection({getApi:()=>f.api,version:'1'});t.after(()=>connection.dispose());
 const endpoint=await connection.start(),client=new Client({name:'media-edit',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));t.after(()=>client.close());
 const tools=await client.listTools();assert.equal(tools.tools.find(t=>t.name==='noria_media_update').annotations.readOnlyHint,false);
 const read=(await client.callTool({name:'noria_media_read',arguments:{path:f.file.path}})).structuredContent;
 const request={path:read.path,revision:read.revision,patch:{pageprogress:60}};
 const result=await client.callTool({name:'noria_media_update',arguments:request});assert.equal(result.structuredContent.properties.pageprogress,60);assert.equal(result.isError,undefined);
 const stale=await client.callTool({name:'noria_media_update',arguments:request});assert.equal(stale.isError,true);assert.equal(stale.structuredContent.error.code,'conflict');
});


test('metadata updates preserve independent progress, personal notes and scores',async()=>{
 const f=fixture(),ref=await f.api.media.read({path:f.file.path});assert.equal(typeof ref.metadataRevision,'string');
 f.raw=f.raw.replace('pageprogress: 20','pageprogress: 30')+'A later personal paragraph.\r\n';
 const result=await f.api.media.updateMetadata({path:ref.path,revision:ref.metadataRevision,patch:{author:['Known Author'],publisher:'Known Publisher',pagecount:96,isbn:'0140328726'}});
 assert.equal(result.changed,true);assert.deepEqual(Array.from(result.properties.author),['Known Author']);assert.deepEqual(Array.from(result.properties.publisher),['Known Publisher']);assert.equal(result.properties.pageprogress,30);
 assert.ok(f.raw.includes('rating: 0\r\n# Keep the original comment\r\nother: "keep"'));assert.ok(f.raw.endsWith('A later personal paragraph.\r\n'));assert.doesNotMatch(f.raw,/finishedAt|reading_volume/);
 const same=f.raw;assert.equal((await f.api.media.updateMetadata({path:ref.path,revision:result.metadataRevision,patch:{author:['Known Author']}})).changed,false);assert.equal(f.raw,same);
 const cleared=await f.api.media.updateMetadata({path:ref.path,revision:result.metadataRevision,patch:{publisher:null}});assert.equal(cleared.properties.publisher,null);assert.deepEqual(Array.from(cleared.properties.author),['Known Author']);
});

test('metadata revisions guard concurrent facts without blocking independent progress updates',async()=>{
 const f=fixture(),ref=await f.api.media.read({path:f.file.path});
 await f.api.media.updateMetadata({path:ref.path,revision:ref.metadataRevision,patch:{author:'A'}});
 const raw=f.raw;await assert.rejects(f.api.media.updateMetadata({path:ref.path,revision:ref.metadataRevision,patch:{author:'B'}}),e=>e.code==='conflict');assert.equal(f.raw,raw);
 assert.equal((await f.api.media.update({path:ref.path,revision:ref.revision,patch:{pageprogress:40}})).properties.pageprogress,40);
 const current=await f.api.media.read({path:ref.path}),before=f.raw;
 for(const patch of [{rating:5},{status:'已读'},{pageprogress:10},{author:[]},{pagecount:0},{isbn:'9780140328722'}])await assert.rejects(f.api.media.updateMetadata({path:ref.path,revision:current.metadataRevision,patch}),e=>e.code==='invalid-input');
 assert.equal(f.raw,before);
 const game=fixture('game'),g=await game.api.media.read({path:game.file.path});await assert.rejects(game.api.media.updateMetadata({path:g.path,revision:g.metadataRevision,patch:{author:'Someone'}}),e=>e.code==='invalid-input');
});

test('actual MCP metadata update exposes a separate revision and preserves the personal record',async t=>{
 const f=fixture(),connection=createAgentConnection({getApi:()=>f.api,version:'test'});t.after(()=>connection.dispose());
 const endpoint=await connection.start(),client=new Client({name:'media-metadata',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));t.after(()=>client.close());
 const read=(await client.callTool({name:'noria_media_read',arguments:{path:f.file.path}})).structuredContent;
 const result=await client.callTool({name:'noria_media_update_metadata',arguments:{path:read.path,revision:read.metadataRevision,patch:{author:'Known Author',pagecount:96}}});
 assert.equal(result.isError,undefined);assert.deepEqual(result.structuredContent.properties.author,['Known Author']);assert.equal(result.structuredContent.properties.pageprogress,20);assert.equal(parse(f.raw).rating,0);
});


test('book cover edits accept existing vault image references and web URLs',async()=>{
 const f=fixture();
 for(const cover of ['99_Attachment/书籍/封面.jpg','[[99_Attachment/另一版.png|封面]]','https://example.com/cover.jpg']) {
  const ref=await f.api.media.read({path:f.file.path});
  const result=await f.api.media.updateMetadata({path:ref.path,revision:ref.metadataRevision,patch:{cover}});
  assert.equal(result.properties.cover,cover);assert.equal(result.properties.pageprogress,20);
 }
 const ref=await f.api.media.read({path:f.file.path}),raw=f.raw;
 for(const cover of ['../outside.jpg','C:/cover.jpg','file:///C:/cover.jpg','javascript:alert(1)','not-an-image.md']) await assert.rejects(f.api.media.updateMetadata({path:ref.path,revision:ref.metadataRevision,patch:{cover}}),e=>e.code==='invalid-input');
 assert.equal(f.raw,raw);
});

test('film, music and game facts round-trip without changing progress, scores or prose',async()=>{
 for(const [kind,key] of [['movie','director'],['music','artist'],['game','developer']]){
  const f=fixture(kind),before=await f.api.media.read({path:f.file.path});
  f.raw+='Later personal writing.\r\n';
  const saved=await f.api.media.updateMetadata({path:before.path,revision:before.metadataRevision,patch:{[key]:['One','Two','One'],year:'2024',cover:'covers/work.jpg',source:'https://example.com/work'}});
  assert.deepEqual(Array.from(saved.properties[key]),['One','Two']);assert.equal(saved.properties.year,2024);
  assert.match(f.raw,/rating: 0\r\n# Keep the original comment/);assert.ok(f.raw.endsWith('Later personal writing.\r\n'));assert.equal(saved.properties.pageprogress,20);
  assert.equal((await f.api.media.updateMetadata({path:before.path,revision:saved.metadataRevision,patch:{year:2024}})).changed,false);
  const cleared=await f.api.media.updateMetadata({path:before.path,revision:saved.metadataRevision,patch:{[key]:null,year:null}});
  assert.equal(cleared.properties[key],null);assert.equal(cleared.properties.year,null);assert.equal(cleared.properties.source,'https://example.com/work');
 }
});

test('metadata respects media type, validates years and rejects concurrent fact changes',async()=>{
 const f=fixture('movie'),before=await f.api.media.read({path:f.file.path}),raw=f.raw;
 for(const patch of [{developer:'Other'},{artist:'Other'},{author:null},{year:0},{year:10000},{year:2024.5},{year:'unknown'},{director:[]},{source:'javascript:alert(1)'}]){
  await assert.rejects(f.api.media.updateMetadata({path:before.path,revision:before.metadataRevision,patch}),e=>e.code==='invalid-input');assert.equal(f.raw,raw);
 }
 f.raw=f.raw.replace('status:', 'director: "External edit"\r\nstatus:');
 const external=f.raw;
 await assert.rejects(f.api.media.updateMetadata({path:before.path,revision:before.metadataRevision,patch:{year:2024}}),e=>e.code==='conflict');assert.equal(f.raw,external);
 const current=await f.api.media.read({path:f.file.path});
 await f.api.media.update({path:current.path,revision:current.revision,patch:{status:'已看'}});
 const saved=await f.api.media.updateMetadata({path:current.path,revision:current.metadataRevision,patch:{year:2014}});assert.equal(saved.properties.status,'已看');assert.equal(saved.properties.director,'External edit');
});

test('MCP accepts nonbook facts but preserves type boundaries',async t=>{
 const f=fixture('game'),connection=createAgentConnection({getApi:()=>f.api,version:'test'});t.after(()=>connection.dispose());
 const endpoint=await connection.start(),client=new Client({name:'game-metadata',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));t.after(()=>client.close());
 const read=(await client.callTool({name:'noria_media_read',arguments:{path:f.file.path}})).structuredContent;
 const result=await client.callTool({name:'noria_media_update_metadata',arguments:{path:read.path,revision:read.metadataRevision,patch:{developer:'Game studio',year:2024}}});
 assert.equal(result.isError,undefined);assert.deepEqual(result.structuredContent.properties.developer,['Game studio']);assert.equal(result.structuredContent.properties.year,2024);
 const wrong=await client.callTool({name:'noria_media_update_metadata',arguments:{path:read.path,revision:result.structuredContent.metadataRevision,patch:{director:'Other'}}});assert.equal(wrong.isError,true);
});
