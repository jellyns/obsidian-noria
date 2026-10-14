"use strict";
const {mediaDistribution}=require('./media-distribution-model.js');
const {renderChart}=require('./statistic-charts.js');
const {iconButton}=require('./card-controls.js');
const {watchCoverImages}=require('./media-cover.js');

function registerMediaDistribution(system,{plugin,text,folder,works,renderSources}){
 system.register({id:'noria:media-distribution',title:text('作品分布','Collection distribution'),icon:'chart-bar',
  statistics:{topic:'library',style:'bars',recommended:true,props:{dimension:'tag'}},
  description:text('按已有类型或标签探索作品，并回到原笔记。','Explore works by existing genres or tags and return to their notes.'),
  fields:config=>[
   {key:'folder',label:text('作品目录（留空跟随藏馆）','Media folder (empty follows library)'),type:'folder'},
   {key:'dimension',label:text('分类依据','Group by'),type:'select',default:'tag',refresh:true,options:[{value:'tag',label:text('标签','Tags')},{value:'genre',label:text('类型（genre）','Genre')}]},
   ...(config.dimension!=='genre'?[{key:'tagPrefix',label:text('标签前缀（可选）','Tag prefix (optional)')}]:[])
  ],
  render:({container,component,config,context})=>{
   config={dimension:'tag',...config};
   let selected=null,timer,disposed=false;const viewState={};
   const paint=()=>{
    if(disposed)return;
    const active=container.ownerDocument.activeElement,focus=container.contains(active)?{group:active.dataset.category,subset:active.dataset.subset,source:active.dataset.sourcePath,work:active.dataset.completionPath,close:active.dataset.closeSources,more:active.classList.contains('noria-stat-more')}:null;
    container.empty();container.addClass('noria-statistic','noria-media-summary','noria-media-distribution');
    try{
     const root=config.folder||folder();if(!root){container.createSpan({cls:'noria-card-secondary',text:text('选择作品目录后即可查看。','Choose a media folder to see statistics.')});return;}
     const catalog=works(plugin,root),data=mediaDistribution(catalog.items,{...config,kind:context.mediaKind||''}),{result,missing,invalid}=data;
     const head=container.createDiv({cls:'noria-media-distribution-summary'});
     head.createSpan({cls:'noria-card-secondary',text:text(config.dimension==='tag'?'标签 · 全部收藏':'类型 · 全部收藏',config.dimension==='tag'?'Tags · All collected works':'Genres · All collected works')});
     head.createSpan({cls:'noria-media-stat-total',text:text(`${data.total} 部作品`,`${data.total} works`)});
     const explanation=container.createDiv({attr:{'data-noria-card-explanation':text('统计口径','Calculation details')},text:text('统计当前目录及页面类型中的全部作品，不限完成日期。类型读取genre；标签排除book等作品身份标签，可限定前缀。一部作品在同一分类中只计一次，多分类可重叠。未填写与格式异常分别保留来源；数量不代表喜爱程度。','Counts all collected works in the folder and page category, regardless of completion date. Genres use genre; tags exclude media identity tags and can use a prefix. Each work counts once per category; categories may overlap. Missing and invalid values retain source access. Counts do not indicate preference.')});explanation.hidden=true;
     const chart=container.createDiv(),extras=container.createDiv({cls:'noria-media-distribution-extras'}),list=container.createDiv({cls:'noria-media-stat-works'});
     const selectedRows=()=>selected?.type==='group'?result.groups.find(g=>g.key===selected.key)?.rows||[]:selected?.type==='missing'?missing:invalid;
     const selectedButton=()=>selected?[...container.querySelectorAll('button')].find(b=>selected.type==='group'?b.dataset.category===selected.key:b.dataset.subset===selected.type):null;
     const reveal=()=>{
      list.empty();list.hidden=!selected;
      for(const b of container.querySelectorAll('[data-category],[data-subset]'))b.setAttribute('aria-pressed',String(b===selectedButton()));
      if(!selected)return;
      const rows=selectedRows(),heading=list.createDiv({cls:'noria-media-stat-heading'});
      heading.createEl('h3',{text:selected.type==='group'?selected.key:selected.type==='missing'?text('未分类','Unclassified'):text('需检查','Needs review')});
      heading.createSpan({cls:'noria-card-secondary',text:text(`${rows.length} 部作品`,`${rows.length} works`)});
      const close=iconButton(heading,'chevron-up',text('收起作品','Hide works'),()=>{const target=selectedButton();selected=null;reveal();(target||chart.querySelector('button')||extras.querySelector('button'))?.focus({preventScroll:true});});close.dataset.closeSources='true';
      if(!rows.length)list.createSpan({cls:'noria-card-secondary',text:text('此分类已没有作品。','No works remain in this category.')});
      if(selected.type==='invalid')list.createDiv({cls:'noria-card-secondary',text:text('请在原笔记中使用文本或文本列表。','Use text or a text list in the source note.')});
      renderSources(list,rows);
     };
     if(result.groups.length){
      renderChart(chart,result,{display:'bars',calculate:'distribution',appearance:{color:'blue'}},{text,number:String,viewState,unit:text('部','works'),source:()=>{},activate:(_b,rows)=>{selected={type:'group',key:result.groups.find(g=>g.rows===rows).key};reveal();}});
      [...chart.querySelectorAll('.noria-stat-bar')].forEach((b,i)=>{b.dataset.category=result.groups[i].key;});
     }else chart.createDiv({cls:'noria-card-secondary',text:data.total?text(config.dimension==='tag'?'为作品添加对应标签后，这里会显示分布。':'为作品填写类型后，这里会显示分布。',config.dimension==='tag'?'Add matching tags to your works to see their distribution.':'Add genres to your works to see their distribution.'):text('这个范围还没有作品。','No works in this scope yet.')});
     for(const [type,rows,zh,en] of [['missing',missing,'未分类','Unclassified'],['invalid',invalid,'需检查','Needs review']]){
      if(!rows.length&&selected?.type!==type)continue;
      const b=extras.createEl('button',{cls:'noria-stat-choice',text:text(`${zh} ${rows.length}`,`${en} ${rows.length}`),attr:{type:'button'}});b.dataset.subset=type;b.onclick=()=>{selected={type};reveal();};
     }
     reveal();
     if(catalog.unindexed)container.createDiv({cls:'noria-card-secondary',text:text('部分笔记仍在索引，统计可能不完整。','Some notes are still indexing; statistics may be incomplete.')});
     if(focus){const buttons=[...container.querySelectorAll('button')],target=buttons.find(b=>focus.group!=null?b.dataset.category===focus.group:focus.subset?b.dataset.subset===focus.subset:focus.source?b.dataset.sourcePath===focus.source:focus.work?b.dataset.completionPath===focus.work:focus.close?b.dataset.closeSources:focus.more?b.classList.contains('noria-stat-more'):false)||selectedButton()||list.querySelector('[data-close-sources]');target?.focus({preventScroll:true});}
    }catch(e){container.createDiv({cls:'noria-card-error',text:e.message});}
   };
   const refresh=()=>{clearTimeout(timer);timer=setTimeout(paint,180);};
   component.registerEvent(plugin.app.metadataCache.on('changed',refresh));component.registerEvent(plugin.app.vault.on('delete',refresh));component.registerEvent(plugin.app.vault.on('rename',refresh));component.registerEvent(plugin.app.workspace.on('noria:media-content',refresh));
   watchCoverImages(plugin,component,container);component.register(()=>{disposed=true;clearTimeout(timer);});paint();
  }
 });
}
module.exports={registerMediaDistribution};
