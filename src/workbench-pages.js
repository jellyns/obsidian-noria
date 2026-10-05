"use strict";
const {commitSettingsChange}=require("./settings-change.js");
const {insertCard}=require("./card-layout-model.js");
const clone=value=>JSON.parse(JSON.stringify(value));
const BUILTINS=["home","diary","day","calendar"];
const pagePicture=page=>page.picture||({home:'house',diary:'book-open',day:'calendar-days',calendar:'calendar'})[page.id]||'panels-top-left';
const internal=page=>page&&!['day','calendar'].includes(page.id);
const validId=id=>BUILTINS.includes(id)||typeof id==='string'&&/^page-[a-zA-Z0-9-]+$/.test(id);

function normalizePages(value={}){
  if(value.version!=null&&value.version!==1)throw Error('Unsupported workspace page version');
  const seen=new Set(),pages=[];
  for(const page of [...(Array.isArray(value.pages)?value.pages:[]),...BUILTINS.map(id=>({id}))]){
    if(!validId(page?.id)||seen.has(page.id))continue;
    seen.add(page.id);
    pages.push({...clone(page),title:String(page.title||'').trim().slice(0,40),hidden:page.hidden===true,
      ...(BUILTINS.includes(page.id)?{}:{widgets:Array.isArray(page.widgets)?clone(page.widgets):[]})});
  }
  if(!pages.some(p=>internal(p)&&!p.hidden))pages.find(p=>p.id==='home').hidden=false;
  const defaultPage=pages.find(p=>p.id===value.defaultPage&&!p.hidden)?.id||pages.find(p=>internal(p)&&!p.hidden).id;
  return {version:1,pages,defaultPage};
}

// Navigation and custom layouts have one owner. Existing home/diary layouts stay intact.
class WorkbenchPages {
  constructor(plugin){this.plugin=plugin;this.listeners=new Set();}
  text(zh,en){return this.plugin.getNoriaLocale()==='zh'?zh:en;}
  read(){return normalizePages(this.plugin.settings.workbenchPages);}
  get(id){return this.read().pages.find(p=>p.id===id);}
  label(page){return page.title||({home:this.text('主页','Home'),diary:this.text('日记','Diary'),day:this.text('日表','Day'),calendar:this.text('日历','Calendar')})[page.id]||this.text('新页面','New page');}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  async update(change){
    const result=await commitSettingsChange(this.plugin,['workbenchPages'],()=>{
      const next=this.read();change(next);this.plugin.settings.workbenchPages=normalizePages(next);return this.read();
    });
    await Promise.all([...this.listeners].map(fn=>Promise.resolve().then(fn).catch(error=>console.warn('Noria page refresh',error))));
    return result;
  }
  async configure(draft,base){
    return this.update(next=>{
      if(JSON.stringify(next)!==JSON.stringify(base))throw Error(this.text('页面已在其他位置更改。请重新打开设置后再试。','Pages changed elsewhere. Reopen settings and try again.'));
      if(!draft.pages.some(p=>internal(p)&&!p.hidden))throw Error(this.text('至少保留一个主页、日记或自定义页面入口。','Keep at least one Home, Diary or custom page visible.'));
      if(draft.pages.some(p=>!BUILTINS.includes(p.id)&&!String(p.title||'').trim()))throw Error(this.text('请填写页面名称。','Enter a page name.'));
      Object.assign(next,clone(draft));
    });
  }
  async changeCards(pageId,change){
    return this.update(next=>{
      const page=next.pages.find(p=>p.id===pageId&&!BUILTINS.includes(p.id));
      if(!page)throw Error(this.text('此页面已移除，请重新选择页面。','This page was removed. Choose another page.'));
      change(page.widgets,page);
    });
  }
  saveCard(pageId,widget){return this.changeCards(pageId,widgets=>{const index=widgets.findIndex(w=>w.id===widget.id);if(index<0)widgets.push(clone(widget));else widgets[index]=clone(widget);});}
  editCard(pageId,id,patch){return this.changeCards(pageId,widgets=>{const item=widgets.find(w=>w.id===id);if(!item)throw Error(this.text('此卡片已移除。','This card was removed.'));Object.assign(item,clone(patch));});}
  reorder(pageId,id,target,after){return this.changeCards(pageId,widgets=>{
    const order=insertCard([...widgets].sort((a,b)=>a.order-b.order).map(w=>w.id),id,target,after);
    for(const widget of widgets)widget.order=order.indexOf(widget.id)*10;
  });}
}
module.exports={WorkbenchPages,normalizePages,BUILTINS,internal,pagePicture};
