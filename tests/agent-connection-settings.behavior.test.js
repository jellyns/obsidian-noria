const test=require('node:test'),assert=require('node:assert/strict');
const {createAgentConnection}=require('../src/agent-mcp.js');
const {createAgentConnectionSettings,LOCAL_KEY,SECRET_KEY}=require('../src/agent-connection-settings.js');
function fixture(){
  const local=new Map(),secrets=new Map();let failSave=false,failSecret=false;
  const app={loadLocalStorage:k=>local.get(k),saveLocalStorage(k,v){if(!failSave)local.set(k,structuredClone(v));},secretStorage:{getSecret:k=>secrets.get(k),setSecret(k,v){if(failSecret){failSecret=false;throw Error('secret unavailable');}secrets.set(k,v);}}};
  const create=()=>{const transport=createAgentConnection({getApi:()=>({version:1,capabilities:()=>({version:1})}),version:'1'});return {transport,service:createAgentConnectionSettings(app,transport)};};
  return {app,local,secrets,create,setFailSave:v=>failSave=v,setFailSecret:v=>failSecret=v};
}
test('local settings persist enabled port and separate secret across reload; reset invalidates old config',async t=>{
  const f=fixture(),first=f.create();t.after(()=>first.service.dispose());await first.service.ready;
  assert.equal(first.service.status().state,'stopped');assert.equal(f.secrets.size,0);
  await first.service.setEnabled(true);
  const original=first.service.clientConfig().mcpServers.noria;
  assert.equal(f.local.get(LOCAL_KEY).enabled,true);
  assert.ok(f.local.get(LOCAL_KEY).port>0);
  assert.ok(!JSON.stringify([...f.local]).includes(f.secrets.get(SECRET_KEY)));
  await first.service.dispose();
  const next=f.create();t.after(()=>next.service.dispose());await next.service.ready;
  assert.deepEqual(next.service.clientConfig().mcpServers.noria,original);
  await next.service.resetCredential();
  const reset=next.service.clientConfig().mcpServers.noria;
  assert.equal(reset.url,original.url);assert.notEqual(reset.headers.Authorization,original.headers.Authorization);
  assert.equal((await fetch(reset.url,{method:'POST',headers:original.headers})).status,401);
  await next.service.setEnabled(false);assert.equal(next.service.status().state,'stopped');assert.equal(f.local.get(LOCAL_KEY).enabled,false);
  assert.throws(()=>next.service.clientConfig(),/connection-not-running/);
});
test('failed settings save leaves no listener, and failed secret reset restores the existing connection',async t=>{
  const f=fixture(),{service}=f.create();t.after(()=>service.dispose());await service.ready;
  f.setFailSave(true);await assert.rejects(service.setEnabled(true),/preferences-save-failed/);
  assert.equal(service.status().enabled,false);assert.equal(service.status().state,'stopped');
  f.setFailSave(false);await service.setEnabled(true);const before=service.clientConfig();
  f.setFailSecret(true);await assert.rejects(service.resetCredential(),/secret unavailable/);
  assert.deepEqual(service.clientConfig(),before);assert.equal(service.status().state,'listening');
  await service.setEnabled(false);await service.setPort(0);assert.equal(service.status().port,0);
});
test('unavailable storage and invalid port cannot silently enable a connection',async t=>{
  const f=fixture();delete f.app.secretStorage;const {service}=f.create();t.after(()=>service.dispose());await service.ready;
  assert.equal(service.status().available,false);assert.equal(service.status().state,'stopped');
  await assert.rejects(service.setEnabled(true),/storage-unavailable/);assert.equal(f.local.size,0);
  const healthy=fixture().create();t.after(()=>healthy.service.dispose());await healthy.service.ready;
  await assert.rejects(healthy.service.setPort(70000),/invalid-port/);assert.equal(healthy.service.status().port,0);
});

test('invalid credentials can be reset, and a saved enable can be disabled without secret storage',async t=>{
  const f=fixture();f.secrets.set(SECRET_KEY,'invalid');f.local.set(LOCAL_KEY,{enabled:true,port:0});
  const {service}=f.create();t.after(()=>service.dispose());await service.ready;
  assert.equal(service.status().error,'credential-invalid');
  await service.resetCredential();assert.equal(service.status().state,'listening');assert.ok(service.clientConfig());
  delete f.app.secretStorage;
  await service.setEnabled(false);assert.equal(service.status().state,'stopped');assert.equal(f.local.get(LOCAL_KEY).enabled,false);
});
