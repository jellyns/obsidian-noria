"use strict";
const {Notice}=require("obsidian");
const {iconButton}=require("./card-controls.js");
const {canResizeCard,nearestSpan,spanLabel,cardGrid,cardUnit}=require("./card-width.js");

function cardDrop(rect,x,y){
  const edges=[['left',x-rect.left,Math.min(48,rect.width*.2)],['right',rect.right-x,Math.min(48,rect.width*.2)],['top',y-rect.top,Math.min(48,rect.height*.2)],['bottom',rect.bottom-y,Math.min(48,rect.height*.2)]];
  const edge=edges.filter(([,distance,limit])=>distance>=0&&distance<=limit).sort((a,b)=>a[1]-b[1])[0]?.[0];
  return edge?{kind:edge==='top'||edge==='bottom'?'stack':'reorder',after:edge==='right'||edge==='bottom',edge}:null;
}

function isHeaderBlank(header,target){
  if(!header?.contains(target)||target.closest?.('button,a,input,select,textarea,summary,[contenteditable=true],svg,img,.noria-picture,.dashboard-card-heading-icon,.noria-card-heading-icon'))return false;
  return ![...target.childNodes].some(node=>node.nodeType===3&&node.textContent.trim());
}

// One gesture owner per card. Previews are transient; only pointer-up persists.
function attachCardDirect(host,{state,header,menu,width,reorder,stack,t}){
  const doc=host.ownerDocument,win=doc.defaultView;
  const edge=iconButton(host,"grip-vertical",t("resizeWidth"));edge.classList.add("noria-card-width-edge");
  let drag=null,busy=false,disposed=false,frame=0,boundHeader=null,headerAbort=null;
  const place=()=>{
    const target=header(),anchor=menu?.();
    if(anchor?.nextElementSibling)anchor.parentElement.appendChild(anchor);
    if(target&&target!==boundHeader){
      headerAbort?.abort();boundHeader?.classList.remove("noria-card-reorder-header");boundHeader=target;
      target.classList.add("noria-card-reorder-header");headerAbort=new win.AbortController();const options={signal:headerAbort.signal};
      target.addEventListener("pointerdown",e=>{if(isHeaderBlank(target,e.target)&&e.pointerType!=="touch")start(e,"move");},options);
      target.addEventListener("pointermove",e=>move(e),options);target.addEventListener("pointerup",()=>finish(),options);
      target.addEventListener("pointercancel",()=>clear(),options);target.addEventListener("lostpointercapture",()=>clear(),options);
    }
  };
  const observer=new win.MutationObserver(place);observer.observe(host,{childList:true,subtree:true});place();
  const responsive=new win.ResizeObserver(()=>{if(!drag)edge.hidden=!canResizeCard(host);});responsive.observe(cardGrid(host));
  const save=async action=>{
    if(busy||disposed)return;busy=true;host.setAttribute("aria-busy","true");
    const active=doc.activeElement,control=active===edge?".noria-card-width-edge":null;
    const scope=host.closest(".workspace-leaf-content")||doc,id=host.dataset.diaryCard||host.dataset.noriaWidgetId;
    try{await action();}catch(e){new Notice(e.message||String(e));}finally{
      busy=false;host.removeAttribute("aria-busy");if(!disposed)place();
      if(control&&(doc.activeElement===active||doc.activeElement===doc.body)){
        const current=[...scope.querySelectorAll(".dashboard-home-widget-shell,[data-diary-card]")].find(el=>(el.dataset.diaryCard||el.dataset.noriaWidgetId)===id);
        current?.querySelector(control)?.focus({preventScroll:true});
      }
    }
  };
  const clear=()=>{
    if(!drag)return null;const old=drag;drag=null;win.cancelAnimationFrame(frame);
    old.unit.style.gridColumn=old.column;host.classList.remove("noria-card-adjusting","noria-card-moving");
    old.indicator.remove();return old;
  };
  const start=(event,kind)=>{
    if(event.button!==0||busy)return;event.preventDefault();event.stopPropagation();
    clear();const unit=cardUnit(host),r=unit.getBoundingClientRect(),parent=cardGrid(host);
    const indicator=doc.body.createDiv({cls:kind==="width"?"noria-card-width-hint":"noria-card-drop-preview"});indicator.hidden=true;
    drag={kind,x:event.clientX,y:event.clientY,width:r.width,column:unit.style.gridColumn,unit,parent,total:parent.clientWidth,gap:parseFloat(win.getComputedStyle(parent).columnGap)||12,indicator,value:null,target:null};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=event=>{
    if(!drag)return;const d=drag;if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<5&&!d.value&&!d.target)return;
    if(d.kind==="width"){
      d.value=nearestSpan(d.width+event.clientX-d.x,d.total,d.gap);
      d.unit.style.gridColumn=`span ${d.value}`;host.classList.add("noria-card-adjusting");d.indicator.hidden=false;
      d.indicator.setText(spanLabel(d.value));
      const r=d.unit.getBoundingClientRect();Object.assign(d.indicator.style,{left:`${Math.max(8,Math.min(r.right-50,win.innerWidth-65))}px`,top:`${Math.max(8,r.top+8)}px`});
    }else{
      host.classList.add("noria-card-moving");
      const target=doc.elementsFromPoint(event.clientX,event.clientY).map(el=>el.closest?.("[data-noria-widget-id].dashboard-home-widget-shell,[data-diary-card]")).find(el=>el!==host&&cardGrid(el)===d.parent&&!el.hidden);
      const location=target&&cardDrop(target.getBoundingClientRect(),event.clientX,event.clientY);
      d.target=location?target:null;d.location=location;d.indicator.hidden=!location;
      if(location){
        const r=(location.kind==='stack'?target:cardUnit(target)).getBoundingClientRect(),height=host.getBoundingClientRect().height;
        const vertical=location.kind==='stack';
        d.indicator.setText(t(vertical?(location.after?'stackBelow':'stackAbove'):'unstack'));
        Object.assign(d.indicator.style,{left:`${vertical?r.left:location.after?r.right+d.gap:r.left-d.width-d.gap}px`,top:`${vertical?(location.after?r.bottom+d.gap:r.top-height-d.gap):r.top}px`,width:`${vertical?r.width:d.width}px`,height:`${height}px`});
      }
      const scroller=host.closest(".view-content,.noria-home-workbench-body")||d.parent;
      const bounds=scroller.getBoundingClientRect(),delta=event.clientY<bounds.top+32?-12:event.clientY>bounds.bottom-32?12:0;
      win.cancelAnimationFrame(frame);if(delta){const pan=()=>{if(!drag)return;scroller.scrollTop+=delta;frame=win.requestAnimationFrame(pan);};frame=win.requestAnimationFrame(pan);}
    }
  };
  const finish=()=>{const d=clear();if(!d)return;
    if(d.kind==="width"&&d.value&&d.value!==nearestSpan(d.width,d.total,d.gap))void save(()=>width(d.value));
    if(d.kind==="move"&&d.target?.isConnected&&d.location)void save(()=>{const target=d.target.dataset.diaryCard||d.target.dataset.noriaWidgetId;return d.location.kind==='stack'&&stack?stack(target,d.location.after):reorder(target,d.location.after);});
  };
  for(const [button,kind] of [[edge,"width"]]){
    button.onpointerdown=e=>start(e,kind);button.onpointermove=move;button.onpointerup=finish;button.onpointercancel=clear;button.onlostpointercapture=clear;
    button.onclick=e=>e.stopPropagation();
  }
  edge.onkeydown=e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const grid=cardGrid(host),span=e.key==="Home"?3:e.key==="End"?12:Math.max(3,Math.min(12,nearestSpan(cardUnit(host).getBoundingClientRect().width,grid.clientWidth,parseFloat(win.getComputedStyle(grid).columnGap)||0)+(e.key==="ArrowRight"?1:-1)));void save(()=>width(span));};
  const cancel=e=>{if(e.key==="Escape"&&drag){e.preventDefault();e.stopPropagation();clear();}};
  doc.addEventListener("keydown",cancel,true);
  return()=>{disposed=true;clear();observer.disconnect();responsive.disconnect();headerAbort?.abort();boundHeader?.classList.remove("noria-card-reorder-header");doc.removeEventListener("keydown",cancel,true);edge.remove();};
}

function notifyHidden(doc,label,undo,undoLabel){
  const fragment=doc.createDocumentFragment();fragment.append(doc.createTextNode(label+" "));
  const button=doc.createElement("button");button.textContent=undoLabel;fragment.append(button);
  const notice=new Notice(fragment,8000);button.onclick=async()=>{button.disabled=true;try{await undo();notice.hide();}catch(e){button.disabled=false;new Notice(e.message);}};
}
module.exports={isHeaderBlank,cardDrop,attachCardDirect,notifyHidden};
