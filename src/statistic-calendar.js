'use strict';
// A calendar is a date navigator with readable values, not a matrix of color swatches.
function renderStatisticCalendar(host,points,{text,value,color,today,viewState,activate}){
 const months=[...new Set(points.map(p=>p.date.slice(0,7)))],byDate=new Map(points.map(p=>[p.date,p]));
 let month=months.includes(viewState.month)?viewState.month:months.includes(viewState.date?.slice(0,7))?viewState.date.slice(0,7):months.at(-1);
 const section=host.createDiv({cls:'noria-stat-record-calendar'}),head=section.createDiv({cls:'noria-stat-calendar-head'});
 const prev=head.createEl('button',{text:'‹',attr:{type:'button','aria-label':text('上月','Previous month')}}),title=head.createEl('span',{attr:{'aria-live':'polite'}}),next=head.createEl('button',{text:'›',attr:{type:'button','aria-label':text('下月','Next month')}});
 const grid=section.createDiv({cls:'noria-stat-calendar-grid',attr:{role:'group','aria-label':text('按日查看记录','Daily records')}});
 function paint(focusDate){
  viewState.month=month;title.setText(month.replace('-',text('年 ',' · '))+text('月',''));prev.disabled=months.indexOf(month)===0;next.disabled=months.indexOf(month)===months.length-1;grid.empty();
  if(!viewState.date?.startsWith(month))viewState.date=points.find(p=>p.date.startsWith(month))?.date;
  for(const day of text('一 二 三 四 五 六 日','M T W T F S S').split(' '))grid.createSpan({cls:'noria-stat-calendar-weekday',text:day});
  const offset=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7,days=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate();
  for(let i=0;i<offset;i++)grid.createSpan();
  for(let day=1;day<=days;day++){
   const date=month+'-'+String(day).padStart(2,'0'),point=byDate.get(date),b=grid.createEl('button',{cls:'noria-stat-calendar-cell',attr:{type:'button','data-date':date}});
   b.disabled=!point;b.tabIndex=date===viewState.date?0:-1;b.createSpan({cls:'noria-stat-calendar-date',text:String(day)});if(date===today)b.setAttribute('aria-current','date');
   if(!point)continue;
   const label=value(point),brief=point.multiple||point.ambiguous?text('多条','Multiple'):point.value==null?'—':label;
   b.createSpan({cls:'noria-stat-calendar-value',text:brief});b.setAttribute('aria-label',date+' · '+label);b.title=date+' · '+label;
   if(point.value!=null&&!point.multiple&&!point.ambiguous)b.style.setProperty('--noria-calendar-value-color',color(point));
   b.dataset.missing=String(point.value==null&&!point.multiple&&!point.ambiguous);b.dataset.selected=String(date===viewState.date);
   b.onclick=()=>{viewState.date=date;for(const cell of grid.querySelectorAll('button')){cell.dataset.selected=String(cell===b);cell.tabIndex=cell===b?0:-1;}activate(b,point.rows,date);};
   b.onkeydown=e=>{const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(step==null)return;e.preventDefault();const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+step);const target=d.toISOString().slice(0,10);if(!byDate.has(target))return;month=target.slice(0,7);viewState.date=target;paint(target);};
   if(focusDate===date)b.focus({preventScroll:true});
  }
 }
 prev.onclick=()=>{month=months[months.indexOf(month)-1];paint();};next.onclick=()=>{month=months[months.indexOf(month)+1];paint();};paint();
 return section;
}
module.exports={renderStatisticCalendar};
