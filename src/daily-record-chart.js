"use strict";
const {appearance}=require('./record-visual.js');

const ordered={mood:['很差','偏低','一般','稳定','很好'],focus:['难进入状态','易分心','基本专注','很专注']};
function recordTrendScale(field,points){
  const states=field.type==='option'&&ordered[field.legacy];
  if(states&&field.options?.every(value=>states.includes(value)))return {min:0,max:states.length-1,low:states[0],high:states.at(-1),value:v=>states.includes(v)?states.indexOf(v):null};
  if(field.type==='number'){
    const values=points.map(p=>p.value).filter(v=>typeof v==='number'&&Number.isFinite(v));
    return {min:values.length?Math.min(...values):0,max:values.length?Math.max(...values):1,value:v=>typeof v==='number'&&Number.isFinite(v)?v:null};
  }
  return null;
}

// Both diary and overview use the same scale; point positions never depend on option order.
function drawRecordChart(chart,field,points,{display,text,compact=false}={}){
  const scale=recordTrendScale(field,points),count=points.length;
  chart.style.setProperty('--noria-record-days',String(count));
  const plot=chart.createSpan({cls:'noria-record-plot',attr:{'aria-hidden':'true'}});
  if(scale){
    chart.addClass('has-trend');
    if(scale.low&&!compact){chart.addClass('has-scale');chart.dataset.recordScale=`${display(field,scale.low)} → ${display(field,scale.high)}`;const labels=chart.createSpan({cls:'noria-record-ordinates',attr:{'aria-hidden':'true'}});labels.createSpan({text:display(field,scale.low)});labels.createSpan({text:' → '});labels.createSpan({text:display(field,scale.high)});}
    const svg=chart.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 1000 100');svg.setAttribute('preserveAspectRatio','none');plot.append(svg);
    const y=v=>scale.max===scale.min?50:86-(v-scale.min)/(scale.max-scale.min)*72;
    let previous=null;
    points.forEach((point,i)=>{
      const value=point.ambiguous||point.multiple?null:scale.value(point.value),x=(i+.5)/count*100;
      if(value==null){previous=null;if(point.ambiguous||point.multiple){const mark=plot.createSpan({cls:'noria-record-point is-multiple'});mark.style.left=x+'%';mark.style.top='50%';}return;}
      const cy=y(value);
      if(previous){const line=svg.ownerDocument.createElementNS(svg.namespaceURI,'line');for(const [key,v] of Object.entries({x1:previous.x*10,y1:previous.y,x2:x*10,y2:cy,class:'noria-series-line'}))line.setAttribute(key,String(v));svg.append(line);}
      const dot=plot.createSpan({cls:'noria-record-point'});dot.style.left=x+'%';dot.style.top=cy+'%';dot.dataset.date=point.date;
      const color=appearance(field,point.value).color;if(color)dot.style.setProperty('--noria-record-color',color);
      previous={x,y:cy};
    });
  }else{
    const cells=plot.createSpan({cls:'noria-daily-series-cells'+(field.type==='level'?' is-level':'')});
    for(const point of points){const cell=cells.createSpan({cls:'noria-daily-series-cell'}),mark=cell.createSpan({cls:'noria-daily-series-mark'});
      if(point.ambiguous||point.multiple){mark.addClass('is-multiple');continue;}
      if(point.value==null){mark.addClass('is-missing');continue;}
      const color=appearance(field,point.value).color;if(color)mark.style.setProperty('--noria-record-color',color);
      if(field.type==='level'){const extent=Number(field.max)-Number(field.min),ratio=extent>0?(Number(point.value)-Number(field.min))/extent:.5;mark.style.height=`${8+Math.max(0,Math.min(1,ratio))*(compact?20:32)}px`;}
    }
  }
  if(!points.some(p=>p.value!=null||p.ambiguous||p.multiple))chart.createSpan({cls:'noria-series-empty',text:text('尚未记录','No records yet')});
  return plot;
}
module.exports={recordTrendScale,drawRecordChart};
