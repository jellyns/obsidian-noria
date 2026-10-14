"use strict";
const {Modal,Notice}=require('obsidian');
const {homeCopy,homeMatch,forgetWidget}=require('./card-placement.js');
function confirmDelete(system,title,remove){
  const modal=new Modal(system.app);modal.setTitle(system.text('删除卡片？','Delete card?'));
  modal.contentEl.createEl('p',{text:system.text(`删除“${title}”在本页的配置。原笔记、任务、账目和健康数据都会保留，其他页面不受影响。`,`Delete the placement of “${title}” on this page. Source notes, tasks, transactions, health data and other pages are kept.`)});
  const actions=modal.contentEl.createDiv({cls:'noria-card-confirm-actions'});
  const cancel=actions.createEl('button',{text:system.text('取消','Cancel')});cancel.onclick=()=>modal.close();
  const accept=actions.createEl('button',{text:system.text('删除卡片','Delete card'),cls:'mod-warning'});
  accept.onclick=async()=>{accept.disabled=true;try{await remove();modal.close();new Notice(system.text('卡片配置已删除','Card placement deleted'));}catch(error){accept.disabled=false;new Notice(error.message);}};
  modal.open();cancel.focus();
}
function lifecycleActions(system,widget,context,doc){
  const result=[];
  if(context.page!=='home'){
    const match=homeMatch(system.plugin.settings.home.widgets,widget);
    const go=async()=>{await system.plugin.app.workspace.getLeavesOfType('noria-dashboard-home')[0]?.view.workbench?.show('home');};
    result.push({label:match?.enabled!==false&&match?system.text('已在主页 · 前往','On Home · Open'):system.text('添加到主页','Add to Home'),icon:'house',run:async()=>{
      // Recheck on activation; a second window may have added the same card.
      const current=homeMatch(system.plugin.settings.home.widgets,widget);
      if(current&&current.enabled!==false){await go();return;}
      const copy=current?{...current,enabled:true}:homeCopy(widget);await system.saveHome(copy);
      const fragment=doc.createDocumentFragment();fragment.append(doc.createTextNode(system.text('已添加到主页 ','Added to Home ')));
      const undo=doc.createElement('button');undo.textContent=system.t('undo');fragment.append(undo);
      const open=doc.createElement('button');open.textContent=system.text('前往','Open');fragment.append(open);
      const notice=new Notice(fragment,8000);open.onclick=()=>{notice.hide();void go();};
      undo.onclick=async()=>{undo.disabled=true;try{if(current)await system.removeHome(copy.id);else await system.changeHomeCards(home=>forgetWidget(home,copy.id),'cards:undo-add');notice.hide();}catch(error){undo.disabled=false;new Notice(error.message);}};
    }});
  }
  return result;
}
module.exports={confirmDelete,lifecycleActions};
