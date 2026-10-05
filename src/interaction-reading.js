"use strict";
const {parseLinktext,resolveSubpath}=require('obsidian');

// Keep Markdown as the content contract. This adapter owns only reading controls.
function attachInteractionReading(plugin,{host,component,sourcePath,report,reload}) {
 const app=plugin.app,t=(zh,en)=>plugin.getNoriaLocale()==='zh'?zh:en;
 const win=host.ownerDocument.defaultView;
 const decorate=()=>{
  for(const title of host.querySelectorAll('.callout.is-collapsible > .callout-title')){
   title.setAttribute('role','button');title.setAttribute('tabindex','0');
   title.setAttribute('aria-expanded',String(!title.parentElement.classList.contains('is-collapsed')));
  }
 };
 const observer=new win.MutationObserver(decorate);
 observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 component.register(()=>observer.disconnect());decorate();
 component.registerDomEvent(host,'keydown',event=>{
  const title=event.target.closest?.('.callout.is-collapsible > .callout-title');
  if(title&&event.target===title&&['Enter',' '].includes(event.key)){
   event.preventDefault();event.stopPropagation();if(!event.repeat)title.click();
  }
 });
 const findFile=(target,origin)=>{
  const {path,subpath}=parseLinktext(target);
  const file=path?app.metadataCache.getFirstLinkpathDest(path,origin):app.vault.getAbstractFileByPath(origin);
  return {file,subpath};
 };
 const originFor=link=>{
  const parents=[];
  for(let el=link.parentElement;el&&el!==host;el=el.parentElement)
   if(el.matches('.internal-embed[src]'))parents.unshift(el.getAttribute('src'));
  let origin=sourcePath;
  for(const target of parents){const {file}=findFile(target,origin);if(file)origin=file.path;}
  return origin;
 };
 // Standalone MarkdownRenderer embeds do not refresh themselves on vault edits.
 const targets=[...host.querySelectorAll('.internal-embed[src]')].map(el=>({target:el.getAttribute('src'),origin:originFor(el)}));
 const paths=new Set(targets.map(({target,origin})=>findFile(target,origin).file?.path).filter(Boolean));
 let stopped=false,pending=false;
 const changed=(file,oldPath)=>{
  if(stopped||pending||!(paths.has(file.path)||paths.has(oldPath)||targets.some(({target,origin})=>findFile(target,origin).file?.path===file.path)))return;
  pending=true;
  Promise.resolve().then(()=>{if(!stopped)return reload();}).catch(report);
 };
 component.register(()=>{stopped=true;});
 component.registerEvent(app.metadataCache.on('changed',changed));
 component.registerEvent(app.vault.on('delete',changed));
 component.registerEvent(app.vault.on('rename',changed));
 const linkFor=event=>{
  const link=event.target.closest?.('a.internal-link');
  return link&&host.contains(link)?link:null;
 };
 component.registerDomEvent(host,'click',event=>{
  const link=linkFor(event);if(!link||event.defaultPrevented||event.button!==0)return;
  const target=link.dataset.href||link.getAttribute('href');if(!target)return;
  event.preventDefault();event.stopPropagation();
  void (async()=>{
   const origin=originFor(link),{file,subpath}=findFile(target,origin);
   if(!file?.extension)throw Error(t('找不到来源笔记，请核对链接。','Source note not found. Check the link.'));
   if(file.extension==='md'&&subpath){
    const cache=app.metadataCache.getFileCache(file);
    if(!cache)throw Error(t('来源索引尚未就绪，请稍后重试。','Source index is not ready. Try again shortly.'));
    if(!resolveSubpath(cache,subpath))throw Error(t('找不到引用的小节或段落，请核对来源链接。','Referenced section or block not found. Check the source link.'));
   }
   const result=await plugin.openHomeSource(file.path+subpath,{sourcePath:origin,event});
   if(!result.ok)throw Error(t('来源已不可用，请核对链接。','Source is no longer available. Check the link.'));
   report(null);
  })().catch(report);
 },true);
 component.registerDomEvent(host,'mouseover',event=>{
  const link=linkFor(event);if(!link||link.contains(event.relatedTarget))return;
  app.workspace.trigger('hover-link',{event,source:'noria-home-source',hoverParent:component,targetEl:link,
   linktext:link.dataset.href||link.getAttribute('href'),sourcePath:originFor(link)});
 });
}
module.exports={attachInteractionReading};
