const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const dir='F:/NoriaTest/_acceptance-page-card-entry-20261002';
const evaluate=code=>{const raw=execFileSync('obsidian',['vault=NoriaTest','eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`],{encoding:'utf8',timeout:30000,windowsHide:true});if(!raw.includes('=> '))throw Error(raw.slice(-1000));return JSON.parse(raw.slice(raw.indexOf('=> ')+3));};
const setup='const s=globalThis.__noriaEntryTest,p=app.plugins.plugins.noria,w=s.leaf.view.workbench;';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<50;i++){if(evaluate(setup+code))return;await pause(100);}throw Error('Timeout: '+code);}
(async()=>{let owned=false;const checks=[];
 const check=(name,code)=>{assert.ok(evaluate(setup+code),name);checks.push(name);};
 try{
  evaluate(`const p=app.plugins.plugins.noria;if(p.cards.modals.size||globalThis.__noriaEntryTest)throw Error('Existing editor or test');const s={active:app.workspace.activeLeaf,home:JSON.stringify(p.settings.home),pages:JSON.stringify(p.settings.workbenchPages),editing:p._homeEditMode===true,dark:document.body.classList.contains('theme-dark')};globalThis.__noriaEntryTest=s;s.win=require('@electron/remote').getCurrentWindow();s.throttle=s.win.webContents.getBackgroundThrottling();s.win.webContents.setBackgroundThrottling(false);s.win.show();s.win.focus();s.leaf=app.workspace.getLeaf('tab');await s.leaf.setViewState({type:'noria-dashboard-home',active:true});return true;`);owned=true;
  await until('return !!w;');evaluate(`${setup}await w.show('home');await w.setLayoutEditing(false);return true;`);
  await until(`return !!s.leaf.view.containerEl.querySelector('.dashboard-hero-strip__metrics > .dashboard-home-widget-shell-actions [data-noria-widget-id="metrics"]');`);
  evaluate(`${setup}s.win.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});document.activeElement?.blur();return true;`);await pause(200);
  check('default overview has no heading or visible idle menu',`const host=s.leaf.view.containerEl.querySelector('.dashboard-hero-strip__metrics'),actions=host.querySelector('.dashboard-home-widget-shell-actions');return !w.isLayoutEditing()&&!host.querySelector('.dashboard-hero-metrics-heading')&&getComputedStyle(actions.querySelector('button')).opacity==='0';`);
  evaluate(`${setup}const r=s.leaf.view.containerEl.querySelector('.dashboard-hero-strip__metrics').getBoundingClientRect();s.win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(r.x+20),y:Math.round(r.y+20)});return true;`);await pause(200);
  check('hover reveals the overview menu without layout editing',`const b=s.leaf.view.containerEl.querySelector('.dashboard-hero-strip__metrics > .dashboard-home-widget-shell-actions button');return b.getBoundingClientRect().width>=20&&getComputedStyle(b).opacity==='1';`);
  evaluate(`${setup}s.win.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});s.leaf.view.containerEl.querySelector('.dashboard-hero-strip__metrics > .dashboard-home-widget-shell-actions button').focus();return true;`);await pause(200);
  check('keyboard focus also reveals the overview menu',`const b=s.leaf.view.containerEl.querySelector('.dashboard-hero-strip__metrics > .dashboard-home-widget-shell-actions button');return document.activeElement===b&&getComputedStyle(b).opacity==='1';`);
  evaluate(`${setup}s.leaf.view.containerEl.querySelector('.dashboard-hero-strip__metrics > .dashboard-home-widget-shell-actions button').click();return true;`);
  await until(`return !!document.querySelector('.noria-card-menu-action');`);
  evaluate(`${setup}const r=s.leaf.view.hostEl.getBoundingClientRect(),menu=document.querySelector('.noria-card-menu').getBoundingClientRect();require('fs').writeFileSync('${dir}/overview-menu.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(Math.min(r.width,innerWidth-r.x)),height:Math.ceil(Math.min(Math.max(menu.bottom-r.y+8,280),innerHeight-r.y))})).toPNG());[...document.querySelectorAll('.noria-card-menu-action')].find(b=>b.textContent.includes('卡片设置')).click();return true;`);
  await until(`return !!document.querySelector('.noria-card-catalog [data-card-field="statsRange"]');`);
  check('visible overview menu opens the actual existing metrics editor',`const m=[...p.cards.modals].find(m=>m.draft?.id==='metrics');return !!m&&m.context.page==='home'&&document.querySelectorAll('[data-overview-field]').length===8;`);
  evaluate(`${setup}for(const m of [...p.cards.modals])m.close(true);await w.show('diary');w.layoutButton.click();return true;`);
  await until(`return [...document.querySelectorAll('.menu-item-title')].some(e=>e.textContent==='添加本页卡片');`);
  check('page menu clearly separates current-page actions and page management',`const names=[...document.querySelectorAll('.menu-item-title')].map(e=>e.textContent);return ['添加本页卡片','调整本页布局','管理页面'].every(x=>names.includes(x));`);
  evaluate(`${setup}const r=w.nav.getBoundingClientRect(),menu=document.querySelector('.menu').getBoundingClientRect(),x=Math.max(0,Math.floor(Math.min(r.x,menu.x)));require('fs').writeFileSync('${dir}/page-menu.png',(await s.win.webContents.capturePage({x,y:Math.max(0,Math.floor(r.y)),width:Math.ceil(Math.min(Math.max(r.right,menu.right)-x+8,innerWidth-x)),height:Math.ceil(Math.min(menu.bottom-r.y+10,innerHeight-r.y))})).toPNG());[...document.querySelectorAll('.menu-item-title')].find(e=>e.textContent==='添加本页卡片').click();return true;`);
  await until(`return !!document.querySelector('.noria-card-catalog');`);
  check('diary add action uses the diary context',`return [...p.cards.modals].some(m=>m.context?.page==='diary');`);
  evaluate(`${setup}for(const m of [...p.cards.modals])m.close(true);await w.setLayoutEditing(true);w.layoutButton.click();return true;`);
  await until(`return [...document.querySelectorAll('.menu-item-title')].some(e=>e.textContent==='完成布局调整');`);
  check('settings stays a menu while arranging, with a separate finish control',`return w.isLayoutEditing()&&w.layoutButton.getAttribute('aria-label')==='页面设置'&&!w.finishLayoutButton.hidden;`);
  evaluate(`${setup}document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));w.finishLayoutButton.click();return true;`);
  await until('return !w.isLayoutEditing();');
  check('finish control exits layout mode without changing the page',`return w.active==='diary'&&w.finishLayoutButton.hidden;`);
  evaluate(`${setup}await w.show('home');return true;`);
  for(const narrow of [false,true]){
   evaluate(`${setup}s.leaf.view.hostEl.style.width='${narrow?360:1120}px';s.leaf.view.hostEl.style.maxWidth='100%';document.body.classList.toggle('theme-dark',${narrow});document.body.classList.toggle('theme-light',${!narrow});w.pages.get('home').panel.scrollTop=0;return true;`);await pause(250);
   check(`overview and navigation fit ${narrow?'narrow dark':'wide light'}`,`const host=s.leaf.view.hostEl,hero=host.querySelector('.dashboard-hero-strip');return hero.scrollWidth<=hero.clientWidth+1&&w.nav.scrollWidth<=w.nav.clientWidth+1&&host.querySelector('.dashboard-hero-strip__metrics > .dashboard-home-widget-shell-actions button').getBoundingClientRect().width>=20;`);
   evaluate(`${setup}const r=s.leaf.view.hostEl.getBoundingClientRect(),hero=s.leaf.view.hostEl.querySelector('.dashboard-hero-strip').getBoundingClientRect();require('fs').writeFileSync('${dir}/home-${narrow?'narrow-dark':'wide-light'}.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(Math.min(r.width,innerWidth-r.x)),height:Math.ceil(Math.min(hero.bottom-r.y+8,innerHeight-r.y))})).toPNG());return true;`);
  }
  check('entry validation does not change card or page settings',`return JSON.stringify(p.settings.home)===s.home&&JSON.stringify(p.settings.workbenchPages)===s.pages;`);
 }finally{
  fs.writeFileSync(dir+'/native-result.json',JSON.stringify({status:'incomplete',checks},null,2));
  if(owned)evaluate(`${setup}for(const m of [...p.cards.modals])m.close(true);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));if(p._homeEditMode!==s.editing)await p.setHomeEditMode(s.editing);s.leaf.detach();if(s.active?.parent)app.workspace.setActiveLeaf(s.active,{focus:true});document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaEntryTest;return true;`);
 }
 fs.writeFileSync(dir+'/native-result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
