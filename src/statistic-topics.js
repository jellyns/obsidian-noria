'use strict';
const TOPICS=[['tasks','任务与专注','Tasks & focus'],['notes','笔记与积累','Notes'],['habits','习惯与状态','Habits & wellbeing'],['health','健康','Health'],['finance','财务','Finance'],['library','藏馆与物品','Collections'],['other','其他统计','Other statistics']];
function statisticTopic(value){
 if(TOPICS.some(([key])=>key===value.topic))return value.topic;
 const props=value.props||{},id=value.builtinId||value.id||'',source=value.source||'';
 if(source.startsWith('noria:health-'))return 'health';
 if(source.startsWith('noria:finance-'))return 'finance';
 if(/noria:(media|inventory|wardrobe|travel)/.test(source))return 'library';
 if(/task|focus/.test(id)||['tasks','focus','goals'].includes(props.source)||props.metric==='tasks')return 'tasks';
 if(/habit|daily-state/.test(id)||['habits','diary'].includes(props.source))return 'habits';
 if(/note|metric|workload|tag-distribution/.test(id)||props.source==='notes'||props.metric==='notes')return 'notes';
 return 'other';
}
function defaultStatisticsView(widgets){
 const active=widgets.filter(w=>w.enabled!==false),pinned=[];
 for(const key of ['task-trend-card','note-trend-card']){const w=active.find(w=>(w.builtinId||w.id)===key);if(w)pinned.push(w.id);}
 return {version:2,pinned,placement:{},expanded:[]};
}
function normalizeStatisticsView(value={}){
 // Version 1 hid entire topics. Only alternative styles can be folded now.
 return {version:2,pinned:Array.isArray(value.pinned)?[...new Set(value.pinned)]:[],
  placement:value.version===2?Object.fromEntries(Object.entries(value.placement||{}).filter(([,v])=>['main','alternative'].includes(v))):{},
  expanded:value.version===2&&Array.isArray(value.expanded)?[...new Set(value.expanded)]:[]};
}
const visualProps=new Set(['display','appearance','picture','cardHeight','lazy']);
function stable(value){return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;}
function statisticPurpose(widget){
 if(widget.source!=='noria:statistics')return widget.id;
 const props=widget.props||{},display=props.display||'metric';
 let purpose=display;
 if(['bars','donut','composition'].includes(display))purpose='distribution';
 else if(['strip','calendar'].includes(display))purpose='daily-state';
 else if(['trend','line','columns'].includes(display))purpose='time-series';
 // Keep every query field, including unfamiliar options. Do not guess
 // equivalence across renderers, periods, filters or summary/comparison views.
 return JSON.stringify(stable([widget.builtinId||(widget.type==='builtin'?widget.id:widget.source),purpose,Object.fromEntries(Object.entries(props).filter(([key])=>!visualProps.has(key)))]));
}
function statisticPlacements(widgets,view){
 const config=normalizeStatisticsView(view),active=widgets.filter(w=>w.enabled!==false).slice().sort((a,b)=>(a.order||0)-(b.order||0));
 const explicitMain=w=>config.pinned.includes(w.id)||config.placement[w.id]==='main';
 const seen=new Set(),result=new Map();
 for(const w of [...active.filter(explicitMain),...active.filter(w=>!explicitMain(w))]){
  const key=statisticPurpose(w),alternative=!explicitMain(w)&&(config.placement[w.id]==='alternative'||seen.has(key));
  result.set(w.id,alternative?'alternative':'main');if(!alternative)seen.add(key);
 }
 return result;
}
module.exports={TOPICS,statisticTopic,defaultStatisticsView,normalizeStatisticsView,statisticPlacements};
