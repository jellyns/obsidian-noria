"use strict";
const {setIcon, setTooltip, Notice, Menu, Modal} = require("obsidian");
let activeMenu = null;

function iconButton(parent, icon, label, action) {
  const button=parent.createEl("button",{cls:"clickable-icon noria-card-icon",attr:{type:"button","aria-label":label}});
  setIcon(button,icon); setTooltip(button,label);
  if(action)button.addEventListener("click",action);
  return button;
}

// Every card uses Obsidian's native menu and the same layout submenu.
function addCardLayoutMenuItems(menu,{state,openWidth,move,height,collapse,copy,stackTargets,stack,unstack,t,run}){
  const value=state();
  menu.addItem(item=>{
    item.setTitle(t("layout")).setIcon("layout-dashboard");const sub=item.setSubmenu();
    sub.addItem(entry=>entry.setTitle(t("width")).setIcon("move-horizontal").onClick(()=>run(openWidth)));
    sub.addSeparator();
    for(const direction of ["up","down"])sub.addItem(entry=>entry.setTitle(t(direction)).setIcon("arrow-"+direction).setDisabled(direction==="up"?value.first===true:value.last===true).onClick(()=>run(()=>move(direction))));
    const targets=stackTargets?.()||[];
    if(stack&&targets.length)sub.addItem(entry=>{entry.setTitle(t('stack')).setIcon('panels-top-left');const choices=entry.setSubmenu();for(const target of targets)choices.addItem(option=>{
      option.setTitle(target.title).setIcon('square');const positions=option.setSubmenu();
      for(const after of [false,true])positions.addItem(position=>position.setTitle(t(after?'stackBelow':'stackAbove')).setIcon(after?'panel-bottom':'panel-top').onClick(()=>run(()=>stack(target.id,after))));
    });});
    if(unstack)sub.addItem(entry=>entry.setTitle(t('unstack')).setIcon('columns-2').onClick(()=>run(unstack)));
    if(height)sub.addItem(entry=>entry.setTitle(t("autoHeight")).setIcon("fold-vertical").onClick(()=>run(()=>height(null))));
    sub.addItem(entry=>entry.setTitle(t(value.collapsed?"expand":"collapse")).setIcon(value.collapsed?"chevron-down":"chevron-up").onClick(()=>run(()=>collapse(!value.collapsed))));
    if(copy)sub.addSeparator();
    if(copy)sub.addItem(entry=>entry.setTitle(t("copy")).setIcon("copy").onClick(()=>run(copy)));
  });
}

function openCardMenu({app,anchor,title,state,actions=[],move,width,collapse,height,copy,remove,deleteCard,stackTargets,stack,unstack,getAnchor,t}){
  activeMenu?.(false);
  const menu=new Menu(),doc=anchor.ownerDocument;
  let closed=false,busy=false,restoreFocus=true;
  const currentAnchor=()=>getAnchor?.()||anchor;
  const close=(focus=true)=>{restoreFocus=focus;if(!closed)menu.hide();};
  const run=async action=>{
    if(busy)return;busy=true;close(false);
    try{await action();}catch(error){new Notice(error.message||String(error));}
    finally{busy=false;const active=doc.activeElement;if(!active||active===doc.body)currentAnchor()?.focus({preventScroll:true});}
  };
  const card=anchor.closest('.noria-diary-card,.dashboard-home-widget-shell');
  let hasContents=false;
  const rangeActions=card?.querySelector('.dashboard-home-trends-range-controls')?._noriaRangeMenuItems?.()||[];
  for(const action of [...rangeActions,...actions,...card?._noriaRecordActions||[]]){
    hasContents=true;
    menu.addItem(item=>{item.setTitle(action.label).setIcon(action.icon||'settings-2').onClick(()=>run(action.run));if(action.checked!==undefined)item.setChecked(action.checked);});
  }
  for(const source of card?.querySelectorAll('[data-noria-card-explanation]')||[]){
    hasContents=true;
    menu.addItem(item=>item.setTitle(source.dataset.noriaCardExplanation).setIcon('info').onClick(()=>run(()=>{
      const modal=new Modal(app);modal.setTitle(source.dataset.noriaCardExplanation);
      modal.contentEl.createDiv({cls:'noria-card-explanation',text:source.textContent});modal.open();
    })));
  }
  if(hasContents)menu.addSeparator();
  addCardLayoutMenuItems(menu,{state,openWidth:()=>require("./card-width-picker.js").openCardWidth({anchor:currentAnchor(),state,width,t,getAnchor}),move,height,collapse,copy,stackTargets,stack,unstack,t,run});
  if(remove)menu.addItem(item=>item.setTitle(t('remove')).setIcon('circle-minus').onClick(()=>run(remove)));
  if(deleteCard){menu.addSeparator();menu.addItem(item=>item.setTitle(t('delete')).setIcon('trash-2').onClick(()=>run(deleteCard)));}
  menu.onHide(()=>{
    if(closed)return;closed=true;anchor.setAttribute('aria-expanded','false');currentAnchor()?.setAttribute('aria-expanded','false');
    if(restoreFocus)currentAnchor()?.focus({preventScroll:true});if(activeMenu===close)activeMenu=null;
  });
  anchor.setAttribute('aria-haspopup','menu');anchor.setAttribute('aria-expanded','true');
  const rect=anchor.getBoundingClientRect();activeMenu=close;
  menu.showAtPosition({x:rect.right,y:rect.bottom,left:true},doc);
  return close;
}

function attachCardResize(host,getHeight,saveHeight,label){
  const handle=iconButton(host,"grip-horizontal",label);handle.addClass("noria-card-resize");
  let drag=null;
  const preview=value=>host.style.setProperty("--noria-card-height",`${Math.max(120,Math.min(1200,value))}px`);
  const cancel=()=>{if(!drag)return;host.style.setProperty("--noria-card-height",drag.saved?`${drag.saved}px`:"auto");drag=null;};
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={y:event.clientY,height:host.getBoundingClientRect().height,saved:getHeight(),value:null};handle.setPointerCapture(event.pointerId);};
  handle.onpointermove=event=>{if(drag){drag.value=Math.max(120,Math.min(1200,Math.round(drag.height+event.clientY-drag.y)));preview(drag.value);}};
  handle.onpointerup=()=>{const value=drag?.value;drag=null;if(value!=null)Promise.resolve(saveHeight(value)).catch(e=>{host.style.setProperty("--noria-card-height",getHeight()?`${getHeight()}px`:"auto");new Notice(e.message);});};
  handle.onpointercancel=cancel;handle.onlostpointercapture=cancel;
  const key=event=>{if(event.key==="Escape"&&drag){event.preventDefault();event.stopPropagation();cancel();}};
  host.ownerDocument.addEventListener("keydown",key,true);
  handle.onkeydown=event=>{if(event.key==="Home"){event.preventDefault();Promise.resolve(saveHeight(null)).catch(e=>new Notice(e.message));return;}if(["ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();const value=Math.round(host.getBoundingClientRect().height)+(event.key==="ArrowUp"?-16:16);Promise.resolve(saveHeight(value)).catch(e=>new Notice(e.message));}};
  return()=>{cancel();host.ownerDocument.removeEventListener("keydown",key,true);handle.remove();};
}
module.exports={iconButton,openCardMenu,addCardLayoutMenuItems,attachCardResize};
