const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const dir=process.argv[2]||'F:/NoriaTest/_acceptance-workbench-pages-20260929';
const command=(...args)=>execFileSync('obsidian',['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()`),i=raw.indexOf('=> ');if(i<0)throw Error(raw.slice(-900));return JSON.parse(raw.slice(i+3));};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(code){for(let i=0;i<45;i++){if(evaluate(code))return;await pause(100);}throw Error('Timed out: '+code);}
const setup='const s=globalThis.__noriaPagesTest,p=app.plugins.plugins.noria,w=s.leaf.view.workbench;';
(async()=>{
 fs.mkdirSync(dir,{recursive:true});const checks=[];let owned=false;
  const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
  async function menuCycle(name, anchorCode, collapsedCode) {
    check(`${name}: no duplicate fold control`,evaluate(`${setup}return !w.pages.get(w.active).panel.querySelector('.noria-card-fold');`));
    check(`${name}: menu is the last control in its group`,evaluate(`${setup}const a=${anchorCode};return !!a&&!a.nextElementSibling;`));
    evaluate(`${setup}(${anchorCode}).click();document.querySelector('.noria-card-menu [data-control="collapse"]').click();return true;`);
    await until(`${setup}return ${collapsedCode};`);
    check(`${name}: collapsed card retains a visible menu`,evaluate(`${setup}const a=${anchorCode};return !!a&&a.getClientRects().length>0;`));
    evaluate(`${setup}const a=${anchorCode};if(!document.querySelector('.noria-card-menu [data-control="expand"]'))a.click();document.querySelector('.noria-card-menu [data-control="expand"]').click();return true;`);
    await until(`${setup}return !(${collapsedCode});`);
    evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true;`);
    check(`${name}: expand restores keyboard focus to the current menu`,evaluate(`${setup}return document.activeElement===(${anchorCode});`));
  }
 try{
  evaluate(`const p=app.plugins.plugins.noria,path='Noria/page-acceptance-source.md';if(await app.vault.adapter.exists(path))throw Error('Fixture already exists');
    const leaf=await p.openDashboardHomeLeaf(false);globalThis.__noriaPagesTest={leaf,path,raw:'## 阅读清单\\n\\n保留自己的阅读节奏。\\n',original:p.settings.workbenchPages===undefined?null:structuredClone(p.settings.workbenchPages),home:JSON.stringify(p.settings.home),diary:JSON.stringify(p.settings.cardLayouts),state:leaf.view.getState(),dark:document.body.classList.contains('theme-dark'),width:leaf.view.hostEl.style.width};
    const win=require('@electron/remote').getCurrentWindow(),s=globalThis.__noriaPagesTest;s.win=win;s.throttle=win.webContents.getBackgroundThrottling();win.webContents.setBackgroundThrottling(false);win.show();win.focus();await app.vault.create(path,s.raw);return true;`);owned=true;
  evaluate(`${setup}await w.show('home');s.homeCard=p.settings.home.widgets.find(x=>x.enabled!==false&&!x.collapsed&&(x.builtinId||x.id)==='inbox-card').id;return true;`);
  const homeAnchor=`[...w.pages.get('home').panel.querySelectorAll('[data-noria-widget-shell-action="menu"]')].find(e=>e.dataset.noriaWidgetId===s.homeCard)`;
  await menuCycle('Home',homeAnchor,`p.settings.home.widgets.find(x=>x.id===s.homeCard).collapsed===true`);
  evaluate(`${setup}await w.show('diary');s.diaryCard=[...w.diary.cards.cards].find(([id,c])=>!c.host.hidden&&!w.diary.cards.layout.cards[id].collapsed)[0];return true;`);
  await menuCycle('Diary','w.diary.cards.cards.get(s.diaryCard).button',`w.diary.cards.layout.cards[s.diaryCard].collapsed===true`);
  for(const kind of ['record','review']) {
    const body=kind==='record'?'recordBody':'reviewHost';
    evaluate(`${setup}w.diary.${kind}MenuButton.click();return true;`);
    await until(`return !![...document.querySelectorAll('.menu-item')].find(e=>e.textContent.trim()==='收起');`);
    evaluate(`[...document.querySelectorAll('.menu-item')].find(e=>e.textContent.trim()==='收起').click();return true;`);
    await until(`${setup}return w.diary.${body}.hidden;`);
    check(`${kind}: collapsed section retains its menu`,evaluate(`${setup}return w.diary.${kind}MenuButton.getClientRects().length>0;`));
    evaluate(`${setup}w.diary.${kind}MenuButton.click();return true;`);
    await until(`return !![...document.querySelectorAll('.menu-item')].find(e=>e.textContent.trim()==='展开');`);
    evaluate(`[...document.querySelectorAll('.menu-item')].find(e=>e.textContent.trim()==='展开').click();return true;`);
    await until(`${setup}return !w.diary.${body}.hidden;`);
    check(`${kind}: menu focus returns after expansion`,evaluate(`${setup}return document.activeElement===w.diary.${kind}MenuButton;`));
  }
  evaluate(`${setup}await w.show('home');w.openLayoutMenu();[...document.querySelectorAll('.menu-item')].find(e=>e.textContent.includes('管理页面')).click();return true;`);
  await until(`return !!document.querySelector('.noria-page-create');`);
  evaluate(`const form=document.querySelector('.noria-page-create');form.querySelector('input').value='阅读与趋势';form.querySelector('select').value='trends';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true;`);
  check('new page appears in configuration',evaluate(`return !![...document.querySelectorAll('.noria-page-settings-row input[type=text]')].find(e=>e.value==='阅读与趋势');`));
  evaluate(`document.querySelector('.noria-page-settings .mod-cta').click();return true;`);
  await until(`${setup}s.id=p.cards.pages.read().pages.find(e=>e.title==='阅读与趋势')?.id;return !!s.id&&w.active===s.id&&w.pages.get(s.id)?.panel.querySelectorAll('.dashboard-home-widget-shell').length===4;`);
  check('real trend template renders four native cards',true);
  check('home and diary configuration are unchanged',evaluate(`${setup}return s.home===JSON.stringify(p.settings.home)&&s.diary===JSON.stringify(p.settings.cardLayouts);`));
  evaluate(`${setup}await p.cards.pages.saveCard(s.id,{id:'card-page-source',type:'extension',source:'noria:note',title:'阅读清单',size:'full',order:50,enabled:true,props:{path:s.path}});return true;`);
  await until(`${setup}return w.pages.get(s.id).panel.textContent.includes('保留自己的阅读节奏');`);
  check('note card reads its actual Markdown source',true);
  evaluate(`${setup}p.cards.catalog({page:'custom',pageId:s.id},'card-page-source');return true;`);
  await until(`return !!document.querySelector('.noria-card-catalog .noria-card-form');`);
  evaluate(`const form=document.querySelector('.noria-card-form'),input=form.querySelector('input[type=text]');input.value='我的阅读';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.noria-card-catalog .mod-cta').click();return true;`);
  await until(`${setup}return p.cards.pages.get(s.id).widgets.find(e=>e.id==='card-page-source')?.title==='我的阅读'&&!document.querySelector('.noria-card-catalog');`);
  check('catalog saves the custom page card rather than the home layout',evaluate(`${setup}return !p.settings.home.widgets.some(e=>e.id==='card-page-source');`));
  evaluate(`${setup}w.pages.get(s.id).panel.querySelector('[data-noria-widget-id="card-page-source"][data-noria-widget-shell-action="menu"]').click();const slider=document.querySelector('.noria-card-width-slider input');slider.value='2';slider.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
  await until(`${setup}return p.cards.pages.get(s.id).widgets.find(e=>e.id==='card-page-source').size==='wide';`);
  check('existing card width control writes only the custom instance',true);
  evaluate(`${setup}w.closeCardMenu?.(false);return true;`);
  await menuCycle('Custom page',`w.pages.get(s.id).panel.querySelector('[data-noria-widget-id="card-page-source"][data-noria-widget-shell-action="menu"]')`,`p.cards.pages.get(s.id).widgets.find(e=>e.id==='card-page-source').collapsed===true`);

  evaluate(`${setup}const card=p.cards.pages.get(s.id).widgets.find(e=>e.id==='card-page-source');await p.cards.pages.saveCard(s.id,{...structuredClone(card),id:'card-page-copy',order:51});await p.cards.pages.editCard(s.id,'card-page-copy',{size:'medium'});await app.vault.modify(app.vault.getAbstractFileByPath(s.path),s.raw+'\\n新的阅读安排。\\n');return true;`);
  await until(`${setup}return [...w.pages.get(s.id).panel.querySelectorAll('.dashboard-home-widget-shell')].filter(e=>e.textContent.includes('新的阅读安排')).length===2;`);
  check('two independently configured cards update from the same source',true);
  evaluate(`${setup}const base=p.cards.pages.read(),draft=structuredClone(base);draft.pages.find(e=>e.id===s.id).title='阅读计划';draft.pages.find(e=>e.id==='calendar').hidden=true;draft.defaultPage=s.id;await p.cards.pages.configure(draft,base);s.newState=w.state();return true;`);
  command('plugin:reload','id=noria');
  await until(`${setup}return w?.active===s.id&&!!w.pages.get(s.id)?.panel.querySelector('[data-noria-widget-id="card-page-source"]');`);
  check('reload restores custom page, title and cards',evaluate(`${setup}return p.cards.pages.get(s.id).title==='阅读计划'&&p.cards.pages.read().defaultPage===s.id&&p.cards.pages.get('calendar').hidden;`));
  evaluate(`${setup}s.extra=app.workspace.getLeaf('tab');await s.extra.setViewState({type:'noria-dashboard-home',active:true});return true;`);
  await until(`${setup}return !!s.extra.view.workbench?.pages.get(s.id)?.panel.querySelector('.dashboard-home-widget-shell');`);
  check('fresh workbench uses configured default',evaluate(`${setup}const active=s.extra.view.workbench.active;s.extra.detach();delete s.extra;app.workspace.setActiveLeaf(s.leaf,{focus:true});return active===s.id;`));
  // Exercise the real save guard before navigating from Diary.
  evaluate(`${setup}await w.show('diary');s.flush=w.diary.flush;w.diary.flush=async()=>{throw Error('Acceptance save failure');};let rejected=false;try{await w.show(s.id);}catch(e){rejected=true;}finally{w.diary.flush=s.flush;delete s.flush;}return rejected&&w.active==='diary';`)?check('failed diary flush keeps the current page',true):check('failed diary flush keeps the current page',false);
  evaluate(`${setup}await w.show(s.id);const before=p.cards.pages.read(),save=p.saveSettings;p.saveSettings=async()=>{throw Error('Acceptance disk failure');};try{await p.cards.pages.editCard(s.id,'card-page-source',{title:'Must not persist'});}catch{}finally{p.saveSettings=save;}return JSON.stringify(before)===JSON.stringify(p.cards.pages.read());`)?check('native settings failure rolls back custom layout',true):check('native settings failure rolls back custom layout',false);
  // One batched inspection: page, settings, and narrow navigation.
  evaluate(`${setup}const r=s.leaf.view.hostEl.getBoundingClientRect(),win=require('@electron/remote').getCurrentWindow();s.win=win;require('fs').writeFileSync('${dir}/wide.png',(await win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.min(850,Math.ceil(r.height))})).toPNG());w.openLayoutMenu();[...document.querySelectorAll('.menu-item')].find(e=>e.textContent.includes('管理页面')).click();return true;`);
  await until(`return !!document.querySelector('.noria-page-settings');`);await pause(200);
  evaluate(`${setup}require('fs').writeFileSync('${dir}/settings.png',(await s.win.webContents.capturePage()).toPNG());[...p.cards.modals].find(m=>m.constructor.name==='PageSettings').close();s.leaf.view.hostEl.style.width='390px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');return true;`);
  await pause(250);
  check('390px navigation stays within the workbench',evaluate(`${setup}const nav=w.nav;return nav.scrollWidth<=nav.clientWidth+1&&nav.getBoundingClientRect().right<=w.host.getBoundingClientRect().right+1;`));
  evaluate(`${setup}const r=w.host.getBoundingClientRect();require('fs').writeFileSync('${dir}/narrow-dark.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:390,height:Math.min(850,Math.ceil(r.height))})).toPNG());w.host.style.width='320px';return true;`);
  await pause(200);
  check('320px navigation remains reachable',evaluate(`${setup}return w.nav.scrollWidth<=w.nav.clientWidth+1&&!!w.tabs.querySelector('button');`));
  evaluate(`${setup}await p.cards.pages.update(config=>config.pages=config.pages.filter(e=>e.id!==s.id));return true;`);
  check('removing the active page returns to a valid page without deleting source notes',evaluate(`${setup}return w.active!=='page-missing'&&w.active!==s.id&&!!p.cards.pages.get(w.active)&&await app.vault.adapter.read(s.path)===s.raw+'\\n新的阅读安排。\\n';`));
 }finally{
  if(owned)evaluate(`${setup}s.extra?.detach();if(s.flush&&w.diary)w.diary.flush=s.flush;for(const m of [...p.cards.modals]){if(m.constructor.name==='PageSettings'||m.constructor.name==='CardCatalog'){m.dirty=false;m.close(true);}}w.host.style.width=s.width;document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);if(s.original===null)delete p.settings.workbenchPages;else p.settings.workbenchPages=s.original;p.settings.home=JSON.parse(s.home);p.settings.cardLayouts=JSON.parse(s.diary);await p.saveSettings();p.cards.emit();await w.syncPages();await w.show(s.state.page||'home',s.state.selection,s.state.intent);const file=app.vault.getAbstractFileByPath(s.path);if(file)await app.vault.delete(file);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaPagesTest;return true;`);
  fs.writeFileSync(dir+'/result.json',JSON.stringify({checks},null,2));
 }
 fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(error=>{console.error(error);process.exit(1);});
