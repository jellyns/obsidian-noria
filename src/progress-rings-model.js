"use strict";
function metrics(config){
  return Array.from({length:Number(config.ringCount??2)},(_,index)=>{
    const key='ring'+(index+1),source=config[key+'Source']||(index===0?'tasks':'habits');
    return {id:key,source,label:String(config[key+'Label']||'').trim(),property:source==='diary'?config[key+'Property']||'':'',habitId:config[key+'Habit']||'',cohort:config[key+'Cohort']||'scheduled',calculate:source==='diary'?(config[key+'Calculation']||'sum'):'rate',target:config[key+'Target'],unit:source==='diary'?String(config[key+'Unit']||'').trim():''};
  });
}
function validate(config,text=(a,b)=>b){
  const count=Number(config.ringCount??2);
  if(!Number.isInteger(count)||count<1||count>4)throw Error(text('选择1至4个指标','Choose one to four metrics'));
  for(const metric of metrics(config)){
    if(!['tasks','habits','diary'].includes(metric.source))throw Error(text('选择有效的指标来源','Choose a valid metric source'));
    if(metric.source==='tasks'&&!['due','scheduled'].includes(metric.cohort))throw Error(text('选择任务日期依据','Choose a task date basis'));
    if(metric.source==='diary'){
      if(!metric.property)throw Error(text('选择要统计的日记属性','Choose a diary property'));
      if(!['sum','mean'].includes(metric.calculate))throw Error(text('选择合计或平均值','Choose sum or mean'));
      if(metric.target!=null&&metric.target!==''&&(!Number.isFinite(Number(metric.target))||Number(metric.target)<=0))throw Error(text('目标需大于零；未设置可留空','A target must be greater than zero; leave blank if unset'));
    }
  }
}
function queryConfig(metric,range){
  return {source:metric.source,calculate:metric.calculate,property:metric.property,habitId:metric.habitId,cohort:metric.cohort,display:'metric',...(range?{scope:'fixed',...range}:{scope:'all'})};
}
function metricModel(metric,result){
  const rate=metric.calculate==='rate',value=rate?result.numerator:result.value,target=rate?result.denominator:metric.target==null||metric.target===''?null:Number(metric.target);
  const incomplete=!!(result.error||result.unreadable?.length||result.invalid?.length);
  const status=incomplete?'incomplete':value==null||rate&&!target?'empty':!target?'no-target':value<0?'negative':'ready';
  const ratio=status==='ready'?value/target:null;
  return {...metric,value,target,status,ratio,arc:ratio==null?0:Math.max(0,Math.min(1,ratio)),result};
}
module.exports={metrics,validate,queryConfig,metricModel};
