// Run only against the isolated NoriaTest vault. No credentials are written to disk.
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {Client} = require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const cli = process.env.OBSIDIAN_CLI || 'obsidian';
function command(...args) { return execFileSync(cli,['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true}); }
function evaluate(code) {
  const output=command('eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`);
  const start=output.indexOf('=> ');
  if(start<0)throw Error(output);
  return JSON.parse(output.slice(start+3));
}
async function clientFor(endpoint) {
  const client=new Client({name:'noria-native-check',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));
  return client;
}

(async()=>{
  const checks=[];let client,created=false,ownedConnection=false;
  const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
  try {
    const setup=evaluate(`const p=app.plugins.plugins.noria;if(p.agentConnection.status().state!=="stopped")throw Error("Connection already active");
      const spec=await p.resolveCalendarNoteSpecAsync("daily","2099-12-28");if(await app.vault.adapter.exists(spec.path))throw Error("Fixture already exists");
      await app.vault.create(spec.path,"## 记录\\n\\n- [ ] MCP native check [due:: 2099-12-28]\\n\\n## 建议\\n\\nOriginal suggestion.\\n\\n## 保留\\n\\nKeep this section.\\n");
      p.invalidateTaskSnapshots("tasks");return {path:spec.path};`);
    created=true;
    const endpoint=evaluate('return await app.plugins.plugins.noria.agentConnection.start();');
    ownedConnection=true;
    client=await clientFor(endpoint);
    const tools=await client.listTools();check('bundled Obsidian endpoint advertises eighteen tools',tools.tools.length===18);
    const call=(name,args={})=>client.callTool({name,arguments:args});
    check('capability discovery uses live API',(await call('noria_capabilities')).structuredContent.version===1);
    const result=await call('noria_tasks_list',{range:{mode:'custom',start:'2099-12-28',end:'2099-12-29'},status:'open'});
    const task=result.structuredContent?.items.find(t=>t.ref?.path===setup.path);
    check('real task query supplies source ref',!!task?.ref);
    const written=await call('noria_tasks_update',{ref:task.ref,patch:{due:'2099-12-29'}});
    check('real task update succeeds',written.structuredContent?.changed===true);
    const stale=await call('noria_tasks_update',{ref:task.ref,patch:{due:'2099-12-30'}});
    check('stale write returns conflict',stale.isError&&stale.structuredContent.error.code==='conflict');
    const before=(await call('noria_suggestions_read',{date:'2099-12-28'})).structuredContent;
    check('suggestions read returns section and revision',before.markdown==='Original suggestion.'&&!!before.revision);
    const update=await call('noria_suggestions_update',{date:'2099-12-28',revision:before.revision,markdown:'Move the task to tomorrow.'});
    check('suggestion update succeeds',update.structuredContent?.changed===true);
    const source=evaluate(`const p=app.plugins.plugins.noria,spec=await p.resolveCalendarNoteSpecAsync("daily","2099-12-28");return {text:await p.loadTextFromVault(spec.path)};`).text;
    check('disk source has both writes and preserved surroundings',source.includes('due:: 2099-12-29')&&source.includes('Move the task to tomorrow.')&&source.includes('Keep this section.')&&!source.includes('2099-12-30'));
    await client.close();client=null;
    command('plugin:reload','id=noria');
    check('plugin reload leaves connection stopped',evaluate('return app.plugins.plugins.noria.agentConnection.status();').state==='stopped');
    await assert.rejects(fetch(endpoint.url));check('plugin reload releases previous listener',true);
    const next=evaluate('return await app.plugins.plugins.noria.agentConnection.start();');
    client=await clientFor(next);check('new plugin instance accepts reconnection',(await client.listTools()).tools.length===18&&next.token!==endpoint.token);
  } finally {
    try {if(client)await client.close();} finally {
      try {if(ownedConnection)evaluate('await app.plugins.plugins.noria.agentConnection.stop();return {ok:true};');} finally {
        if(created)evaluate(`const p=app.plugins.plugins.noria,spec=await p.resolveCalendarNoteSpecAsync("daily","2099-12-28"),f=app.vault.getAbstractFileByPath(spec.path);if(f)await app.vault.delete(f);p.invalidateTaskSnapshots("tasks");return {ok:true};`);
        fs.mkdirSync('F:/NoriaTest/_acceptance-agent-mcp-20260927',{recursive:true});
        fs.writeFileSync('F:/NoriaTest/_acceptance-agent-mcp-20260927/results.json',JSON.stringify(checks,null,2));
      }
    }
  }
  console.log(JSON.stringify({checks:checks.length,pass:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
