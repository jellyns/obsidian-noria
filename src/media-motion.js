"use strict";

// Keep the same cover visible between its shelf position and the open work.
// Motion never blocks navigation; cancellation restores the real element immediately.
function mediaMotion(container) {
  const doc=container.ownerDocument,win=doc.defaultView,active=new Set();
  const reduced=()=>win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stop=()=>{for(const cancel of [...active])cancel();};
  const play=(el,frames,options,finish=()=>{})=>{
    const animation=el.animate(frames,options);
    let done=false;
    const cleanup=()=>{if(done)return;done=true;active.delete(cancel);finish();};
    const cancel=()=>{animation.cancel();cleanup();};active.add(cancel);
    animation.finished.then(cleanup,cleanup);return animation;
  };
  const capture=el=>{
    stop();if(!el||reduced())return null;
    const rect=el.getBoundingClientRect();
    return rect.width&&rect.height?{rect,clone:el.cloneNode(true)}:null;
  };
  const move=(frame,target,content,closing=false)=>{
    if(reduced()||!target?.isConnected)return;
    if(frame){
      const to=target.getBoundingClientRect(),from=frame.rect,ghost=frame.clone,visibility=target.style.visibility;
      if(to.width&&to.height){
        ghost.classList.add('noria-media-moving-cover');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
        Object.assign(ghost.style,{position:'fixed',left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',maxWidth:'none',maxHeight:'none',margin:'0',transformOrigin:'0 0',pointerEvents:'none',zIndex:'1000',transition:'none'});
        doc.body.append(ghost);target.style.visibility='hidden';
        play(ghost,[{transform:'translate(0,0) scale(1,1)'},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`}],{duration:closing?280:360,easing:'cubic-bezier(.22,1,.36,1)'},()=>{target.style.visibility=visibility;ghost.remove();});
      }
    }
    if(content)play(content,[{opacity:0,transform:`translateY(${closing?4:10}px)`},{opacity:1,transform:'translateY(0)'}],{duration:240,delay:frame&&!closing?55:0,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
  };
  const section=container.closest('.noria-media-subpage');
  const observer=new win.MutationObserver(()=>{if(section?.hidden)stop();});
  if(section)observer.observe(section,{attributes:true,attributeFilter:['hidden']});
  win.addEventListener('resize',stop);win.addEventListener('scroll',stop,true);
  return {capture,move,stop,dispose:()=>{stop();observer.disconnect();win.removeEventListener('resize',stop);win.removeEventListener('scroll',stop,true);}};
}
module.exports={mediaMotion};
