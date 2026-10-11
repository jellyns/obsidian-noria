"use strict";
const {SuggestModal,Modal,Menu,Notice}=require('obsidian');
const {Shortcuts,key}=require('./shortcuts.js');
const {iconButton}=require('./card-controls.js');
const {renderPicture,pictureField}=require('./picture-picker.js');
const {mediaTypes}=require('./media-catalog.js');
const {coverSource}=require('./media-card.js');
const {bindCoverImage,watchCoverImages}=require('./media-cover.js');
const {readingTarget}=require('./media-workspace-model.js');
const {openReading,openMediaLink}=require('./media-access.js');
const t=plugin=>(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en;
const run=fn=>void Promise.resolve().then(fn).catch(e=>new Notice(e.message));
function fileEntry(plugin,file){
 const cache=plugin.app.metadataCache.getFileCache(file),types=file.extension==='md'?mediaTypes(cache?.frontmatter||{},(cache?.tags||[]).map(e=>e.tag)).types:[];
 return {kind:types.length?'media':'file',target:file.path};
}
function describe(plugin,entry){
 const text=t(plugin);
 if(entry.kind==='page'){const page=plugin.cards.pages.get(entry.target);return {title:entry.title|| (page?plugin.cards.pages.label(page):text('页面已移除','Page removed')),picture:entry.picture||page?.picture||require('./workbench-pages.js').pagePicture(page||{}),missing:!page};}
 if(entry.kind==='url'){let title=entry.target;try{title=new URL(entry.target).hostname||entry.target;}catch{}return {title:entry.title||title,picture:entry.picture||'link'};}
 const file=plugin.app.metadataCache.getFirstLinkpathDest(entry.target.split('#')[0],'');
 const fm=file?plugin.app.metadataCache.getFileCache(file)?.frontmatter||{}:{};
 const kind=mediaTypes(fm).types[0];
 return {title:entry.title||fm.title||file?.basename||entry.target.split('/').at(-1),picture:entry.picture||({base:'table',canvas:'layout-dashboard',pdf:'file-text'})[file?.extension]||({book:'book-open',movie:'film',music:'disc-3',game:'gamepad-2'})[kind]||'file-text',
  image:!entry.picture&&file?coverSource(plugin,{path:file.path,properties:fm}):'',missing:!file};
}
class ShortcutPicker extends SuggestModal {
 constructor(plugin,choose){super(plugin.app);this.plugin=plugin;this.choose=choose;this.text=t(plugin);this.setPlaceholder(this.text('搜索笔记、页面，或粘贴链接','Find a note or page, or paste a link'));}
 getSuggestions(query){
  const q=query.trim().toLocaleLowerCase(),p=this.plugin;
  const entries=[...p.cards.pages.read().pages.filter(page=>!page.hidden).map(page=>({kind:'page',target:page.id})),...p.app.vault.getFiles().map(file=>fileEntry(p,file))];
  const result=entries.filter(e=>{const title=describe(p,e).title;return (title+' '+e.target).toLocaleLowerCase().includes(q);}).slice(0,40);
  try{const link=readingTarget(query);if(link?.type==='url')result.unshift({kind:'url',target:link.value});}catch{}
  return result;
 }
 renderSuggestion(entry,el){const value=describe(this.plugin,entry);el.createDiv({text:value.title});el.createDiv({cls:'suggestion-note',text:entry.kind==='page'?this.text('Noria 页面','Noria page'):entry.target});}
 onChooseSuggestion(entry){run(()=>this.choose(entry));}
}
class ShortcutEditor extends Modal {
 constructor(plugin,entry){super(plugin.app);this.plugin=plugin;this.entry={...entry};this.original=key(entry);this.text=t(plugin);}
 onOpen(){
  this.setTitle(this.text('编辑快捷入口','Edit shortcut'));this.modalEl.addClass('noria-shortcut-editor');
  const form=this.contentEl.createEl('form'),label=form.createEl('label',{cls:'noria-card-field',text:this.text('名称','Name')}),name=label.createEl('input',{attr:{type:'text',placeholder:describe(this.plugin,this.entry).title,'aria-label':this.text('名称','Name')}});name.value=this.entry.title||'';
  const dest=form.createDiv({cls:'noria-card-field'});dest.createSpan({text:this.text('打开位置','Destination')});const value=dest.createEl('button',{attr:{type:'button'},text:describe(this.plugin,this.entry).title});
  value.onclick=()=>new ShortcutPicker(this.plugin,entry=>{this.entry={...entry,title:this.entry.title,picture:this.entry.picture};value.setText(describe(this.plugin,entry).title);}).open();
  pictureField(this.plugin,form,this.entry.picture||'',next=>{this.entry.picture=next;});
  const error=form.createDiv({cls:'noria-card-error',attr:{role:'alert'}}),actions=form.createDiv({cls:'noria-record-actions'}),cancel=actions.createEl('button',{text:this.text('取消','Cancel'),attr:{type:'button'}});cancel.onclick=()=>this.close();
  const save=actions.createEl('button',{text:this.text('保存','Save'),cls:'mod-cta',attr:{type:'submit'}});
  form.onsubmit=async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;try{await this.plugin.shortcuts.put({...this.entry,title:name.value.trim()},this.original);this.close();}catch(e){error.setText(e.message);}finally{save.disabled=false;}};
 }
}
async function openShortcut(plugin,entry){
 if(entry.kind==='url'){const link=readingTarget(entry.target);if(link?.type!=='url')throw Error('Invalid link');window.open(link.value,'_blank','noopener');return;}
 if(entry.kind==='page'){if(!plugin.cards.pages.get(entry.target))throw Error(t(plugin)('页面已移除，请更换入口。','Page removed; choose another destination.'));const leaf=await plugin.openDashboardHomeLeaf(false);await leaf.view.workbench.show(entry.target);return;}
 if(!plugin.app.metadataCache.getFirstLinkpathDest(entry.target.split('#')[0],''))throw Error(t(plugin)('文件已移动或删除，请更换入口。','File unavailable; choose another destination.'));
 if(entry.kind==='media'){
  let opened;
  try{opened=await openReading(plugin,entry.target);}
  catch(error){if(error.code!=='media-destination')throw error;await require('./media-workspace.js').openWork(plugin,entry.target,false,error.message);return;}
  if(!opened)await require('./media-workspace.js').openWork(plugin,entry.target);return;
 }
 await openMediaLink(plugin,entry.target,'');
}
function registerShortcutCard(system){
 const plugin=system.plugin,text=t(plugin),store=plugin.shortcuts=new Shortcuts(plugin);
 system.register({id:'noria:shortcuts',title:text('快捷入口','Shortcuts'),icon:'bookmark',fields:[],description:text('把作品、笔记、页面和链接放在手边。','Keep works, notes, pages and links at hand.'),
  render:async({container,component})=>{
   await system.ready;let disposed=false,timer;container.addClass('noria-shortcuts');
   const toolbar=container.createDiv({cls:'noria-shortcut-tools'}),plus=iconButton(toolbar,'plus',text('添加快捷入口','Add shortcut'),()=>new ShortcutPicker(plugin,entry=>store.put(entry)).open());
   const tools=container.closest('.dashboard-home-widget-shell')?.querySelector('.dashboard-guide-card__tools');if(tools){tools.addClass('noria-shortcut-header-tools');tools.prepend(plus);toolbar.remove();component.register(()=>{plus.remove();tools.removeClass('noria-shortcut-header-tools');});}
   const grid=container.createDiv({cls:'noria-shortcut-grid'});
   const paint=()=>{if(disposed)return;const focused=grid.contains(container.ownerDocument.activeElement)?container.ownerDocument.activeElement.closest('[data-shortcut]')?.dataset.shortcut:null,position=focused?[...grid.children].findIndex(e=>e.dataset.shortcut===focused):-1;grid.empty();const entries=store.entries();
    if(!entries.length){grid.createSpan({cls:'noria-card-secondary',text:text('把想常用的内容放在这里。','Keep your go-to items here.')});if(focused)plus.focus({preventScroll:true});return;}
    for(const entry of entries){const value=describe(plugin,entry),id=key(entry),tile=grid.createDiv({cls:'noria-shortcut'});tile.dataset.shortcut=id;tile.draggable=true;tile.classList.toggle('is-unavailable',!!value.missing);
     const button=tile.createEl('button',{cls:'noria-shortcut-open',attr:{type:'button',title:value.title,'aria-label':value.title}}),art=button.createSpan({cls:'noria-shortcut-art',attr:{'aria-hidden':'true'}});
     renderPicture(plugin,art,value.picture);
     bindCoverImage(art,()=>describe(plugin,entry).image,{loadedClass:'has-image'});
     button.createSpan({cls:'noria-shortcut-name',text:value.title});button.onclick=()=>run(()=>openShortcut(plugin,entry));
     const actions=tile.createDiv({cls:'noria-shortcut-actions'});
     if(entry.kind==='media')iconButton(actions,'notebook-pen',text('笔记与记录','Notes & entries'),()=>run(()=>require('./media-workspace.js').openWork(plugin,entry.target,true)));
     const showMenu=event=>{event?.preventDefault();tile.addClass('is-menu-open');more.setAttribute('aria-expanded','true');const menu=new Menu();menu.addItem(i=>i.setTitle(text('编辑入口','Edit shortcut')).setIcon('pencil').onClick(()=>new ShortcutEditor(plugin,entry).open()));
      const index=entries.findIndex(e=>key(e)===id);for(const [step,label,icon]of[[-1,text('前移','Move earlier'),'arrow-left'],[1,text('后移','Move later'),'arrow-right']])menu.addItem(i=>i.setTitle(label).setIcon(icon).setDisabled(!entries[index+step]).onClick(()=>run(()=>store.move(id,key(entries[index+step])))));
      menu.addItem(i=>i.setTitle(text('移出快捷入口','Remove shortcut')).setIcon('minus-circle').onClick(()=>run(()=>store.remove(id))));const r=more.getBoundingClientRect();menu.onHide(()=>{tile.removeClass('is-menu-open');more.setAttribute('aria-expanded','false');if(more.isConnected)more.focus({preventScroll:true});});menu.showAtPosition({x:event?.type==='contextmenu'?event.clientX:r.left,y:event?.type==='contextmenu'?event.clientY:r.bottom});};
     const more=iconButton(actions,'ellipsis',text('入口菜单','Shortcut menu'),showMenu);more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');tile.oncontextmenu=showMenu;
     tile.ondragstart=e=>{e.stopPropagation();e.dataTransfer.setData('application/x-noria-shortcut',id);};tile.ondragover=e=>{if([...e.dataTransfer.types].includes('application/x-noria-shortcut'))e.preventDefault();};tile.ondrop=e=>{const from=e.dataTransfer.getData('application/x-noria-shortcut');if(from){e.preventDefault();e.stopPropagation();run(()=>store.move(from,id));}};
    }
    if(focused){const tiles=[...grid.querySelectorAll('[data-shortcut]')],next=tiles.find(e=>e.dataset.shortcut===focused)||tiles[Math.min(position,tiles.length-1)];next?.querySelector('button')?.focus({preventScroll:true});}
   };
   const refresh=()=>{clearTimeout(timer);timer=setTimeout(paint,180);};component.register(store.subscribe(paint));component.register(system.pages.subscribe(refresh));component.registerEvent(plugin.app.metadataCache.on('changed',refresh));component.registerEvent(plugin.app.vault.on('delete',file=>{if(!/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(file.path))refresh();}));watchCoverImages(plugin,component,container);component.register(()=>{disposed=true;clearTimeout(timer);});paint();
  }});
}
module.exports={registerShortcutCard,openShortcut,describe};
