(function () {
  const units = ["hour", "day", "week", "month", "year"];
  const defaults = [{amount:1,unit:"day"},{amount:1,unit:"week"},{amount:1,unit:"month"}];
  function scale(value) {
    const amount=Number(value?.amount),unit=value?.unit;
    return Number.isInteger(amount)&&amount>=1&&amount<=({month:120,year:10}[unit]||999)&&units.includes(unit)?{amount,unit}:null;
  }
  function add(value, spec, direction=1) {
    const d=new Date(value),s=scale(spec);if(!s||!Number.isFinite(+d))return NaN;
    const n=s.amount*direction;
    if(s.unit==="hour")return +d+n*3600000;
    if(s.unit==="day"||s.unit==="week")d.setDate(d.getDate()+n*(s.unit==="week"?7:1));
    else {const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n*(s.unit==="year"?12:1));const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));}
    return +d;
  }
  function normalize(value) {
    const startMs=Number(value?.startMs),endMs=Number(value?.endMs);
    if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs||!Number.isFinite(+new Date(startMs))||!Number.isFinite(+new Date(endMs)))return null;
    const s=scale(value.scale),anchor=value.calendarAnchor;
    const anchored=s&&["month","year"].includes(s.unit)&&Number.isFinite(anchor?.originMs)&&Number.isInteger(anchor?.step)&&Math.abs(anchor.step)<=12000&&Math.abs(add(anchor.originMs,s,anchor.step)-startMs)<5&&Math.abs(add(anchor.originMs,s,anchor.step+1)-endMs)<5;
    const result={startMs,endMs,scale:s&&(anchored||Math.abs(add(startMs,s)-endMs)<5)?s:null};
    if(anchored)result.calendarAnchor={originMs:anchor.originMs,step:anchor.step};
    if(Number.isFinite(value.focusMs)&&value.focusMs>=startMs&&value.focusMs<endMs)result.focusMs=value.focusMs;
    return result;
  }
  function at(startMs,spec){const s=scale(spec);return s?normalize({startMs,endMs:add(startMs,s),scale:s}):null;}
  function shift(window,dir){
    const w=normalize(window);if(!w||!Number.isInteger(dir))return null;
    let next;
    if(w.scale&&["month","year"].includes(w.scale.unit)){
      const anchor=w.calendarAnchor||{originMs:w.startMs,step:0},step=anchor.step+dir;
      next=normalize({startMs:add(anchor.originMs,w.scale,step),endMs:add(anchor.originMs,w.scale,step+1),scale:w.scale,calendarAnchor:{originMs:anchor.originMs,step}});
    }else {const startMs=w.scale?add(w.startMs,w.scale,dir):w.startMs+dir*(w.endMs-w.startMs);next=w.scale?at(startMs,w.scale):normalize({startMs,endMs:startMs+w.endMs-w.startMs});}
    if(next&&Number.isFinite(w.focusMs))next.focusMs=next.startMs+(w.focusMs-w.startMs)/(w.endMs-w.startMs)*(next.endMs-next.startMs);
    return next;
  }
  function around(focusMs,spec){
    const s=scale(spec);if(!s||!Number.isFinite(focusMs))return null;
    let lo=add(focusMs,s,-1),hi=focusMs;
    for(let i=0;i<48&&hi-lo>1;i++){const mid=Math.floor((lo+hi)/2);if((mid+add(mid,s))/2<focusMs)lo=mid;else hi=mid;}
    const result=at(Math.round((lo+hi)/2),s);return result?{...result,focusMs}:null;
  }
  function favorites(raw){return (Array.isArray(raw)?raw:defaults).map(scale).filter(Boolean).filter((s,i,arr)=>arr.findIndex(a=>a.unit===s.unit&&a.amount===s.amount)===i).slice(0,24);}
  function label(window,zh=true){const w=normalize(window),s=w?.scale;if(s)return zh?`${s.amount} ${{hour:"小时",day:"天",week:"周",month:"月",year:"年"}[s.unit]}`:`${s.amount} ${s.unit}${s.amount===1?"":"s"}`;if(!w)return zh?"尺度":"Scale";const h=(w.endMs-w.startMs)/3600000;return (zh?"自定 · ":"Custom · ")+(h<48?`${+h.toFixed(1)}${zh?" 小时":" h"}`:`${+(h/24).toFixed(1)}${zh?" 天":" d"}`);}
  const api={scale,add,normalize,at,around,shift,favorites,label,defaults,units};
  (globalThis.noriaTaskTimeline||(globalThis.noriaTaskTimeline={})).timeWindow=api;
  if(typeof module!=="undefined"&&module.exports&&module!==globalThis.module)module.exports=api;
})();
