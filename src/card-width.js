"use strict";
const PRESETS=[3,4,6,8,9,12];
const LEGACY={small:3,medium:4,wide:6,full:12};
const clampSpan=value=>Math.max(3,Math.min(12,Math.round(Number(value)||4)));
const cardSpan=state=>clampSpan(state?.span??state?.layout?.span??LEGACY[state?.size]??4);
const nearestSpan=(width,total,gap=0)=>clampSpan((width+gap)/((total+gap)/12));
const spanLabel=span=>({3:'¼',4:'⅓',6:'½',8:'⅔',9:'¾',12:'100%'})[span]||`${Math.round(span/12*100)}%`;
const widthLayout=(state,span)=>({...state?.layout,span:clampSpan(span),minWidth:220});
const cardGrid=host=>host?.closest?.('.noria-diary-cards,.dashboard-home-root')||host?.parentElement;
const cardUnit=host=>host?.parentElement?.classList.contains('noria-card-stack')?host.parentElement:host;
const canResizeCard=host=>host?.classList.contains('noria-diary-card')
  ? (host.closest('.noria-diary')?.clientWidth||cardGrid(host).clientWidth)>640
  : cardGrid(host).clientWidth>900&&host.ownerDocument.defaultView.innerWidth>900;
module.exports={PRESETS,canResizeCard,clampSpan,cardSpan,nearestSpan,spanLabel,widthLayout,cardGrid,cardUnit};
