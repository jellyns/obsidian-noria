// Installed task-calendar states only; no note writes or settings changes.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const dir='F:/NoriaTest/_acceptance-release-rules-20261002';
const evaluate=code=>{const raw=execFileSync('obsidian',['vault=NoriaTest','eval',`code=(async()=>JSON.stringify(await (async()=>{if(app.vault.getName()!=="NoriaTest")throw Error("NoriaTest only");${code}})()))()`],{encoding:'utf8',timeout:30000,windowsHide:true}),i=raw.indexOf('=> ');if(i<0)throw Error(raw.slice(-800));return JSON.parse(raw.slice(i+3));};
const setup='const s=globalThis.__noriaReleaseRulesTest,p=app.plugins.plugins.noria;';
(async()=>{
 const checks=[];let owned=false;
 const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,ok:true});};
 try{
  evaluate(`const p=app.plugins.plugins.noria;if(p.cards.modals.size||globalThis.__noriaReleaseRulesTest)throw Error('Existing editor/test');globalThis.__noriaReleaseRulesTest={active:app.workspace.activeLeaf,shot:p._tasksItemOneShot};return true;`);owned=true;
  evaluate(`${setup}s.leaf=app.workspace.getLeaf('tab');p.setTasksItemViewInput({view:'month',startPosition:'2026-09-26'});await s.leaf.setViewState({type:'noria-tasks-calendar',active:true});return true;`);
  check('month view exposes genuine date endpoints with matching spacing states',evaluate(`${setup}const root=s.leaf.view.hostEl.querySelector('.tasksCalendar'),handles=[...root.querySelectorAll('.tc-month-date-handle')];s.handles=handles.length;return root.getAttribute('view')==='month'&&handles.length>0&&handles.every(h=>{const edge=h.dataset.edge,row=h.parentElement;return row.classList.contains('tc-month-resizable-'+edge)&&getComputedStyle(row).getPropertyValue('--tc-month-resize-'+(edge==='due'?'end':'start')+'-space').trim()==='10px';});`));
  check('non-endpoint segments do not reserve resize padding',evaluate(`${setup}return [...s.leaf.view.hostEl.querySelectorAll('.tc-cal-item')].every(row=>['start','due'].every(edge=>row.classList.contains('tc-month-resizable-'+edge)===!!row.querySelector('.tc-month-date-handle[data-edge="'+edge+'"]')));`));
  evaluate(`${setup}p.setTasksItemViewInput({view:'week',startPosition:'2026-09-26'});await s.leaf.view.reload();return true;`);
  check('week headers preserve space for their expand-day control',evaluate(`${setup}const root=s.leaf.view.hostEl.querySelector('.tasksCalendar'),buttons=[...root.querySelectorAll('.tc-week-day-focus')];s.weekButtons=buttons.length;return root.getAttribute('view')==='week'&&buttons.length===7&&buttons.every(b=>b.parentElement.classList.contains('tc-week-day-focusable')&&parseFloat(getComputedStyle(b.parentElement.querySelector('.cellName')).paddingRight)>=26);`));
  check('installed recovery command remains available',evaluate(`${setup}return !!app.commands.commands['noria:open-reply-library'];`));
  fs.writeFileSync(dir+'/calendar-state.json',JSON.stringify(evaluate(`${setup}return {monthHandles:s.handles,weekButtons:s.weekButtons};`),null,2));
 }finally{
  fs.writeFileSync(dir+'/calendar-result.json',JSON.stringify({status:'incomplete',checks},null,2));
  if(owned)evaluate(`${setup}s.leaf?.detach();p._tasksItemOneShot=s.shot;if(s.active?.parent)app.workspace.setActiveLeaf(s.active,{focus:true});delete globalThis.__noriaReleaseRulesTest;return true;`);
 }
 fs.writeFileSync(dir+'/calendar-result.json',JSON.stringify({status:'passed',checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
