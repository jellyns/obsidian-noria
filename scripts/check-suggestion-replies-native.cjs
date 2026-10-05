// Real Markdown persistence in NoriaTest. No Agent or model execution is simulated.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const cli=process.env.OBSIDIAN_CLI||'obsidian',date='2099-12-27',dir='F:/NoriaTest/_acceptance-suggestion-replies-20260927';
const command=(...args)=>execFileSync(cli,['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`);const i=raw.indexOf('=> ');if(i<0)throw Error('Obsidian evaluation failed');return JSON.parse(raw.slice(i+3));};
(async()=>{
 const checks=[],check=(name,value)=>{assert.ok(value,name);checks.push({name,ok:true});};let owned=false;
 fs.mkdirSync(dir,{recursive:true});
 try{
  evaluate(`const p=app.plugins.plugins.noria,spec=await p.resolveCalendarNoteSpecAsync("daily","${date}"),read=await p.api.suggestionReplies.read({date:"${date}"});if(await app.vault.adapter.exists(spec.path)||await app.vault.adapter.exists(read.path))throw Error("Fixture already exists");
   const win=require("@electron/remote").getCurrentWindow();globalThis.__noriaReplyCheck={source:spec.path,replies:read.path,body:"## 记录\\n保留的记录。\\n\\n## 建议\\n先读书，再散步。\\n",oldLeaf:app.workspace.activeLeaf,win,throttle:win.webContents.getBackgroundThrottling()};win.webContents.setBackgroundThrottling(false);return true;`);owned=true;
  check('read does not create a reply file',evaluate('return !(await app.vault.adapter.exists(globalThis.__noriaReplyCheck.replies));'));
  evaluate(`const p=app.plugins.plugins.noria,s=globalThis.__noriaReplyCheck;await p.ensureVaultParent(s.source);await app.vault.create(s.source,s.body);const source=await p.api.suggestions.read({date:"${date}"});s.request={date:"${date}",sourcePath:source.path,sourceRevision:source.revision,requestId:"native-reply-check",markdown:"散步保留，读书明天继续。"};const first=await p.api.suggestionReplies.submit(s.request);s.id=first.id;return true;`);
  check('reply saved separately with original context and source link',evaluate(`const p=app.plugins.plugins.noria,s=globalThis.__noriaReplyCheck,r=await p.api.suggestionReplies.read({date:"${date}"}),raw=await app.vault.read(app.vault.getAbstractFileByPath(s.replies));return r.replies.length===1&&r.replies[0].sourceMarkdown==="先读书，再散步。"&&r.replies[0].state==="saved"&&raw.includes("[[")&&raw.includes("散步保留，读书明天继续。");`));
  check('duplicate request does not append',evaluate('return !(await app.plugins.plugins.noria.api.suggestionReplies.submit(globalThis.__noriaReplyCheck.request)).changed;'));
  check('source diary unchanged',evaluate('const s=globalThis.__noriaReplyCheck;return await app.vault.read(app.vault.getAbstractFileByPath(s.source))===s.body;'));
  command('plugin:reload','id=noria');
  check('plugin reload recovers the same conversation and reply',evaluate(`const r=await app.plugins.plugins.noria.api.suggestionReplies.read({date:"${date}"});return r.id===globalThis.__noriaReplyCheck.id&&r.replies.length===1;`));
  evaluate('const s=globalThis.__noriaReplyCheck;s.leaf=app.workspace.getLeaf(true);await s.leaf.openFile(app.vault.getAbstractFileByPath(s.replies),{state:{mode:"preview"}});return true;');
  for(let i=0;i<20;i++){if(evaluate('return globalThis.__noriaReplyCheck.leaf.view.previewMode.containerEl.textContent.includes("散步保留，读书明天继续。");'))break;await new Promise(r=>setTimeout(r,100));}
  const preview=evaluate('return {text:globalThis.__noriaReplyCheck.leaf.view.previewMode.containerEl.textContent};');
  fs.writeFileSync(dir+'/reading-view.txt',preview.text);
  check('native reading view shows reply and hides protocol markers',preview.text.includes('散步保留，读书明天继续。')&&preview.text.includes('先读书，再散步。')&&!preview.text.includes('noria:conversation')&&!preview.text.includes('sourceRevision'));
  evaluate('const s=globalThis.__noriaReplyCheck;await app.vault.modify(app.vault.getAbstractFileByPath(s.source),s.body.replace("先读书，再散步。","人工更新。"));return true;');
  check('updated source retains old reply context and reports change',evaluate(`const r=await app.plugins.plugins.noria.api.suggestionReplies.read({date:"${date}"});return r.replies[0].sourceChanged&&r.replies[0].sourceMarkdown==="先读书，再散步。";`));
 }finally{
  if(owned)evaluate('const s=globalThis.__noriaReplyCheck;s.leaf?.detach();if(s.oldLeaf)app.workspace.setActiveLeaf(s.oldLeaf,{focus:true});s.win.webContents.setBackgroundThrottling(s.throttle);for(const path of [s.replies,s.source]){const f=app.vault.getAbstractFileByPath(path);if(f)await app.vault.delete(f);}delete globalThis.__noriaReplyCheck;return true;');
  fs.writeFileSync(dir+'/results.json',JSON.stringify(checks,null,2));
 }
 console.log(JSON.stringify({checks:checks.length,pass:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
