"use strict";

function initialMediaStatus(items,locale) {
  const choices=locale==='zh'?['进行中','In progress']:['In progress','进行中'];
  return choices.find(status=>items.some(item=>item.properties.status===status))||'';
}

const {readingTarget}=require('./link-target.js');
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? value : null;
}
function completionGroups(items, today, months = 6) {
  const end = validDate(today);
  if (!end) throw Error('Invalid current date');
  const [year, month] = end.split('-').map(Number), groups = [];
  for (let offset = Math.max(1, Math.min(24, months)) - 1; offset >= 0; offset--) {
    const key = new Date(Date.UTC(year, month - 1 - offset, 1)).toISOString().slice(0, 7);
    groups.push({key, value: 0, rows: []});
  }
  for (const item of items) {
    const date = validDate(item.properties.finishedAt);
    if (!date || date > end) continue;
    const group = groups.find(group => group.key === date.slice(0, 7));
    if (group) { group.value++; group.rows.push(item); }
  }
  for (const group of groups) group.rows.sort((a,b)=>b.properties.finishedAt.localeCompare(a.properties.finishedAt)||a.path.localeCompare(b.path));
  return groups;
}
function completionScope(items, pageKind, selectedKind, today, months) {
  if (['book','movie','music','game'].includes(pageKind)) return pageKind;
  const kinds = ['book','movie','game'];
  if (kinds.includes(selectedKind)) return selectedKind;
  return kinds.find(kind => completionGroups(items.filter(item=>item.kinds.includes(kind)),today,months).some(group=>group.value))
    || kinds.find(kind=>items.some(item=>item.kinds.includes(kind))) || 'book';
}
function libraryWidgets(kind = '') {
  const widgets = [{id:'media-library', type:'extension', source:'noria:media-library', title:'', enabled:true, order:10, size:'full', layout:{colSpan:12}, props:{folder:''}}];
  if (kind !== 'music') widgets.push({id:'media-completions', type:'extension', source:'noria:media-summary', title:'', enabled:true, order:20, size:'wide', layout:{colSpan:6}, props:{months:6}});
  widgets.push({id:'media-distribution',type:'extension',source:'noria:media-distribution',title:'',enabled:true,order:30,size:kind==='music'?'full':'wide',layout:{colSpan:kind==='music'?12:6},props:{dimension:'tag'}});
  return widgets;
}
function libraryView(view={},kind='') {
  if(!Array.isArray(view.widgets))return {...view,widgets:libraryWidgets(kind)};
  const widgets=JSON.parse(JSON.stringify(view.widgets));
  // Removal keeps a disabled instance. Never reinsert it or duplicate a custom instance.
  if(!widgets.length||widgets.some(w=>w.source==='noria:media-distribution')||!widgets.some(w=>w.enabled!==false&&['noria:media-library','noria:media-summary'].includes(w.source)))return {...view,widgets};
  const untouched=kind!=='music'&&widgets.length===2&&widgets.every((w,i)=>
    w.id===(i?'media-completions':'media-library')&&w.source===(i?'noria:media-summary':'noria:media-library')&&w.enabled!==false&&!w.collapsed&&!w.title&&w.order===(i?20:10)&&w.size==='full'&&w.layout?.colSpan===12&&Object.keys(w.layout).length===1&&!w.props?.cardHeight)&&
    widgets[1].props?.months===6;
  if(untouched){widgets[1].size='wide';widgets[1].layout={colSpan:6};}
  const distribution=libraryWidgets(kind).at(-1);
  distribution.order=Math.max(0,...widgets.map(w=>Number(w.order)||0))+10;
  while(widgets.some(w=>w.id===distribution.id))distribution.id+='-default';
  widgets.push(distribution);
  return {...view,widgets};
}
module.exports = {readingTarget, validDate, completionGroups, completionScope, libraryWidgets, libraryView, initialMediaStatus};
