const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const cli=process.env.OBSIDIAN_CLI||'obsidian',dir='F:/NoriaTest/_acceptance-reply-relink-20260929';
const command=(...args)=>execFileSync(cli,['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`),i=raw.indexOf('=> ');if(i<0)throw Error(raw.slice(-1200));return JSON.parse(raw.slice(i+3));};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<35;i++){if(evaluate(code))return;await wait(100);}throw Error('Timed out: '+code);}
const list=`document.querySelector('.noria-reply-library')`,row=`[...${list}.querySelectorAll('.noria-reply-library-item')].find(e=>e.textContent.includes('2099-12-20'))`;
const click=(scope,label)=>evaluate(`const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent==='${label}');if(!b)throw Error('Missing button: ${label}');b.click();return true;`);
async function choose(){
 click(row,'定位来源');await until(`return !!document.querySelector('.prompt-input');`);
 evaluate(`const input=document.querySelector('.prompt-input');input.value=globalThis.__replyRelinkCheck.target;input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
 await until(`return [...document.querySelectorAll('.suggestion-item')].some(e=>e.textContent.includes('2099-12-20-relocated'));`);
 evaluate(`[...document.querySelectorAll('.suggestion-item')].find(e=>e.textContent.includes('2099-12-20-relocated')).click();return true;`);
 await until(`return ${list}?.textContent.includes('确认关联');`);
}
(async()=>{
 const checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};let owned=process.argv.includes('--restore');fs.mkdirSync(dir,{recursive:true});
 try{
  if(owned)return;
  evaluate(`if(${list}||document.querySelector('.prompt'))throw Error('A dialog is already open');const p=app.plugins.plugins.noria,date='2099-12-20',source=await p.api.suggestions.read({date}),record=await p.api.suggestionReplies.read({date}),target=source.path.replace('.md','-relocated.md');for(const path of [source.path,target,record.path])if(await app.vault.adapter.exists(path))throw Error('Fixture exists: '+path);const key=path=>'noria-reply-draft-v1-'+require('crypto').createHash('sha256').update(JSON.stringify([path,date])).digest('hex'),keys=[key(source.path),key(target),'noria-reply-drafts-v1','noria-reply-renames-v1'],win=require('@electron/remote').getCurrentWindow();globalThis.__replyRelinkCheck={date,path:source.path,target,record:record.path,keys,local:keys.map(k=>app.loadLocalStorage(k)),win,throttle:win.webContents.getBackgroundThrottling(),dark:document.body.classList.contains('theme-dark')};win.webContents.setBackgroundThrottling(false);return true;`);owned=true;
  evaluate(`const s=globalThis.__replyRelinkCheck,p=app.plugins.plugins.noria;await p.ensureVaultParent(s.path);await app.vault.create(s.path,'## 建议\\n保留散步，阅读稍后继续。\\n');const source=await p.api.suggestions.read({date:s.date});await p.api.suggestionReplies.submit({date:s.date,sourcePath:s.path,sourceRevision:source.revision,requestId:'relink-native-first',markdown:'先读完这一章。'});s.original=await app.vault.read(app.vault.getAbstractFileByPath(s.record));app.saveLocalStorage(s.keys[0],{version:1,markdown:'散步保留，整理笔记改到明天。',requestId:'relink-native-draft',sourceRevision:source.revision,expanded:true,attempted:false});app.saveLocalStorage('noria-reply-drafts-v1',[...(s.local[2]||[]),{path:s.path,date:s.date}]);await app.vault.create(s.target,'## 建议\\n先散步，再整理阅读笔记。\\n');await app.vault.delete(app.vault.getAbstractFileByPath(s.path));return true;`);
  command('plugin:reload','id=noria');evaluate(`app.commands.executeCommandById('noria:open-reply-library');return true;`);
  await until(`return ${list}?.textContent.includes('来源已移走或删除');`);await choose();
  check('native file chooser opens an explicit source preview',evaluate(`return ${list}.querySelector('.noria-reply-source-preview').textContent.includes('先散步，再整理阅读笔记。');`));
  check('preview does not alter the saved conversation or original draft',evaluate(`const s=globalThis.__replyRelinkCheck;return (await app.vault.read(app.vault.getAbstractFileByPath(s.record)))===s.original&&app.loadLocalStorage(s.keys[0]).markdown==='散步保留，整理笔记改到明天。'&&!app.loadLocalStorage(s.keys[1]);`));
  click(list,'返回列表');await until(`return !!${row};`);check('cancel returns to the missing source without binding',evaluate(`return ${row}.textContent.includes('来源已移走或删除');`));
  await choose();evaluate(`const s=globalThis.__replyRelinkCheck;await app.vault.modify(app.vault.getAbstractFileByPath(s.target),'## 建议\\n先散步，今天只整理一页笔记。\\n');return true;`);click(list,'确认关联');
  await until(`return ${list}?.textContent.includes('预览后内容发生变化');`);check('changed source blocks stale confirmation and retains input',evaluate(`const s=globalThis.__replyRelinkCheck;return (await app.vault.read(app.vault.getAbstractFileByPath(s.record)))===s.original&&!!app.loadLocalStorage(s.keys[0]);`));
  click(list,'返回列表');await until(`return !!${row};`);await choose();
  evaluate(`const s=globalThis.__replyRelinkCheck,r=${list}.closest('.modal').getBoundingClientRect();require('fs').writeFileSync('${dir}/wide.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());${list}.closest('.modal').style.width='390px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');return true;`);await wait(150);
  check('390px preview and buttons fit without horizontal overflow',evaluate(`const e=${list};return e.clientWidth>0&&e.scrollWidth<=e.clientWidth+1;`));
  evaluate(`const s=globalThis.__replyRelinkCheck,r=${list}.closest('.modal').getBoundingClientRect();require('fs').writeFileSync('${dir}/narrow-dark.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());return true;`);
  click(list,'确认关联');await until(`return ${list}?.textContent.includes('已接续来源');`);
  check('confirmation retains conversation identity and note content and transfers the draft',evaluate(`const s=globalThis.__replyRelinkCheck,p=app.plugins.plugins.noria,record=await p.api.suggestionReplies.read({date:s.date,sourcePath:s.target});s.id=record.id;return record.path===s.record&&record.replies.length===1&&(await app.vault.read(app.vault.getAbstractFileByPath(s.record))).startsWith(s.original)&&!app.vault.getAbstractFileByPath(s.path)&&!app.loadLocalStorage(s.keys[0])&&app.loadLocalStorage(s.keys[1]).markdown==='散步保留，整理笔记改到明天。'&&(await app.vault.read(app.vault.getAbstractFileByPath(s.target)))==='## 建议\\n先散步，今天只整理一页笔记。\\n';`));
  evaluate(`${list}.closest('.modal').querySelector('.modal-header-button').click();return true;`);command('plugin:reload','id=noria');evaluate(`app.commands.executeCommandById('noria:open-reply-library');return true;`);
  await until(`return ${list}?.textContent.includes('已接续来源');`);evaluate(`${row}.querySelector('details').open=true;return true;`);click(row,'继续填写');
  await until(`return ${list}?.querySelector('.noria-suggestion-replies textarea')?.value==='散步保留，整理笔记改到明天。';`);
  check('plugin reload restores the linked draft with explicit source review',evaluate(`return ${list}.querySelector('.noria-reply-conflict').textContent.includes('建议已更新');`));
  evaluate(`${list}.querySelector('.noria-reply-conflict').open=true;return true;`);click(list,'已核对，按最新内容保存');click(list,'保存补充');
  await until(`return ${list}?.querySelector('.noria-suggestion-replies textarea')?.value==='';`);
  check('reviewed draft appends exactly one reply to the same conversation',evaluate(`const s=globalThis.__replyRelinkCheck,r=await app.plugins.plugins.noria.api.suggestionReplies.read({date:s.date,sourcePath:s.target});return r.id===s.id&&r.replies.length===2&&r.replies[1].markdown==='散步保留，整理笔记改到明天。';`));
 }finally{
  if(owned)evaluate(`const s=globalThis.__replyRelinkCheck,p=app.plugins.plugins.noria;if(!s)return true;${list}?.closest('.modal').querySelector('.modal-header-button')?.click();if(p._suggestionReplyCoordinator)await p._suggestionReplyCoordinator.run(()=>{});for(const key of s.keys.slice(0,2))p._suggestionReplyDrafts?.delete(key);for(const path of [s.path,s.target,s.record]){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file);}s.keys.forEach((k,i)=>app.saveLocalStorage(k,s.local[i]??null));document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__replyRelinkCheck;return true;`);
  fs.writeFileSync(dir+'/results.json',JSON.stringify(checks,null,2));
 }
 console.log(JSON.stringify({checks:checks.length,pass:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
