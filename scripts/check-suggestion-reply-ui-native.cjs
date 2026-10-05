const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const cli=process.env.OBSIDIAN_CLI||'obsidian',dir='F:/NoriaTest/_acceptance-reply-ui-20260928';
const command=(...args)=>execFileSync(cli,['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`);const i=raw.indexOf('=> ');if(i<0)throw Error('Obsidian evaluation failed: '+raw.slice(-1200));return JSON.parse(raw.slice(i+3));};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<35;i++){if(evaluate(code))return;await wait(100);}throw Error('Timed out: '+code);}
const setCard=`const p=app.plugins.plugins.noria,s=globalThis.__noriaReplyUi;p.settings.home.widgets=[{id:"daily-advice",type:"markdown",enabled:true,order:10,size:"full",title:"建议",props:{sourceMode:"daily-section",heading:"建议",date:s.date}}];p.syncRuntimeBridgeConfig();s.leaf=await p.openDashboardHomeLeaf();await s.leaf.view.workbench.refreshHome();`;
const ui='globalThis.__noriaReplyUi.leaf.view.hostEl.querySelector(".noria-suggestion-replies")';
(async()=>{
 const checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};let owned=false;
 fs.mkdirSync(dir,{recursive:true});
 try{
  evaluate(`const p=app.plugins.plugins.noria,win=require("@electron/remote").getCurrentWindow(),dates=["2099-12-27","2099-12-26"],items=[];
   for(const date of dates){const source=await p.api.suggestions.read({date}),record=await p.api.suggestionReplies.read({date});if(await app.vault.adapter.exists(source.path)||await app.vault.adapter.exists(record.path))throw Error("Fixture exists");const key="noria-reply-draft-v1-"+require("crypto").createHash("sha256").update(JSON.stringify([source.path,date])).digest("hex");items.push({date,path:source.path,replies:record.path,key,local:app.loadLocalStorage(key)});}
   globalThis.__noriaReplyUi={items,date:dates[0],draftIndex:app.loadLocalStorage('noria-reply-drafts-v1'),home:JSON.parse(JSON.stringify(p.settings.home)),workbench:app.workspace.getLeavesOfType("noria-dashboard-home")[0]?.view.workbench?.state(),win,throttle:win.webContents.getBackgroundThrottling(),dark:document.body.classList.contains("theme-dark")};win.webContents.setBackgroundThrottling(false);return true;`);owned=true;
  evaluate(`{const p=app.plugins.plugins.noria;for(const item of globalThis.__noriaReplyUi.items){await p.ensureVaultParent(item.path);await app.vault.create(item.path,"## 记录\\n保留记录。\\n\\n## 建议\\n今天先读书，晚些时候散步。\\n");}}${setCard}return true;`);
  await until(`return !!${ui}?.querySelector('.noria-reply-open');`);
  evaluate(`const e=${ui};e.querySelector('.noria-reply-open').click();const input=e.querySelector('textarea');input.value="散步保留，读书明天继续。";input.dispatchEvent(new Event('input',{bubbles:true}));e.querySelector('.noria-reply-actions button').click();return true;`);
  check('collapse retains a local draft',evaluate(`return ${ui}.textContent.includes('草稿')&&${ui}.querySelector('.noria-reply-compose').hidden;`));
  evaluate('await globalThis.__noriaReplyUi.leaf.view.workbench.refreshHome();return true;');
  await until(`return ${ui}?.querySelector('textarea')?.value==="散步保留，读书明天继续。";`);
  check('home refresh restores draft',true);
  evaluate(`globalThis.__noriaReplyUi.date="2099-12-26";${setCard}return true;`);
  await until(`return !!${ui}?.querySelector('textarea');`);
  check('different date has its own empty draft',evaluate(`return ${ui}.querySelector('textarea').value==='';`));
  command('plugin:reload','id=noria');
  evaluate(`globalThis.__noriaReplyUi.date="2099-12-27";${setCard}return true;`);
  await until(`return ${ui}?.querySelector('textarea')?.value==="散步保留，读书明天继续。";`);
  check('plugin reload restores local draft',true);
  evaluate(`const s=globalThis.__noriaReplyUi,p=app.plugins.plugins.noria;s.injectedPlugin=p;s.originalWrite=p.processTextAtVaultPath;p.processTextAtVaultPath=async function(path,...args){if(path===s.items[0].replies)throw Error("Acceptance storage failure");return s.originalWrite.call(this,path,...args);};const e=${ui};e.querySelector('.noria-reply-open').click();e.querySelector('.mod-cta').click();return true;`);
  await until(`return ${ui}?.querySelector('.is-error')?.textContent.includes('保存未确认');`);
  check('save failure retains input and reports failure',evaluate(`return ${ui}.querySelector('textarea').value==='散步保留，读书明天继续。'&&!(await app.vault.adapter.exists(globalThis.__noriaReplyUi.items[0].replies));`));
  await until(`return !${ui}?.querySelector('.mod-cta')?.disabled;`);
  evaluate(`const s=globalThis.__noriaReplyUi;s.injectedPlugin.processTextAtVaultPath=s.originalWrite;s.injectedPlugin=null;const e=${ui},input=e.querySelector('textarea');s.keyProbe={};input.addEventListener('keydown',event=>{s.keyProbe.key=event.key;s.keyProbe.ctrl=event.ctrlKey;s.keyProbe.composing=event.isComposing;},{capture:true,once:true});e.querySelector('.mod-cta').addEventListener('click',()=>{s.keyProbe.click=true;},{capture:true,once:true});input.focus();s.win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter',modifiers:['control']});s.win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter',modifiers:['control']});return true;`);
  await until(`return ${ui}?.textContent.includes('已保存 · 待领取');`);
  check('save writes Markdown and updates the card without an Agent receipt',evaluate(`const r=await app.plugins.plugins.noria.api.suggestionReplies.read({date:"2099-12-27"});return r.replies.length===1&&r.replies[0].state==='saved'&&${ui}.querySelector('textarea').value==='';`));
  check('keyboard save leaves history collapsed and its toggle exposes the saved supplement',evaluate(`const e=${ui},button=e.querySelector('.noria-reply-history-toggle'),history=e.querySelector('.noria-reply-history');if(!history.hidden||button.getAttribute('aria-expanded')!=='false')return false;button.click();const shown=!history.hidden&&button.getAttribute('aria-expanded')==='true'&&history.textContent.includes('散步保留，读书明天继续。');button.click();return shown&&history.hidden;`));
  evaluate(`const e=${ui};e.querySelector('.noria-reply-open').click();const input=e.querySelector('textarea');input.value="不要调整其他安排。";input.dispatchEvent(new Event('input',{bubbles:true}));const s=globalThis.__noriaReplyUi;await app.vault.modify(app.vault.getAbstractFileByPath(s.items[0].path),"## 建议\\n人工更新后的建议。\\n");await s.leaf.view.workbench.refreshHome();return true;`);
  await until(`return ${ui}?.querySelector('.noria-reply-conflict')?.hidden===false;`);
  check('changed source keeps draft and requires context review',evaluate(`const e=${ui};return e.querySelector('textarea').value==='不要调整其他安排。'&&e.querySelector('.mod-cta').disabled;`));
  evaluate(`const e=${ui};e.querySelector('.noria-reply-conflict').open=true;e.querySelector('.noria-reply-conflict button').click();return true;`);
  check('explicit context review enables saving',evaluate(`return !${ui}.querySelector('.mod-cta').disabled;`));
  evaluate(`const s=globalThis.__noriaReplyUi,r=s.leaf.view.hostEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/wide.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.min(850,Math.ceil(r.height))})).toPNG());s.width=s.leaf.view.hostEl.style.width;s.leaf.view.hostEl.style.width='390px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');return true;`);
  await wait(150);
  check('390px reply controls have no horizontal overflow',evaluate(`const e=${ui};return e.clientWidth>0&&e.scrollWidth<=e.clientWidth+1;`));
  evaluate(`const s=globalThis.__noriaReplyUi,r=s.leaf.view.hostEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/narrow-dark.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.min(850,Math.ceil(r.height))})).toPNG());return true;`);
  check('initial reply read failure stays local and offers retry',evaluate(`const s=globalThis.__noriaReplyUi,p=app.plugins.plugins.noria;s.originalApi=p.api;s.probe=document.body.createDiv();s.probe.createDiv({text:'Keep the rendered suggestion',cls:'probe-source'});p.api={...p.api,suggestions:{...p.api.suggestions,read:async()=>{throw Error('Acceptance read failure');}}};try{s.probeCleanup=await p.buildRuntimeBridgeConfig().runtime.renderSuggestionReplies(s.probe,{heading:'建议',date:s.items[1].date,path:s.items[1].path,markdown:'An older displayed suggestion'});}finally{p.api=s.originalApi;s.originalApi=null;}return s.probe.textContent.includes('补充暂时无法读取')&&s.probe.querySelector('.probe-source').textContent==='Keep the rendered suggestion';`));
  evaluate(`globalThis.__noriaReplyUi.probe.querySelector('button').click();return true;`);
  await until(`return !!globalThis.__noriaReplyUi.probe.querySelector('.noria-reply-open');`);
  check('retry detects a source changed since the main content was rendered',evaluate(`const e=globalThis.__noriaReplyUi.probe;e.querySelector('.noria-reply-open').click();const input=e.querySelector('textarea');input.value='A new reply';input.dispatchEvent(new Event('input',{bubbles:true}));return !e.querySelector('.noria-reply-conflict').hidden&&e.querySelector('.mod-cta').disabled;`));
 }catch(error){
  if(owned)fs.writeFileSync(dir+'/diagnostic.json',JSON.stringify(evaluate(`const e=${ui};return {probe:globalThis.__noriaReplyUi.keyProbe,text:e?.textContent,saveDisabled:e?.querySelector('.mod-cta')?.disabled,input:e?.querySelector('textarea')?.value,record:await app.plugins.plugins.noria.api.suggestionReplies.read({date:'2099-12-27'})};`),null,2));
  throw error;
 }finally{
  if(owned)evaluate(`const s=globalThis.__noriaReplyUi,p=app.plugins.plugins.noria;if(s.originalApi)p.api=s.originalApi;s.probeCleanup?.();s.probe?.remove();if(s.injectedPlugin)s.injectedPlugin.processTextAtVaultPath=s.originalWrite;document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);if(s.leaf&&s.width!==undefined)s.leaf.view.hostEl.style.width=s.width;
   p.settings.home=s.home;p.syncRuntimeBridgeConfig();if(s.leaf){await s.leaf.view.workbench.refreshHome();if(s.workbench)await s.leaf.view.workbench.show(s.workbench.page,s.workbench.selection,s.workbench.intent);}for(const item of s.items){p._suggestionReplyDrafts?.delete(item.key);app.saveLocalStorage(item.key,item.local||null);for(const path of [item.replies,item.path]){const f=app.vault.getAbstractFileByPath(path);if(f)await app.vault.delete(f);}}app.saveLocalStorage('noria-reply-drafts-v1',s.draftIndex||null);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaReplyUi;return true;`);
  fs.writeFileSync(dir+'/results.json',JSON.stringify(checks,null,2));
 }
 console.log(JSON.stringify({checks:checks.length,pass:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
