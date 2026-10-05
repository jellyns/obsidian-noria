"use strict";
const {validPicture}=require("./picture-model.js");
const icons=["circle","smile","laugh","meh","frown","cloud-rain","sun","moon","battery-low","battery-medium","battery-full","book-open","heart","droplets","footprints","focus","check","minus"];
const labels={circle:["圆点","Dot"],smile:["微笑","Smile"],laugh:["开心","Happy"],meh:["平静","Calm"],frown:["低落","Low"],"cloud-rain":["雨云","Rain"],sun:["太阳","Sun"],moon:["月亮","Moon"],"battery-low":["低电量","Low energy"],"battery-medium":["半电量","Medium energy"],"battery-full":["满电量","Full energy"],"book-open":["书本","Book"],heart:["心形","Heart"],droplets:["水滴","Water"],footprints:["足迹","Footprints"],focus:["专注","Focus"],check:["勾选","Check"],minus:["横线","Dash"],sparkles:["星光","Sparkles"],"flower-2":["花朵","Flower"],dumbbell:["运动","Exercise"]};
const iconLabel=(icon,zh)=>(require("./record-pictures.js").names[icon]||labels[icon])?.[zh?0:1]||icon;
function choices(field){return field.type==="toggle"?[true,false]:field.type==="level"?Array.from({length:Math.max(0,Math.min(11,field.max-field.min+1))},(_,i)=>field.min+i):field.options||[];}
function fieldPicture(field){
 const defaults={mood:"smile",energy:"battery-medium",focus:"focus"},key=field.legacy;
 if(defaults[key]&&!field.iconCustomized&&(!field.icon||field.icon===defaults[key]))return "noria-"+key;
 return field.icon||"circle";
}
function appearance(field,value){
 const custom=field.states?.[String(value)]||{},base=fieldPicture(field);
 let icon=base,label="";
 if(value!=null){
  if(base==="noria-mood")icon=({"很好":"noria-mood-5","稳定":"noria-mood-4","一般":"noria-mood-3","偏低":"noria-mood-2","很差":"noria-mood-1"})[value]||base;
  if(base==="noria-focus")icon=({"很专注":"noria-focus-4","基本专注":"noria-focus-3","易分心":"noria-focus-2","难进入状态":"noria-focus-1"})[value]||base;
  if(base==="noria-energy"&&field.min===1&&field.max===5&&Number.isInteger(value)&&value>=1&&value<=5){icon="noria-energy-"+value;label=["","很低","偏低","适中","充沛","饱满"][value];}
  if(field.type==="toggle")icon=value?"check":"minus";
 }
 if(validPicture(custom.icon))icon=custom.icon;
 return {label:custom.label||label,icon,color:/^#[\da-f]{6}$/i.test(custom.color||"")?custom.color:""};
}
function validateVisuals(field){
 const states=Object.create(null);
 for(const value of choices(field)){const source=field.states?.[String(value)];if(!source)continue;
  if(source.icon&&!validPicture(source.icon))throw Error("Invalid state icon");
  if(source.color&&!/^#[\da-f]{6}$/i.test(source.color))throw Error("Invalid state color");
  states[String(value)]={label:String(source.label||"").trim(),icon:source.icon||"",color:source.color||""};
 }return states;
}
module.exports={fieldPicture,icons,iconLabel,choices,appearance,validateVisuals};
