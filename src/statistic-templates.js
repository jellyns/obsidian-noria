"use strict";
const {commitSettingsChange}=require('./settings-change.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const STYLES=[
  ['metric','数字摘要','Number','hash'],['line','折线','Line','chart-line'],
  ['columns','柱图','Columns','chart-column'],['bars','横向条形','Horizontal bars','chart-bar'],
  ['donut','环图','Donut','chart-pie'],['composition','分段占比','Segmented composition','chart-bar-stacked'],['heatmap','日历热力图','Calendar heatmap','calendar-days'],
  ['strip','连续色带','Continuous strip','chart-no-axes-combined'],['states','按日状态格','Daily states','calendar-check'],
  ['progress','目标进度','Progress','goal'],['comparison','前期对比','Previous period','columns-2']
];
// These templates retain the existing dashboard renderer and its data semantics.
const DASHBOARD_STATS={
  metrics:['metric','hash','统计总览','Overview metrics','汇总现有笔记与任务指标','Summarize existing note and task metrics'],
  'note-trend-card':['combo','chart-no-axes-combined','笔记趋势','Note trend','新建笔记与当前日记字符的双轴组合图','New notes and current diary characters on two axes'],
  'task-trend-card':['combo','chart-no-axes-combined','任务趋势','Task trend','任务活动总量与实际完成情况','Task activity totals and actual completions'],
  'habit-history-card':['history','calendar-check','习惯打卡','Habit history','逐项打卡、连续记录与计划达标','Check-ins, streaks and scheduled completion'],
  'habit-heatmap-card':['year','calendar-days','习惯热力图','Habit heatmap','按年查看习惯活动分布','Habit activity across a year'],
  'workload-heatmap-card':['year','calendar-days','工作量热力图','Workload heatmap','按年查看工作量，可切换统计指标','Yearly workload with selectable metrics'],
  'tag-distribution-card':['donut','chart-pie','标签分布','Tag distribution','沿用主页标签分布与来源口径','Use the existing dashboard tag distribution'],
  'daily-state-card':['records','activity','日常记录','Daily records','多个记录项目的趋势与就地补记','Multiple record trends with in-place editing']
};
function isDashboardStatistic(widget){return widget?.type==='builtin'&&Object.hasOwn(DASHBOARD_STATS,widget.builtinId||widget.id);}
function dashboardStatisticIcon(widget){return DASHBOARD_STATS[widget?.builtinId||widget?.id]?.[1];}
function dashboardTemplates(defaults,text){
  return defaults.filter(isDashboardStatistic).map(widget=>{
    const [style,icon,zh,en,descriptionZh,descriptionEn]=DASHBOARD_STATS[widget.id];
    return {id:'dashboard-'+widget.id,kind:'dashboard',builtinId:widget.id,source:widget.source,
      title:text(zh,en),description:text(descriptionZh,descriptionEn),style,icon,size:widget.size,props:clone(widget.props||{})};
  });
}
function widgetFromTemplate(template,base,followDiary=false){
  const identity={id:base?.id||`card-${globalThis.crypto.randomUUID()}`,title:template.title,
    size:template.size||base?.size||'medium',enabled:true,order:base?.order??Date.now(),props:clone(template.props)};
  if(followDiary){
    if(template.kind==='dashboard'&&require('./dashboard-statistic-settings.js').supportsRange({builtinId:template.builtinId}))identity.props.statsRange={mode:'homeCurrent'};
    else if(identity.props.scope!=='all')identity.props.scope='follow';
  }
  return template.kind==='dashboard'?{...identity,type:'builtin',builtinId:template.builtinId,source:template.source}:
    {...identity,type:'extension',source:template.kind==='periodic'?'noria:periodic-statistics':'noria:statistics'};
}
function builtInTemplates(fields,text){
  const active=fields.filter(f=>f.enabled!==false),numeric=active.find(f=>['number','level'].includes(f.type)),state=active.find(f=>['option','toggle'].includes(f.type));
  const recent={scope:'rolling',days:30};
  const task={source:'tasks',calculate:'count',...recent};
  const trend=numeric?{source:'diary',property:numeric.property,calculate:'mean',...recent}:task;
  const states={source:'diary',property:state?.property||'',calculate:'distribution',...recent};
  const groups={source:'notes',calculate:'count',group:'folder',recursive:true,scope:'all'};
  const definitions={
    metric:{title:text('完成任务数量','Completed tasks'),props:task,description:text('查看近期实际完成了多少任务','Count recently completed tasks')},
    line:{title:numeric?text(numeric.name+'变化',numeric.name+' trend'):text('任务完成趋势','Task completion trend'),props:trend,description:text('按日期查看变化，缺失记录保留空白','See changes by date; missing records stay empty')},
    columns:{title:text('每日完成任务','Daily task completions'),props:task,description:text('比较每天完成的任务数量','Compare the number of tasks completed each day')},
    bars:{title:text('文件夹构成','Folder composition'),props:groups,description:text('按文件夹比较笔记数量','Compare note counts by folder')},
    donut:{title:text('笔记构成占比','Note composition'),props:groups,description:text('查看互不重叠的文件夹占比','See shares of mutually exclusive folders')},
    composition:{title:state?state.name+text('占比',' composition'):text('状态占比','State composition'),props:{...states,scope:'follow'},description:text('跟随当前周期，查看各状态的数量与比例','Follow the current period and compare state counts and shares')},
    heatmap:{title:text('习惯完成日历','Habit completion calendar'),props:{source:'habits',calculate:'count',...recent},description:text('查看每天的打卡数量与空白日期','See check-ins and dates without records')},
    strip:{title:state?state.name+text('变化',' over time'):text('状态变化','State changes'),props:states,description:state?text('沿日期查看记录状态','Follow recorded states over time'):text('先选择要查看的状态属性','Choose a state property to track')},
    states:{title:state?state.name+text('日历',' calendar'):text('每日状态','Daily states'),props:states,description:state?text('逐日查看状态，可就地补记','Inspect daily states and edit records in place'):text('先选择要记录的状态属性','Choose a state property to track')},
    progress:{title:text('习惯按计划达标','Scheduled habit completion'),props:{source:'habits',calculate:'rate',scope:'follow'},description:text('按实际计划计算达标比例，休息日不计入','Completion against the schedule, excluding rest days')},
    comparison:{title:text('任务完成对比','Task completion comparison'),props:task,description:text('与前一等长区间比较完成量','Compare completions with the preceding equal-length period')}
  };
  const styles=STYLES.map(([display,zh,en,icon])=>({id:'style-'+display,style:display,styleName:text(zh,en),icon,...definitions[display],props:{...definitions[display].props,display}}));
  const records=active.map(f=>({id:'record-'+f.id,title:f.name,icon:'activity',description:text('使用已配置的日常记录','Use your configured daily record'),props:{source:'diary',property:f.property,calculate:['number','level'].includes(f.type)?'mean':'distribution',display:['number','level'].includes(f.type)?'line':'strip',...recent}}));
  return {styles,recommended:[...records,...['metric','heatmap','progress','comparison'].map(id=>styles.find(t=>t.style===id))]};
}

