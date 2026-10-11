"use strict";
const {setIcon}=require('obsidian');
const {iconButton}=require('./card-controls.js');
const {recordPopover}=require('./record-popover.js');
const {mediaDistribution}=require('./media-distribution-model.js');
const {filterMediaClassification}=require('./media-filter-model.js');

function mediaFilters({tools,summary,text,getItems,onChange}){
 const selection={genre:[],tag:[],unclassified:false};let close,popupRefresh;
 const count=()=>selection.genre.length+selection.tag.length+Number(selection.unclassified);
 const change=()=>{onChange();};
 const clear=()=>{selection.genre=[];selection.tag=[];selection.unclassified=false;};
 const button=iconButton(tools,'list-filter',text('筛选作品分类','Filter work categories'),()=>{
  close=recordPopover(button,text('筛选作品','Filter works'),(host,hide)=>{
   host.addClass('noria-media-filter-popover');
   const search=host.createEl('input',{attr:{type:'search',placeholder:text('搜索分类','Search categories'),'aria-label':text('搜索分类','Search categories')}});
   const list=host.createDiv({cls:'noria-media-filter-options'}),footer=host.createDiv({cls:'noria-media-filter-footer'});
   const reset=footer.createEl('button',{text:text('清除分类筛选','Clear category filters'),attr:{type:'button'}});reset.onclick=()=>{clear();change();search.focus();};
   footer.createEl('button',{text:text('完成','Done'),attr:{type:'button'}}).onclick=()=>hide();
   popupRefresh=()=>{
    const focused=host.ownerDocument.activeElement,focus=list.contains(focused)?{dimension:focused.dataset.dimension,key:focused.dataset.key}:null;
    const scroll=list.scrollTop,needle=search.value.trim().toLocaleLowerCase();list.empty();reset.disabled=!count();
    for(const [dimension,label] of [['tag',text('标签','Tags')],['genre',text('类型（属性）','Genre property')]]){
     const data=mediaDistribution(getItems(),{dimension}),names=[...new Set([...data.result.groups.map(g=>g.key),...selection[dimension]])];
     const choices=names.map(key=>({key,label:key,checked:selection[dimension].includes(key)}));
     if(dimension==='tag'&&(data.missing.length||selection.unclassified))choices.push({key:'',label:text('未标注','Untagged'),checked:selection.unclassified,missing:true});
     const visible=choices.filter(c=>c.label.toLocaleLowerCase().includes(needle));if(!visible.length)continue;
     const group=list.createEl('fieldset');group.createEl('legend',{text:label,attr:{title:text('同组多选匹配任一项；类型与标签需同时满足。','Match any choice within a group, and both groups when selected.')}});
     for(const choice of visible){
      const row=group.createEl('label',{cls:'noria-media-filter-option'}),input=row.createEl('input',{attr:{type:'checkbox'}});input.checked=choice.checked;input.dataset.dimension=choice.missing?'missing':dimension;input.dataset.key=choice.key;
      row.createSpan({text:choice.label});
      input.onchange=()=>{if(choice.missing)selection.unclassified=input.checked;else selection[dimension]=input.checked?[...selection[dimension],choice.key]:selection[dimension].filter(k=>k!==choice.key);change();};
     }
    }
    if(!list.children.length)list.createDiv({cls:'noria-card-secondary',text:text(needle?'没有匹配的分类':'作品尚未添加分类',needle?'No matching categories':'No categories have been recorded')});
    list.scrollTop=scroll;
    if(focus)[...list.querySelectorAll('input')].find(i=>i.dataset.dimension===focus.dimension&&i.dataset.key===focus.key)?.focus({preventScroll:true});
   };
   search.oninput=popupRefresh;popupRefresh();
  },{onClose:()=>{popupRefresh=null;button.setAttribute('aria-expanded','false');}});
  button.setAttribute('aria-expanded','true');
 });
 button.dataset.mediaFilter='true';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
 const refresh=()=>{
  button.setAttribute('aria-pressed',String(count()>0));button.setAttribute('aria-label',text('筛选作品分类','Filter work categories')+(count()?text(`，已选 ${count()} 项`,`, ${count()} selected`):''));
  summary.empty();summary.hidden=!count();
  const add=(label,remove)=>{const b=summary.createEl('button',{cls:'noria-media-filter-chip',attr:{type:'button','aria-label':text('取消筛选：','Remove filter: ')+label}});b.createSpan({text:label});setIcon(b.createSpan({attr:{'aria-hidden':'true'}}),'x');b.onclick=()=>{remove();change();button.focus({preventScroll:true});};};
  for(const dimension of ['tag','genre'])for(const key of selection[dimension])add(text(dimension==='genre'?'类型：':'标签：',dimension==='genre'?'Genre: ':'Tag: ')+key,()=>{selection[dimension]=selection[dimension].filter(k=>k!==key);});
  if(selection.unclassified)add(text('未标注','Untagged'),()=>selection.unclassified=false);
  if(count()>1){const b=summary.createEl('button',{cls:'noria-media-filter-clear',text:text('清除','Clear'),attr:{type:'button'}});b.onclick=()=>{clear();change();button.focus({preventScroll:true});};}
  popupRefresh?.();
 };
 return {filter:items=>filterMediaClassification(items,selection),reset:clear,refresh,dispose:()=>close?.(false)};
}
module.exports={mediaFilters};
