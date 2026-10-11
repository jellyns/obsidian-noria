"use strict";
const {attachCardResize,openCardMenu}=require('./card-controls.js');
const {attachCardDirect,notifyHidden}=require('./card-direct-controls.js');
const {renderPicture}=require('./picture-picker.js');

// Mount the existing card grid with a page-local bridge; never replace home settings.
async function renderCardPage(workbench,pageId,panel){
  if(pageId==='media'&&!panel.dataset.mediaKind)return require('./media-page.js').renderMediaPage(workbench,panel,renderCardPage);
  const plugin=workbench.plugin,system=plugin.cards,store=system.pages;
  panel.__noriaHomeCleanup?.();panel.empty();
  const page=store.get(pageId);if(!page)return;
  const widgets=page.widgets;
  if(!widgets.some(w=>w.enabled!==false)){
    const empty=panel.createDiv({cls:'noria-custom-page-empty'});
    empty.createEl('h3',{text:store.label(page)});
    const add=empty.createEl('button',{text:store.text('添加卡片','Add a card'),cls:'mod-cta'});
    add.onclick=()=>system.catalog({page:'custom',pageId});return;
  }
  const bridge=plugin.buildRuntimeBridgeConfig();
  bridge.statisticsPageId=pageId;
  bridge.homeSettings={...bridge.homeSettings,widgets,
    ...(page.trendsRange?{trendsRange:page.trendsRange}:{}),...(page.dailyStateRange?{dailyStateRange:page.dailyStateRange}:{})};bridge.homeWidgetDefaults=[];
  bridge.getHomeTrendsRange=()=>plugin.normalizeHomeTrendsRangeInput(store.get(pageId)?.trendsRange||bridge.homeSettings.trendsRange||{});
  bridge.saveHomeTrendsRange=async value=>{const range=plugin.normalizeHomeTrendsRangeInput(value);await store.changeCards(pageId,(_,page)=>{page.trendsRange=range;});return {ok:true,range};};
  bridge.getHomeDailyStateRange=()=>plugin.normalizeHomeDailyStateRangeInput(store.get(pageId)?.dailyStateRange||bridge.homeSettings.dailyStateRange||{},bridge.homeSettings.defaults||{});
  bridge.saveHomeDailyStateRange=async value=>{const range=plugin.normalizeHomeDailyStateRangeInput(value,bridge.homeSettings.defaults||{});await store.changeCards(pageId,(_,page)=>{page.dailyStateRange=range;});return {ok:true,range};};
  bridge.homeEditMode=workbench.customEditing===true;
  const card= id=>store.get(pageId)?.widgets.find(w=>w.id===id);
  const edit=(id,patch)=>store.editCard(pageId,id,patch);
  bridge.diaryHabits.saveHistoryDays=async(id,days)=>{
    const widget=card(id);
    if(!widget||(widget.builtinId||widget.id)!=='habit-history-card'||![7,14,21,30,60,90,180,365].includes(days))throw Error('Invalid habit history range');
    return edit(id,{props:{...widget.props,historyDays:days}});
  };
  bridge.runtime.renderExtensionCard=(widget,mount,selection)=>system.render(widget,mount,{...selection,pageId,range:bridge.getHomeTrendsRange()});
  bridge.runtime.renderDailyRecordSummary=(host,range,options)=>plugin.propertyStats.renderDailySummary(host,range,{...options,context:{page:'custom',pageId},getWidget:card,saveWidget:widget=>store.saveCard(pageId,widget)});
  const setWidth=(id,span)=>store.compose(pageId,id,'width',span);
  const context={page:'custom',pageId};
  bridge.runtime.openHomeWidgetSettings=id=>system.catalog(context,id);
  bridge.runtime.openCardCatalog=()=>system.catalog(context);
  bridge.runtime.setHomeEditMode=value=>workbench.setLayoutEditing(value);
  bridge.runtime.openHomeWidgetMenu=(id,anchor,visibleIds)=>{
    const state=()=>({...card(id),first:visibleIds[0]===id,last:visibleIds.at(-1)===id});
    const getAnchor=()=>[...panel.querySelectorAll('[data-noria-widget-shell-action="menu"]')].find(el=>el.dataset.noriaWidgetId===id);
    const actions=[{label:store.text('卡片设置','Card settings'),run:()=>system.catalog(context,id)}];
    const local=anchor.closest('.dashboard-home-widget-shell')?._noriaConfigureWidget;
    if(local)actions.unshift({label:store.text('管理内容','Manage contents'),icon:'list',run:local});
    workbench.closeCardMenu=openCardMenu({app:plugin.app,anchor,title:system.title(card(id)),state,getAnchor,t:key=>system.t(key),actions,
      stackTargets:()=>visibleIds.filter(key=>key!==id).map(key=>({id:key,title:system.title(card(key))})),stack:(target,after)=>store.compose(pageId,id,'stack',{target,after}),unstack:card(id)?.layout?.stack?()=>store.compose(pageId,id,'unstack'):null,
      width:value=>setWidth(id,value),collapse:value=>edit(id,{collapsed:value}),
      move:direction=>{const index=visibleIds.indexOf(id),target=visibleIds[index+(direction==='up'?-1:1)];return target?store.compose(pageId,id,'reorder',{target,after:direction==='down',keepStack:true}):Promise.resolve();},
      height:()=>edit(id,{props:{...card(id)?.props,cardHeight:null}}),
      remove:async()=>{const undo=await store.removeCard(pageId,id);notifyHidden(anchor.ownerDocument,system.t('removed'),undo,system.t('undo'));},
      copy:()=>store.saveCard(pageId,{...JSON.parse(JSON.stringify(card(id))),id:`card-${crypto.randomUUID()}`,title:system.title(card(id))+store.text(' 副本',' copy'),order:Number(card(id).order)+1})});
  };
  bridge.runtime.attachHomeCardResize=(host,id)=>{
    const apply=()=>host.style.setProperty('--noria-card-height',card(id)?.props?.cardHeight?`${card(id).props.cardHeight}px`:'auto');apply();
    const decorate=()=>{const value=card(id)?.props?.picture;if(!value)return;const title=host.querySelector('.dashboard-card-heading-icon,.noria-card-heading-icon,.dashboard-guide-card__dot');if(title&&title.dataset.pictureRef!==value){title.dataset.pictureRef=value;renderPicture(plugin,title,value);}};
    const observer=new host.ownerDocument.defaultView.MutationObserver(decorate);observer.observe(host,{childList:true,subtree:true});decorate();
    const resize=attachCardResize(host,()=>card(id)?.props?.cardHeight,value=>edit(id,{props:{...card(id)?.props,cardHeight:value}}),store.text('调整卡片高度','Resize card height'));
    const direct=attachCardDirect(host,{state:()=>card(id)||{},t:key=>system.t(key),
      header:()=>host.querySelector('.dashboard-guide-card__head,.dashboard-workbench-panel__head,.noria-card-heading,.callout-title,.dashboard-home-widget-native-title-actions,.dashboard-home-trends-habit-history__head,.dashboard-moc-heading'),
      menu:()=>host.querySelector('[data-noria-widget-shell-action="menu"]'),width:value=>setWidth(id,value),reorder:(target,after)=>store.compose(pageId,id,'reorder',{target,after}),stack:(target,after)=>store.compose(pageId,id,'stack',{target,after})});
    return()=>{resize();direct();observer.disconnect();};
  };
  await plugin.runNoriaView('dashboardHome',{workbench:true,noriaBridge:bridge},panel);
  if(workbench.disposed||!panel.isConnected)panel.__noriaHomeCleanup?.();
}
module.exports={renderCardPage};
