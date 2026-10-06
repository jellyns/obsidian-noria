const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi}=require('../src/public-api.js');
const {normalizeReviewSelection}=require('../src/review-center-core.js');
const {createAgentConnection}=require('../src/agent-mcp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');

function fixture(){
 const notes=new Map(),reads=[],prepared=[];
 const target=selection=>`Custom/${selection.mode}/${selection.period}.md`;
 const analysis=selection=>target(selection).replace('.md',selection.mode==='yearly'?`-review-${selection.yearlyVariant}.md`:'-review.md');
 const plugin={
  getReviewFinalTarget:async selection=>({selection,targetPath:target(selection),exists:notes.has(target(selection))}),
  getReviewFinalSectionHeading:()=> 'Review',
  resolveReviewAnalysisArtifactPath:async selection=>analysis(selection),
  loadTextFromVault:async path=>{reads.push(path);return notes.get(path)||'';},
  loadReviewRecoveryEntry:()=>{throw Error('Private recovery must not be read');},
  prepareReviewAnalysis:async selection=>{prepared.push(selection);return {ok:true,selection,evidence:{evidenceHash:'evidence-A'},evidencePath:'cache/evidence.json',readingPath:'cache/evidence.material.json',promptPath:'cache/prompt.md',artifactPath:analysis(selection),prompt:'Read these records and write the analysis artifact.',material:{exportKind:'noria.reviewMaterial',exportVersion:1,payload:{mode:selection.mode,period:selection.period,records:[{path:'Custom/source.md',text:'Author prose'}]}}};}
 };
 return {plugin,api:createPublicApi(plugin),notes,reads,prepared,target,analysis};
}

test('review reads preserve configured periods and expose saved content without recovery or unrelated prose',async()=>{
 const f=fixture();
 for(const [mode,anchorDate,period] of [['daily','2026-10-06','2026-10-06'],['weekly','2026-01-01','2026-W01'],['monthly','2026-10-06','2026-10'],['yearly','2026-10-06','2026']]){
  const request={mode,anchorDate},selection=normalizeReviewSelection(request);
  assert.equal(selection.period,period);
  f.notes.set(f.target(selection),'## Other\nUnrelated prose\n\n%% noria:review:start %%\n## Review\n\nSaved reflection.\n%% noria:review:end %%\n\n## Later\nOther record.');
  f.notes.set(f.analysis(selection),'## External analysis\nSeparate proposal.');
  const read=await f.api.reviews.read(request);
  assert.equal(read.selection.period,period);assert.equal(read.path,f.target(selection));assert.equal(read.exists,true);
  assert.equal(read.markdown,'## Review\n\nSaved reflection.');assert.equal(read.analysis.markdown,'## External analysis\nSeparate proposal.');
  assert.deepEqual(f.reads.splice(0),[f.target(selection),f.analysis(selection)]);
  f.notes.set(f.target(selection),f.notes.get(f.target(selection)).replace('Unrelated prose','Changed elsewhere'));
  assert.equal((await f.api.reviews.read(request)).revision,read.revision);
  f.notes.set(f.target(selection),f.notes.get(f.target(selection)).replace('Saved reflection.','Updated reflection.'));
  assert.notEqual((await f.api.reviews.read(request)).revision,read.revision);f.reads.length=0;
 }
 const empty=await f.api.reviews.read({mode:'daily',anchorDate:'2026-10-07'});
 assert.equal(empty.exists,false);assert.equal(empty.noteExists,false);assert.equal(empty.markdown,'');assert.equal(empty.analysis.exists,false);
 assert.equal(f.notes.size,8);assert.equal(f.prepared.length,0);
});

test('review requests reject ambiguous dates and modes before reading, and report malformed review boundaries',async()=>{
 const f=fixture();
 for(const request of [{},{mode:'other',anchorDate:'2026-10-06'},{mode:'daily',anchorDate:'2026-02-30'},{mode:'weekly',anchorDate:'2026-10-06',period:'2026-W01'},{mode:'daily',anchorDate:'2026-10-06',path:'Elsewhere.md'},{mode:'yearly',anchorDate:'2026-10-06',yearlyVariant:'day'}]){
  await assert.rejects(f.api.reviews.read(request),e=>e.code==='invalid-input');await assert.rejects(f.api.reviews.prepare(request),e=>e.code==='invalid-input');
 }
 assert.equal(f.reads.length,0);assert.equal(f.prepared.length,0);
 f.notes.set('Custom/daily/2026-10-06.md','%% noria:review:start %%\nMissing end');
 await assert.rejects(f.api.reviews.read({mode:'daily',anchorDate:'2026-10-06'}),e=>e.code==='conflict');
 f.plugin._noriaPluginDisposed=true;await assert.rejects(f.api.reviews.prepare({mode:'daily',anchorDate:'2026-10-06'}),e=>e.code==='unsupported');
});

test('MCP review preparation returns the actual material and prompt without writing final review or invoking an Agent',async t=>{
 const f=fixture(),connection=createAgentConnection({getApi:()=>f.api,version:'1'});t.after(()=>connection.dispose());
 const endpoint=await connection.start(),client=new Client({name:'review-api-test',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));t.after(()=>client.close());
 const listed=await client.listTools();assert.equal(listed.tools.find(x=>x.name==='noria_reviews_read').annotations.readOnlyHint,true);assert.equal(listed.tools.find(x=>x.name==='noria_reviews_prepare').annotations.readOnlyHint,false);
 const args={mode:'yearly',anchorDate:'2026-10-06',yearlyVariant:'week'};
 const read=(await client.callTool({name:'noria_reviews_read',arguments:args})).structuredContent;assert.equal(read.selection.period,'2026');assert.equal(read.analysis.path,'Custom/yearly/2026-review-week.md');
 const result=(await client.callTool({name:'noria_reviews_prepare',arguments:args})).structuredContent;
 assert.equal(result.material.payload.records[0].text,'Author prose');assert.match(result.prompt,/Read these records/);assert.equal(result.evidenceHash,'evidence-A');assert.equal(result.readingPath,'cache/evidence.material.json');assert.equal(result.artifactPath,read.analysis.path);
 assert.equal(f.notes.size,0);assert.equal(f.prepared.length,1);assert.equal(f.prepared[0].yearlyVariant,'week');
});
