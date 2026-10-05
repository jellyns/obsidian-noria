const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const dir='F:/NoriaTest/_acceptance-card-catalog-20261002';
const evaluate=code=>{const raw=execFileSync('obsidian',['vault=NoriaTest','eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`],{encoding:'utf8',timeout:30000,windowsHide:true});return JSON.parse(raw.slice(raw.indexOf('=> ')+3));};
const setup='const s=globalThis.__noriaCatalogTest,p=app.plugins.plugins.noria,m=[...p.cards.modals].find(m=>m.constructor.name==="CardCatalog");';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(dir,{recursive:true});let owned=false;const checks=[];
 const check=(name,code)=>{assert.ok(evaluate(setup+code),name);checks.push({name,ok:true});};
 const capture=async name=>{await pause(180);evaluate(`${setup}const r=m.modalEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/${name}.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());return true;`);};
 try{
  evaluate(`const p=app.plugins.plugins.noria;if(p.cards.modals.size||globalThis.__noriaCatalogTest)throw Error('Existing editor/test');const win=require('@electron/remote').getCurrentWindow();globalThis.__noriaCatalogTest={dark:document.body.classList.contains('theme-dark'),win,throttle:win.webContents.getBackgroundThrottling()};win.webContents.setBackgroundThrottling(false);win.show();win.focus();p.cards.catalog({page:'custom'});return true;`);owned=true;
  evaluate(`${setup}const preview=m.preview.bind(m);m.preview=()=>s.preview=preview();return true;`);
  for(const narrow of [false,true]){
   evaluate(`${setup}m.list();m.modalEl.style.width='${narrow?390:800}px';document.body.classList.toggle('theme-dark',${narrow});document.body.classList.toggle('theme-light',${!narrow});return true;`);await pause(120);
   check(`card entry icon and label columns align (${narrow?'narrow':'wide'})`,`const list=m.contentEl.querySelector('.noria-card-catalog-list'),r=list.getBoundingClientRect();return [...list.querySelectorAll('.noria-card-choice')].every(b=>{const box=b.getBoundingClientRect(),icon=b.querySelector('.noria-card-choice-icon').getBoundingClientRect(),label=b.querySelector('strong').getBoundingClientRect();return Math.abs(icon.left-box.left-15)<2&&Math.abs(label.left-icon.left-34)<2&&box.left>=r.left-1&&box.right<=r.right+1;});`);
   check(`one statistics entry and named native icons (${narrow?'narrow':'wide'})`,`return m.contentEl.querySelectorAll('.noria-stat-catalog-entry').length===1&&![...m.contentEl.querySelectorAll('.noria-card-choice strong')].some(el=>el.textContent==='统计')&&new Set([...m.contentEl.querySelectorAll('.noria-card-choice-icon svg')].map(e=>e.getAttribute('class'))).size>8;`);
   check(`catalog has no horizontal overflow (${narrow?'narrow':'wide'})`,`return m.contentEl.scrollWidth<=m.contentEl.clientWidth+1;`);
   check(`catalog column count suits the available width (${narrow?'narrow':'wide'})`,`return getComputedStyle(m.contentEl.querySelector('.noria-card-catalog-list')).gridTemplateColumns.split(' ').length===${narrow?1:2};`);
   await capture('cards-'+(narrow?'narrow-dark':'wide-light'));
   evaluate(`${setup}const input=m.contentEl.querySelector('input[type=search]');input.value='no-such-card-345';input.dispatchEvent(new Event('input'));return true;`);
   check('empty card search has a working recovery',`const empty=m.contentEl.querySelector('.noria-card-catalog-empty');if(!empty)return false;empty.querySelector('button').click();return m.contentEl.querySelectorAll('.noria-card-choice').length>5;`);
   evaluate(`${setup}m.contentEl.querySelector('.noria-stat-catalog-entry').click();m.contentEl.querySelector('[data-tab="styles"]').click();return true;`);
   check(`all styles starts with basic editable chart types (${narrow?'narrow':'wide'})`,`return m.contentEl.querySelector('[data-stat-template]').dataset.statTemplate==='style-metric'&&m.contentEl.querySelectorAll('.noria-stat-template-note').length===1;`);
   check(`gallery has no horizontal overflow (${narrow?'narrow':'wide'})`,`return m.contentEl.scrollWidth<=m.contentEl.clientWidth+1;`);
   await capture('gallery-'+(narrow?'narrow-dark':'wide-light'));
   evaluate(`${setup}const input=m.contentEl.querySelector('input[type=search]');input.value='折线';input.dispatchEvent(new Event('input'));m.contentEl.querySelector('[data-stat-template="style-line"]').click();await s.preview;const days=m.contentEl.querySelector('[data-card-field="days"]');days.value='7';days.dispatchEvent(new Event('input',{bubbles:true}));return true;`);await pause(300);evaluate(`${setup}await s.preview;return true;`);
   check('editor keeps return, replacement and primary apply distinct',`return m.contentEl.querySelector('.noria-card-back').textContent.includes('统计模板')&&m.contentEl.querySelector('.noria-card-change-template').textContent==='更换模板'&&m.applyButton.classList.contains('mod-cta')&&m.contentEl.querySelector('.noria-stat-template-save');`);
   check('editor preview has loaded real content',`return !!m.previewHost.querySelector('.noria-stat-range')&&m.previewHost.textContent.includes('精力变化');`);
   await capture('editor-'+(narrow?'narrow-dark':'wide-light'));
   evaluate(`${setup}m.contentEl.querySelector('.noria-card-back').click();m.contentEl.querySelector('.noria-card-discard button').click();return true;`);
   check('keep editing retains the unsaved setting',`return m.draft.props.days===7&&!m.contentEl.querySelector('.noria-card-discard');`);
   evaluate(`${setup}m.contentEl.querySelector('.noria-card-back').click();m.contentEl.querySelectorAll('.noria-card-discard button')[1].click();return true;`);
   check('return restores search, selected category and keyboard focus',`return m.contentEl.querySelector('input[type=search]').value==='折线'&&m.contentEl.querySelector('[data-tab="styles"]').getAttribute('aria-pressed')==='true'&&document.activeElement.dataset.statTemplate==='style-line';`);
   evaluate(`${setup}const input=m.contentEl.querySelector('input[type=search]');input.value='not-a-template';input.dispatchEvent(new Event('input'));return true;`);
   check('empty template search can be cleared without losing the selected category',`const empty=m.contentEl.querySelector('.noria-card-catalog-empty');if(!empty)return false;empty.querySelector('button').click();return m.contentEl.querySelectorAll('[data-stat-template]').length>=11&&m.statNavigation.tab==='styles';`);
   evaluate(`${setup}m.contentEl.querySelector('.noria-card-back').click();return true;`);
   check('gallery return goes to card list',`return !!m.contentEl.querySelector('.noria-card-catalog-list');`);
  }
 }finally{
  fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'incomplete',checks},null,2));
  if(owned)evaluate(`${setup}m?.close(true);document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaCatalogTest;return true;`);
 }
 fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
