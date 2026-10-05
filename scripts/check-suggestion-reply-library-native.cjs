const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const cli=process.env.OBSIDIAN_CLI||'obsidian',dir='F:/NoriaTest/_acceptance-reply-library-20260928';
const command=(...args)=>execFileSync(cli,['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`),i=raw.indexOf('=> ');if(i<0)throw Error(raw.slice(-1200)+'\nDuring: '+code.slice(0,700));return JSON.parse(raw.slice(i+3));};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<35;i++){if(evaluate(code))return;await wait(100);}throw Error('Timed out: '+code);}
const ui=`globalThis.__replyLibraryCheck.leaf.view.hostEl.querySelector('.noria-suggestion-replies')`;
const list=`document.querySelector('.noria-reply-library')`;
const showCard=`const s=globalThis.__replyLibraryCheck,p=app.plugins.plugins.noria;p.settings.home.widgets=[{id:'daily-advice',type:'markdown',enabled:true,order:10,size:'full',title:'建议',props:{sourceMode:'daily-section',heading:'建议',date:s.items[0].date}}];p.syncRuntimeBridgeConfig();s.leaf=await p.openDashboardHomeLeaf();await s.leaf.view.workbench.refreshHome();`;
(async()=>{
 const checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};let owned=process.argv.includes('--restore');
 fs.mkdirSync(dir,{recursive:true});
 try{
  if(owned)return;
  evaluate(`if(${list})throw Error('A replies dialog is already open');const p=app.plugins.plugins.noria,items=[];
   for(const date of ['2099-12-23','2099-12-22']){const source=await p.api.suggestions.read({date}),r=await p.api.suggestionReplies.read({date}),key='noria-reply-draft-v1-'+require('crypto').createHash('sha256').update(JSON.stringify([source.path,date])).digest('hex');if(await app.vault.adapter.exists(source.path)||await app.vault.adapter.exists(r.path))throw Error('Fixture exists');items.push({date,path:source.path,record:r.path,key,local:app.loadLocalStorage(key)});}
   const win=require('@electron/remote').getCurrentWindow();globalThis.__replyLibraryCheck={items,home:JSON.parse(JSON.stringify(p.settings.home)),root:p.settings.onboarding.workspaceRoot,index:app.loadLocalStorage('noria-reply-drafts-v1'),workbench:app.workspace.getLeavesOfType('noria-dashboard-home')[0]?.view.workbench?.state(),win,throttle:win.webContents.getBackgroundThrottling(),dark:document.body.classList.contains('theme-dark')};win.webContents.setBackgroundThrottling(false);return true;`);owned=true;
  evaluate(`{const s=globalThis.__replyLibraryCheck,p=app.plugins.plugins.noria;for(const item of s.items){await p.ensureVaultParent(item.path);await app.vault.create(item.path,'## 建议\\n保留散步，读书稍后继续。\\n');}const source=await p.api.suggestions.read({date:s.items[0].date});await p.api.suggestionReplies.submit({date:source.date,sourcePath:source.path,sourceRevision:source.revision,requestId:'recovery-check-first',markdown:'今天先完成阅读。'});s.saved=await app.vault.read(app.vault.getAbstractFileByPath(s.items[0].record));}${showCard}return true;`);
  await until(`return !!${ui}?.querySelector('textarea');`);
  evaluate(`const e=${ui};e.querySelector('.noria-reply-open').click();const input=e.querySelector('textarea');input.value='散步保留，不要删除这份草稿。';input.dispatchEvent(new Event('input',{bubbles:true}));e.querySelector('button[aria-label="交流与草稿"]').click();return true;`);
  await until(`return ${list}?.textContent.includes('2099-12-23');`);
  check('card history entry lists saved conversation and local draft',evaluate(`return ${list}.textContent.includes('交流 · 1 条')&&${list}.textContent.includes('本机草稿');`));
  evaluate(`const row=[...${list}.querySelectorAll('.noria-reply-library-item')].find(e=>e.textContent.includes('2099-12-23'));row.querySelector('details').open=true;row.querySelector('.mod-cta').click();return true;`);
  await until(`return ${list}?.querySelector('.noria-suggestion-replies textarea')?.value==='散步保留，不要删除这份草稿。';`);
  check('available source resumes the same draft',true);
  evaluate(`document.querySelector('.noria-reply-library').closest('.modal').querySelector('.modal-header-button').click();const s=globalThis.__replyLibraryCheck;await app.vault.delete(app.vault.getAbstractFileByPath(s.items[0].path));return true;`);
  command('plugin:reload','id=noria');
  evaluate(`app.commands.executeCommandById('noria:open-reply-library');return true;`);
  await until(`return ${list}?.textContent.includes('来源已移走或删除');`);
  check('deleted source remains recoverable after plugin reload without rebinding',evaluate(`const e=${list};return e.querySelector('textarea').value==='散步保留，不要删除这份草稿。'&&!e.querySelector('.mod-cta')&&!(await app.vault.adapter.exists(globalThis.__replyLibraryCheck.items[0].path));`));
  evaluate(`const s=globalThis.__replyLibraryCheck,p=app.plugins.plugins.noria;await app.vault.create(s.items[0].path,'## 建议\\n保留散步，读书稍后继续。\\n');s.originalResolve=p.resolveCalendarNoteSpecAsync;s.resolvePlugin=p;p.resolveCalendarNoteSpecAsync=async function(kind,date){return date===s.items[0].date?{path:'DifferentDiary/'+date+'.md'}:s.originalResolve.call(this,kind,date);};p.settings.onboarding.workspaceRoot='ChangedWorkspace';${list}.querySelector('button').click();return true;`);
  await until(`return ${list}?.textContent.includes('当前日记位置已改变');`);
  check('changed diary and workspace roots retain the old record without offering submission',evaluate(`return ${list}.textContent.includes('交流 · 1 条')&&!${list}.querySelector('.mod-cta');`));
  evaluate(`const s=globalThis.__replyLibraryCheck;s.resolvePlugin.resolveCalendarNoteSpecAsync=s.originalResolve;s.resolvePlugin=null;app.plugins.plugins.noria.settings.onboarding.workspaceRoot=s.root;await app.vault.delete(app.vault.getAbstractFileByPath(s.items[0].path));${list}.querySelector('button').click();return true;`);
  await until(`return ${list}?.textContent.includes('来源已移走或删除');`);
  evaluate(`${list}.querySelector('details').open=true;const s=globalThis.__replyLibraryCheck,r=${list}.closest('.modal').getBoundingClientRect();require('fs').writeFileSync('${dir}/wide.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());${list}.closest('.modal').style.width='390px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');return true;`);
  await wait(150);
  check('390px recovery dialog has no horizontal overflow',evaluate(`const e=${list};return e.clientWidth>0&&e.scrollWidth<=e.clientWidth+1;`));
  evaluate(`const s=globalThis.__replyLibraryCheck,r=${list}.closest('.modal').getBoundingClientRect();require('fs').writeFileSync('${dir}/narrow-dark.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());return true;`);
  check('recovery never changes saved conversation or creates a missing source',evaluate(`const s=globalThis.__replyLibraryCheck;return (await app.vault.read(app.vault.getAbstractFileByPath(s.items[0].record)))===s.saved&&!(await app.vault.adapter.exists(s.items[0].path));`));
  evaluate(`globalThis.__replyLibraryCheck.markdownLeaves=app.workspace.getLeavesOfType('markdown').map(l=>l.id);const row=[...${list}.querySelectorAll('.noria-reply-library-item')].find(e=>e.textContent.includes('2099-12-23'));row.querySelector('.noria-reply-actions button').click();return true;`);
  await until(`return !${list}&&app.workspace.getActiveFile()?.path===globalThis.__replyLibraryCheck.items[0].record;`);
  check('open conversation closes the dialog and shows the saved Markdown',true);
 }finally{
  if(owned)evaluate(`const s=globalThis.__replyLibraryCheck,p=app.plugins.plugins.noria;if(!s)return true;${list}?.closest('.modal').querySelector('.modal-header-button')?.click();if(s.resolvePlugin)s.resolvePlugin.resolveCalendarNoteSpecAsync=s.originalResolve;for(const leaf of app.workspace.getLeavesOfType('markdown')){if(s.markdownLeaves&&!s.markdownLeaves.includes(leaf.id)&&s.items.some(item=>leaf.view.file?.path===item.record))leaf.detach();}p.settings.home=s.home;p.settings.onboarding.workspaceRoot=s.root;p.syncRuntimeBridgeConfig();const leaf=app.workspace.getLeavesOfType('noria-dashboard-home')[0];if(leaf){await leaf.view.workbench.refreshHome();if(s.workbench)await leaf.view.workbench.show(s.workbench.page,s.workbench.selection,s.workbench.intent);}for(const item of s.items){p._suggestionReplyDrafts?.delete(item.key);app.saveLocalStorage(item.key,item.local||null);for(const path of [item.record,item.path]){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file);}}app.saveLocalStorage('noria-reply-drafts-v1',s.index||null);document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__replyLibraryCheck;return true;`);
  fs.writeFileSync(dir+'/results.json',JSON.stringify(checks,null,2));
 }
 console.log(JSON.stringify({checks:checks.length,pass:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
