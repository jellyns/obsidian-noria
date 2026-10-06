const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createAgentConnection } = require('../src/agent-mcp.js');

async function connect(endpoint) {
  const client = new Client({name:'noria-test',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));
  return client;
}
function request(endpoint, patch={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request(endpoint.url,{method:'POST',headers:{Authorization:`Bearer ${endpoint.token}`,...patch.headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
    req.on('error',reject);req.end(patch.body||'{}');
  });
}

test('real MCP client discovers public tools, forwards inputs and preserves business errors', async t => {
  const calls=[];
  const invoke=name=>async args=>{calls.push({name,args});return {ok:true,name};};
  const api={version:1,capabilities:()=>({version:1}),records:{fields:invoke('record-fields'),read:invoke('record-read'),update:invoke('record-update')},tasks:{list:invoke('list'),update:invoke('update')},suggestions:{read:invoke('read'),update:async()=>{throw Object.assign(Error('Source changed'),{code:'conflict'});}},suggestionReplies:{list:invoke('replies-list'),read:invoke('replies-read'),claim:invoke('claim'),respond:invoke('respond')}};
  const connection=createAgentConnection({getApi:()=>api,version:'0.4.6'});
  t.after(()=>connection.dispose());
  assert.equal(connection.status().state,'stopped');
  const endpoint=await connection.start(),client=await connect(endpoint);
  t.after(()=>client.close());
  const listed=await client.listTools();
  assert.deepEqual(listed.tools.map(x=>x.name).sort(),['noria_capabilities','noria_reviews_read','noria_reviews_prepare','noria_media_list','noria_media_lookup','noria_media_create','noria_media_read','noria_media_update','noria_media_update_metadata','noria_tasks_list','noria_tasks_update','noria_suggestions_read','noria_suggestions_update','noria_replies_list','noria_replies_read','noria_replies_claim','noria_replies_respond',...['fields','read','update'].map(n=>'noria_records_'+n),...['list','read','publish','submit','claim','respond'].map(n=>'noria_interactions_'+n)].sort());
  const call=(name,args={})=>client.callTool({name,arguments:args});
  assert.equal((await call('noria_capabilities')).structuredContent.version,1);
  const query={range:{mode:'custom',start:'2026-09-21',end:'2026-09-27'},status:'open'};
  await call('noria_tasks_list',query);
  const change={ref:{path:'Projects/A.md',line:1,rawText:'- [ ] A'},patch:{due:'2026-09-28'}};
  await call('noria_tasks_update',change);
  await call('noria_suggestions_read',{date:'2026-09-27'});
  assert.deepEqual(calls,[{name:'list',args:query},{name:'update',args:change},{name:'read',args:{date:'2026-09-27'}}]);
  const failed=await call('noria_suggestions_update',{date:'2026-09-27',revision:'old',markdown:'New'});
  assert.equal(failed.isError,true);assert.deepEqual(failed.structuredContent.error,{code:'conflict',message:'Source changed'});
  const before=calls.length;
  assert.equal((await call('noria_tasks_update',{...change,patch:{title:'unsupported'}})).isError,true);
  assert.equal((await call('noria_tasks_list',{range:{mode:'custom'}})).isError,true);
  assert.equal(calls.length,before);
  await call('noria_replies_list',{start:'2026-09-29',end:'2026-09-29'});await call('noria_replies_read',{date:'2026-09-29'});
  const ref={conversationId:'conversation-id',replyId:'reply-id-one',replyRevision:'reply-version',sourceRevision:'source-version',requestId:'claim-id-one'};
  await call('noria_replies_claim',{...ref,agent:'Native client'});await call('noria_replies_respond',{...ref,claimId:'claim-id-one',requestId:'response-id-one',markdown:'Done reading.'});
  assert.deepEqual(calls.slice(before).map(c=>c.name),['replies-list','replies-read','claim','respond']);
  await call('noria_records_fields');await call('noria_records_read',{date:'2026-10-06'});
  const record={date:'2026-10-06',fieldId:'exercise',revision:'record-version',value:false};await call('noria_records_update',record);
  assert.deepEqual(calls.slice(-3),[{name:'record-fields',args:undefined},{name:'record-read',args:{date:'2026-10-06'}},{name:'record-update',args:record}]);
  await call('noria_records_update',{...record,value:null});assert.equal(calls.at(-1).args.value,null);
  const recordCalls=calls.length;assert.equal((await call('noria_records_update',{...record,value:[]})).isError,true);assert.equal(calls.length,recordCalls);
});

test('local connection enforces credentials and origin, releases port, rotates credentials on restart', async t => {
  const api={version:1,capabilities:()=>({version:1})};
  const connection=createAgentConnection({getApi:()=>api,version:'1'});
  t.after(()=>connection.dispose());
  const first=await connection.start();
  const port=Number(new URL(first.url).port);
  assert.match(first.url,/^http:\/\/127\.0\.0\.1:/);
  assert.equal(JSON.stringify(connection.status()).includes(first.token),false);
  assert.equal(await request(first,{headers:{Authorization:'Bearer wrong'}}),401);
  assert.equal(await request(first,{headers:{Host:`evil.test:${port}`}}),403);
  assert.equal(await request(first,{headers:{Origin:'https://evil.test'}}),403);
  assert.equal(await request(first,{headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:' '.repeat(1024*1024+1)}),413);
  const competing=createAgentConnection({getApi:()=>api,version:'1'});
  t.after(()=>competing.dispose());
  await assert.rejects(competing.start({port}),{code:'EADDRINUSE'});
  assert.equal(competing.status().state,'error');
  await connection.stop();
  await assert.rejects(request(first));
  const second=await connection.start({port});
  assert.notEqual(second.token,first.token);
  assert.equal(await request(first),401);
  const client=await connect(second);
  assert.equal((await client.callTool({name:'noria_capabilities',arguments:{}})).structuredContent.version,1);
  await client.close();await connection.dispose();
  await assert.rejects(request(second));
  await assert.rejects(connection.start(),/disposed/);
});

test('disposing during queued startup cannot leave a listener or revive the connection', async () => {
  const connection=createAgentConnection({getApi:()=>({version:1}),version:'1'});
  const starting=connection.start();
  const closing=connection.dispose();
  await assert.rejects(starting,/disposed/);await closing;
  assert.deepEqual(connection.status(),{state:'disposed',url:null,error:null});
});
