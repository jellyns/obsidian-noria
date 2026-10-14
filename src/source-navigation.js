"use strict";
const pendingReturns=new WeakMap();
const cardSelector='[data-diary-card],.dashboard-home-widget-shell[data-noria-widget-id]';

// Capture before opening a note or dialog: a refresh can replace the original button.
function captureCardFocus(origin){
  const card=origin?.closest?.(cardSelector),leaf=origin?.closest?.('.workspace-leaf');
  const cardAttr=card?.hasAttribute('data-diary-card')?'data-diary-card':'data-noria-widget-id',cardId=card?.getAttribute(cardAttr);
  const keys=['data-ni-focus','data-shortcut','data-source-path','data-path','data-progress-path','href','aria-label'];
  const key=keys.find(key=>origin?.hasAttribute?.(key)),value=key&&origin.getAttribute(key),tag=origin?.tagName;
  return ()=>{
    if(origin?.isConnected&&origin.getClientRects().length)return origin;
    if(!cardId||!leaf?.isConnected||!key)return null;
    const current=[...leaf.querySelectorAll(cardSelector)].find(el=>el.getAttribute(cardAttr)===cardId&&el.getClientRects().length);
    return [...(current?.querySelectorAll(`[${key}]`)||[])].find(el=>el.tagName===tag&&el.getAttribute(key)===value&&el.getClientRects().length)||null;
  };
}

function rememberSourceReturn(plugin,origin){
  const workspace=plugin.app.workspace,leaf=workspace.activeLeaf;
  origin=origin||leaf?.view?.containerEl?.ownerDocument.activeElement;
  if(!origin?.closest?.(cardSelector)||!leaf?.view?.containerEl?.contains(origin))return()=>{};
  pendingReturns.get(plugin)?.();
  const resolve=captureCardFocus(origin),page=leaf.view.workbench?.active;
  let left=false,stopped=false,timer,ref,layoutRef;
  const cancel=()=>{if(stopped)return;stopped=true;clearTimeout(timer);if(ref)workspace.offref(ref);if(layoutRef)workspace.offref(layoutRef);if(pendingReturns.get(plugin)===cancel)pendingReturns.delete(plugin);};
  pendingReturns.set(plugin,cancel);
  ref=workspace.on('active-leaf-change',next=>{
    if(stopped)return;
    if(next!==leaf){left=true;return;}
    if(!left)return;
    clearTimeout(timer);
    timer=setTimeout(()=>{
      cancel();
      if(plugin._noriaPluginDisposed||workspace.activeLeaf!==leaf||leaf.view.workbench?.active!==page)return;
      const target=resolve(),active=target?.ownerDocument.activeElement;
      // Returning to a tab should not displace an intentional click or ongoing input.
      if(active&&active!==target&&leaf.view.containerEl.contains(active)&&active.matches('input,textarea,select,button,a[href],[contenteditable=true]'))return;
      target?.focus({preventScroll:true});
    },50);
  });
  layoutRef=workspace.on('layout-change',()=>{
    // Obsidian detaches inactive tab DOM; only an actually closed leaf cancels return.
    let present=false;workspace.iterateAllLeaves(current=>{if(current===leaf)present=true;});
    if(!present)cancel();
  });
  // One cleanup per plugin; successive navigations replace the pending return.
  if(!plugin._noriaSourceReturnCleanup){plugin._noriaSourceReturnCleanup=true;plugin.register(()=>{pendingReturns.get(plugin)?.();delete plugin._noriaSourceReturnCleanup;});}
  return cancel;
}
module.exports={captureCardFocus,rememberSourceReturn};
