"use strict";
function fields(config,t){
  const option=items=>items.map(([value,zh,en])=>({value,label:t(zh,en)}));
  const result=[{key:'source',label:t('来源','Source'),type:'select',default:'goals',refresh:true,options:option([['goals','多个目标','Multiple goals'],['diary','日记记录','Diary records'],['tasks','任务','Tasks'],['habits','习惯','Habits'],['focus','专注分段记录','Focus segments'],['notes','笔记属性','Note properties']])},
    {key:'scope',section:t('时间范围','Time range'),label:t('范围','Range'),type:'select',default:'follow',refresh:true,options:option([['follow','跟随当前页面','Follow page'],['rolling','最近一段时间','Recent days'],['fixed','固定范围','Fixed range'],['all','不限时间','All dates']])},
    ...(config.scope==='rolling'?[{key:'days',label:t('最近天数（含今天）','Recent days (including today)'),type:'number',default:30,required:true}]:[]),
    ...(config.scope==='fixed'?[{key:'start',label:t('开始','Start'),type:'date',required:true},{key:'end',label:t('结束','End'),type:'date',required:true}]:[]),
    {key:'ringCount',section:t('指标','Metrics'),label:t('圈数','Rings'),type:'select',default:'2',refresh:true,options:[1,2,3,4].map(n=>({value:String(n),label:String(n)}))}];
  for(let i=1;i<=Number(config.ringCount||2);i++){
    const key='ring'+i,source=config[key+'Source']||(i===1?'tasks':'habits');
    result.push({key:key+'Source',section:t('第'+i+'圈','Ring '+i),label:t('指标来源','Metric source'),type:'select',default:source,refresh:true,options:option([['tasks','任务完成','Task completion'],['habits','习惯达标','Habit completion'],['diary','日记数值','Diary value']])},
      {key:key+'Label',label:t('名称（可选）','Name (optional)')});
    if(source==='tasks')result.push({key:key+'Cohort',label:t('按什么日期纳入任务','Task date basis'),type:'select',default:'scheduled',options:option([['scheduled','计划日期','Scheduled date'],['due','截止日期','Due date']])});
    if(source==='habits')result.push({key:key+'Habit',label:t('习惯 ID 或名称（留空为全部）','Habit ID or name (empty for all)')});
    if(source==='diary')result.push({key:key+'Property',label:t('数值属性','Numeric property'),type:'property',required:true},
      {key:key+'Calculation',label:t('计算方式','Calculation'),type:'select',default:'sum',options:option([['sum','合计','Sum'],['mean','平均值','Mean']])},
      {key:key+'Target',label:t('当前范围目标（同单位，可留空）','Target for this range (optional, same unit)'),type:'number'},
      {key:key+'Unit',label:t('单位（留空沿用记录设置）','Unit (empty to use record settings)')});
  }
  result.push({key:'display',label:t('图表','Chart'),type:'select',default:'progress-rings',options:[{value:'progress-rings',label:t('进度环','Progress rings')}]});
  return result;
}
module.exports={fields};
