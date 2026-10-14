'use strict';
const {setIcon}=require('obsidian');
const {TOPICS,statisticTopic,normalizeStatisticsView,statisticPlacements}=require('./statistic-topics.js');

async function mountStatisticsPage(workbench,pageId,panel,bridge){
 const store=workbench.store,root=panel.querySelector('.dashboard-home-root');
 if(!root||!store.get(pageId)?.statisticsView)return;
 const t=(zh,en)=>store.text(zh,en),heading=panel.createDiv({cls:'noria-statistics-page-head'});
 panel.prepend(heading);heading.createEl('h2',{text:store.label(store.get(pageId))});
 const range=heading.createDiv({cls:'noria-statistics-page-range'}),rangeCleanups=[];
 await workbench.plugin.runNoriaView('.obsidian/plugins/noria/views/dashboard/home/sections/trends-and-stats',{noriaBridge:bridge,renderMode:'range',registerCleanup:fn=>rangeCleanups.push(fn)},range);
 const library=heading.createEl('button',{cls:'noria-statistics-library',attr:{type:'button'}});
 setIcon(library.createSpan(),'library');library.createSpan({text:t('统计库','Statistics library')});
 library.onclick=()=>{const {CardCatalog}=require('./card-catalog.js');const catalog=new CardCatalog(workbench.plugin.cards,{page:'custom',pageId});catalog.open();catalog.statistics();};
 let stopped=false;
 const apply=()=>{
  if(stopped)return;
  const page=store.get(pageId);if(!page)return;
  const config=normalizeStatisticsView(page.statisticsView),widgets=new Map(page.widgets.map(w=>[w.id,w]));
  const placements=statisticPlacements(page.widgets,config),focused=root.ownerDocument.activeElement?.dataset.statisticsSection;
  for(const old of root.querySelectorAll(':scope > .noria-statistics-section'))old.remove();
  const units=[...root.children].filter(el=>el.dataset.noriaWidgetId||el.classList.contains('noria-card-stack'));
  for(const unit of units)unit.classList.remove('is-stat-section-hidden');
  root.classList.toggle('noria-statistics-grouped',!workbench.customEditing);
  if(workbench.customEditing)return;
  const groups=new Map(),top=[];
  for(const unit of units){
   const cards=(unit.dataset.noriaWidgetId?[unit]:[...unit.children]).map(el=>widgets.get(el.dataset.noriaWidgetId)).filter(w=>w&&w.enabled!==false);
   if(!cards.length)continue;
   // A user-created stack stays intact when one of its cards is a main chart.
   const alternative=cards.every(w=>placements.get(w.id)==='alternative');
   if(!alternative&&cards.some(w=>config.pinned.includes(w.id)||(w.builtinId||w.id)==='metrics')){top.push(unit);continue;}
   const topic=statisticTopic(cards[0]),key=topic==='notes'?'tasks':topic;
   if(!groups.has(key))groups.set(key,{main:[],alternative:[]});
   groups.get(key)[alternative?'alternative':'main'].push(unit);
  }
  const place=node=>{if(root.moveBefore&&node.isConnected)root.moveBefore(node,null);else root.append(node);};
  // The overview precedes the trend pair without rewriting saved widths/order.
  const overview=top.filter(unit=>[unit,...unit.children].some(el=>(widgets.get(el.dataset.noriaWidgetId)?.builtinId||el.dataset.noriaWidgetId)==='metrics'));
  for(const node of [...overview,...top.filter(unit=>!overview.includes(unit))])place(node);
  for(const [key,zh,en]of TOPICS){
   const group=groups.get(key);if(!group)continue;
   const section=root.createDiv({cls:'noria-statistics-section noria-statistics-topic'});
   section.createEl('h3',{text:key==='tasks'?t('工作与积累','Work & learning'):t(zh,en)});
   for(const node of group.main)place(node);
   if(!group.alternative.length)continue;
   const open=config.expanded.includes(key),more=root.createDiv({cls:'noria-statistics-section noria-statistics-alternatives'});
   const button=more.createEl('button',{attr:{type:'button','data-statistics-section':key,'aria-expanded':String(open),'aria-label':t(zh,en)+' · '+t('其他样式','Other styles')}});
   setIcon(button.createSpan(),'chevron-right');button.createSpan({text:t('其他样式','Other styles')});
   button.onclick=async()=>{
    const restoreFocus=button===root.ownerDocument.activeElement;button.disabled=true;
    try{
     await updateView(workbench,pageId,view=>{view.expanded=view.expanded.includes(key)?view.expanded.filter(value=>value!==key):[...view.expanded,key];});
     if(restoreFocus)root.querySelector('[data-statistics-section="'+key+'"]')?.focus({preventScroll:true});
    }catch(error){button.disabled=false;workbench.error(error);}
   };
   for(const node of group.alternative){node.classList.toggle('is-stat-section-hidden',!open);place(node);}
  }
  if(focused)root.querySelector('[data-statistics-section="'+focused+'"]')?.focus({preventScroll:true});
 };
 root._noriaStatisticsLayout=apply;apply();
 const previous=panel.__noriaHomeCleanup;
 panel.__noriaHomeCleanup=()=>{stopped=true;rangeCleanups.forEach(fn=>fn());delete root._noriaStatisticsLayout;heading.remove();previous?.();};
}

async function updateView(workbench,pageId,change){
 await workbench.store.update(next=>{
  const page=next.pages.find(p=>p.id===pageId);if(!page?.statisticsView)return;
  const view=normalizeStatisticsView(page.statisticsView);change(view);page.statisticsView=view;
 },{layoutOnly:true,pageId});
 require('./card-composition-view.js').applyLiveWidgetComposition(workbench.plugin,pageId,workbench.store.get(pageId).widgets);
}
async function pinStatistic(workbench,pageId,id){
 await updateView(workbench,pageId,view=>{
  if(view.pinned.includes(id))view.pinned=view.pinned.filter(key=>key!==id);
  else{view.pinned.push(id);view.placement[id]='main';}
 });
}
async function placeStatistic(workbench,pageId,id,placement){
 await updateView(workbench,pageId,view=>{
  view.placement[id]=placement;
  if(placement==='alternative')view.pinned=view.pinned.filter(key=>key!==id);
 });
 const panel=workbench.pages.get(pageId)?.panel,topic=statisticTopic(workbench.store.get(pageId)?.widgets.find(w=>w.id===id)||{});
 const card=[...panel?.querySelectorAll('[data-noria-widget-id]')||[]].find(el=>el.dataset.noriaWidgetId===id);
 if(card&&!card.getClientRects().length)panel.querySelector('[data-statistics-section="'+(topic==='notes'?'tasks':topic)+'"]')?.focus({preventScroll:true});
}
module.exports={mountStatisticsPage,pinStatistic,placeStatistic};
