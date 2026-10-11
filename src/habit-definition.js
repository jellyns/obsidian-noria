"use strict";
const H=require("./runtime/views/dashboard/core/utils/habit-parsing.js");
const {scanMarkdownLines,scanAtxHeadings}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const titles={active:["打卡中的习惯","Active habits"],paused:["暂停的习惯","Paused habits"],done:["已养成习惯","Established habits","Completed habits"]};
function readHabitDefinitions(raw){
  const headings=scanAtxHeadings(raw),lines=scanMarkdownLines(raw),result=[];
  for(const heading of headings){
    if(heading.level!==2)continue;const stage=Object.keys(titles).find(key=>titles[key].includes(heading.title));if(!stage)continue;
    const end=headings.find(h=>h.start>heading.start&&h.level<=2)?.start??raw.length;
    for(const row of lines.filter(row=>row.eligible&&row.start>=heading.end&&row.start<end&&/^\s*-\s+(?!\[)/.test(row.text))){
      const config=H.inferLegacyHabitConfig(row.text.replace(/^\s*-\s+/,""));
      if(!config.name||/^(?:[（(]?空[）)]?|\(?empty\)?)$/i.test(config.name))continue;
      result.push({...config,stage,raw:row.text,startOffset:row.start,endOffset:row.end});
    }
  }return result;
}
function writeHabitDefinition(raw,original,draft,{id,zh=true,today}={}){
  const rows=readHabitDefinitions(raw),name=String(draft.name||"").trim(),stage=draft.stage||"active";
  if(!name||/[\r\n\[\];]/.test(name)||!titles[stage])throw Error("Invalid habit definition");
  if(draft.type==="number"&&(!Number.isFinite(Number(draft.target))||Number(draft.target)<=0))throw Error("The target must be greater than zero");
  if(draft.type==="sleep"&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.target))throw Error("Enter a valid target time");
  let current;
  if(original){const matches=rows.filter(row=>original.id?row.id===original.id:row.name===original.name);current=matches.length===1?matches[0]:null;if(!current||current.raw!==original.raw||current.stage!==original.stage)throw Error("Habit changed elsewhere; reload before saving");}
  if(rows.some(row=>row!==current&&(row.name===name||String(row.aliases||"").split(";").includes(name))))throw Error("Habit name already exists");
  const aliases=[...new Set([...(current?.aliases||"").split(";").filter(Boolean),...(original&&original.name!==name?[original.name]:[])])].filter(alias=>alias!==name).join(";");
  const config={...(today?require("./habit-plan.js").evolve(current,draft,today):draft),id:current?.id||id,aliases};
  if(config.icon&&!require("./picture-model.js").validPicture(config.icon))throw Error("Invalid habit icon");
  if(config.color&&!/^#[\da-f]{6}$/i.test(config.color))throw Error("Invalid habit color");
  require("./habit-plan.js").plans(config);
  require("./habit-plan.js").targets(config);
  const eol=raw.includes("\r\n")?"\r\n":"\n",line="- "+H.serializeHabitConfig(config);
  if(current&&current.stage===stage)return raw.slice(0,current.startOffset)+line+raw.slice(current.startOffset+current.raw.length);
  let next=current?raw.slice(0,current.startOffset)+raw.slice(current.endOffset):raw;
  const headings=scanAtxHeadings(next),heading=headings.find(h=>h.level===2&&titles[stage].includes(h.title));
  if(heading){const end=headings.find(h=>h.start>heading.start&&h.level<=2)?.start??next.length;const before=next.slice(0,end).replace(/(?:\r?\n)+$/,"");return before+eol+line+eol+eol+next.slice(end);}
  return next.replace(/\s*$/,"")+eol+eol+`## ${titles[stage][zh?0:1]}`+eol+eol+line+eol;
}
module.exports={readHabitDefinitions,writeHabitDefinition};
