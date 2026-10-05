"use strict";
const {setIcon,setTooltip,Notice}=require("obsidian");
const {iconButton}=require("./card-controls.js");
const SIZES=["small","medium","wide","full"], SPANS=[3,4,6,12];
function nearestSize(width,total,gap=0,spans=SPANS,preferred="small"){
  const unit=(total-11*gap)/12;
  return SIZES[spans.reduce((best,span,i)=>Math.abs(span*unit+(span-1)*gap-width)<Math.abs(spans[best]*unit+(spans[best]-1)*gap-width)?i:best,Math.max(0,SIZES.indexOf(preferred)))];
}

function isHeaderBlank(header,target){
  if(!header?.contains(target)||target.closest?.('button,a,input,select,textarea,summary,[contenteditable=true],svg,img,.noria-picture,.dashboard-card-heading-icon,.noria-card-heading-icon'))return false;
  return ![...target.childNodes].some(node=>node.nodeType===3&&node.textContent.trim());
}

// One gesture owner per card. Previews are transient; only pointer-up persists.
function attachCardDirect(host,{state,header,menu,size,collapse,reorder,t,spans=()=>SPANS}){
  const doc=host.ownerDocument,win=doc.defaultView;
  const holder=doc.createElement("span");
  const fold=iconButton(holder,"chevron-down",t("collapse"));fold.classList.add("noria-card-fold");
  const edge=iconButton(host,"grip-vertical",t("resizeWidth"));edge.classList.add("noria-card-width-edge");
  let drag=null,busy=false,disposed=false,frame=0,boundHeader=null,headerAbort=null;
  const place=()=>{
    const target=header(),anchor=menu?.();
    if(anchor&&fold.nextElementSibling!==anchor)anchor.before(fold);
    if(target&&target!==boundHeader){
      headerAbort?.abort();boundHeader?.classList.remove("noria-card-reorder-header");boundHeader=target;
      target.classList.add("noria-card-reorder-header");headerAbort=new win.AbortController();const options={signal:headerAbort.signal};
      target.addEventListener("pointerdown",e=>{if(isHeaderBlank(target,e.target)&&e.pointerType!=="touch")start(e,"move");},options);
      target.addEventListener("pointermove",e=>move(e),options);target.addEventListener("pointerup",()=>finish(),options);
      target.addEventListener("pointercancel",()=>clear(),options);target.addEventListener("lostpointercapture",()=>clear(),options);
    }
    const collapsed=!!state()?.collapsed;
    if(fold.dataset.collapsed!==String(collapsed)){fold.dataset.collapsed=String(collapsed);setIcon(fold,collapsed?"chevron-right":"chevron-down");fold.setAttribute("aria-label",t(collapsed?"expand":"collapse"));fold.setAttribute("aria-expanded",String(!collapsed));setTooltip(fold,t(collapsed?"expand":"collapse"));}
  };
  const observer=new win.MutationObserver(place);observer.observe(host,{childList:true,subtree:true});place();
  const responsive=new win.ResizeObserver(()=>{if(!drag)edge.hidden=win.getComputedStyle(host).gridColumn==="1 / -1";});responsive.observe(host.parentElement);
  const save=async action=>{
    if(busy||disposed)return;busy=true;host.setAttribute("aria-busy","true");
    const active=doc.activeElement,control=active===edge?".noria-card-width-edge":active===fold?".noria-card-fold":null;
    const scope=host.closest(".workspace-leaf-content")||doc,id=host.dataset.diaryCard||host.dataset.noriaWidgetId;
    try{await action();}catch(e){new Notice(e.message||String(e));}finally{
      busy=false;host.removeAttribute("aria-busy");if(!disposed)place();
      if(control&&(doc.activeElement===active||doc.activeElement===doc.body)){
        const current=[...scope.querySelectorAll(".dashboard-home-widget-shell,[data-diary-card]")].find(el=>(el.dataset.diaryCard||el.dataset.noriaWidgetId)===id);
        current?.querySelector(control)?.focus({preventScroll:true});
      }
    }
  };
  fold.onclick=e=>{e.stopPropagation();void save(()=>collapse(!state().collapsed));};
  const clear=()=>{
    if(!drag)return null;const old=drag;drag=null;win.cancelAnimationFrame(frame);
    host.style.gridColumn=old.column;host.classList.remove("noria-card-adjusting","noria-card-moving");
    old.indicator.remove();return old;
  };
  const start=(event,kind)=>{
    if(event.button!==0||busy)return;event.preventDefault();event.stopPropagation();
    clear();const r=host.getBoundingClientRect(),parent=host.parentElement;
    const indicator=doc.body.createDiv({cls:kind==="width"?"noria-card-width-hint":"noria-card-drop-line"});
    drag={kind,x:event.clientX,y:event.clientY,width:r.width,column:host.style.gridColumn,parent,total:parent.clientWidth,gap:parseFloat(win.getComputedStyle(parent).columnGap)||0,indicator,value:null,target:null};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move=event=>{
    if(!drag)return;const d=drag;if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<5&&!d.value&&!d.target)return;
    if(d.kind==="width"){
      d.value=nearestSize(d.width+event.clientX-d.x,d.total,d.gap,spans(),state().size);
      host.style.gridColumn=`span ${spans()[SIZES.indexOf(d.value)]}`;host.classList.add("noria-card-adjusting");
      d.indicator.setText(t(d.value));
      const r=host.getBoundingClientRect();Object.assign(d.indicator.style,{left:`${Math.max(8,Math.min(r.right-50,win.innerWidth-65))}px`,top:`${Math.max(8,r.top+8)}px`});
    }else{
      host.classList.add("noria-card-moving");
      const target=doc.elementsFromPoint(event.clientX,event.clientY).map(el=>el.closest?.("[data-noria-widget-id].dashboard-home-widget-shell,[data-diary-card]")).find(el=>el!==host&&el?.parentElement===d.parent&&!el.hidden);
      d.target=target||null;d.indicator.hidden=!target;if(!target)return;
      const r=target.getBoundingClientRect(),horizontal=r.width<d.total*.75;
      d.after=horizontal?event.clientX>r.left+r.width/2:event.clientY>r.top+r.height/2;
      Object.assign(d.indicator.style,{left:`${horizontal?(d.after?r.right:r.left):r.left}px`,top:`${horizontal?r.top:(d.after?r.bottom:r.top)}px`,width:horizontal?"2px":`${r.width}px`,height:horizontal?`${r.height}px`:"2px"});
      const scroller=host.closest(".view-content,.noria-home-workbench-body")||d.parent;
      const bounds=scroller.getBoundingClientRect(),delta=event.clientY<bounds.top+32?-12:event.clientY>bounds.bottom-32?12:0;
      if(delta){win.cancelAnimationFrame(frame);frame=win.requestAnimationFrame(()=>{scroller.scrollTop+=delta;});}
    }
  };
  const finish=()=>{const d=clear();if(!d)return;
    if(d.kind==="width"&&d.value&&d.value!==state().size)void save(()=>size(d.value));
    if(d.kind==="move"&&d.target?.isConnected)void save(()=>reorder(d.target.dataset.diaryCard||d.target.dataset.noriaWidgetId,d.after));
  };
  for(const [button,kind] of [[edge,"width"]]){
    button.onpointerdown=e=>start(e,kind);button.onpointermove=move;button.onpointerup=finish;button.onpointercancel=clear;button.onlostpointercapture=clear;
    button.onclick=e=>e.stopPropagation();
  }
  edge.onkeydown=e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const at=SIZES.indexOf(state().size),index=e.key==="Home"?0:e.key==="End"?3:Math.max(0,Math.min(3,at+(e.key==="ArrowRight"?1:-1)));void save(()=>size(SIZES[index]));};
  const cancel=e=>{if(e.key==="Escape"&&drag){e.preventDefault();e.stopPropagation();clear();}};
  doc.addEventListener("keydown",cancel,true);
  return()=>{disposed=true;clear();observer.disconnect();responsive.disconnect();headerAbort?.abort();boundHeader?.classList.remove("noria-card-reorder-header");doc.removeEventListener("keydown",cancel,true);fold.remove();edge.remove();};
}

function notifyHidden(doc,label,undo,undoLabel){
  const fragment=doc.createDocumentFragment();fragment.append(doc.createTextNode(label+" "));
  const button=doc.createElement("button");button.textContent=undoLabel;fragment.append(button);
  const notice=new Notice(fragment,8000);button.onclick=async()=>{button.disabled=true;try{await undo();notice.hide();}catch(e){button.disabled=false;new Notice(e.message);}};
}
module.exports={isHeaderBlank,nearestSize,attachCardDirect,notifyHidden};
