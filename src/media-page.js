"use strict";
const {iconButton}=require('./card-controls.js');

// A media section owns its card layout; the collection itself stays in the same notes.
async function renderMediaPage(workbench,panel,renderCards){
  if(panel._noriaMediaPage)return panel._noriaMediaPage.refresh();
  const store=workbench.store,text=(zh,en)=>store.text(zh,en),sections=new Map();
  let disposed=false,serial=0,transition;
  const header=panel.createDiv({cls:'noria-media-page-header'});
  const title=header.createEl('h2',{text:store.label(store.get('media'))});
  const tabs=header.createDiv({cls:'noria-library-types noria-media-page-tabs',attr:{role:'tablist','aria-label':text('藏馆分类','Library sections')}});
  const controls=header.createDiv({cls:'noria-media-page-controls'});
  const body=panel.createDiv({cls:'noria-media-page-body'});
  const pageId=kind=>kind?'media:'+kind:'media';
  const show=async kind=>{
    if(disposed)return;transition?.cancel();const token=++serial,previous=workbench.mediaKind;
    workbench.mediaScrolls[previous]=panel.scrollTop;workbench.mediaKind=kind;
    for(const b of tabs.children){const active=b.dataset.kind===kind;b.setAttribute('aria-selected',String(active));b.setAttribute('aria-pressed',String(active));b.tabIndex=active?0:-1;}
    let section=sections.get(kind);
    if(!section){const el=body.createDiv({cls:'noria-media-subpage',attr:{role:'tabpanel','data-media-kind':kind||'all',id:workbench.navigationId+'-media-'+(kind||'all')}});section={el};sections.set(kind,section);el.setAttribute('aria-labelledby',tabs.querySelector('[data-kind="'+kind+'"]').id);}
    for(const [key,value] of sections){value.el.hidden=key!==kind;if(value.el._noriaMediaTools)value.el._noriaMediaTools.hidden=key!==kind;}
    if(!section.el._noriaMediaTools)section.el._noriaMediaTools=controls.createDiv({cls:'noria-media-page-tools'});
    const page=store.get(pageId(kind));
    // Folder edits in All must invalidate sections inheriting that collection.
    const version=JSON.stringify([page,store.get('media')?.widgets,workbench.customEditing]);
    if(section.version!==version&&workbench.canReplace(section.el)){
      if(section.pending)await section.pending;
      if(disposed||token!==serial)return;
      section.pending=renderCards(workbench,pageId(kind),section.el);
      try{await section.pending;section.version=version;}finally{section.pending=null;}
    }
    if(disposed||token!==serial)return;
    panel.scrollTop=previous===kind?workbench.mediaScrolls[previous]||0:workbench.mediaScrolls[kind]||0;
    if(previous!==kind&&!panel.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches)
      transition=section.el.animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'});
    workbench.view.app.workspace.requestSaveLayout?.();
  };
  for(const [kind,icon,label]of [['','library',text('全部作品','All works')],['book','book-open',text('图书','Books')],['movie','film',text('影视','Film & TV')],['music','disc-3',text('音乐','Music')],['game','gamepad-2',text('游戏','Games')]]){
    const b=iconButton(tabs,icon,label,()=>void show(kind).catch(e=>workbench.error(e)));
    b.dataset.kind=kind;b.id=workbench.navigationId+'-media-tab-'+(kind||'all');b.setAttribute('role','tab');b.setAttribute('title',label);b.setAttribute('aria-controls',workbench.navigationId+'-media-'+(kind||'all'));
  }
  tabs.onkeydown=event=>{const buttons=[...tabs.children],index=buttons.indexOf(event.target);if(index<0)return;
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowRight'?(index+1)%buttons.length:event.key==='ArrowLeft'?(index+buttons.length-1)%buttons.length:-1;
    if(next>=0){event.preventDefault();buttons[next].focus();buttons[next].click();}
  };
  const controller=panel._noriaMediaPage={show,refresh:async()=>{title.setText(store.label(store.get('media')));await show(workbench.mediaKind);}};
  panel.__noriaHomeCleanup=()=>{disposed=true;++serial;transition?.cancel();for(const {el}of sections.values())el.__noriaHomeCleanup?.();delete panel._noriaMediaPage;};
  await controller.refresh();
}
module.exports={renderMediaPage};
