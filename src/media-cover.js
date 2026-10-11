"use strict";

// Keep artwork updates local: refreshing an image must not replace the surrounding editor or button.
function bindCoverImage(host, source, {placeholder, loadedClass='has-cover'}={}) {
  let current, image, failed=false;
  host.dataset.noriaCover='';
  const refresh=(retry=false)=>{
    const next=source();if(next===current&&!(retry&&failed))return;
    current=next;failed=false;image?.remove();image=null;
    host.classList.remove(loadedClass);if(placeholder)placeholder.hidden=false;
    if(!next)return;
    const nextImage=host.createEl('img',{attr:{alt:'',loading:'lazy',decoding:'async',draggable:'false',referrerpolicy:'no-referrer'}});image=nextImage;
    nextImage.onload=()=>{if(image!==nextImage)return;host.classList.add(loadedClass);if(placeholder)placeholder.hidden=true;};
    nextImage.onerror=()=>{if(image!==nextImage)return;failed=true;nextImage.remove();host.classList.remove(loadedClass);if(placeholder)placeholder.hidden=false;};
    nextImage.src=next;
  };
  host._noriaRefreshCover=refresh;refresh();
}

function watchCoverImages(plugin,component,container){
  let timer,disposed=false;
  const refresh=retry=>{if(disposed)return;for(const slot of container.querySelectorAll('[data-noria-cover]'))slot._noriaRefreshCover?.(retry);};
  const changed=(file,old)=>{
    if(!/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(file?.path||'')&&!/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(typeof old==='string'?old:''))return;
    clearTimeout(timer);timer=setTimeout(()=>refresh(false),100);
  };
  for(const event of ['create','modify','delete','rename'])component.registerEvent(plugin.app.vault.on(event,changed));
  const win=container.ownerDocument.defaultView,online=()=>refresh(true);win.addEventListener('online',online);
  component.register(()=>{disposed=true;clearTimeout(timer);win.removeEventListener('online',online);});
}
module.exports={bindCoverImage,watchCoverImages};
