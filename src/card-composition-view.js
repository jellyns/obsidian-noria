"use strict";

// Reparent existing elements only. Editors, timers and render cleanup owners stay alive.
function applyCardComposition(root,entries){
  const groups=new Map(),units=[],wrappers=[...root.children].filter(el=>el.classList.contains('noria-card-stack'));
  for(const entry of entries){
    if(entry.stack&&!entry.host.hidden){if(!groups.has(entry.stack)){const unit=[];groups.set(entry.stack,unit);units.push(unit);}groups.get(entry.stack).push(entry);}
    else units.push([entry]);
  }
  const used=new Set(),ordered=[];
  const place=(parent,node,before)=>{if(node.parentElement!==parent||node!==before){if(parent.moveBefore&&node.isConnected)parent.moveBefore(node,before);else parent.insertBefore(node,before);}};
  for(const unit of units){
    if(unit.length<2){ordered.push(unit[0].host);continue;}
    const key=unit[0].stack;
    const wrapper=wrappers.find(el=>el.dataset.noriaStack===key)||root.createDiv({cls:'noria-card-stack'});
    wrapper.dataset.noriaStack=key;wrapper.style.setProperty('--noria-stack-span',String(unit[0].span||4));used.add(wrapper);
    let cursor=wrapper.firstElementChild;
    for(const {host} of unit){place(wrapper,host,cursor);cursor=host.nextElementSibling;}
    ordered.push(wrapper);
  }
  // Keep non-card chrome at the beginning of the grid.
  let cursor=[...root.children].find(el=>ordered.includes(el)||entries.some(entry=>entry.host===el)||wrappers.includes(el))||null;
  for(const node of ordered){place(root,node,cursor);cursor=node.nextElementSibling;}
  for(const wrapper of wrappers)if(!used.has(wrapper)){for(const child of [...wrapper.children])root.appendChild(child);wrapper.remove();}
}
function applyWidgetComposition(root,widgets){
  const model=require('./card-composition.js').widgetComposition(widgets);
  const hosts=new Map([...root.children].flatMap(el=>el.classList.contains('noria-card-stack')?[...el.children]:[el]).filter(el=>el.dataset.noriaWidgetId).map(host=>[host.dataset.noriaWidgetId,host]));
  for(const [id,host] of hosts){const state=model.cards[id];if(!state)continue;const span=require('./card-width.js').cardSpan(state);host.dataset.noriaWidgetSpan=String(span);host.style.setProperty('--noria-home-widget-span',String(span));}
  const hero=hosts.get('identity+metrics');
  const entries=model.order.flatMap(id=>hosts.has(id)?[{id,host:hosts.get(id),stack:model.cards[id].stack,span:Number(hosts.get(id).dataset.noriaWidgetSpan)||4}]:id==='identity'&&hero?[{id:'identity+metrics',host:hero,span:12}]:[]);
  applyCardComposition(root,entries);
  root._noriaStatisticsLayout?.();
}
function applyLiveWidgetComposition(plugin,pageId,widgets){
  const docs=new Set();plugin.app.workspace.iterateAllLeaves(leaf=>{if(leaf.view.containerEl?.ownerDocument)docs.add(leaf.view.containerEl.ownerDocument);});
  for(const doc of docs)for(const root of doc.querySelectorAll('.dashboard-home-root'))if(root.dataset.noriaCardPage===pageId)applyWidgetComposition(root,widgets);
}
module.exports={applyCardComposition,applyWidgetComposition,applyLiveWidgetComposition};
