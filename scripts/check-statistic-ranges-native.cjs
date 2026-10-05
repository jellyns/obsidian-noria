const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const dir='F:/NoriaTest/_acceptance-statistic-ranges-20261002';
const evaluate=code=>{const raw=execFileSync('obsidian',['vault=NoriaTest','eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`],{encoding:'utf8',timeout:30000,windowsHide:true});if(!raw.includes('=> '))throw Error(raw.slice(-1000));return JSON.parse(raw.slice(raw.indexOf('=> ')+3));};
const setup='const s=globalThis.__noriaRangeTest,p=app.plugins.plugins.noria,w=s.leaf.view.workbench;';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<50;i++){if(evaluate(setup+code))return;await pause(100);}throw Error('Update timed out: '+code);}
(async()=>{
 let owned=false;const checks=[];fs.mkdirSync(dir,{recursive:true});
 const check=(name,code)=>{assert.ok(evaluate(setup+code),name);checks.push(name);};
 try{
  evaluate(`const p=app.plugins.plugins.noria;if(p.cards.modals.size||globalThis.__noriaRangeTest)throw Error('An editor or test is already open');const s={active:app.workspace.activeLeaf,pages:structuredClone(p.settings.workbenchPages??null),home:JSON.stringify(p.settings.home),dark:document.body.classList.contains('theme-dark'),files:[],page:'page-'+crypto.randomUUID(),save:p.saveSettings};globalThis.__noriaRangeTest=s;s.win=require('@electron/remote').getCurrentWindow();s.throttle=s.win.webContents.getBackgroundThrottling();s.win.webContents.setBackgroundThrottling(false);s.win.show();s.win.focus();s.leaf=app.workspace.getLeaf('tab');await s.leaf.setViewState({type:'noria-dashboard-home',active:true});return true;`);owned=true;
  await until('return !!w;');
  evaluate(`${setup}for(const date of ['1901-01-11','1901-01-12']){const path='Noria/Projects/_range-'+crypto.randomUUID()+'.md';await app.vault.create(path,['---','created: '+date,'tags: [noria-range-test]','---','## Range test','- [x] Range acceptance [completion:: '+date+']',''].join(String.fromCharCode(10)));s.files.push(path);}const defaults=p.buildRuntimeBridgeConfig().homeWidgetDefaults;s.ids={range:'card-'+crypto.randomUUID(),follow:'card-'+crypto.randomUUID(),fixed:'card-'+crypto.randomUUID(),generic:'card-'+crypto.randomUUID(),trend:'card-'+crypto.randomUUID()};const make=(key,type,props)=>({...structuredClone(defaults.find(d=>d.id===type)),id:s.ids[key],builtinId:type,enabled:true,size:'full',order:Object.keys(s.ids).indexOf(key)*10,props:{...defaults.find(d=>d.id===type).props,...props,lazy:false}});const range={mode:'custom',start:'1901-01-11',end:'1901-01-12'};await p.cards.pages.update(config=>config.pages.push({id:s.page,title:'统计范围验收',trendsRange:range,widgets:[make('range','trends-range',{}),make('follow','metrics',{overviewFields:['todayNotes','completedTasks'],statsRange:{mode:'homeCurrent'}}),make('fixed','metrics',{overviewFields:['todayNotes','completedTasks'],statsRange:{mode:'custom',start:'1901-01-11',end:'1901-01-11'}}),{id:s.ids.generic,type:'extension',source:'noria:statistics',title:'完成任务',enabled:true,size:'full',order:30,props:{source:'tasks',scope:'follow',calculate:'count',display:'metric'}},make('trend','note-trend-card',{statsRange:range})]}));await w.show(s.page);s.card=key=>[...s.leaf.view.containerEl.querySelectorAll('.dashboard-home-widget-shell')].find(el=>el.dataset.noriaWidgetId===s.ids[key]);s.values=key=>[...s.card(key)?.querySelectorAll('b')||[]].map(el=>el.textContent);return true;`);
  await until(`return s.values('follow').join(',')==='+2,2'&&s.values('fixed').join(',')==='+1,1';`);
  check('page-following and fixed cards render different real source intervals',`return s.values('follow').join(',')==='+2,2'&&s.values('fixed').join(',')==='+1,1';`);
  check('generic statistics follow the custom page rather than Home',`return s.card('generic').querySelector('.noria-stat-result-value')?.textContent==='2';`);
  // The editor previews its own draft without changing the live cards.
  evaluate(`${setup}p.cards.catalog({page:'custom',pageId:s.page},s.ids.fixed);return true;`);
  await until(`return !!document.querySelector('.noria-card-catalog [data-card-field="statsRange"]');`);
  check('existing card settings expose the saved custom interval',`return document.querySelector('[data-card-field="statsRange"]').value==='custom'&&document.querySelector('[data-card-field="statsRange.start"]').value==='1901-01-11';`);
  evaluate(`${setup}document.querySelector('[data-overview-field="completedTasks"]').click();const input=document.querySelector('[data-card-field="statsRange.end"]');input.value='1901-01-12';input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
  await until(`return [...document.querySelectorAll('.noria-card-preview b')].map(e=>e.textContent).join(',')==='+2';`);
  check('preview filters metrics and leaves the live card untouched',`return s.values('fixed').join(',')==='+1,1';`);
  // Batch visual inspection: wide light and narrow dark editor.
  for(const narrow of (process.env.NORIA_RANGE_SKIP_SCREENSHOTS?[]:[false,true])){
   evaluate(`${setup}const el=document.querySelector('.noria-card-catalog');el.style.width='${narrow?360:820}px';el.style.maxWidth='calc(100vw - 32px)';document.body.classList.toggle('theme-dark',${narrow});document.body.classList.toggle('theme-light',${!narrow});return true;`);await pause(250);
   check(`editor fits ${narrow?'narrow dark':'wide light'} width`,`const el=document.querySelector('.noria-card-catalog');return el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('input,select')].every(e=>e.getBoundingClientRect().right<=el.getBoundingClientRect().right+1);`);
   evaluate(`${setup}const el=document.querySelector('.noria-card-catalog'),r=el.getBoundingClientRect();require('fs').writeFileSync('${dir}/editor-${narrow?'narrow-dark':'wide-light'}.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.ceil(Math.min(r.height,innerHeight-r.y))})).toPNG());return true;`);
  }
  evaluate(`${setup}document.querySelector('.noria-card-form-footer .mod-cta').click();return true;`);
  await until(`return !document.querySelector('.noria-card-catalog')&&s.values('fixed').join(',')==='+2';`);
  check('applying one card saves its selected metrics and interval',`const item=p.cards.pages.get(s.page).widgets.find(c=>c.id===s.ids.fixed);return item.props.overviewFields.join(',')==='todayNotes'&&item.props.statsRange.end==='1901-01-12'&&JSON.stringify(p.settings.home)===s.home;`);
  evaluate(`${setup}await w.show('home');await w.show(s.page);return true;`);
  await until(`return s.values('fixed').join(',')==='+2';`);
  check('card choices persist after leaving and returning',`return s.values('fixed').join(',')==='+2'&&s.values('follow').join(',')==='+2,2';`);
  // Page range failure keeps the existing range and allows retry.
  evaluate(`${setup}s.previousRange=JSON.stringify(p.cards.pages.get(s.page).trendsRange);p.saveSettings=async()=>{throw Error('Acceptance save failure');};s.card('range').querySelectorAll('input[type=date]')[0].value='1901-01-12';s.card('range').querySelectorAll('input[type=date]')[0].dispatchEvent(new Event('change',{bubbles:true}));return true;`);
  await until(`return s.card('range')?.innerText.includes('Acceptance save failure');`);
  check('failed range save preserves saved settings and rendered values',`return JSON.stringify(p.cards.pages.get(s.page).trendsRange)===s.previousRange&&s.values('follow').join(',')==='+2,2';`);
  evaluate(`${setup}p.saveSettings=s.save;s.card('range').querySelectorAll('input[type=date]')[0].dispatchEvent(new Event('change',{bubbles:true}));return true;`);
  await until(`return s.values('follow').join(',')==='+1,1';`);
  await until(`return s.card('generic')?.querySelector('.noria-stat-result-value')?.textContent==='1';`);
  check('generic card refresh uses the changed page interval',`return s.card('generic').querySelector('.noria-stat-result-value').textContent==='1';`);
  check('fixed trend retains its two-note interval',`return [...s.card('trend').querySelectorAll('svg text')].some(e=>['总计: 2','Total: 2'].includes(e.textContent));`);
  check('retry updates followers but not independent cards or Home',`return s.values('fixed').join(',')==='+2'&&p.cards.pages.get(s.page).trendsRange.start==='1901-01-12'&&JSON.stringify(p.settings.home)===s.home;`);
  check('range event listeners are scoped to this page',`s.otherEvents=0;const stop=p.cards.onStatisticRange('other-page',()=>s.otherEvents++);p.cards.emitStatisticRange(s.page,{range:{mode:'custom',start:'1901-01-12',end:'1901-01-12'}});stop();return s.otherEvents===0;`);
  evaluate(`${setup}await p.cards.pages.editCard(s.page,s.ids.range,{enabled:false});p.cards.catalog({page:'custom',pageId:s.page});return true;`);
  await until(`return !![...document.querySelectorAll('.noria-card-catalog button')].find(b=>b.textContent.includes('统一调整跟随本页'));`);
  evaluate(`${setup}[...document.querySelectorAll('.noria-card-catalog button')].find(b=>b.textContent.includes('统一调整跟随本页')).click();return true;`);
  await until(`return !!document.querySelector('.noria-card-form-footer .mod-cta');`);
  evaluate(`${setup}document.querySelector('.noria-card-form-footer .mod-cta').click();return true;`);
  await until(`return !document.querySelector('.noria-card-catalog')&&p.cards.pages.get(s.page).widgets.some(c=>c.id!==s.ids.range&&c.builtinId==='trends-range'&&c.enabled!==false);`);
  check('custom page can add its shared range control from the actual catalog',`return p.cards.pages.get(s.page).widgets.filter(c=>(c.builtinId||c.id)==='trends-range'&&c.enabled!==false).length===1;`);

 }finally{
  fs.writeFileSync(dir+'/native-result.json',JSON.stringify({status:'incomplete',checks},null,2));
  if(owned)evaluate(`${setup}p.saveSettings=s.save;for(const modal of [...p.cards.modals])modal.close(true);s.leaf.detach();if(s.pages===null)delete p.settings.workbenchPages;else p.settings.workbenchPages=s.pages;await p.saveSettings();for(const path of s.files){const f=app.vault.getAbstractFileByPath(path);if(f)await app.vault.delete(f);}if(s.active?.parent)app.workspace.setActiveLeaf(s.active,{focus:true});document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaRangeTest;return true;`);
 }
 fs.writeFileSync(dir+'/native-result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
