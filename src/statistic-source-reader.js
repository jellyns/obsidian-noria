"use strict";
const {Component,MarkdownRenderer,parseYaml,parseLinktext}=require('obsidian');
const {frontmatter}=require('./record-properties.js');
const {prepareReviewPreview}=require('./review-document.js');

class StatisticSourceReader{
 constructor(plugin,modal,list,title){this.plugin=plugin;this.app=plugin.app;this.modal=modal;this.list=list;this.title=title;this.turn=0;this.closed=false;}
 text(zh,en){return this.plugin.getNoriaLocale()==='zh'?zh:en;}
 reset(){++this.turn;this.component?.unload();this.component=null;this.host?.remove();this.host=null;}
 back(){this.reset();this.list.hidden=false;this.modal.setTitle(this.title);this.returnFocus?.focus({preventScroll:true});this.returnFocus=null;}
 dispose(){this.closed=true;this.reset();}
 async show(row,anchor){
  const turn=++this.turn,file=this.app.vault.getAbstractFileByPath(row.path);
  if(!file)throw Error(this.text('源笔记已移除，请刷新统计。','Source note was removed. Refresh the statistics.'));
  const raw=await this.app.vault.read(file);if(this.closed||turn!==this.turn)return;
  if(row.taskRef)require('./task-document.js').locateTask(raw,row.taskRef);
  this.component?.unload();this.host?.remove();this.returnFocus ||= anchor;
  const component=this.component=new Component();component.load();
  const host=this.host=this.modal.contentEl.createDiv({cls:'noria-stat-source-reader'});
  this.list.hidden=true;this.modal.setTitle(file.basename||row.title||row.path);
  const back=host.createEl('button',{cls:'noria-review-text-action',text:this.text('返回来源','Back to sources'),attr:{type:'button'}});back.onclick=()=>this.back();
  host.createDiv({cls:'noria-card-secondary',text:row.path});
  const feedback=host.createDiv({cls:'noria-card-error',attr:{role:'alert'}});feedback.hidden=true;
  let body=raw;
  try{
   const parsed=frontmatter(raw,parseYaml);if(parsed.hit)body=raw.slice(parsed.hit[0].length);
   const entries=Object.entries(parsed.value);
   if(entries.length){const details=host.createEl('details',{cls:'noria-stat-source-properties'});details.createEl('summary',{text:this.text('属性','Properties')});
    const table=details.createEl('table');for(const [key,value] of entries){const tr=table.createEl('tr');tr.createEl('th',{text:key,attr:{scope:'row'}});tr.createEl('td',{text:value==null?'—':typeof value==='object'?JSON.stringify(value):String(value)});}}
  }catch(error){feedback.setText(error.message);feedback.hidden=false;}
  const prose=host.createDiv({cls:'noria-review-prose markdown-rendered'});
  const blockTask=event=>{if(event.target.closest?.('input[type="checkbox"],.task-list-item-checkbox')){event.preventDefault();event.stopImmediatePropagation();}};
  component.registerDomEvent(prose,'click',blockTask,true);component.registerDomEvent(prose,'change',blockTask,true);
  component.registerDomEvent(prose,'click',event=>{
   const link=event.target.closest?.('a.internal-link');if(!link||!prose.contains(link))return;
   event.preventDefault();event.stopPropagation();
   const target=parseLinktext(link.dataset.href||link.getAttribute('href')||''),next=target.path?this.app.metadataCache.getFirstLinkpathDest(target.path,row.path):file;
   if(!next||next.extension!=='md'){feedback.setText(!next?this.text('找不到来源笔记，请核对链接。','Source note not found. Check the link.'):this.text('此处可阅读 Markdown 笔记，请在工作区打开其他来源。','Read Markdown notes here; open other sources from the workspace.'));feedback.hidden=false;return;}
   void this.show({path:next.path,subpath:target.subpath},this.returnFocus).catch(error=>{if(!this.closed&&feedback.isConnected){feedback.setText(error.message);feedback.hidden=false;}});
  },true);
  try{await MarkdownRenderer.render(this.app,prepareReviewPreview(body,{sourcePath:row.path}),prose,row.path,component);}
  catch(error){if(!this.closed&&turn===this.turn){feedback.setText(error.message);feedback.hidden=false;}return;}
  if(this.closed||turn!==this.turn)return;
  prose.querySelectorAll('input[type="checkbox"]').forEach(input=>input.disabled=true);
  back.focus({preventScroll:true});
  const heading=row.subpath?.replace(/^#/,'');if(heading)[...prose.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(el=>el.textContent===heading)?.scrollIntoView({block:'start'});
 }
}
module.exports={StatisticSourceReader};
