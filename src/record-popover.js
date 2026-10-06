"use strict";
const {Scope}=require('obsidian');
let active;
// A short-lived editor anchored to the value being changed. It cannot outlive its row.
function recordPopover(anchor,title,build,{onClose}={}){
  active?.();
  const doc=anchor.ownerDocument,win=doc.defaultView,abort=new win.AbortController();
  const host=doc.body.createDiv({cls:"popover noria-record-popover",attr:{role:"dialog","aria-label":title}});
  host.createEl("strong",{text:title});
  let closed=false,scope,sizeObserver;
  const close=(focus=true)=>{if(closed)return;closed=true;if(scope)win.app.keymap.popScope(scope);abort.abort();observer.disconnect();sizeObserver?.disconnect();host.remove();if(active===close)active=null;if(focus&&anchor.isConnected)anchor.focus({preventScroll:true});onClose?.(focus);};
  const observer=new win.MutationObserver(()=>{if(!anchor.isConnected||!anchor.getClientRects().length)close(false);});observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
  const position=()=>{if(closed)return;const r=anchor.getBoundingClientRect();host.style.left=Math.max(8,Math.min(win.innerWidth-host.offsetWidth-8,r.left))+"px";host.style.top=Math.max(8,Math.min(win.innerHeight-host.offsetHeight-8,r.bottom+6))+"px";};
  const focusable=()=>[...host.querySelectorAll("input,select,button,textarea,summary")].filter(e=>!e.disabled&&e.getClientRects().length);
  build(host,close);position();active=close;
  sizeObserver=new win.ResizeObserver(position);sizeObserver.observe(host);
  if(win.app?.keymap&&Scope){scope=new Scope(win.app.scope);scope.register([], 'Escape',()=>{close();return false;});win.app.keymap.pushScope(scope);}
  const opts={capture:true,signal:abort.signal};
  doc.addEventListener("pointerdown",e=>{if(!host.contains(e.target)&&!anchor.contains(e.target))close(false);},opts);
  win.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();close();}else if(e.key==="Tab"){
    const items=focusable();
    if(e.shiftKey&&doc.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}
    else if(!e.shiftKey&&doc.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}
  }},opts);
  win.addEventListener("resize",position,{signal:abort.signal});
  win.addEventListener("scroll",position,{capture:true,signal:abort.signal});
  focusable()[0]?.focus();return close;
}
module.exports={recordPopover};
