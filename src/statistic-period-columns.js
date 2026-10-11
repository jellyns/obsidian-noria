"use strict";
const {axisDomain,axisTicks}=require('./statistic-appearance.js');
const {peakIndexes}=require('./runtime/views/dashboard/core/components/charts/trend-annotations.js');

// Pre-aggregated calendar periods stay discrete: never expand monthly counts into days.
function periodDotScale(values){
 const maximum=Math.max(0,...values),step=Math.max(1,Math.ceil(maximum/36)),rows=Math.max(8,Math.ceil(maximum/(3*step)));
 return {step,rows,capacity:rows*3*step};
}
function renderPeriodColumns(host,periods,{text,number,unit='',viewState={},activate,periodStyle='columns'}){
 const dots=periodStyle==='dots'?periodDotScale(periods.map(p=>p.value)):null;
 const domain=dots?{min:0,max:dots.capacity}:axisDomain(periods.map(p=>p.value),{},'columns');if(!domain)return;
 const chart=host.createDiv({cls:'noria-stat-periods'}),plot=chart.createDiv({cls:'noria-stat-period-plot'});chart.dataset.dense=String(periods.length>6);
 chart.dataset.style=periodStyle;
 if(dots){plot.style.height=(dots.rows*15-3)+'px';chart.createDiv({cls:'noria-stat-dot-key noria-card-secondary',text:text(`每格 ${number(dots.step)} ${unit}`,`${number(dots.step)} ${unit} per tile`)});}
 const peaks=new Set(peakIndexes(periods.map(p=>p.value))),buttons=[],labels=[];
 const retained=periods.findIndex(p=>p.key===viewState.date);let current=retained<0?periods.length-1:retained;
 const ratio=value=>value/domain.max*100;
 for(const value of axisTicks(domain,true)){
   const rule=plot.createDiv({cls:'noria-stat-period-rule',attr:{'aria-hidden':'true'}});rule.style.bottom=ratio(value)+'%';
   rule.createSpan({text:number(value)});
 }
 const columns=plot.createDiv({cls:'noria-stat-period-columns'});columns.style.gridTemplateColumns=`repeat(${periods.length},minmax(0,1fr))`;
 const inspect=index=>{buttons.forEach((b,i)=>{b.dataset.inspect=String(i===index);labels[i].hidden=i!==index&&!peaks.has(i);});};
 const select=index=>{current=index;viewState.date=periods[index].key;buttons.forEach((b,i)=>{b.tabIndex=i===index?0:-1;});inspect(index);};
 periods.forEach((period,i)=>{
   const b=columns.createEl('button',{cls:'noria-stat-period',attr:{type:'button',title:`${period.key} · ${number(period.value)} ${unit}`,'aria-label':`${period.key} · ${number(period.value)} ${unit} · ${text('查看作品','View works')}`}});buttons.push(b);b.dataset.period=period.key;
   b.style.setProperty('--noria-period-height',ratio(period.value)+'%');
   if(dots){
     b.style.setProperty('--noria-period-height',Math.max(0,Math.ceil(period.value/(3*dots.step))*15-3)+'px');
     const matrix=b.createSpan({cls:'noria-stat-dot-matrix',attr:{'aria-hidden':'true'}});matrix.style.gridTemplateRows=`repeat(${dots.rows},12px)`;
     for(let cell=0;cell<dots.rows*3;cell++){
       const tile=matrix.createSpan({cls:'noria-stat-dot'});tile.style.gridColumn=String(cell%3+1);tile.style.gridRow=String(dots.rows-Math.floor(cell/3));
       const fraction=Math.max(0,Math.min(1,period.value/dots.step-cell));tile.dataset.fraction=String(fraction);
       if(fraction>0){const ink=tile.createSpan();ink.style.height=fraction*100+'%';}
     }
   }else{const fill=b.createSpan({cls:'noria-stat-period-fill',attr:{'aria-hidden':'true'}});fill.hidden=period.value===0;}
   labels.push(b.createSpan({cls:'noria-stat-period-value',text:number(period.value),attr:{'aria-hidden':'true'}}));
   const tick=b.createSpan({cls:'noria-stat-period-label',text:text(Number(period.key.slice(5))+'月',new Date(period.key+'-01T12:00:00Z').toLocaleDateString('en',{month:'short',timeZone:'UTC'})),attr:{'aria-hidden':'true'}});tick.dataset.optional=String(i!==0&&i!==periods.length-1&&(i%2!==0||i===periods.length-2));
   b.onclick=()=>{select(i);activate(b,period.rows,period.key);};b.onfocus=()=>select(i);b.onpointerenter=()=>inspect(i);
   b.onkeydown=e=>{let next;if(e.key==='Home')next=0;else if(e.key==='End')next=periods.length-1;else if(e.key==='ArrowLeft'||e.key==='ArrowRight')next=Math.max(0,Math.min(periods.length-1,i+(e.key==='ArrowLeft'?-1:1)));if(next==null)return;e.preventDefault();select(next);buttons[next].focus({preventScroll:true});};
 });
 columns.onpointerleave=()=>inspect(current);select(current);
 return {select};
}
module.exports={renderPeriodColumns,periodDotScale};
