"use strict";
const {Notice}=require('obsidian');
const {PRESETS,cardSpan,spanLabel,canResizeCard,cardUnit}=require('./card-width.js');
let closeActive;

// The grid previews without writing settings; dismissal restores the saved layout.
function openCardWidth({anchor,state,width,t,getAnchor}){
  closeActive?.();
  const doc=anchor.ownerDocument,win=doc.defaultView;
  const card=anchor.closest('.noria-diary-card,.dashboard-home-widget-shell');
  const unit=cardUnit(card),original=unit?.style.gridColumn||'',initial=cardSpan(state());
  const panel=doc.body.createDiv({cls:'noria-card-width-picker',attr:{popover:'auto',role:'dialog','aria-label':t('width')}});
  const heading=panel.createDiv({cls:'noria-card-width-picker-head'});
  heading.createSpan({text:t(unit!==card?'stackWidth':'width')});const output=heading.createEl('output',{text:spanLabel(initial)});
  const choices=panel.createDiv({cls:'noria-card-width-presets'});
  let done=false,busy=false,keyboard=false;
  const close=(focus=true)=>{
    if(done)return;done=true;
    if(unit)unit.style.gridColumn=original;
    panel.remove();win.removeEventListener('resize',position);doc.removeEventListener('keydown',escape,true);
    detached.disconnect();if(closeActive===close)closeActive=null;
    if(focus)(getAnchor?.()||anchor)?.focus({preventScroll:true});
  };
  const commit=async span=>{
    if(busy)return;busy=true;close(false);
    try{if(span!==initial)await width(span);}catch(error){new Notice(error.message||String(error));}
    finally{const current=getAnchor?.()||anchor;if(doc.activeElement===doc.body)current?.focus({preventScroll:true});}
  };
  for(const span of PRESETS){
    const button=choices.createEl('button',{attr:{type:'button','aria-label':`${t('width')} ${spanLabel(span)}`,'aria-pressed':String(span===initial)}});
    const diagram=button.createSpan({cls:'noria-card-width-diagram',attr:{'aria-hidden':'true'}});
    diagram.createSpan().style.width=`${span/12*100}%`;
    button.createSpan({text:spanLabel(span)});button.onclick=()=>void commit(span);
  }
  const slider=panel.createEl('input',{attr:{type:'range',min:'3',max:'12',step:'1',value:String(initial),'aria-label':t('width'),'aria-valuetext':spanLabel(initial)}});
  slider.oninput=()=>{
    const span=Number(slider.value);output.textContent=spanLabel(span);slider.setAttribute('aria-valuetext',spanLabel(span));
    for(const [i,button] of [...choices.children].entries())button.setAttribute('aria-pressed',String(PRESETS[i]===span));
    if(card&&canResizeCard(card))unit.style.gridColumn=`span ${span}`;
  };
  slider.onpointerdown=()=>{keyboard=false;};
  slider.onkeydown=e=>{keyboard=true;if(e.key==='Enter'){e.preventDefault();void commit(Number(slider.value));}};
  slider.onchange=()=>{if(!keyboard)void commit(Number(slider.value));};
  const position=()=>{const r=anchor.getBoundingClientRect();panel.style.left=`${Math.max(8,Math.min(r.right-288,win.innerWidth-296))}px`;panel.style.top=`${Math.max(8,Math.min(r.bottom+6,win.innerHeight-panel.offsetHeight-8))}px`;};
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  const detached=new win.MutationObserver(()=>{if(!anchor.isConnected)close(false);});detached.observe(doc.body,{childList:true,subtree:true});
  panel.addEventListener('toggle',e=>{if(e.newState==='closed')close();});
  doc.addEventListener('keydown',escape,true);win.addEventListener('resize',position);
  panel.showPopover();position();slider.focus({preventScroll:true});closeActive=close;
  return close;
}
module.exports={openCardWidth};
