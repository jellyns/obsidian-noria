"use strict";
const validDate=s=>{const d=new Date(s+"T12:00:00Z");return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;};
const all="1234567";
function plans(config){return String(config.plan||"").split(";").filter(Boolean).map(entry=>{const [from,days]=entry.split("=");if(!validDate(from)||!/^([1-7]+|off)$/.test(days)||days!=="off"&&[...new Set(days)].sort().join("")!==days)throw Error("Invalid habit schedule");return {from,days};}).sort((a,b)=>a.from.localeCompare(b.from));}
function daysAt(config,date){let days=all;for(const plan of plans(config))if(plan.from<=date)days=plan.days;return days;}
function due(config,date){const day=new Date(date+"T12:00:00Z").getUTCDay()||7;return daysAt(config,date).includes(String(day));}
function firstStart(config){const history=plans(config);return history[0]?.days==="off"?history.find(p=>p.days!=="off")?.from||"":"";}
function evolve(current,draft,today){
 const next={...draft},history=current?plans(current):[{from:"0001-01-01",days:"off"}],previous=current?.stage||"active",stage=draft.stage||"active";
 const days=draft.weekdays??current?.weekdays??all;
 if(!/^[1-7]+$/.test(days)||[...new Set(days)].sort().join("")!==days)throw Error("Choose at least one weekday");
 if(current&&draft.startedOn&&draft.startedOn!==firstStart(current)){
  const first=history.find(p=>p.days!=="off");
  if(history[0]?.days!=="off"||!first||!validDate(draft.startedOn)||draft.startedOn>first.from||draft.startedOn>today||draft.startedOn<=history[0].from)throw Error("The initial start can only be extended into the past; later plans are preserved");
  first.from=draft.startedOn;
 }
 const changed=!current||days!==(current.weekdays||all)||stage!==previous;
 if(changed){const from=!current?(draft.startedOn||draft.effective||today):stage!==previous?today:(draft.effective||today);if(!validDate(from)||(current&&from<today)||(!current&&draft.startedOn&&from>today))throw Error("Schedule changes must start today or later; an initial start may be in the past");
  const retained=history.filter(item=>item.from<from);retained.push({from,days:stage==="active"?days:"off"});
  next.plan=retained.map(item=>`${item.from}=${item.days}`).join(";");
 }else next.plan=history.map(item=>`${item.from}=${item.days}`).join(";");
 next.weekdays=days;delete next.effective;delete next.startedOn;return next;
}
function summary(config,records,today){
 const keys=Object.keys(records).filter(d=>validDate(d)&&d<=today).sort();let streak=0,date=today;
 const shift=(d,n)=>{const t=new Date(d+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
 const earliest=keys[0]||today;
 while(date>=earliest){if(due(config,date)){if(records[date]?.done)streak++;else if(date!==today)break;}date=shift(date,-1);}
 const start=shift(today,-((new Date(today+"T12:00:00Z").getUTCDay()+6)%7));let planned=0,done=0;
 for(let i=0;i<7;i++){date=shift(start,i);if(due(config,date)){planned++;if(date<=today&&records[date]?.done)done++;}}
 const actualDone=keys.filter(date=>date>=start&&records[date]?.done).length,first=firstStart(config);
 const historyMissing=!!first&&keys.some(date=>date<first&&records[date]?.done);
 return {streak,planned,done,actualDone,historyMissing,daily:daysAt(config,today)===all,todayPlanned:due(config,today)};
}
function summaryText(s,zh=true){return zh?`${s.historyMissing?"待补历史计划":s.daily?`连续 ${s.streak} 天`:`连续达标 ${s.streak} 次`} · 本周 ${s.actualDone} 天`:`${s.historyMissing?"Set historical start":s.daily?`${s.streak} consecutive days`:`${s.streak} scheduled check-ins`} · ${s.actualDone} days this week`;}
function summaryDetail(s,zh=true){return zh?`本周计划内完成 ${s.done}/${s.planned}；额外打卡 ${s.actualDone-s.done} 天${s.historyMissing?"。请在习惯设置中补全开始坚持日期":""}`:`Scheduled this week: ${s.done}/${s.planned}; extra check-ins: ${s.actualDone-s.done}${s.historyMissing?". Set the initial start date in habit settings":""}`;}
function visual(config){
 const name=String(config.name||""),defaults=/早起|早间|起床|wake/i.test(name)?["sunrise","var(--color-orange)"]:/睡|sleep/i.test(name)||config.type==="sleep"?["moon","var(--color-purple)"]:/水|water/i.test(name)?["droplets","var(--color-cyan)"]:/读|阅读|read/i.test(name)?["book-open","var(--color-blue)"]:/运动|锻炼|exercise/i.test(name)?["dumbbell","var(--color-green)"]:["circle-check","var(--color-green)"];
 return {color:/^#[\da-f]{6}$/i.test(config.color||"")?config.color:defaults[1],icon:config.icon||defaults[0]};
}
function streakEnds(config,records,today){
 const keys=Object.keys(records).filter(date=>validDate(date)&&date<=today).sort(),ends={};if(!keys.length)return ends;
 let date=keys[0],count=0,last="";
 const finish=()=>{if(last&&count>=2)ends[last]=count;count=0;last="";};
 while(date<=today){if(due(config,date)){if(records[date]?.done){count++;last=date;}else finish();}const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+1);date=d.toISOString().slice(0,10);}
 finish();return ends;
}
module.exports={plans,daysAt,due,firstStart,evolve,summary,summaryText,summaryDetail,visual,streakEnds};
