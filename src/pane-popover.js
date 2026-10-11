"use strict";
// Pane bounds matter even when a popup is in the document top layer.
function popupRect(anchor, size, bounds, gap=6) {
 const width=Math.min(size.width,Math.max(0,bounds.right-bounds.left));
 const height=Math.min(size.height,Math.max(0,bounds.bottom-bounds.top));
 const left=Math.max(bounds.left,Math.min(anchor.right-width,bounds.right-width));
 const below=anchor.bottom+gap;
 const top=Math.max(bounds.top,Math.min(below+height<=bounds.bottom?below:anchor.top-height-gap,bounds.bottom-height));
 return {left,top,width,height};
}
function placePanePopover(pop,anchor,root) {
 if(!pop||!anchor||!root)return;
 const win=anchor.ownerDocument.defaultView, pane=root.closest('.workspace-leaf-content')||root;
 const r=root.getBoundingClientRect(),p=pane.getBoundingClientRect(),margin=8;
 const bounds={left:Math.max(0,r.left,p.left)+margin,right:Math.min(win.innerWidth,r.right,p.right)-margin,
 top:Math.max(0,p.top)+margin,bottom:Math.min(win.innerHeight,p.bottom)-margin};
 const width=Math.max(0,bounds.right-bounds.left),height=Math.max(0,bounds.bottom-bounds.top);
 Object.assign(pop.style,{position:'fixed',right:'auto',bottom:'auto',margin:'0',minWidth:'0',minHeight:'0',maxWidth:width+'px',maxHeight:height+'px',boxSizing:'border-box',overflowY:'auto'});
 pop.classList.toggle('tc-pop-compact',width<=414);
 const rect=popupRect(anchor.getBoundingClientRect(),pop.getBoundingClientRect(),bounds);
 // Fixed children can have a pane-relative origin because Obsidian uses containment.
 pop.style.left='0px';pop.style.top='0px';const origin=pop.getBoundingClientRect();
 pop.style.left=(rect.left-origin.left)+'px';pop.style.top=(rect.top-origin.top)+'px';
 return rect;
}
function openPanePopover(anchor,root,title,build){
 const doc=anchor.ownerDocument,win=doc.defaultView,pop=doc.createElement('div');
 pop.className='tc-hours-popover tc-settings-popover';pop.setAttribute('popover','auto');pop.setAttribute('role','dialog');pop.setAttribute('aria-label',title);root.appendChild(pop);
 const position=()=>placePanePopover(pop,anchor,root),observer=new win.ResizeObserver(position);
 const close=()=>{if(pop.matches(':popover-open'))pop.hidePopover();if(anchor.isConnected)anchor.focus({preventScroll:true});};
 pop.addEventListener('toggle',event=>{if(event.newState!=='closed')return;observer.disconnect();win.removeEventListener('resize',position);win.removeEventListener('scroll',position,true);pop.remove();if(anchor.isConnected)anchor.focus({preventScroll:true});});
 build(pop,close);pop.showPopover();position();observer.observe(root);win.addEventListener('resize',position);win.addEventListener('scroll',position,true);
 pop.querySelector('select,input,button')?.focus({preventScroll:true});return pop;
}
module.exports={popupRect,placePanePopover,openPanePopover};
