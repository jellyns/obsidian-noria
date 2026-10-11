"use strict";
const focusDefaults=[
  {id:'focus-timer-card',type:'extension',schemaVersion:3,enabled:true,order:70,size:'medium',layout:{span:4,minWidth:220},title:'',titleKey:'home.focus.timer',source:'noria:focus',props:{cardHeight:274}}

];
function ensureHomeFocusCards(home){
  if(home.focusCardsVersion>=1)return home;
  const widgets=[...(home.widgets||[])],removed=new Set(home.removedWidgetIds||[]);
  const after=anchor=>{const order=Number(anchor?.order)||52;const next=widgets.filter(w=>Number(w.order)>order).sort((a,b)=>a.order-b.order)[0];return next?(order+Number(next.order))/2:order+1;};
  let timer=widgets.find(w=>w.source==='noria:focus');
  if(!timer&&!removed.has(focusDefaults[0].id)){
    timer={...focusDefaults[0],props:{...focusDefaults[0].props},order:after(widgets.find(w=>w.id==='today-tasks-card'))};widgets.push(timer);
  }

  return {...home,focusCardsVersion:1,widgets:widgets.sort((a,b)=>a.order-b.order)};
}
module.exports={focusDefaults,ensureHomeFocusCards};
