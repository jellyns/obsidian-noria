const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const dir='F:/NoriaTest/_acceptance-card-editor-20261002';
const evaluate=code=>{const raw=execFileSync('obsidian',['vault=NoriaTest','eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`],{encoding:'utf8',timeout:30000,windowsHide:true});if(!raw.includes('=> '))throw Error(raw.slice(-900));return JSON.parse(raw.slice(raw.indexOf('=> ')+3));};
const setup='const s=globalThis.__noriaEditorTest,p=app.plugins.plugins.noria,w=s.leaf.view.workbench,m=[...p.cards.modals][0];';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(code){for(let i=0;i<45;i++){if(evaluate(setup+code))return;await pause(100);}throw Error('Timeout: '+code);}
(async()=>{let owned=false;const checks=[];const check=(name,code)=>{assert.ok(evaluate(setup+code),name);checks.push(name);};
try{
 evaluate(`const p=app.plugins.plugins.noria;if(p.cards.modals.size||globalThis.__noriaEditorTest)throw Error('An editor or test is open');const s={active:app.workspace.activeLeaf,layouts:structuredClone(p.settings.cardLayouts),home:JSON.stringify(p.settings.home),save:p.saveSettings,render:p.cards.render,dark:document.body.classList.contains('theme-dark')};globalThis.__noriaEditorTest=s;s.win=require('@electron/remote').getCurrentWindow();s.throttle=s.win.webContents.getBackgroundThrottling();s.win.webContents.setBackgroundThrottling(false);s.win.show();s.win.focus();s.leaf=app.workspace.getLeaf('tab');await s.leaf.setViewState({type:'noria-dashboard-home',active:true});return true;`);owned=true;
 await until('return !!w;');
 evaluate(`${setup}await w.show('diary',{mode:'weekly',anchorDate:'2026-09-16'});p.cards.catalog({page:'diary',mode:'weekly',selection:w.diary.selection});return true;`);
 evaluate(`${setup}const preview=m.preview.bind(m);m.preview=()=>s.preview=preview();m.statistics();m.contentEl.querySelector('[data-stat-template="dashboard-metrics"]').click();await s.preview;return true;`);
 check('the editor names the affected diary layouts',`return m.contentEl.textContent.includes('所有周记共用此卡片配置');`);
 evaluate(`${setup}const picker=m.contentEl.querySelector('[data-card-field="statsRange"]');picker.value='custom';picker.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
 await until(`return !!m.contentEl.querySelector('[data-card-field="statsRange.start"]')&&m.previewHost.textContent.includes('尚未应用');`);
 check('custom dates start from the selected historical diary week',`return m.contentEl.querySelector('[data-card-field="statsRange.start"]').value==='2026-09-14'&&m.contentEl.querySelector('[data-card-field="statsRange.end"]').value==='2026-09-20';`);
 evaluate(`${setup}document.body.classList.add('theme-light');document.body.classList.remove('theme-dark');m.contentEl.scrollTop=0;return true;`);await pause(150);
 evaluate(`${setup}const r=m.modalEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/editor-light.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(Math.min(r.width,innerWidth-r.x)),height:Math.ceil(Math.min(r.height,innerHeight-r.y))})).toPNG());const end=m.contentEl.querySelector('[data-card-field="statsRange.end"]');end.value='2026-09-01';end.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
 await until(`return m.previewHost.textContent.includes('开始日期不能晚于结束日期');`);
 check('invalid dates explain the problem without showing misleading data or applying',`return m.applyButton.disabled&&!m.previewHost.querySelector('.noria-diary-statistic')&&m.draft.props.statsRange.end==='2026-09-01';`);
 evaluate(`${setup}m.modalEl.style.width='390px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');m.previewHost.scrollIntoView({block:'center'});return true;`);await pause(150);
 check('narrow error feedback stays inside the editor',`return m.contentEl.scrollWidth<=m.contentEl.clientWidth+1;`);
 evaluate(`${setup}const r=m.modalEl.getBoundingClientRect();require('fs').writeFileSync('${dir}/editor-narrow-dark.png',(await s.win.webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(Math.min(r.width,innerWidth-r.x)),height:Math.ceil(Math.min(r.height,innerHeight-r.y))})).toPNG());const end=m.contentEl.querySelector('[data-card-field="statsRange.end"]');end.value='2026-09-20';end.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
 await until(`return !m.applyButton.disabled&&!!m.previewHost.querySelector('.noria-diary-statistic');`);
 check('correcting the input restores preview and Apply without losing the start date',`return m.contentEl.querySelector('[data-card-field="statsRange.start"]').value==='2026-09-14'&&m.previewHost.textContent.includes('尚未应用');`);
 evaluate(`${setup}s.calls=0;s.saveGate=new Promise(resolve=>s.releaseSave=resolve);p.saveSettings=async function(){if(m.saving){s.calls++;await s.saveGate;throw Error('Acceptance save failure');}return s.save.call(p);};s.pendingSave=m.save();return true;`);
 await until('return s.calls===1;');
 evaluate(`${setup}await m.preview();await m.save();m.close();return true;`);
 check('a preview cannot unlock Apply or close the editor while persistence is pending',`return m.saving&&m.applyButton.disabled&&m.contentEl.inert&&s.calls===1&&m.applyButton.textContent==='正在应用…';`);
 evaluate(`${setup}s.releaseSave();await s.pendingSave;return true;`);
 check('failed persistence rolls back settings while preserving editable draft and retry',`return !m.saving&&!m.contentEl.inert&&!m.applyButton.disabled&&m.errorEl.textContent.includes('修改已保留')&&m.draft.props.statsRange.start==='2026-09-14'&&JSON.stringify(p.settings.cardLayouts)===JSON.stringify(s.layouts);`);
 evaluate(`${setup}p.saveSettings=s.save;s.id=m.draft.id;await m.save();return true;`);
 await until('return p.cards.modals.size===0;');
 check('retry saves exactly one card with the chosen dates',`const matches=p.cards.layout('weekly').widgets.filter(x=>x.id===s.id);return matches.length===1&&matches[0].props.statsRange.start==='2026-09-14'&&matches[0].props.statsRange.end==='2026-09-20';`);
 evaluate(`${setup}p.cards.catalog({page:'diary',mode:'weekly',selection:w.diary.selection},s.id);return true;`);
 await until(`return m?.previewHost.textContent.includes('尚未应用');`);
 evaluate(`${setup}let first=true;s.oldGate=new Promise(resolve=>s.releaseOld=resolve);p.cards.render=async function(...args){if(first){first=false;await s.oldGate;}return s.render.apply(p.cards,args);};m.draft.props.statsRange={mode:'custom',start:'2026-08-01',end:'2026-08-02'};s.oldPreview=m.preview();m.draft.props.statsRange={mode:'custom',start:'2026-09-10',end:'2026-09-11'};await m.preview();s.releaseOld();await s.oldPreview;return true;`);
 check('a late preview cannot reinsert the previous range',`const views=[...m.previewHost.querySelectorAll('.noria-diary-statistic')];return views.length===1&&views[0].dataset.rangeStart==='2026-09-10'&&!m.previewHost.textContent.includes('2026年8月');`);
 check('preview-only changes leave saved card and Home configuration unchanged',`return p.cards.layout('weekly').widgets.find(x=>x.id===s.id).props.statsRange.start==='2026-09-14'&&JSON.stringify(p.settings.home)===s.home;`);
}finally{
 fs.writeFileSync(dir+'/native-result.json',JSON.stringify({status:'incomplete',checks},null,2));
 if(owned)evaluate(`${setup}s.releaseSave?.();s.releaseOld?.();p.saveSettings=s.save;p.cards.render=s.render;await s.pendingSave?.catch(()=>{});await s.oldPreview?.catch(()=>{});for(const modal of [...p.cards.modals])modal.close(true);s.leaf.detach();p.settings.cardLayouts=s.layouts;await p.saveSettings();p.cards.emit();if(s.active?.parent)app.workspace.setActiveLeaf(s.active,{focus:true});document.body.classList.toggle('theme-dark',s.dark);document.body.classList.toggle('theme-light',!s.dark);s.win.webContents.setBackgroundThrottling(s.throttle);delete globalThis.__noriaEditorTest;return true;`);
}
 fs.writeFileSync(dir+'/native-result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(e=>{console.error(e);process.exitCode=1;});
