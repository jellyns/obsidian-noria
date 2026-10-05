"use strict";
const H = require("./runtime/views/dashboard/core/utils/habit-parsing.js");
const {scanMarkdownLines,scanAtxHeadings} = require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const {normalizeReviewSelection} = require("./review-center-core.js");

function habitRecords(raw, date, path) {
  return scanMarkdownLines(raw).filter(r=>r.eligible).flatMap(row=>{
    const match=/^\s*[-*+]\s*\[([ xX])\]\s+(.+)$/.exec(row.text);
    if(!match || !/(^|\s)#habit\b/.test(match[2])) return [];
    const fields=H.parseInlineFields(match[2]), stamp=H.extractTaskDate(match[2]) || date;
    if(stamp !== date) return [];
    return [{...fields,name:H.canonicalHabitName(match[2]),date,done:/[xX]/.test(match[1]),
      text:match[2],completed:/[xX]/.test(match[1]),path,line:row.line,start:row.start,end:row.end,raw:row.text}];
  });
}
function withoutHabitRecords(raw,date) {
  const records=habitRecords(raw,date,"");
  let ranges=records.map(r=>({start:r.start,end:r.end}));
  const headings=scanAtxHeadings(raw);
  for(const h of headings.filter(h=>h.level===2 && ["习惯记录","Habit records"].includes(h.title))) {
    const end=headings.find(next=>next.start>h.start && next.level<=2)?.start ?? raw.length;
    const inner=records.filter(r=>r.start>=h.end && r.end<=end);
    let remainder=raw.slice(h.end,end);
    for(const r of inner.slice().reverse()) remainder=remainder.slice(0,r.start-h.end)+remainder.slice(r.end-h.end);
    if(inner.length && !remainder.trim()) {ranges=ranges.filter(r=>r.start<h.start || r.end>end);ranges.push({start:h.start,end});}
  }
  for(const range of ranges.sort((a,b)=>b.start-a.start)) raw=raw.slice(0,range.start)+raw.slice(range.end);
  return raw;
}
function writeHabitMarkdown(raw, {config,date,done,value="",heading="习惯记录"}) {
  const cfg=H.inferLegacyHabitConfig(H.serializeHabitConfig(config));
  if(!cfg.name || [cfg.name,cfg.type,cfg.target,cfg.unit,value].some(v=>/[\r\n\[\]]/.test(String(v||"")))) throw new Error("Invalid habit record");
  normalizeReviewSelection({mode:"daily",anchorDate:date});
  if(value !== "" && cfg.type === "number" && (!Number.isFinite(Number(value)) || Number(value)<0)) throw new Error("Invalid habit value");
  if(value !== "" && cfg.type === "sleep" && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Invalid sleep time");
  const names=new Set([cfg.name,...String(cfg.aliases||"").split(";").filter(Boolean)]);
  const records=habitRecords(raw,date,"").filter(r=>r.name === cfg.name || names.has(r.name) || (cfg.id && r["habit-id"]===cfg.id));
  if(records.length>1) throw new Error("Duplicate habit records; open the source to resolve them");
  const eol=/\r\n|\n|\r/.exec(raw)?.[0] || "\n";
  const {plan,weekdays,icon,color,...recordConfig}=cfg;
  const line=`- [${done?"x":" "}] ${H.serializeHabitConfig(recordConfig)} #habit [due:: ${date}]${value !== ""?` [value:: ${value}]`:""}${done?` [completion:: ${date}]`:""}`;
  if(records.length){
    const hit=records[0];
    let updated=hit.raw.replace(/^(\s*[-*+]\s*\[)[ xX](\])/,(all,before,after)=>before+(done?"x":" ")+after);
    const suffix=/([ \t]+\^[A-Za-z0-9-]+[ \t]*|[ \t]+)$/.exec(updated)?.[0] || "";
    if(suffix) updated=updated.slice(0,-suffix.length);
    const field=(key,next)=>{
      const pattern=new RegExp(`\\[${key}::[^\\]]*\\]`,"gi"),matches=updated.match(pattern)||[];
      if(matches.length>1) throw new Error("Duplicate habit fields; open the source to resolve them");
      if(next === "") updated=updated.replace(new RegExp(`[ \\t]*\\[${key}::[^\\]]*\\]`,"gi"),"");
      else if(matches.length) updated=updated.replace(pattern,`[${key}:: ${next}]`);
      else updated+=` [${key}:: ${next}]`;
    };
    for(const key of ["type","target","unit"]) if(!H.extractInlineField(updated,key) && cfg[key]) field(key,cfg[key]);
    if(cfg.id&&!H.extractInlineField(updated,"habit-id"))field("habit-id",cfg.id);
    field("value",String(value));field("done","");field("completion",done?date:"");
    updated=updated.replace(/[ \t]*✅\s*\d{4}-\d{2}-\d{2}/g,"");
    if(!H.extractTaskDate(updated)) field("due",date);
    return raw.slice(0,hit.start)+updated+suffix+raw.slice(hit.start+hit.raw.length,hit.end)+raw.slice(hit.end);
  }
  const headings=scanAtxHeadings(raw), matches=headings.filter(h=>h.level === 2 && ["习惯记录","Habit records"].includes(h.title));
  if(matches.length>1) throw new Error("Duplicate habit sections; open the source to resolve them");
  if(matches.length){const start=matches[0],end=headings.find(h=>h.start>start.start && h.level<=2)?.start ?? raw.length;const before=raw.slice(0,end);return before+(before.endsWith(eol)?"":eol)+line+eol+(end<raw.length?eol:"")+raw.slice(end);}
  return raw+(raw?raw.endsWith(eol+eol)?"":raw.endsWith(eol)?eol:eol+eol:"")+`## ${heading}${eol}${eol}${line}${eol}`;
}
class DiaryHabitStore {
  constructor(plugin){this.plugin=plugin;}
  async history(configs){
    const p=this.plugin,result=Object.fromEntries(configs.map(c=>[c.name,{}]));
    const sources=new Map();
    const read=async path=>{if(!sources.has(path))sources.set(path,await p.loadTextFromVault(path));return sources.get(path);};
    const registry=p.getManagedPath("habitRegistry");
    const source=await read(registry),tasks=scanMarkdownLines(source).filter(row=>row.eligible).flatMap(row=>{const m=/^\s*[-*+]\s*\[([ xX])\]\s+(.+)$/.exec(row.text);return m?[{path:registry,text:m[2],completed:/[xX]/.test(m[1])}]:[];});
    // Native metadata task entries carry positions/status, not the source text.
    // Read the scoped notes so history is independent of the visible date window.
    for(const page of p.pagesForManagedPath("diaryRoot")){
      const path=page.file?.path;if(!path)continue;
      const raw=await read(path);
      for(const row of scanMarkdownLines(raw).filter(row=>row.eligible)){
        const m=/^\s*[-*+]\s*\[([ xX])\]\s+(.+)$/.exec(row.text);
        if(m)tasks.push({path,text:m[2],completed:/[xX]/.test(m[1])});
      }
    }
    for(const task of tasks){const text=task.text||task.rawText||"";if(!/(^|\s)#habit\b/.test(text))continue;
      const fields=H.parseInlineFields(text),name=H.canonicalHabitName(text),config=configs.find(c=>c.id&&c.id===fields["habit-id"]||c.name===name||String(c.aliases||"").split(";").includes(name));
      const date=H.extractTaskDate(text);if(!config||!date||date>p.getLocalYmd())continue;
      const previous=result[config.name][date],path=task.path||task.from;if(previous?.path!==registry&&path===registry&&previous)continue;
      result[config.name][date]={done:!!task.completed,path,target:fields.target,value:fields.value,type:fields.type,unit:fields.unit};
    }
    for(const task of tasks){const text=task.text||task.rawText||"";if(!/(^|\s)#tl\/sleep\b/.test(text))continue;
      const config=configs.find(c=>c.type==="sleep"),fields=H.parseInlineFields(text),date=H.getSleepHabitDate(fields.start);
      if(!config||!date||date>p.getLocalYmd()||result[config.name][date])continue;
      const value=fields.start?.match(/\d{1,2}:\d{2}/)?.[0],target=fields.target||config.target;
      if(value)result[config.name][date]={done:H.isSleepBeforeTarget(value,target),path:task.path||task.from,value,target};
    }
    // Bound habits store their value in the dated note property. The checkbox is
    // only a projection and can be stale after editing that property directly.
    for(const config of configs.filter(config=>config.recordField)){
      const field=p.records?.definitions().find(field=>field.property===config.recordField);if(!field)continue;
      for(const [date,record] of Object.entries(result[config.name])){
        const spec=await p.resolveCalendarNoteSpecAsync("daily",date),value=p.records.read(await read(spec.path),field);
        result[config.name][date]={...record,path:spec.path,value:value??"",done:typeof value==="number"&&value>=Number(record.target||config.target),source:"property",recordField:config.recordField};
      }
    }
    return result;
  }
  async load(date,{registryPath="",registryText}={}){
    const p=this.plugin,spec=await p.resolveCalendarNoteSpecAsync("daily",date);
    registryPath=registryPath || p.buildRuntimeBridgeConfig().paths.habitRegistryPath;
    const [registry,raw]=await Promise.all([registryText===undefined?p.loadTextFromVault(registryPath):registryText,p.loadTextFromVault(spec.path)]);
    const definitions=require("./habit-definition.js").readHabitDefinitions(registry);
    const active=definitions.filter(c=>c.stage==="active");
    const records=new Map(habitRecords(registry,date,registryPath).filter(r=>H.extractTaskDate(r.text)).map(r=>[r.name,r]));
    for(const row of habitRecords(raw,date,spec.path)) records.set(row.name,row);
    const resolved=new Map();
    for(const row of records.values()){
      const config=definitions.find(cfg=>(cfg.id&&cfg.id===row["habit-id"])||cfg.name===row.name||String(cfg.aliases||"").split(";").includes(row.name));
      const name=config?.name||row.name;
      resolved.set(name,{...row,name,originalName:row.name,...(config?.id?{id:config.id,aliases:config.aliases}:{} )});
    }
    const sleep=active.find(cfg=>cfg.type==="sleep");
    if(sleep&&!resolved.has(sleep.name)){
      const next=await p.resolveCalendarNoteSpecAsync("daily",require("./diary-tasks.js").shiftDate(date,1));
      const sources=[{path:spec.path,raw},{path:next.path,raw:next.path===spec.path?"":await p.loadTextFromVault(next.path)}];
      for(const source of sources)for(const line of scanMarkdownLines(source.raw).filter(line=>line.eligible)){
        const hit=/^\s*[-*+]\s*\[[ xX]\]\s+(.+)$/.exec(line.text);if(!hit||!/(^|\s)#tl\/sleep\b/.test(hit[1]))continue;
        const fields=H.parseInlineFields(hit[1]);if(H.getSleepHabitDate(fields.start)!==date)continue;
        const value=fields.start?.match(/\d{1,2}:\d{2}/)?.[0]||"",target=fields.target||sleep.target;
        resolved.set(sleep.name,{...sleep,date,value,target,type:"sleep",done:H.isSleepBeforeTarget(value,target),source:"tl",path:source.path,text:hit[1],task:{path:source.path,line:line.line,text:hit[1],rawText:line.text}});
      }
    }
    for(const config of definitions.filter(cfg=>cfg.recordField)){
      const field=p.records?.definitions().find(field=>field.property===config.recordField);if(!field)continue;
      const record=resolved.get(config.name),value=p.records.read(raw,field);
      if(record||(config.stage==="active"&&date===p.getLocalYmd?.()))resolved.set(config.name,{...config,...record,name:config.name,date,path:spec.path,value:value??"",done:typeof value==="number"&&value>=Number(record?.target||config.target),source:"property",recordField:config.recordField});
    }
    return {spec,registryPath,active,records:[...resolved.values()]};
  }
  manage(initial=false){
    const p=this.plugin,{RecordManager}=require("./record-manager.js"),{readHabitDefinitions,writeHabitDefinition}=require("./habit-definition.js");
    const text=(zh,en)=>p.getNoriaLocale()==="zh"?zh:en,path=p.getManagedPath("habitRegistry");
    const stages=[{value:"active",label:text("打卡中","Active")},{value:"paused",label:text("已暂停","Paused")},{value:"done",label:text("已养成","Established")}];
    const save=async(draft,original)=>{
      if(draft.recordField){const field=p.records?.definitions().find(f=>f.property===draft.recordField&&f.type==="number");if(!field)throw Error(text("请选择可用的数值记录","Choose an available number field"));draft.unit=field.unit||"";}
      await p.processTextAtVaultPath(path,raw=>writeHabitDefinition(raw,original?{...original,id:original.recordId}:null,draft,{id:crypto.randomUUID(),zh:p.getNoriaLocale()==="zh",today:p.getLocalYmd()}));
      p.requestNoriaRefresh("home","habits:definition");
    };
    const modal=new RecordManager(p,{title:text("习惯","Habits"),initial,initialFilter:"active",filters:stages,
      list:async()=>readHabitDefinitions(await p.loadTextFromVault(path)).map(row=>({...row,id:row.id||row.name,recordId:row.id,startedOn:require("./habit-plan.js").firstStart(row)})),
      summary:row=>row.type==="sleep"?text(`目标 ${row.target} 前入睡`,`Sleep before ${row.target}`):row.target?text(`目标 ${row.target} ${row.unit||""}`,`Target ${row.target} ${row.unit||""}`):text("每天打卡","Daily check-in"),
      defaults:()=>({name:"",type:"",stage:"active",target:"",unit:"",weekdays:"1234567",startedOn:p.getLocalYmd(),effective:p.getLocalYmd(),icon:"",color:""}),
      fields:row=>[{key:"name",label:text("名称","Name"),required:true},{key:"type",label:text("记录方式","Record type"),type:"select",refresh:true,options:[{value:"",label:text("勾选","Checkbox")},{value:"number",label:text("数值","Number")},{value:"sleep",label:text("入睡时间","Sleep time")}]},
        {key:"target",label:text("目标","Target"),type:row.type==="number"?"number":"time",required:true,min:row.type==="number"?0.01:undefined,step:row.type==="number"?"any":undefined,when:row=>!!row.type},
        {key:"unit",label:text("单位","Unit"),when:row=>row.type==="number"},
        {key:"recordField",label:text("数值来源","Value source"),type:"select",when:row=>row.type==="number",options:[{value:"",label:text("独立习惯记录","Habit record")},...(p.records?.definitions()||[]).filter(f=>f.type==="number").map(f=>({value:f.property,label:`${f.name} · ${f.property}`}))]},
        {key:"icon",label:text("图样","Picture"),type:"picture"},
        {key:"color",label:text("颜色","Color"),type:"color",preview:require("./habit-plan.js").visual(row).color},
        {key:"weekdays",render:(parent,draft,changed)=>{const field=parent.createDiv({cls:"noria-card-field"});field.createSpan({text:text("计划日","Scheduled days")});const days=field.createDiv({cls:"noria-habit-weekdays"});
          for(let day=1;day<=7;day++){const b=days.createEl("button",{text:(p.getNoriaLocale()==="zh"?["一","二","三","四","五","六","日"]:["M","T","W","T","F","S","S"])[day-1],attr:{type:"button","aria-label":text(`周${["一","二","三","四","五","六","日"][day-1]}`,`Weekday ${day}`),"aria-pressed":String((draft.weekdays??"1234567").includes(String(day)))}});
            b.onclick=()=>{const selected=new Set(draft.weekdays??"1234567");selected.has(String(day))?selected.delete(String(day)):selected.add(String(day));draft.weekdays=[...selected].sort().join("");b.setAttribute("aria-pressed",String(selected.has(String(day))));changed();};}}},
        {key:"startedOn",label:text("开始坚持日期","Initial start date"),type:"date",required:true,max:row.raw?(require("./habit-plan.js").firstStart(row)<p.getLocalYmd()?require("./habit-plan.js").firstStart(row):p.getLocalYmd()):p.getLocalYmd(),when:row=>!row.raw||!!require("./habit-plan.js").firstStart(row),description:text("可向前补全最初计划；后续的计划变更和暂停记录保持。","Extend the initial schedule into the past; later changes and pauses are preserved.")},
        {key:"effective",label:text("新计划生效日期","New schedule effective from"),type:"date",default:p.getLocalYmd(),min:p.getLocalYmd(),when:row=>!!row.raw,description:text("更改计划日从此日期起生效；暂停或恢复从今天起生效。","Weekday changes start on this date. Pause/resume takes effect today.")},
        {key:"stage",label:text("状态","State"),type:"select",options:stages}],
      save,
      actions:row=>stages.filter(stage=>stage.value!==row.stage).map(stage=>({label:stage.label,icon:stage.value==="active"?"play":stage.value==="paused"?"pause":"check",run:()=>save({...row,stage:stage.value},row)}))
    });modal.open();return modal;
  }
  async write(request){
    const p=this.plugin,date=String(request.date||"");
    const {assertCurrentDay}=require("./day-clock.js");assertCurrentDay(p,request.expectedToday);
    normalizeReviewSelection({mode:"daily",anchorDate:date});
    if(date>p.getLocalYmd()) throw new Error(p.t("workbench.habitFuture"));
    const spec=await p.resolveCalendarNoteSpecAsync("daily",date);
    const seed=await p.buildCalendarNoteContent(spec);
    const existed=!!p.app.vault.getAbstractFileByPath(spec.path);
    let previousText,text;
    await p.processTextAtVaultPath(spec.path,current=>{assertCurrentDay(p,request.expectedToday);previousText=current;let source=current || (existed?"":seed),record=request;
      if(request.config.recordField){const field=p.records?.definitions().find(f=>f.property===request.config.recordField);if(!field)throw Error("The linked record field is unavailable");
        const {writeProperty}=require("./record-properties.js"),{parseYaml}=require("obsidian");source=writeProperty(source,field,request.value===""?null:Number(request.value),parseYaml);record={...request,value:""};}
      text=writeHabitMarkdown(source,{...record,heading:p.t("workbench.habits") });return text;});
    if(request.refresh!==false)p.requestNoriaRefresh("tasks","diary-habit-record");
    return {ok:true,path:spec.path,previousText,text};
  }
}
module.exports={DiaryHabitStore,habitRecords,writeHabitMarkdown,withoutHabitRecords};
