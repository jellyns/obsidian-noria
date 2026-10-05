// Bounded NoriaTest settings and live-card acceptance; credentials never leave process memory.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const cli=process.env.OBSIDIAN_CLI||'obsidian',dir='F:/NoriaTest/_acceptance-agent-settings-20260927';
fs.mkdirSync(dir,{recursive:true});
const command=(...args)=>execFileSync(cli,['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`);const i=raw.indexOf('=> ');if(i<0)throw Error(raw);return JSON.parse(raw.slice(i+3));};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<30;i++){if(evaluate(code))return;await wait(100);}throw Error('Timed out: '+code);}
(async()=>{
 const checks=[];let client,owned=false;
 const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
 try{
  evaluate(`const p=app.plugins.plugins.noria;await p.agentIntegration.ready;if(p.agentIntegration.status().enabled||p.agentConnection.status().state!=="stopped")throw Error("Connection in use");
   const win=require("@electron/remote").getCurrentWindow();globalThis.__noriaAgentUiCheck={local:app.loadLocalStorage("noria-agent-connection-v1"),secret:app.secretStorage.getSecret("noria-agent-connection"),win,throttle:win.webContents.getBackgroundThrottling(),home:JSON.parse(JSON.stringify(p.settings.home)),workbench:app.workspace.getLeavesOfType("noria-dashboard-home")[0]?.view.workbench?.state()};win.webContents.setBackgroundThrottling(false);
   app.setting.open();app.setting.openTabById("noria");const tab=app.setting.pluginTabs.find(t=>t.id==="noria");tab.activeTab="overview";tab.display();tab.containerEl.querySelector(".noria-agent-settings").scrollIntoView({block:"center"});return true;`);
  owned=true;
  check('connection settings and search target visible',evaluate('return !!app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector("[data-noria-setting-id=\\"agentConnection.enabled\\"]") && app.plugins.plugins.noria.searchSettingsRegistry("mcp").some(x=>x.id==="agentConnection.enabled");'));
  evaluate('app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector(".noria-agent-settings .checkbox-container").click();return true;');
  await until('return app.plugins.plugins.noria.agentIntegration.status().state==="listening" && app.plugins.plugins.noria.agentIntegration.status().enabled;');
  check('UI toggle starts and remembers connection',true);
  const config=evaluate('return app.plugins.plugins.noria.agentIntegration.clientConfig();').mcpServers.noria;
  check('secret absent from plugin data',evaluate('const p=app.plugins.plugins.noria,token=app.secretStorage.getSecret("noria-agent-connection");return !(await app.vault.adapter.read(".obsidian/plugins/noria/data.json")).includes(token);'));
  evaluate('const s=globalThis.__noriaAgentUiCheck;s.clipboard=require("electron").clipboard.readText();app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelectorAll(".noria-agent-settings button")[0].click();return true;');
  await until('try{return JSON.parse(require("electron").clipboard.readText()).mcpServers?.noria?.headers?.Authorization==="Bearer "+app.secretStorage.getSecret("noria-agent-connection");}catch{return false;}');
  check('copy action produces authenticated client config',true);
  evaluate('app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector(".noria-agent-settings details").open=true;return true;');
  evaluate('const s=globalThis.__noriaAgentUiCheck;s.settingsWin=require("@electron/remote").BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==="about:blank"&&w.getTitle().includes("NoriaTest"));s.settingsThrottle=s.settingsWin.webContents.getBackgroundThrottling();s.settingsWin.webContents.setBackgroundThrottling(false);s.settingsWin.webContents.invalidate();return true;');
  await wait(150);
  evaluate(`require("fs").writeFileSync("${dir}/wide.png",(await globalThis.__noriaAgentUiCheck.settingsWin.webContents.capturePage()).toPNG());return true;`);
  evaluate('const tab=app.setting.pluginTabs.find(t=>t.id==="noria"),s=globalThis.__noriaAgentUiCheck;s.width=tab.containerEl.style.width;tab.containerEl.style.width="390px";return true;');
  check('390px settings do not overflow',evaluate('const e=app.setting.pluginTabs.find(t=>t.id==="noria").containerEl.querySelector(".noria-agent-settings");return e.clientWidth>0&&e.scrollWidth<=e.clientWidth+1;'));
  await wait(150);
  evaluate(`require("fs").writeFileSync("${dir}/narrow.png",(await globalThis.__noriaAgentUiCheck.settingsWin.webContents.capturePage()).toPNG());return true;`);
  evaluate('const tab=app.setting.pluginTabs.find(t=>t.id==="noria");tab.containerEl.style.width=globalThis.__noriaAgentUiCheck.width;const s=globalThis.__noriaAgentUiCheck;s.settingsWin.webContents.setBackgroundThrottling(s.settingsThrottle);app.setting.close();return true;');
  command('plugin:reload','id=noria');
  await until('await app.plugins.plugins.noria.agentIntegration.ready;return app.plugins.plugins.noria.agentIntegration.status().state==="listening";');
  check('reload preserves endpoint and credential',JSON.stringify(evaluate('return app.plugins.plugins.noria.agentIntegration.clientConfig();').mcpServers.noria)===JSON.stringify(config));
  evaluate('await app.plugins.plugins.noria.agentIntegration.resetCredential();return true;');
  check('reset rejects previous credential',(await fetch(config.url,{method:'POST',headers:config.headers})).status===401);
  const next=evaluate('return app.plugins.plugins.noria.agentIntegration.clientConfig();').mcpServers.noria;
  client=new Client({name:'noria-settings-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(next.url),{requestInit:{headers:next.headers}}));
  const fixture=evaluate(`const p=app.plugins.plugins.noria,s=globalThis.__noriaAgentUiCheck,spec=await p.resolveCalendarNoteSpecAsync("daily","2099-12-28");if(await app.vault.adapter.exists(spec.path))throw Error("Fixture exists");await app.vault.create(spec.path,"## 建议\\n\\nBefore MCP update.\\n");s.fixture=spec.path;
   p.settings.home.widgets=[{id:"daily-advice",type:"markdown",enabled:true,order:10,size:"full",title:"建议",props:{sourceMode:"daily-section",heading:"建议",date:"2099-12-28"}}];p.syncRuntimeBridgeConfig();const leaf=await p.openDashboardHomeLeaf();await leaf.view.workbench.refreshHome();return {path:spec.path};`);
  await until('return app.workspace.getLeavesOfType("noria-dashboard-home").some(l=>l.view.hostEl.textContent.includes("Before MCP update."));');
  const before=(await client.callTool({name:'noria_suggestions_read',arguments:{date:'2099-12-28'}})).structuredContent;
  await client.callTool({name:'noria_suggestions_update',arguments:{date:'2099-12-28',revision:before.revision,markdown:'Updated through the external MCP client.'}});
  await until('return app.workspace.getLeavesOfType("noria-dashboard-home").some(l=>l.view.hostEl.textContent.includes("Updated through the external MCP client."));');
  check('external MCP write automatically refreshes visible suggestion card',true);
  check('updated card is rendered Markdown',evaluate('return [...app.workspace.getLeavesOfType("noria-dashboard-home")[0].view.hostEl.querySelectorAll(".dashboard-home-markdown-daily-section-content p")].some(e=>e.textContent==="Updated through the external MCP client.");'));
 }finally{
  if(owned)fs.writeFileSync(dir+'/ui-status.json',JSON.stringify(evaluate('const t=app.setting.pluginTabs.find(t=>t.id==="noria");return {status:t.containerEl.querySelector(".noria-agent-status")?.textContent,buttons:[...t.containerEl.querySelectorAll(".noria-agent-settings button")].map(b=>({text:b.textContent,disabled:b.disabled}))};'),null,2));
  try{await client?.close();}finally{if(owned)evaluate(`const p=app.plugins.plugins.noria,s=globalThis.__noriaAgentUiCheck;await p.agentIntegration.setEnabled(false);if(s.clipboard!==undefined)require("electron").clipboard.writeText(s.clipboard);if(s.settingsWin&&!s.settingsWin.isDestroyed())s.settingsWin.webContents.setBackgroundThrottling(s.settingsThrottle);app.setting.close();
    if(s.fixture){const f=app.vault.getAbstractFileByPath(s.fixture);if(f)await app.vault.delete(f);}p.settings.home=s.home;p.syncRuntimeBridgeConfig();const leaf=app.workspace.getLeavesOfType("noria-dashboard-home")[0];if(leaf){await leaf.view.workbench.refreshHome();if(s.workbench)await leaf.view.workbench.show(s.workbench.page,s.workbench.selection,s.workbench.intent);}
    app.saveLocalStorage("noria-agent-connection-v1",s.local||null);await app.secretStorage.setSecret("noria-agent-connection",s.secret||"");s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaAgentUiCheck;return true;`);}
  fs.writeFileSync(dir+'/results.json',JSON.stringify(checks,null,2));
 }
 console.log(JSON.stringify({checks:checks.length,pass:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
