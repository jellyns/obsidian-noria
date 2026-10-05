// Isolated installed-chart acceptance; only UUID-owned notes and a temporary catalog.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const denseOnly=process.argv.includes('--donut-only');
const dir=denseOnly?'F:/NoriaTest/_acceptance-donut-inspection-20261002':'F:/NoriaTest/_acceptance-category-quality-20261002';
const command=(...args)=>execFileSync('obsidian',['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`),i=raw.indexOf('=> ');if(i<0)throw Error(raw.slice(-900));return JSON.parse(raw.slice(i+3));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const setup='const s=globalThis.__noriaCategoryTest,p=app.plugins.plugins.noria,m=[...p.cards.modals].find(m=>m.constructor.name==="CardCatalog");';
async function until(code){for(let i=0;i<35;i++){if(evaluate(code))return;await pause(100);}throw Error('Native update timed out');}
async function capture(name){if(process.argv.includes('--no-screenshots'))return;await pause(180);evaluate(`${setup}const r=m.modalEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/'+${JSON.stringify(name)}+'.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());return true;`);}
(async()=>{
 fs.mkdirSync(dir,{recursive:true});const checks=[];let owned=false;
 const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
 try{
  evaluate(`const p=app.plugins.plugins.noria;if(p.cards.modals.size||globalThis.__noriaCategoryTest)throw Error('Existing editor/test');globalThis.__noriaCategoryTest={folder:'_noria-category-'+crypto.randomUUID(),files:[],dark:document.body.classList.contains('theme-dark'),edit:p.propertyStats.editPoint};return true;`);owned=true;
  evaluate(`${setup}s.win=require('@electron/remote').getCurrentWindow();s.throttle=s.win.webContents.getBackgroundThrottling();s.win.webContents.setBackgroundThrottling(false);s.win.show();s.win.focus();await app.vault.createFolder(s.folder);const names=['研究与写作','运动','阅读','生活整理','项目讨论与长期知识积累的完整分类名称','家庭','出行','学习','休闲','音乐','计划','其他'];for(let i=0;i<names.length;i++){const file=s.folder+'/'+i+'.md';await app.vault.create(file,['---','category_value: '+(i===0?1000:1),'tags: ['+names[i]+']','---',''].join(String.fromCharCode(10)));s.files.push(file);}p.cards.catalog({page:'custom'});s.config={source:'notes',folder:s.folder,property:'category_value',calculate:'sum',group:'tag',display:'donut',scope:'all',appearance:{showLegend:false}};return true;`);
  await until(`${setup}const r=await p.propertyStats.query(s.config);return r.groups.length===12;`);
  evaluate(`${setup}m.statistics('styles');const preview=m.preview.bind(m);m.preview=()=>s.preview=preview();m.contentEl.querySelector('[data-stat-template="style-donut"]').click();m.edit({...m.draft,title:'分类占比',props:s.config});await s.preview;m.modalEl.style.width='640px';return true;`);
  check('all twelve categories stay accessible with the legend hidden',evaluate(`${setup}return !m.contentEl.querySelector('.noria-stat-bars')&&m.contentEl.querySelectorAll('.noria-leader-donut__slice[role="button"]').length===12;`));
  check('dense leader labels do not collide',evaluate(`${setup}const labels=[...m.contentEl.querySelectorAll('.noria-leader-donut__slice > text')].filter(e=>e.getAttribute('text-anchor')!=='middle');return ['start','end'].every(side=>{const r=labels.filter(e=>e.getAttribute('text-anchor')===side).map(e=>e.getBoundingClientRect()).sort((a,b)=>a.top-b.top);return r.every((a,i)=>!i||a.top>=r[i-1].bottom+2);});`));
  check('a tiny category opens its own numeric source editor',evaluate(`${setup}const slices=[...m.contentEl.querySelectorAll('.noria-leader-donut__slice')];s.tinyKey=slices.find(e=>e.querySelector('desc').textContent.includes(' · 1 · ')).getAttribute('data-category-key');slices.find(e=>e.getAttribute('data-category-key')===s.tinyKey).querySelector('text:last-of-type').dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;`));
  await until(`${setup}return !!document.querySelector('.noria-record-popover input[type="number"]');`);
  check('the source editor reads the real tiny value',evaluate(`${setup}return document.querySelector('.noria-record-popover input').value==='1';`));
  evaluate(`${setup}const pop=document.querySelector('.noria-record-popover');pop.querySelector('input').value='3';pop.querySelector('form').requestSubmit();return true;`);
  await until(`${setup}return !document.querySelector('.noria-record-popover');`);
  check('saving writes only the selected category and recalculates its total',evaluate(`${setup}const r=await p.propertyStats.query(s.config);return r.groups.find(g=>g.key===s.tinyKey).value===3&&r.value===1013&&r.groups.filter(g=>g.value===1).length===10;`));
  evaluate(`${setup}await m.preview();p.propertyStats.editPoint=(anchor,rows)=>s.opened=rows.map(r=>r.path);const g=[...m.contentEl.querySelectorAll('.noria-leader-donut__slice')].find(e=>e.getAttribute('data-category-key')===s.tinyKey);g.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true;`);
  check('keyboard activation retains the category source mapping',evaluate(`${setup}const r=await p.propertyStats.query(s.config);return JSON.stringify(s.opened)===JSON.stringify(r.groups.find(g=>g.key===s.tinyKey).rows.map(r=>r.path));`));
  // The normal catalog preview is inert; enable it temporarily to inspect focus persistence.
  evaluate(`${setup}const g=m.contentEl.querySelector('.noria-leader-donut__slice');for(let e=g;e&&e!==m.modalEl;e=e.parentElement)e.inert=false;g.focus();s.focusKey=g.getAttribute('data-category-key');m.modalEl.style.width='390px';return true;`);
  await pause(180);
  check('resize preserves keyboard focus on the same category',evaluate(`${setup}return document.activeElement?.getAttribute('data-category-key')===s.focusKey;`));
  for(const narrow of [false,true]){
   for(const style of (denseOnly?['donut']:['donut','bars','composition'])){
    evaluate(`${setup}m.modalEl.style.width='${narrow?390:640}px';document.body.classList.toggle('theme-dark',${narrow});document.body.classList.toggle('theme-light',${!narrow});m.draft.props={...s.config,display:'${style}',appearance:{showLegend:${style!=='donut'}}};await m.preview();return true;`);
    await pause(150);
    check(`${style} ${narrow?'narrow dark':'wide light'} has no horizontal overflow`,evaluate(`${setup}const host=m.contentEl.querySelector('.noria-property-stat');return host.scrollWidth<=host.clientWidth+1&&m.contentEl.scrollWidth<=m.contentEl.clientWidth+1;`));
    if(style==='donut')check(`long Chinese labels fit their columns (${narrow?'narrow':'wide'})`,evaluate(`${setup}const svg=m.contentEl.querySelector('.noria-leader-donut svg').getBoundingClientRect();return [...m.contentEl.querySelectorAll('.noria-leader-donut__slice > text')].filter(e=>e.getAttribute('text-anchor')!=='middle').every(e=>{const r=e.getBoundingClientRect();return r.left>=svg.left&&r.right<=svg.right;});`));
    if(style==='bars')check(`bar rows share one comparison baseline and retain full names (${narrow?'narrow':'wide'})`,evaluate(`${setup}const rows=[...m.contentEl.querySelectorAll('.noria-stat-bar')],tracks=rows.map(e=>e.querySelector('.noria-stat-bar-track').getBoundingClientRect());return rows.every(e=>e.title.includes(e.querySelector('.noria-stat-bar-label').textContent))&&tracks.every(r=>Math.abs(r.left-tracks[0].left)<1&&Math.abs(r.width-tracks[0].width)<1);`));
    if(style==='composition')check(`tiny shares remain proportional and have full size source rows (${narrow?'narrow':'wide'})`,evaluate(`${setup}const segments=[...m.contentEl.querySelectorAll('.noria-distribution-segment')],rows=[...m.contentEl.querySelectorAll('.noria-distribution-item')];rows.at(-1).click();return segments.length===12&&Math.min(...segments.map(e=>parseFloat(e.style.width)))<.1&&rows.every(e=>e.getBoundingClientRect().height>=28)&&s.opened.length===1;`));
    await capture(style+(narrow?'-narrow-dark':'-light'));
    if(style==='donut'){
     evaluate(`${setup}const g=[...m.contentEl.querySelectorAll('.noria-leader-donut__slice')].find(e=>e.querySelector('desc').textContent.includes('项目讨论'));for(let e=g;e&&e!==m.modalEl;e=e.parentElement)e.inert=false;g.focus();s.inspectKey=g.getAttribute('data-category-key');return true;`);
     check(`focused truncated category shows its complete name and values (${narrow?'narrow':'wide'})`,evaluate(`${setup}const host=m.contentEl.querySelector('.noria-leader-donut'),hint=host.querySelector('.noria-donut-inspection'),slice=[...host.querySelectorAll('.noria-leader-donut__slice')].find(e=>e.getAttribute('data-category-key')===s.inspectKey);return !hint.hidden&&hint.textContent===slice.querySelector('desc').textContent&&hint.textContent.includes('项目讨论与长期知识积累的完整分类名称');`));
     check(`focused trace is above the other leaders and stays readable (${narrow?'narrow':'wide'})`,evaluate(`${setup}const host=m.contentEl.querySelector('.noria-leader-donut'),g=document.activeElement,front=host.querySelector('svg > g[aria-hidden="true"]');return front.style.display!=='none'&&front.lastElementChild.getAttribute('points')===g.querySelector('polyline').getAttribute('points')&&[...host.querySelectorAll('.noria-leader-donut__slice')].filter(e=>e!==g).every(e=>e.querySelector('polyline').style.opacity==='0.18');`));
     check(`full-name readout remains inside the chart (${narrow?'narrow':'wide'})`,evaluate(`${setup}const host=m.contentEl.querySelector('.noria-leader-donut').getBoundingClientRect(),hint=m.contentEl.querySelector('.noria-donut-inspection').getBoundingClientRect();return hint.left>=host.left-1&&hint.right<=host.right+1&&hint.top>=host.top-1&&hint.bottom<=host.bottom+1;`));
     await capture('donut-inspect'+(narrow?'-narrow-dark':'-light'));
     evaluate(`${setup}document.activeElement.blur();return true;`);
     check(`leaving the category clears the transient inspection (${narrow?'narrow':'wide'})`,evaluate(`${setup}return m.contentEl.querySelector('.noria-donut-inspection').hidden&&[...m.contentEl.querySelectorAll('.noria-leader-donut__slice polyline')].every(e=>e.style.opacity==='1');`));
    }
   }
  }
 }finally{
  fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'incomplete',checks},null,2));
  if(owned)evaluate(`${setup}p.propertyStats.editPoint=s.edit;document.querySelector('.noria-record-popover')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));if(m)m.close(true);for(const name of s.files){const file=app.vault.getAbstractFileByPath(name);if(file)await app.vault.delete(file);}const path=require('path'),root=path.resolve(app.vault.adapter.getBasePath()),target=path.resolve(root,s.folder);if(path.dirname(target)!==root||!/^_noria-category-[0-9a-f-]{36}$/.test(s.folder))throw Error('Unexpected fixture path');if(require('fs').existsSync(target))require('fs').rmdirSync(target);document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaCategoryTest;return true;`);
 }
 fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(error=>{console.error(error);process.exitCode=1;});
