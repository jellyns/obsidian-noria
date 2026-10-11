"use strict";

// The collapsed preview contains no links, so clipped links cannot receive focus.
function introDisclosure(section,body,owner,text){
  const preview=section.createDiv({cls:'noria-media-intro-preview'});
  preview.textContent=[...body.childNodes].map(node=>node.textContent.trim()).filter(Boolean).join('\n\n');
  if(!preview.textContent){preview.remove();return;}
  body.before(preview);
  const toggle=section.createEl('button',{cls:'noria-media-intro-toggle',attr:{type:'button'}});
  let expanded=false,width=-1;
  const paint=()=>{
    if(section.classList.contains('is-editing'))return;
    preview.hidden=false;body.hidden=true;
    const long=preview.scrollHeight>preview.clientHeight+2;
    toggle.hidden=!long;preview.hidden=!long||expanded;body.hidden=long&&!expanded;
    toggle.textContent=expanded?text('收起','Show less'):text('展开简介','Read more');toggle.setAttribute('aria-expanded',String(expanded));
  };
  toggle.onclick=()=>{expanded=!expanded;paint();};
  const observer=new section.ownerDocument.defaultView.ResizeObserver(entries=>{
    const next=entries[0].contentRect.width;if(next===width)return;width=next;paint();
  });observer.observe(section);owner.register(()=>observer.disconnect());
  paint();
  return ()=>{preview.remove();toggle.remove();body.hidden=false;};
}
module.exports={introDisclosure};