// A template copies configuration, never a card placement or a data snapshot.
function templateFromWidget(widget,title,id=globalThis.crypto.randomUUID()){
  const name=String(title||'').trim();
  if(!name||name.length>80)throw Error('Template names must contain 1–80 characters');
  const dashboard=isDashboardStatistic(widget);
  if(!dashboard&&(!['noria:statistics','noria:periodic-statistics'].includes(widget.source)||widget.type!=='extension'))throw Error('Only statistics cards can be saved as statistics templates');
  const props=clone(widget.props||{});delete props.cardHeight;
  if(props.display==='trend')props.display='columns';
  return {id,title:name,size:widget.size||'medium',props,...(dashboard?{kind:'dashboard',builtinId:widget.builtinId||widget.id,source:widget.source,style:DASHBOARD_STATS[widget.builtinId||widget.id][0]}:widget.source==='noria:periodic-statistics'?{kind:'periodic',style:'combo'}:{})};
}
class StatisticTemplates{
  constructor(plugin){this.plugin=plugin;}
  read(){const value=this.plugin.settings.statisticTemplates;if(value?.version!=null&&value.version!==1)throw Error('Unsupported statistics template version');return clone(value?.items||[]);}
  async save(widget,title){const template=templateFromWidget(widget,title);await commitSettingsChange(this.plugin,['statisticTemplates'],()=>{this.plugin.settings.statisticTemplates={version:1,items:[...this.read(),template]};});return clone(template);}
  async remove(id){await commitSettingsChange(this.plugin,['statisticTemplates'],()=>{this.plugin.settings.statisticTemplates={version:1,items:this.read().filter(item=>item.id!==id)};});}
}
module.exports={STYLES,builtInTemplates,dashboardTemplates,isDashboardStatistic,dashboardStatisticIcon,widgetFromTemplate,templateFromWidget,StatisticTemplates};
