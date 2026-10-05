"use strict";
const M=require('./statistic-model.js');
const {appearance}=require('./record-visual.js');
const {renderLeaderDonutChart}=require('./runtime/views/dashboard/core/components/charts/leader-donut-chart.js');
const A=require('./statistic-appearance.js');
const {renderStackedDistributionBar}=require('./runtime/views/dashboard/core/components/charts/stacked-distribution-bar.js');
function renderChart(host,result,config,{text,number,compactNumber=number,viewState={},unit='',today,rangeText=r=>`${r.start} – ${r.end}`,field,display,activate,source}){
 const visual=A.appearance(config.appearance),colorFor=key=>A.categoryColor(key,visual,appearance(field||{},field?.type==='toggle'?String(key)==='true':key).color);
 const numeric=value=>number(value)+(value!=null&&unit?(unit==='%'?'%':' '+unit):'');
 const style=config.display||'metric',format=value=>config.calculate==='distribution'?(field?display(field,value):String(value)):numeric(value);
 const button=(parent,label,fn,cls='noria-stat-choice')=>{const b=parent.createEl('button',{text:label,cls,attr:{type:'button'}});b.onclick=()=>fn(b);return b;};
 if(style==='metric')return;
 if(style==='progress'){
   if(result.denominator===0||result.value===null&&result.numerator==null)return;
   const target=result.denominator??Number(config.target),value=result.numerator??result.value,ratio=target>0&&value!=null?value/target:null;
   const row=host.createDiv({cls:'noria-stat-progress'}),bar=row.createEl('progress',{attr:{max:1}});if(ratio!=null)bar.value=Math.max(0,Math.min(1,ratio));else bar.value=0;
   bar.setAttribute('aria-label',ratio==null?text('没有可用分母','No denominator'):`${number(value)} / ${number(target)}`);
   button(row,ratio==null?'—':`${number(value)} / ${config.calculate==='rate'?number(target):numeric(target)} · ${number(ratio*100)}%`,()=>source(result.rows));
   if(result.denominatorLabel)row.createSpan({cls:'noria-card-secondary',text:result.denominatorLabel});return;
 }
 if(style==='comparison'){
   const comparison=result.comparison,previous=comparison.previous,box=host.createDiv({cls:'noria-stat-comparison'}),max=Math.max(1,Math.abs(result.value||0),Math.abs(previous.value||0)),signed=result.value<0||previous.value<0;
   if(signed)box.addClass('noria-stat-comparison--signed');
   for(const [label,r] of [[text('本期','Current'),result],[text('前期','Previous'),previous]]){
     const row=button(box,`${label}  ${r.value==null?text('未记录','No record'):numeric(r.value)}`,()=>source(r.rows,r),'noria-stat-compare-row');
     row.createSpan({cls:'noria-card-secondary',text:rangeText(r.range)});
     const track=row.createSpan({cls:'noria-stat-compare-track'}),fill=track.createSpan(),extent=Math.abs(r.value||0)/max*(signed?50:100);
     track.setAttribute('aria-hidden','true');fill.style.width=`${extent}%`;
     if(signed){fill.style.left=`${r.value<0?50-extent:50}%`;track.createSpan({cls:'noria-stat-compare-zero',text:'0'});}
   }
   box.createDiv({text:comparison.absolute==null?text('记录不足，暂不能比较','Not enough records to compare'):`${text('较前期 ','Change ')}${comparison.absolute>0?'+':''}${config.calculate==='rate'?number(comparison.absolute)+text(' 个百分点',' pp'):numeric(comparison.absolute)}${comparison.percent==null?'':` · ${comparison.percent>0?'+':''}${number(comparison.percent)}%`}`,cls:'noria-stat-change'});
   if(previous.value===0&&result.value!=null)box.createSpan({cls:'noria-card-secondary',text:text('前期为 0，不计算变化率。','Previous value is 0; percentage change is undefined.')});
   box.createSpan({cls:'noria-card-secondary',text:comparison.periods.partial?text('本期截至今天，与前一等长区间比较','Current period through today; compared with an equally long preceding range'):text('两个等长日期区间，沿用同一计算方式','Equal date ranges using the same calculation')});return;
 }
 if(['bars','donut','composition'].includes(style)){
   if(['donut','composition'].includes(style)&&result.recorded&&!M.exclusiveGroups(result))throw Error(text('这些分组有重叠、负值或缺少分类，改用横向条形查看。','Overlapping, negative or ungrouped data: use horizontal bars.'));
   const label=g=>field&&config.calculate==='distribution'&&!config.group?display(field,field.type==='toggle'?g.key==='true':g.key):g.key;
   if(!result.groups.length)return;
   if(style==='composition'){
     renderStackedDistributionBar(host,{bare:true,title:text('分类占比','Category shares'),defs:result.groups.map(g=>({key:g.key,label:label(g)})),countMap:Object.fromEntries(result.groups.map(g=>[g.key,g.value])),showLegend:visual.showLegend,colorFor,number,emptyText:text('没有可计算占比的数值。','No values available for shares.'),onSelect:(key,anchor)=>activate(anchor,result.groups.find(g=>g.key===key).rows,'')});return;
   }
   if(style==='donut'){renderLeaderDonutChart(host,{items:result.groups.map(g=>({key:g.key,label:label(g),value:g.value,color:colorFor(g.key)})),total:result.value,centerLabel:text('总计','Total'),ariaLabel:text('分类构成','Composition'),onSelect:(key,anchor)=>activate(anchor,result.groups.find(g=>g.key===key).rows,'')});if(!visual.showLegend)return;}
   const list=host.createDiv({cls:'noria-stat-bars'}),max=Math.max(1,...result.groups.map(g=>Math.abs(g.value||0)));
   if(result.groups.some(g=>g.value<0))list.addClass('noria-stat-signed');
   result.groups.forEach((g,i)=>{const b=button(list,'',b=>activate(b,g.rows,''),'noria-stat-bar');b.setAttribute('title',`${label(g)} · ${numeric(g.value)}`);b.createSpan({cls:'noria-stat-bar-label',text:label(g)});const track=b.createSpan({cls:'noria-stat-bar-track'}),fill=track.createSpan();const ratio=Math.abs(g.value||0)/max;
     fill.style.setProperty('--noria-stat-ratio',String(ratio));fill.style.setProperty('--noria-stat-horizontal-start',`${g.value<0?50-ratio*50:50}%`);fill.style.setProperty('--noria-stat-extent',`${ratio*50}%`);fill.style.background=colorFor(g.key);b.createSpan({cls:'noria-stat-bar-value',text:numeric(g.value)});});
   if(config.group==='tag'||!M.exclusiveGroups(result))host.createSpan({cls:'noria-card-secondary',text:text('分类可重叠，数量不代表互斥占比。','Categories may overlap; counts are not exclusive shares.')});return;
 }
 const points=M.calendarPoints(result,{...config,property:result.property||config.property,calculate:result.calculation||config.calculate});
 if(!points.length)return;
 const category=config.calculate==='distribution',values=points.map(p=>p.value).filter(v=>typeof v==='number');
 const categories=category?(field?require('./record-visual.js').choices(field).map(String):result.groups.map(g=>g.key)):[];
 if(['line','columns','trend'].includes(style)&&!values.length){
   // A missing series has no meaningful axis; retain explicit date-based entry.
   if(config.source==='diary'&&config.property&&result.range){
     const end=today&&today<result.range.end?today:result.range.end;
     if(result.range.start<=end){const row=host.createDiv({cls:'noria-stat-empty-entry'}),label=row.createEl('label');label.createSpan({text:text('补记日期','Record date')});const date=label.createEl('input',{attr:{type:'date',min:result.range.start,max:end,required:''}});date.value=end;
       button(row,text('填写记录','Add record'),anchor=>{if(date.value>=result.range.start&&date.value<=end&&/^\d{4}-\d{2}-\d{2}$/.test(date.value))activate(anchor,[],date.value);else date.reportValidity();});}
   }return;
 }
 const caption=host.createDiv({cls:'noria-stat-selection'});const retained=points.findIndex(p=>p.date===viewState.date);let selected=retained>=0?retained:Math.max(0,points.findLastIndex(p=>(!today||p.date<=today)&&p.value!=null)),updateSelection;
 const label=p=>`${p.date} · ${p.ambiguous?text('多份记录','Multiple records'):p.multiple?text('多个状态','Multiple states'):p.value==null?(['heatmap','strip','states'].includes(style)?text('未记录','No record'):'—'):format(p.value)}`;
 const pick=button(caption,'',b=>activate(b,points[selected].rows,points[selected].date));
 const select=i=>{selected=Math.max(0,Math.min(points.length-1,i));viewState.date=points[selected].date;pick.setText(label(points[selected]));pick.setAttribute('aria-label',`${label(points[selected])} · ${text('编辑或查看来源','Edit or view sources')}`);updateSelection?.();};select(selected);
 const colorMin=Math.min(0,...values),colorMax=Math.max(0,...values);
 const shade=p=>p.value==null?'var(--background-secondary)':category?colorFor(p.value):`color-mix(in srgb,var(--noria-record-color,var(--interactive-accent)) ${25+75*(p.value-colorMin)/(colorMax-colorMin||1)}%,var(--background-primary))`;
 if(['heatmap','strip','states'].includes(style)){
   const grid=host.createDiv({cls:`noria-stat-calendar noria-stat-calendar--${style}`});
   const month=style==='heatmap'&&points.length<=62;
   const annual=style==='heatmap'&&!month,leading=(new Date(points[0].date+'T12:00:00Z').getUTCDay()+6)%7,cells=[];
   if(month)grid.addClass('is-month');
   if(annual){grid.addClass('is-year');for(let i=0;i<7;i++){const day=grid.createSpan({cls:'noria-stat-weekday',text:text('一 二 三 四 五 六 日','M T W T F S S').split(' ')[i]});day.style.gridColumn='1';day.style.gridRow=String(i+2);}}
   points.forEach((p,i)=>{
     const boundary=i===0||p.date.slice(0,7)!==points[i-1].date.slice(0,7);
     const nextMonth=i===0?points.findIndex(p=>p.date.slice(0,7)!==points[0].date.slice(0,7)):-1;
     const crowdedFirst=annual&&i===0&&nextMonth>0&&Math.floor((leading+nextMonth)/7)<4;
     if(boundary&&!crowdedFirst&&(month||style==='states'||annual)){
       const heading=grid.createSpan({cls:'noria-stat-month-label',text:p.date.slice(0,7)});
       if(annual){heading.style.gridRow='1';heading.style.gridColumn=`${Math.floor((leading+i)/7)+2} / span 4`;}
       else{heading.style.gridColumn='1 / -1';if(month){for(const day of text('一 二 三 四 五 六 日','M T W T F S S').split(' '))grid.createSpan({cls:'noria-stat-weekday',text:day});const pad=(new Date(p.date+'T12:00:00Z').getUTCDay()+6)%7;for(let j=0;j<pad;j++)grid.createSpan({cls:'noria-stat-calendar-pad'});}}
     }
     const multi=p.multiple||p.ambiguous,b=button(grid,style==='states'||month?p.date.slice(8):multi?'⋯':'',b=>{select(i);activate(b,p.rows,p.date);},'noria-stat-day');cells.push(b);
     b.style.background=shade(p);b.title=label(p);b.setAttribute('aria-label',label(p));b.dataset.date=p.date;b.dataset.missing=String(p.value==null&&!multi);b.dataset.multiple=String(multi);
     if(annual){b.style.gridColumn=String(Math.floor((leading+i)/7)+2);b.style.gridRow=String((leading+i)%7+2);}
     b.onfocus=()=>select(i);b.onpointerenter=()=>select(i);
     b.onkeydown=e=>{let next;
       if(e.key==='Home')next=0;else if(e.key==='End')next=points.length-1;
       else if(e.key==='ArrowLeft'||e.key==='ArrowRight')next=i+(e.key==='ArrowLeft'?-1:1)*(annual?7:1);
       else if(style==='heatmap'&&(e.key==='ArrowUp'||e.key==='ArrowDown'))next=i+(e.key==='ArrowUp'?-1:1)*(annual?1:7);
       if(next==null)return;e.preventDefault();select(next);cells[selected].focus({preventScroll:true});cells[selected].scrollIntoView({block:'nearest',inline:'nearest'});
     };
   });
   updateSelection=()=>cells.forEach((b,i)=>{b.dataset.selected=String(i===selected);b.tabIndex=i===selected?0:-1;});select(selected);
   if((month||style==='states')&&host.ownerDocument.defaultView){
     const context=host.ownerDocument.createElement('canvas').getContext('2d',{willReadFrequently:true}),inks=new Map();
     for(const b of cells){if(b.dataset.missing==='true'||b.dataset.multiple==='true')continue;
       const background=host.ownerDocument.defaultView.getComputedStyle(b).backgroundColor;
       if(!inks.has(background)){context.fillStyle=background;context.fillRect(0,0,1,1);const rgb=context.getImageData(0,0,1,1).data;
         const linear=Array.from(rgb).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}),luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
         inks.set(background,(luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff');}
       b.style.color=inks.get(background);
     }
   }
   if(viewState.calendarScrollLeft!=null)grid.scrollLeft=viewState.calendarScrollLeft;
   else if(grid.clientWidth){const r=cells[selected].getBoundingClientRect(),g=grid.getBoundingClientRect();grid.scrollLeft=r.left-g.left-(grid.clientWidth-r.width)/2;}
   grid.onscroll=()=>{viewState.calendarScrollLeft=grid.scrollLeft;};
   const legend=host.createDiv({cls:'noria-stat-axis'}),acrossYears=points[0].date.slice(0,4)!==points.at(-1).date.slice(0,4);
   legend.createSpan({text:acrossYears?points[0].date:points[0].date.slice(5)});legend.createSpan({text:acrossYears?points.at(-1).date:points.at(-1).date.slice(5)});
   if(!category&&visual.showLegend&&values.length){const scale=host.createDiv({cls:'noria-stat-legend'});for(const value of [...new Set([colorMin,colorMax,null])]){const item=scale.createSpan(),swatch=item.createSpan({cls:'noria-stat-legend-swatch'});swatch.style.background=shade({value});item.createSpan({text:value===null?text('未记录','No record'):numeric(value)});}}
   if(category&&visual.showLegend){let parent=host;if(categories.length>8){parent=host.createEl('details');parent.createEl('summary',{text:text('状态图例','State legend')});}const list=parent.createDiv({cls:'noria-stat-legend'});for(const key of categories){const item=list.createSpan(),swatch=item.createSpan({cls:'noria-stat-legend-swatch'});swatch.style.background=colorFor(key);item.createSpan({text:field?display(field,field.type==='toggle'?key==='true':key):key});}}
   return;
 }
 const plot=button(host,'',b=>activate(b,points[selected].rows,points[selected].date),'noria-stat-plot');
 const svg=plot.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 170');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');plot.append(svg);
 const draw=(tag,attrs)=>{const el=svg.ownerDocument.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));svg.append(el);return el;};
 const domain=A.axisDomain(values,visual,style,config.referenceValue),low=domain.min,high=domain.max,y=v=>146-(v-low)/(high-low)*130,x=i=>15+(i+.5)/points.length*570;
 const ruler=plot.createSpan({cls:'noria-stat-ruler',attr:{'aria-hidden':'true'}});
 for(const value of [high,(low+high)/2,low]){const tick=ruler.createSpan({text:compactNumber(value),attr:{title:numeric(value)}});tick.style.top=`${y(value)/170*100}%`;}
 draw('line',{x1:15,x2:585,y1:y(Math.max(low,Math.min(high,0))),y2:y(Math.max(low,Math.min(high,0))),class:'noria-series-baseline'});let previous;
 if(Number.isFinite(config.referenceValue))draw('line',{x1:15,x2:585,y1:y(config.referenceValue),y2:y(config.referenceValue),class:'noria-stat-reference'});
 points.forEach((p,i)=>{if(typeof p.value!=='number'){previous=null;return;}const px=x(i),py=y(p.value);
   if(style==='line'){if(previous)draw('line',{x1:previous.x,y1:previous.y,x2:px,y2:py,class:'noria-series-line'});const isolated=!previous&&typeof points[i+1]?.value!=='number';if(visual.showPoints||isolated)draw('circle',{cx:px,cy:py,r:isolated?2.5:Math.min(2.5,210/points.length),class:'noria-series-point'});previous={x:px,y:py};}
   else draw('rect',{x:px-Math.min(18,450/points.length)/2,y:Math.min(py,y(0)),width:Math.min(18,450/points.length),height:Math.abs(py-y(0)),rx:2,class:'noria-series-state'});
 });
 const cursor=draw('line',{y1:12,y2:150,class:'noria-stat-cursor'}),activePoint=draw('circle',{r:4,class:'noria-stat-active-point'});
 updateSelection=()=>{
   const point=points[selected],px=x(selected);cursor.setAttribute('x1',px);cursor.setAttribute('x2',px);
   const hasValue=typeof point.value==='number';activePoint.setAttribute('visibility',hasValue?'visible':'hidden');
   if(hasValue){activePoint.setAttribute('cx',px);activePoint.setAttribute('cy',y(point.value));}
   plot.setAttribute('aria-label',`${label(point)} · ${text('左右键选择日期，回车编辑或查看来源','Arrow keys select dates; Enter edits or shows sources')}`);
 };
 select(selected);
 plot.onpointermove=e=>{const r=svg.getBoundingClientRect();if(r.width>0)select(Math.floor(((e.clientX-r.left)/r.width*600-15)/570*points.length));};
 plot.onpointerdown=plot.onpointermove;plot.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();select(e.key==='Home'?0:e.key==='End'?points.length-1:selected+(e.key==='ArrowLeft'?-1:1));}};
 const axis=host.createDiv({cls:'noria-stat-axis noria-stat-numeric-axis'}),acrossYears=points[0].date.slice(0,4)!==points.at(-1).date.slice(0,4);
 for(const i of [...new Set([0,Math.floor((points.length-1)/2),points.length-1])])axis.createSpan({text:acrossYears?points[i].date.slice(2):points[i].date.slice(5),attr:{title:points[i].date}});
 if(Number.isFinite(config.referenceValue))host.createSpan({cls:'noria-card-secondary noria-stat-reference-caption',text:text('参考值：','Reference: ')+numeric(config.referenceValue)});
 if(domain.expanded)host.createDiv({cls:'noria-card-secondary noria-stat-scale-notice',text:text('已扩展刻度以完整显示数据与参考值。','Scale expanded to include all data and the reference value.')});
}
module.exports={renderChart};
