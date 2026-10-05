// Installed UI flow in NoriaTest. Restores owned settings and closes only its test leaf.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const dir=process.env.NORIA_TEMPLATE_EVIDENCE||'F:/NoriaTest/_acceptance-release-rules-20261002/templates';
const command=(...args)=>execFileSync('obsidian',['vault=NoriaTest',...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const evaluate=code=>{const raw=command('eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`),i=raw.indexOf('=> ');if(i<0)throw Error(raw.slice(-900));return JSON.parse(raw.slice(i+3));};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<35;i++){if(evaluate(code))return;await pause(100);}throw Error('Timed out: '+code);}
const setup='const s=globalThis.__noriaStatTemplateTest,p=app.plugins.plugins.noria,w=s.leaf.view.workbench,m=[...p.cards.modals].find(m=>m.constructor.name==="CardCatalog");';
(async()=>{
 fs.mkdirSync(dir,{recursive:true});const checks=[];let owned=false;
 const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
 try{
  evaluate(`const p=app.plugins.plugins.noria;if(p.cards.modals.size)throw Error('Close existing card editors first');const s={active:app.workspace.activeLeaf,page:'page-'+crypto.randomUUID(),pages:structuredClone(p.settings.workbenchPages??null),templates:structuredClone(p.settings.statisticTemplates??null),dark:document.body.classList.contains('theme-dark')};globalThis.__noriaStatTemplateTest=s;s.win=require('@electron/remote').getCurrentWindow();s.throttle=s.win.webContents.getBackgroundThrottling();s.win.webContents.setBackgroundThrottling(false);s.win.show();s.win.focus();s.leaf=app.workspace.getLeaf('tab');await s.leaf.setViewState({type:'noria-dashboard-home',active:true});return true;`);owned=true;
  await until(`${setup}return !!w;`);
  evaluate(`${setup}await p.cards.pages.update(config=>config.pages.push({id:s.page,title:'统计验收',widgets:[]}));await w.show(s.page);p.cards.catalog({page:'custom',pageId:s.page});return true;`);
  check('add card exposes a direct statistics entry',evaluate(`${setup}return !!m.contentEl.querySelector('.noria-stat-catalog-entry');`));
  evaluate(`${setup}m.contentEl.querySelector('.noria-stat-catalog-entry').click();return true;`);
  check('recommended templates use configured daily records',evaluate(`${setup}return m.contentEl.textContent.includes('心情')&&m.contentEl.textContent.includes('精力');`));
  evaluate(`${setup}m.contentEl.querySelector('[data-tab="styles"]').click();document.body.classList.add('theme-light');document.body.classList.remove('theme-dark');return true;`);
  check('all eleven chart defaults and eight dashboard statistics are present',evaluate(`${setup}return m.contentEl.querySelectorAll('[data-stat-template^="style-"]').length===11&&m.contentEl.querySelectorAll('[data-stat-template^="dashboard-"]').length===8;`));
  await pause(180);evaluate(`${setup}const r=m.modalEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/gallery-light.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());m.contentEl.querySelector('[data-stat-template="style-line"]').click();return true;`);
  await until(`${setup}return !!m.contentEl.querySelector('.noria-property-stat');`);
  check('preview reads actual configured record and recent date range',evaluate(`${setup}return m.draft.props.property==='energy'&&m.contentEl.querySelector('.noria-stat-range').textContent.includes('9');`));
  evaluate(`${setup}const days=m.contentEl.querySelector('[data-card-field="days"]');days.value='7';days.dispatchEvent(new Event('input',{bubbles:true}));m.draft.props.tag='acceptance-statistics';const style=m.contentEl.querySelector('[data-card-field="display"]');style.value='columns';style.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
  await until(`${setup}return m.draft.props.display==='columns'&&!!m.contentEl.querySelector('[data-card-field="days"]');`);
  check('changing chart preserves property, range and filters',evaluate(`${setup}return m.draft.props.days===7&&m.draft.props.tag==='acceptance-statistics'&&m.draft.props.property==='energy';`));
  evaluate(`${setup}m.contentEl.querySelector('.noria-stat-template-save').click();const form=m.templateSaveEl;form.querySelector('input').value='验收·精力周趋势';s.writer=p.saveSettings;p.saveSettings=async()=>{throw Error('Template persistence failure');};form.querySelector('button.mod-cta').click();return true;`);
  await until(`${setup}return m.templateSaveEl.textContent.includes('Template persistence failure');`);
  check('failed save preserves typed name and draft without adding template',evaluate(`${setup}p.saveSettings=s.writer;delete s.writer;return m.templateSaveEl.querySelector('input').value==='验收·精力周趋势'&&m.draft.props.tag==='acceptance-statistics'&&!p.propertyStats.templateLibrary.read().some(t=>t.title==='验收·精力周趋势');`));
  evaluate(`${setup}m.templateSaveEl.querySelector('button.mod-cta').click();return true;`);
  await until(`${setup}return m.templateSaveEl.textContent.includes('已保存');`);
  evaluate(`${setup}s.template=p.propertyStats.templateLibrary.read().find(t=>t.title==='验收·精力周趋势');m.templateSaveEl.querySelector('button').click();m.modalEl.style.width='390px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');return true;`);
  await pause(200);
  check('390px dark editor fields and preview remain within content',evaluate(`${setup}const c=m.contentEl;return c.scrollWidth<=c.clientWidth+1&&getComputedStyle(c.querySelector('.noria-card-config-grid')).gridTemplateColumns.split(' ').length===1;`));
  evaluate(`${setup}const r=m.modalEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/editor-narrow-dark.png',(await s.win.webContents.capturePage({x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());m.modalEl.style.width='';document.body.classList.add('theme-light');document.body.classList.remove('theme-dark');await m.save();return true;`);
  await until(`${setup}return p.cards.pages.get(s.page).widgets.length===1;`);
  evaluate(`${setup}s.card=p.cards.pages.get(s.page).widgets[0];return true;`);
  command('plugin:reload','id=noria');
  await until(`${setup}return !!p.propertyStats&&!!w;`);
  check('template and independently added card survive plugin reload',evaluate(`${setup}return p.propertyStats.templateLibrary.read().some(t=>t.id===s.template.id)&&p.cards.pages.get(s.page).widgets[0].props.days===7;`));
  evaluate(`${setup}p.cards.catalog({page:'custom',pageId:s.page});return true;`);
  evaluate(`${setup}m.contentEl.querySelector('.noria-stat-catalog-entry').click();m.contentEl.querySelector('[data-tab="mine"]').click();m.contentEl.querySelector('[data-stat-template="'+s.template.id+'"]').click();return true;`);
  check('reusing a saved template creates a new placement with the same configuration',evaluate(`${setup}return m.draft.id!==s.card.id&&m.draft.props.property==='energy'&&m.draft.props.days===7&&m.draft.props.tag==='acceptance-statistics';`));
  evaluate(`${setup}await m.save();return true;`);
  evaluate(`${setup}p.cards.catalog({page:'custom',pageId:s.page});return true;`);
  evaluate(`${setup}m.contentEl.querySelector('.noria-stat-catalog-entry').click();m.contentEl.querySelector('[data-tab="mine"]').click();const tile=m.contentEl.querySelector('[data-stat-template="'+s.template.id+'"]').parentElement;tile.querySelector('.noria-stat-template-remove').click();tile.querySelector('.noria-stat-template-confirm button').click();return true;`);
  await until(`${setup}return !p.propertyStats.templateLibrary.read().some(t=>t.id===s.template.id);`);
  check('removing a template leaves both added cards intact',evaluate(`${setup}return p.cards.pages.get(s.page).widgets.length===2&&p.cards.pages.get(s.page).widgets.every(c=>c.props.property==='energy');`));
  // A restored older column setting must not silently become a metric.
  check('legacy date-column settings remain columns when edited',evaluate(`${setup}m.edit({...s.card,props:{...s.card.props,display:'trend'}});return m.draft.props.display==='columns'&&m.draft.props.days===7;`));
  evaluate(`${setup}const preview=m.preview.bind(m);m.preview=()=>s.preview=preview();m.statBaseWidget=null;m.statistics('styles');return true;`);
  const nativeIds=evaluate(`${setup}return [...m.contentEl.querySelectorAll('[data-stat-template^="dashboard-"]')].map(b=>b.dataset.statTemplate);`);
  for(const id of nativeIds){
   const result=evaluate(`${setup}m.statistics('styles');m.contentEl.querySelector('[data-stat-template="${id}"]').click();await s.preview;const mount=m.previewHost.querySelector('.noria-card-builtin-preview');return {id:m.draft.builtinId,source:m.draft.source,text:mount?.textContent||'',svg:mount?.querySelectorAll('svg').length||0,save:!!m.contentEl.querySelector('.noria-stat-template-save')};`);
   check('existing dashboard renderer previews '+id,result.id===id.replace('dashboard-','')&&result.text.length>5&&result.save&&!/加载失败|Load failed/.test(result.text));
   if(['dashboard-note-trend-card','dashboard-task-trend-card'].includes(id))check('combination chart keeps its SVG '+id,result.svg>0);
  }
  evaluate(`${setup}m.statistics('styles');m.contentEl.querySelector('[data-stat-template="dashboard-habit-history-card"]').click();await s.preview;m.draft.props.historyDays=14;await p.propertyStats.templateLibrary.save(m.draft,'验收·内置习惯');s.nativeTemplate=p.propertyStats.templateLibrary.read().find(t=>t.title==='验收·内置习惯');await m.save();return true;`);
  command('plugin:reload','id=noria');
  await until(`${setup}return !!p.propertyStats&&!!w;`);
  check('dashboard card and template preserve renderer and configuration after reload',evaluate(`${setup}const card=p.cards.pages.get(s.page).widgets.find(c=>c.builtinId==='habit-history-card');return card?.props.historyDays===14&&p.propertyStats.templateLibrary.read().some(t=>t.id===s.nativeTemplate.id&&t.kind==='dashboard');`));
  evaluate(`${setup}p.cards.catalog({page:'custom',pageId:s.page});return true;`);
  evaluate(`${setup}m.statistics('mine');m.contentEl.querySelector('[data-stat-template="'+s.nativeTemplate.id+'"]').click();return true;`);
  check('my templates reuses the dashboard card without converting it to generic statistics',evaluate(`${setup}return m.draft.type==='builtin'&&m.draft.source==='trends-and-stats'&&m.draft.builtinId==='habit-history-card'&&m.draft.props.historyDays===14;`));
  check('diary gallery explains cards whose period support is not ready',evaluate(`${setup}m.context={page:'diary',mode:'daily'};m.statistics('styles');return [...m.contentEl.querySelectorAll('[data-stat-template^="dashboard-"]')].every(b=>b.disabled)&&!m.contentEl.querySelector('[data-stat-template="style-line"]').disabled;`));
 }finally{
  if(owned)evaluate(`${setup}if(s.writer)p.saveSettings=s.writer;for(const modal of [...p.cards.modals])if(modal.constructor.name==='CardCatalog')modal.close(true);if(s.templates===null)delete p.settings.statisticTemplates;else p.settings.statisticTemplates=s.templates;if(s.pages===null)delete p.settings.workbenchPages;else p.settings.workbenchPages=s.pages;await p.saveSettings();s.leaf.detach();if(s.active?.parent)app.workspace.setActiveLeaf(s.active,{focus:true});document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaStatTemplateTest;return true;`);
  fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'incomplete',checks},null,2));
 }
 fs.writeFileSync(dir+'/result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(error=>{console.error(error);process.exitCode=1;});
