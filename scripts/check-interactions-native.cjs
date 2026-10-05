const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const dir='F:/NoriaTest/_acceptance-interactions-20260929';
const command=(...args)=>execFileSync('obsidian',['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`),i=raw.indexOf('=> ');if(i<0)throw Error(raw.slice(-900));return JSON.parse(raw.slice(i+3));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<40;i++){if(evaluate(code))return;await pause(120);}throw Error('Timed out: '+code);}
const setup='const s=globalThis.__noriaInteractionTest,p=app.plugins.plugins.noria,w=s.leaf.view.workbench;';
(async()=>{
 fs.mkdirSync(dir,{recursive:true});const checks=[];let owned=false,client;
 const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
 try{
  const endpoint=evaluate(`const p=app.plugins.plugins.noria;if(p.agentConnection.status().state!=='stopped')throw Error('Connection already active');const leaf=await p.openDashboardHomeLeaf(false),id=crypto.randomUUID();
   globalThis.__noriaInteractionTest={leaf,id,page:'page-'+id,original:p.settings.workbenchPages===undefined?null:structuredClone(p.settings.workbenchPages),state:leaf.view.getState(),width:leaf.view.hostEl.style.width,dark:document.body.classList.contains('theme-dark')};const s=globalThis.__noriaInteractionTest;s.win=require('@electron/remote').getCurrentWindow();s.throttle=s.win.webContents.getBackgroundThrottling();s.win.webContents.setBackgroundThrottling(false);s.win.show();s.win.focus();return await p.agentConnection.start();`);owned=true;
  client=new Client({name:'noria-interaction-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
  const call=async(name,args)=>{const out=await client.callTool({name:'noria_interactions_'+name,arguments:args});if(out.isError)throw Error(JSON.stringify(out.structuredContent));return out.structuredContent;};
  const id=evaluate(`${setup}return s.id;`),definition={title:'阅读安排',markdown:'先确定今天想读什么，再选择适合自己的节奏。',fields:[{id:'book',label:'今天读什么',type:'single',required:true,options:[{id:'novel',label:'一本小说'},{id:'paper',label:'一篇论文'}]},{id:'style',label:'阅读方式',type:'multi',options:[{id:'notes',label:'边读边记'},{id:'quiet',label:'安静阅读'}]},{id:'minutes',label:'计划分钟',type:'number',default:20},{id:'day',label:'开始日期',type:'date'},{id:'note',label:'补充',type:'text'}]};
  let record=await call('publish',{conversationId:id,requestId:'native-publish-one',revision:null,date:'2026-09-29',definition});
  evaluate(`${setup}s.path=${JSON.stringify(record.path)};await p.cards.pages.update(config=>config.pages.push({id:s.page,title:'阅读交流',hidden:false,widgets:[0,1].map(i=>({id:'interaction-card-'+i,type:'extension',source:'noria:interaction',title:i?'另一处阅读入口':'阅读交流',size:'medium',enabled:true,order:i,props:{conversationId:s.id}}))}));await w.show(s.page);return true;`);
  await until(`${setup}return w.pages.get(s.page)?.panel.querySelectorAll('.noria-interaction-form').length===2;`);check('MCP published definition renders in two card placements',true);
  check('first input keeps focus and synchronizes another card',evaluate(`${setup}const rows=w.pages.get(s.page).panel.querySelectorAll('.noria-interaction-form'),input=rows[0].querySelector('textarea');input.focus();input.value='先读一章';input.dispatchEvent(new Event('input',{bubbles:true}));return input===document.activeElement&&input.isConnected&&rows[1].querySelector('textarea').value==='先读一章';`));
  evaluate(`${setup}const form=w.pages.get(s.page).panel.querySelector('.noria-interaction-form');form.querySelector('input[type=radio]').click();form.querySelector('input[type=checkbox]').click();const date=form.querySelector('input[type=date]');date.value='2026-09-29';date.dispatchEvent(new Event('input',{bubbles:true}));s.writer=p.processTextAtVaultPath;p.processTextAtVaultPath=async()=>{throw Error('Native save failure');};form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true;`);
  await until(`${setup}return w.pages.get(s.page).panel.textContent.includes('Native save failure');`);
  check('failed save preserves visible answers',evaluate(`${setup}p.processTextAtVaultPath=s.writer;delete s.writer;return w.pages.get(s.page).panel.querySelector('textarea').value==='先读一章';`));
  evaluate(`${setup}w.pages.get(s.page).panel.querySelector('form.noria-interaction-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true;`);
  await until(`${setup}return [...w.pages.get(s.page).panel.querySelectorAll('.noria-interaction')].every(e=>e.textContent.includes('回答已保存'));`);
  record=await call('read',{conversationId:id});check('MCP reads actual native form values and typed numeric default',record.replies[0].answers.note==='先读一章'&&record.replies[0].answers.minutes===20&&record.replies[0].answers.book==='novel'&&record.replies[0].answers.day==='2026-09-29');
  const r=record.replies[0],ref={conversationId:id,replyId:r.id,replyRevision:r.revision,sourceRevision:record.source.revision};
  const claim=await call('claim',{...ref,requestId:'native-claim-one',agent:'Native acceptance'});
  const response={...ref,claimId:claim.claimId,requestId:'native-response-one',markdown:'今天先读小说的一章，用 20 分钟边读边记。读完再决定是否继续，不把阅读变成额外负担。'};
  await call('respond',response);check('identical MCP response retry does not append twice',(await call('respond',response)).changed===false);
  await until(`${setup}return w.pages.get(s.page).panel.querySelectorAll('.noria-interaction-response').length===2;`);check('response appears in both original cards without page reload',true);
  await pause(200);
  evaluate(`${setup}const r=w.host.getBoundingClientRect();if(${!process.env.NORIA_SKIP_SCREENSHOTS})require('fs').writeFileSync('${dir}/wide-response.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.min(850,Math.ceil(r.height))})).toPNG());[...w.pages.get(s.page).panel.querySelectorAll('button')].find(b=>b.textContent==='补充回答').click();const input=w.pages.get(s.page).panel.querySelector('textarea');input.value='保留这份补充';input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
  record=await call('publish',{conversationId:id,requestId:'native-publish-two',revision:record.source.revision,date:'2026-09-29',definition:{...definition,markdown:'如果只有十分钟，仍想保留哪一步？'}});
  await until(`${setup}return !!w.pages.get(s.page).panel.querySelector('.noria-interaction-changed');`);
  check('question updates preserve the old draft and disable stale submission',evaluate(`${setup}const panel=w.pages.get(s.page).panel;return panel.querySelector('textarea').value==='保留这份补充'&&panel.querySelector('.noria-interaction-form button[type=submit]').disabled;`));
  evaluate(`${setup}w.pages.get(s.page).panel.querySelector('.noria-interaction-changed button').click();w.host.style.width='390px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');return true;`);
  await pause(250);
  check('updated questions retain compatible answers and a readable old-answer snapshot',evaluate(`${setup}const panel=w.pages.get(s.page).panel;return panel.querySelector('textarea').value==='保留这份补充'&&panel.textContent.includes('更新前的回答')&&!panel.querySelector('.noria-interaction-form button[type=submit]').disabled;`));
  check('narrow form stays within card width',evaluate(`${setup}const card=w.pages.get(s.page).panel.querySelector('.noria-interaction');return card.scrollWidth<=card.clientWidth+1;`));
  evaluate(`${setup}const r=w.host.getBoundingClientRect();if(${!process.env.NORIA_SKIP_SCREENSHOTS})require('fs').writeFileSync('${dir}/narrow-dark-form.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:390,height:Math.min(850,Math.ceil(r.height))})).toPNG());w.pages.get(s.page).panel.querySelector('button[aria-label="编辑问题"]').click();return true;`);
  await until(`return !!document.querySelector('.noria-interaction-editor');`);
  check('native editor exposes existing fields without creating another conversation',evaluate(`${setup}return document.querySelectorAll('.noria-interaction-definition-field').length===5;`));
  evaluate(`${setup}const modal=[...p.cards.modals].find(m=>m.constructor.name==='InteractionEditor');modal.draft.title='我的阅读安排';modal.dirty=true;await modal.save();return true;`);
  await until(`${setup}return w.pages.get(s.page).panel.textContent.includes('我的阅读安排');`);
  check('editing the shared definition updates existing placements',true);
  await client.close();client=null;evaluate(`${setup}await p.agentConnection.stop();return true;`);command('plugin:reload','id=noria');
  await until(`${setup}return w.pages.get(s.page)?.panel.querySelector('textarea')?.value==='保留这份补充';`);
  check('reload restores persistent draft and shared conversation',evaluate(`${setup}const record=await p.api.interactions.read({conversationId:s.id});return record.replies.length===1&&record.replies[0].response.markdown.includes('20 分钟')&&p.agentConnection.status().state==='stopped';`));
 }finally{
  await client?.close();
  if(owned)evaluate(`${setup}if(s.writer)p.processTextAtVaultPath=s.writer;await p.agentConnection.stop();for(const m of [...p.cards.modals])if(m.constructor.name==='InteractionEditor'){m.dirty=false;m.close(true);}w.host.style.width=s.width;document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);if(s.original===null)delete p.settings.workbenchPages;else p.settings.workbenchPages=s.original;await p.saveSettings();await w.syncPages();await w.show(s.state.page||'home',s.state.selection,s.state.intent);app.saveLocalStorage('noria-interaction-draft-v1-'+s.id,null);p._interactionDrafts?.delete(s.id);const file=s.path&&app.vault.getAbstractFileByPath(s.path);if(file)await app.vault.delete(file);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaInteractionTest;return true;`);
  fs.writeFileSync(dir+'/result.json',JSON.stringify({checks},null,2));
 }
 fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(error=>{console.error(error);process.exit(1);});
