// Real Codex config parsing and MCP discovery, without a model turn or user-config changes.
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),{execFileSync,spawn}=require('node:child_process');
const readline=require('node:readline');
const cli=process.env.OBSIDIAN_CLI||'obsidian',codex=process.env.CODEX_BINARY;
if(!codex||!fs.existsSync(codex))throw Error('Set CODEX_BINARY to the native Codex executable');
const dir='F:/NoriaTest/_acceptance-agent-codex-20260927';
const evaluate=code=>{const raw=execFileSync(cli,['vault=NoriaTest','eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`],{encoding:'utf8',timeout:30000,windowsHide:true});const i=raw.indexOf('=> ');if(i<0)throw Error('Obsidian evaluation failed');return JSON.parse(raw.slice(i+3));};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(code){for(let i=0;i<25;i++){if(evaluate(code))return;await wait(100);}throw Error('Native condition timed out');}
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const temporary=fs.mkdtempSync(path.join(dir,'client-'));
 const checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
 let owned=false,proc,reader,version;
 const pending=new Map();let nextId=0;
 try{
  evaluate(`const p=app.plugins.plugins.noria;await p.agentIntegration.ready;if(p.agentIntegration.status().enabled||p.agentConnection.status().state!=="stopped")throw Error("Connection already in use");
   globalThis.__noriaCodexCheck={local:app.loadLocalStorage("noria-agent-connection-v1"),secret:app.secretStorage.getSecret("noria-agent-connection"),clipboard:require("electron").clipboard.readText()};return true;`);owned=true;
  evaluate(`await app.plugins.plugins.noria.agentIntegration.setEnabled(true);app.setting.open();app.setting.openTabById("noria");const tab=app.setting.pluginTabs.find(t=>t.id==="noria");tab.activeTab="overview";tab.display();
   const select=tab.containerEl.querySelector(".noria-agent-settings select");select.value="codex";select.dispatchEvent(new select.ownerDocument.defaultView.Event("change",{bubbles:true}));return true;`);
  await until('return app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector(".noria-agent-settings").textContent.includes("config.toml");');
  evaluate('app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector(".noria-agent-settings button").click();return true;');
  await until('return require("electron").clipboard.readText()===app.plugins.plugins.noria.agentIntegration.clientConfig("codex");');
  const config=evaluate('return {text:require("electron").clipboard.readText()};').text;
  check('native format selector copies Codex TOML',config.startsWith('[mcp_servers.noria]\n'));
  check('configuration explains replacement of existing section',evaluate('return app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector(".noria-agent-settings").textContent.includes("config.toml");'));
  // Only this child process uses an isolated Codex home; no existing config or auth is copied.
  fs.writeFileSync(path.join(temporary,'config.toml'),config,{mode:0o600});
  const env={...process.env,CODEX_HOME:temporary};
  version=execFileSync(codex,['--version'],{encoding:'utf8',windowsHide:true}).trim();
  const parsed=JSON.parse(execFileSync(codex,['mcp','get','noria','--json'],{cwd:temporary,env,encoding:'utf8',windowsHide:true,timeout:15000}));
  const expected=evaluate('return app.plugins.plugins.noria.agentIntegration.clientConfig().mcpServers.noria;');
  check('installed Codex parses endpoint and authorization',parsed.transport.url===expected.url&&parsed.transport.http_headers.Authorization===expected.headers.Authorization);
  proc=spawn(codex,['app-server'],{cwd:temporary,env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  proc.stderr.resume(); // Never persist server logs, which may contain configuration details.
  reader=readline.createInterface({input:proc.stdout});
  reader.on('line',line=>{let msg;try{msg=JSON.parse(line);}catch{return;}const entry=pending.get(msg.id);if(!entry)return;pending.delete(msg.id);clearTimeout(entry.timer);msg.error?entry.reject(Error('Codex RPC failed: '+msg.error.code)):entry.resolve(msg.result);});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('Codex RPC timeout: '+method));},25000);pending.set(id,{resolve,reject,timer});proc.stdin.write(JSON.stringify({id,method,params})+'\n');});
  await rpc('initialize',{clientInfo:{name:'noria_acceptance',version:'1'}});
  proc.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
  const status=await rpc('mcpServerStatus/list',{detail:'toolsAndAuthOnly'});
  const server=status.data.find(item=>item.name==='noria');
  check('real Codex authenticates and discovers all fifteen Noria tools',!!server&&Object.keys(server.tools).length===15&&['noria_capabilities','noria_tasks_list','noria_tasks_update','noria_suggestions_read','noria_suggestions_update'].every(key=>server.tools[key]));
  evaluate(`const tab=app.setting.pluginTabs.find(t=>t.id==="noria"),s=globalThis.__noriaCodexCheck;s.width=tab.containerEl.style.width;s.settingsWin=require("@electron/remote").BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==="about:blank"&&w.getTitle().includes("NoriaTest"));s.throttle=s.settingsWin.webContents.getBackgroundThrottling();s.settingsWin.webContents.setBackgroundThrottling(false);tab.containerEl.querySelector(".noria-agent-settings").scrollIntoView({block:"center"});return true;`);
  await wait(150);
  evaluate(`require("fs").writeFileSync("${dir}/wide.png",(await globalThis.__noriaCodexCheck.settingsWin.webContents.capturePage()).toPNG());return true;`);
  evaluate('app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.style.width="390px";return true;');
  check('format controls fit 390px settings',evaluate('const e=app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector(".noria-agent-settings");return e.clientWidth>0&&e.scrollWidth<=e.clientWidth+1;'));
  await wait(150);
  evaluate(`require("fs").writeFileSync("${dir}/narrow.png",(await globalThis.__noriaCodexCheck.settingsWin.webContents.capturePage()).toPNG());return true;`);
 }finally{
  // Sanitize before any cleanup that might fail. Diagnostic runtime files may be retained.
  fs.writeFileSync(path.join(temporary,'config.toml'),'# Acceptance finished; credential removed.\n');
  for(const entry of pending.values())clearTimeout(entry.timer);
  reader?.close();
  if(proc&&proc.exitCode===null){const stopped=new Promise(resolve=>proc.once('exit',resolve));proc.stdin.end();const timer=setTimeout(()=>proc.kill(),2000);await stopped;clearTimeout(timer);}
  if(owned)evaluate(`const p=app.plugins.plugins.noria,s=globalThis.__noriaCodexCheck;await p.agentIntegration.setEnabled(false);require("electron").clipboard.writeText(s.clipboard);const tab=app.setting.pluginTabs.find(t=>t.id==="noria");if(s.width!==undefined)tab.containerEl.style.width=s.width;if(s.settingsWin&&!s.settingsWin.isDestroyed())s.settingsWin.webContents.setBackgroundThrottling(s.throttle);app.setting.close();app.saveLocalStorage("noria-agent-connection-v1",s.local||null);await app.secretStorage.setSecret("noria-agent-connection",s.secret||"");delete globalThis.__noriaCodexCheck;return true;`);
  fs.writeFileSync(dir+'/results.json',JSON.stringify({version,checks},null,2));
 }
 console.log(JSON.stringify({checks:checks.length,pass:true,version}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
