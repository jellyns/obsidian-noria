const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const dir = 'F:/NoriaTest/_acceptance-inbox-work-20261005';
const notePath = 'Noria/Inbox/阅读材料待整理.md';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = code => {
  const source = `(async()=>JSON.stringify(await(async()=>{if(app.vault.getName()!=="NoriaTest")throw Error('NoriaTest only');const p=app.plugins.plugins.noria;${code}})()))()`;
  const raw = execFileSync('obsidian', ['vault=NoriaTest', 'eval', `code=eval(Buffer.from('${Buffer.from(source).toString('base64')}','base64').toString('utf8'))`], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (!raw.includes('=> ')) throw Error(raw);
  return JSON.parse(raw.slice(raw.indexOf('=> ') + 3));
};
const target = JSON.stringify(notePath);
const checks = [];
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
async function waitFor(code) {
  for (let i=0;i<50;i++) { if(evaluate(code)) return; await pause(100); }
  throw Error('Timed out: '+code);
}
const setup = `const card=document.querySelector('.noria-inbox-card'),row=card?.querySelector('[data-inbox-path="${notePath}"]');`;
const sector = (actor,action) => `.noria-inbox-sector[data-actor="${actor}"][data-action="${action}"]`;
const mouse = (type,x,y) => evaluate(`require('@electron/remote').getCurrentWindow().webContents.sendInputEvent({type:'${type}',x:${Math.round(x)},y:${Math.round(y)},button:'left',clickCount:1});return true;`);
async function capture(name) {
  evaluate(`${setup}await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=card.getBoundingClientRect();require('fs').writeFileSync('${dir}/${name}.png',(await require('@electron/remote').getCurrentWindow().webContents.capturePage({x:Math.max(0,Math.floor(r.x)),y:Math.max(0,Math.floor(r.y)),width:Math.ceil(r.width),height:Math.ceil(r.height)})).toPNG());return true;`);
}
async function hold() {
  const point=evaluate(`${setup}const r=row.querySelector('.noria-inbox-title').getBoundingClientRect();return {x:r.left+40,y:r.top+12};`);
  mouse('mouseDown',point.x,point.y);await pause(350);
  await waitFor(`${setup}return !card.querySelector('.noria-inbox-layer').hidden;`);
  return point;
}
async function drop(actor,action) {
  const point=evaluate(`${setup}const label=card.querySelector('${sector(actor,action)} .noria-inbox-sector-label').getBoundingClientRect();return {x:label.left+label.width/2,y:label.top+label.height/2};`);
  mouse('mouseMove',point.x,point.y);await pause(100);
  check('hover draws one connector',evaluate(`${setup}return !!card.querySelector('.noria-inbox-flow path').getAttribute('d');`));
  await capture('arcs-hover');
  mouse('mouseUp',point.x,point.y);
  await waitFor(`${setup}return row?.querySelector('.noria-inbox-mark').dataset.inboxWork==='${actor}：${action}';`);
}
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const before=evaluate(`return await app.vault.read(app.vault.getAbstractFileByPath(${target}));`);
 const state=evaluate(`const win=require('@electron/remote').getCurrentWindow();const state={throttle:win.webContents.getBackgroundThrottling(),dark:document.body.classList.contains('theme-dark')};win.webContents.setBackgroundThrottling(false);win.show();win.focus();return state;`);
 fs.writeFileSync(dir+'/note-before.md',before);
 const folder='_acceptance-inbox-work-20261005/move-target';
 let restored=false;
 try {
  evaluate(`await p.buildRuntimeBridgeConfig().inbox.updateWork({path:${target},work:''});await app.commands.executeCommandById('noria:open-home-tab');return true;`);
  await waitFor(`${setup}return !!row?.getClientRects().length && row.querySelector('.noria-inbox-mark').hidden;`);
  check('unassigned notes have no Next step control and no stage lanes',evaluate(`${setup}return !card.querySelector('.dashboard-inbox-lanes')&&!card.querySelector('.dashboard-inbox-work')&&!card.textContent.includes('待处理')&&!card.textContent.includes('处理中');`));
  check('filters are in the header on the right',evaluate(`${setup}const filters=card.querySelector('.noria-inbox-filters'),title=card.querySelector('.dashboard-workbench-panel__title');return filters.closest('.dashboard-workbench-panel__head')&&filters.getBoundingClientRect().left>title.getBoundingClientRect().right&&filters.querySelector('select').selectedOptions[0].textContent==='全';`));
  await capture('list');
  const beforeOpen=evaluate(`${setup}return {height:card.closest('.dashboard-home-widget-shell').getBoundingClientRect().height,scroll:card.closest('.dashboard-home-widget-native-content').scrollTop};`);
  await hold();
  check('opening arcs preserves card height and list scroll',evaluate(`${setup}return card.closest('.dashboard-home-widget-shell').getBoundingClientRect().height===${beforeOpen.height}&&card.closest('.dashboard-home-widget-native-content').scrollTop===${beforeOpen.scroll};`));
  check('expanded arcs stay inside the card viewport',evaluate(`${setup}const viewport=card.closest('.dashboard-home-widget-native-content').getBoundingClientRect(),layer=card.querySelector('.noria-inbox-layer').getBoundingClientRect();return layer.top>=viewport.top-1&&layer.bottom<=viewport.bottom+1;`));
  check('separate edge arcs expose seven choices and aligned custom sectors',evaluate(`${setup}const left=card.querySelector('${sector('我','自定义')} span').getBoundingClientRect(),right=card.querySelector('${sector('SI','自定义')} span').getBoundingClientRect(),exit=card.querySelector('.noria-inbox-exit').getBoundingClientRect();return card.querySelectorAll('.noria-inbox-sector').length===7&&Math.abs(left.y-right.y)<1&&Math.abs((left.y+left.height/2)-(exit.y+exit.height/2))<3;`));
  await drop('SI','整理');check('real hold-drag-release writes the intended assignment',true);
  await pause(450);
  evaluate(`${setup}row.querySelector('.noria-inbox-mark').click();return true;`);
  check('counts include all notes with the assignment',evaluate(`${setup}const total=app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(p.getManagedPath('inboxRoot')+'/')&&app.metadataCache.getFileCache(f)?.frontmatter?.['inbox-work']==='SI：整理').length;return Number(card.querySelector('${sector('SI','整理')} small').textContent)===total;`));
  evaluate(`${setup}card.querySelector('${sector('我','自定义')}').click();return true;`);
  evaluate(`${setup}const form=card.querySelector('.noria-inbox-form form');form.querySelector('input').value='比较结论';form.requestSubmit();return true;`);
  await waitFor(`${setup}return row?.querySelector('.noria-inbox-mark').dataset.inboxWork==='我：比较结论';`);
  check('custom work persists',true);
  evaluate(`${setup}card.querySelector('[data-actor-filter="SI"]').click();return true;`);
  check('SI filter hides work assigned to me',evaluate(`${setup}return !row;`));
  evaluate(`${setup}card.querySelector('[data-actor-filter="我"]').click();return true;`);
  check('human filter finds the same note',evaluate(`${setup}return !!row;`));
  evaluate(`${setup}const select=card.querySelector('.noria-inbox-action-filter');select.value='比较结论';select.dispatchEvent(new Event('change'));return true;`);
  check('action filter uses the actual custom action',evaluate(`${setup}return !!row&&card.querySelectorAll('.noria-inbox-item').length===1;`));
  evaluate(`${setup}const select=card.querySelector('.noria-inbox-action-filter');select.value='';select.dispatchEvent(new Event('change'));card.querySelector('[data-actor-filter=""]').click();return true;`);
  await hold();
  const point=evaluate(`${setup}const r=card.querySelector('.noria-inbox-exit').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
  mouse('mouseMove',point.x,point.y);mouse('mouseUp',point.x,point.y);
  await waitFor(`${setup}return !card.querySelector('.noria-inbox-form').hidden&&!!card.querySelector('.noria-inbox-form select');`);
  check('dragging to Move out opens a real destination choice',true);
  evaluate(`if(!app.vault.getAbstractFileByPath('${folder}'))await app.vault.createFolder('${folder}');return true;`);
  // Reopen the destination list after creating the isolated test folder.
  evaluate(`${setup}card.querySelector('.noria-inbox-form button').click();row.querySelector('.noria-inbox-mark').click();card.querySelector('.noria-inbox-exit').click();const form=card.querySelector('.noria-inbox-form form');form.querySelector('select').value='${folder}';form.requestSubmit();return true;`);
  const moved=folder+'/阅读材料待整理.md';
  await waitFor(`return !!app.vault.getAbstractFileByPath('${moved}')&&!app.vault.getAbstractFileByPath(${target});`);
  const content=evaluate(`return await app.vault.read(app.vault.getAbstractFileByPath('${moved}'));`);
  check('move preserves body and removes temporary properties',!content.includes('inbox-work:')&&content.includes('## 阅读材料待整理'));
  await waitFor(`${setup}return !card.querySelector('.noria-inbox-receipt').hidden;`);
  evaluate(`${setup}[...card.querySelectorAll('.noria-inbox-receipt button')].find(el=>el.textContent==='撤销').click();return true;`);
  await waitFor(`return !!app.vault.getAbstractFileByPath(${target})&&!app.vault.getAbstractFileByPath('${moved}');`);
  check('undo returns note and its assignment',evaluate(`return (await app.vault.read(app.vault.getAbstractFileByPath(${target}))).includes('我：比较结论');`));
  await waitFor(`${setup}return !!row;`);
  evaluate(`${setup}globalThis.__inboxCardStyle=card.getAttribute('style');const shell=card.closest('.dashboard-home-widget-shell');globalThis.__inboxShellStyle=shell.getAttribute('style');shell.style.setProperty('--noria-card-height','240px');card.style.width='320px';card.style.maxWidth='320px';document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');return true;`);
  check('320px header stays within card',evaluate(`${setup}const r=card.getBoundingClientRect();return [...card.querySelectorAll('.dashboard-workbench-panel__head button,.noria-inbox-action-filter')].filter(el=>el.getClientRects().length).every(el=>el.getBoundingClientRect().right<=r.right+1);`));
  await capture('list-narrow-dark');
  evaluate(`${setup}row.querySelector('.noria-inbox-mark').click();return true;`);
  check('compact card keeps its 240px height and all actions visible',evaluate(`${setup}const r=card.closest('.dashboard-home-widget-native-content').getBoundingClientRect();return Math.abs(r.height-240)<2&&[...card.querySelectorAll('.noria-inbox-sector-label,.noria-inbox-exit,.noria-inbox-cancel')].every(el=>{const b=el.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom;});`));
  await capture('arcs-narrow-dark');
  evaluate(`${setup}card.querySelector('.noria-inbox-cancel').click();if(globalThis.__inboxCardStyle===null)card.removeAttribute('style');else card.setAttribute('style',globalThis.__inboxCardStyle);delete globalThis.__inboxCardStyle;if(globalThis.__inboxShellStyle!=null)card.closest('.dashboard-home-widget-shell').setAttribute('style',globalThis.__inboxShellStyle);delete globalThis.__inboxShellStyle;return true;`);
 } finally {
  evaluate(`${setup}card?.querySelector('.noria-inbox-cancel')?.click();if(globalThis.__inboxCardStyle!=null&&card)card.setAttribute('style',globalThis.__inboxCardStyle);delete globalThis.__inboxCardStyle;if(globalThis.__inboxShellStyle!=null)card.closest('.dashboard-home-widget-shell').setAttribute('style',globalThis.__inboxShellStyle);delete globalThis.__inboxShellStyle;document.body.classList.toggle('theme-dark',${state.dark});document.body.classList.toggle('theme-light',${!state.dark});const moved=app.vault.getAbstractFileByPath('${folder}/阅读材料待整理.md');if(moved&&!app.vault.getAbstractFileByPath(${target}))await app.fileManager.renameFile(moved,${target});await app.vault.modify(app.vault.getAbstractFileByPath(${target}),${JSON.stringify(before)});require('@electron/remote').getCurrentWindow().webContents.setBackgroundThrottling(${state.throttle});return true;`);
  restored=evaluate(`return await app.vault.read(app.vault.getAbstractFileByPath(${target}))===${JSON.stringify(before)};`);
  fs.writeFileSync(dir+'/arcs-result.json',JSON.stringify({checks,restored},null,2));
 }
 check('sample restored byte for byte',restored);
 fs.writeFileSync(dir+'/arcs-result.json',JSON.stringify({status:'passed',checks,restored},null,2));
 console.log(JSON.stringify({status:'passed',checks:checks.length,dir}));
})().catch(error=>{console.error(error);process.exitCode=1;});
