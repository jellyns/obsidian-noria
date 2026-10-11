"use strict";
const {parseYaml,Menu,Notice,setIcon}=require("obsidian");
const {readProperty,writeProperty,validateValue}=require("./record-properties.js");
const {RecordManager}=require("./record-manager.js");
const {recordPopover}=require("./record-popover.js");
const {iconButton}=require("./card-controls.js");
const {createHash}=require("node:crypto");
const V=require("./record-visual.js");
const clone=value=>JSON.parse(JSON.stringify(value));
class RecordFields{
  constructor(plugin){this.plugin=plugin;this.app=plugin.app;}
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  definitions(){
    return (this.plugin.settings.recordFields||[
      {id:"mood",property:"mood",name:this.text("心情","Mood"),type:"option",options:["很好","稳定","一般","偏低","很差"],icon:"smile",color:"",enabled:true,legacy:"mood"},
      {id:"energy",property:"energy",name:this.text("精力","Energy"),type:"level",min:1,max:5,icon:"battery-medium",color:"",enabled:true,legacy:"energy"},
      {id:"focus",property:"focus",name:this.text("专注","Focus"),type:"option",options:["很专注","基本专注","易分心","难进入状态"],icon:"focus",enabled:false,legacy:"focus"}
    ]).map(field=>({...field,icon:V.fieldPicture(field)}));
  }
  details(raw,field){return require('./record-entries.js').readEntries(raw,field,parseYaml);}
  read(raw,field){return this.details(raw,field).value;}
  snapshot(date,path,raw,field){
    const state=this.details(raw,field),meaning=[field.id,field.property,field.type,field.unit||"",field.min,field.max,field.options,field.legacy,!!field.multiple,field.aggregation];
    const revision="record-v1-"+createHash("sha256").update(JSON.stringify([date,path,meaning,state])).digest("hex");
    return {fieldId:field.id,...state,revision};
  }
  display(field,value){if(value==null)return "—";const label=V.appearance(field,value).label;if(label){if(field.legacy==="energy"&&!field.states?.[String(value)]?.label&&this.plugin.getNoriaLocale()!=="zh")return ["","Very low","Low","Moderate","High","Full"][value]||label;return label;}if(field.type==="toggle")return value?this.text("是","Yes"):this.text("否","No");
    if(field.type==="option"&&field.options?.includes(value)){
      if(this.plugin.getNoriaLocale()==="zh"||!field.legacy)return String(value);
      if(field.legacy==="mood"&&value==="一般")return "Okay";
    }
    if(field.legacy&&typeof value==="string")return this.plugin.displayRuntimeLabel(field.legacy,value,value);
    return `${value}${field.type==="level"?"/"+field.max:field.unit?" "+field.unit:""}`;
  }
  color(field){
    if(/^#[\da-f]{6}$/i.test(field.color||""))return field.color;
    return ({mood:"var(--color-purple)",energy:"var(--color-orange)",focus:"var(--color-blue)",sleep_hours:"var(--color-blue)",reading_minutes:"var(--color-cyan)",exercise:"var(--color-green)"})[field.property]||"var(--interactive-accent)";
  }
  async save(date,field,value,{increment=false,expected,operation,entry,time,expectedToday}={}){
    const p=this.plugin,spec=await p.resolveCalendarNoteSpecAsync("daily",date),file=this.app.vault.getAbstractFileByPath(spec.path),seed=file?"":await p.buildCalendarNoteContent(spec);
    if(date>p.getLocalYmd())throw Error(this.text("未来日期不能填写实际记录","Actual records cannot be entered for a future date"));
    const {readHabitDefinitions}=require("./habit-definition.js"),{habitRecords,writeHabitMarkdown}=require("./diary-habits.js");
    const bindings=readHabitDefinitions(await p.loadTextFromVault(p.getManagedPath("habitRegistry"))).filter(config=>config.recordField===field.property);
    let previousText,text;
    await p.processTextAtVaultPath(spec.path,current=>{previousText=current;const source=current||(file?"":seed);
      require('./day-clock.js').assertCurrentDay(p,expectedToday);
      if(p._noriaPluginDisposed)throw Object.assign(Error("Noria is unloaded; reconnect to the current plugin instance"),{code:"unsupported"});
      if(expected){const definition=expected.revision?this.definitions().find(f=>f.id===field.id):field;
        const changed=expected.revision?(!definition||this.snapshot(date,spec.path,current,definition).revision!==expected.revision):JSON.stringify(this.read(source,field))!==JSON.stringify(expected.value);
        if(changed)throw Object.assign(Error(this.text("记录已在别处修改，请重新打开后编辑。","This record changed elsewhere. Reopen it before editing.")),{code:"conflict"});}
      if(this.details(source,field).multiple){
        if(!expected?.revision)throw Error(this.text('请重新打开明细后保存','Reopen the entries before saving'));
        text=require('./record-entries.js').changeEntry(source,field,{operation,entry,value,time},parseYaml);value=this.read(text,field);
      }else{
        if(operation)throw Error(this.text('此项目未启用日内多次','Multiple entries are not enabled'));
        if(increment){const old=this.read(source,field);if(old!=null&&typeof old!=="number")throw Error(this.text("原值不是数值","The existing value is not a number"));value=(old??0)+value;}
        text=writeProperty(source,field,value,parseYaml);
      }
      const existing=habitRecords(source,date,spec.path);
      for(const config of bindings){const record=existing.find(row=>(config.id&&row["habit-id"]===config.id)||row.name===config.name||String(config.aliases||"").split(";").includes(row.name));if(!record&&(config.stage!=="active"||date!==p.getLocalYmd()))continue;
        const target=Number(record?.target||require("./habit-plan.js").targetAt(config,date)||NaN);text=writeHabitMarkdown(text,{config:{...config,target:String(target)},date,value:"",done:typeof value==="number"&&value>=target,heading:p.t("workbench.habits")});}
      return text;});
    p.requestNoriaRefresh("tasks","record-field:save");return {ok:true,path:spec.path,write:{path:spec.path,previousText,text}};
  }
  render({host,toolsHost,date,raw,beforeSave,onSaved,report,refresh,context={page:"home"},recent=false,settings=true}){
    host.addClass("noria-record-fields");
    toolsHost?.querySelector('[data-noria-record-range]')?.remove();
    if(recent){host.addClass('noria-record-with-trends');host.style.setProperty('--noria-record-columns',String(Math.max(1,Math.min(3,this.definitions().filter(f=>f.enabled!==false).length))));const range=(toolsHost||host).createSpan({cls:'noria-record-recent-range',text:this.text('近7天','Last 7 days'),attr:{'data-noria-record-range':'',title:this.text('截至所选日期的近7天','Seven days ending on the selected date')}});if(toolsHost)toolsHost.insertBefore(range,toolsHost.firstChild);}
    const save=async(field,value,options)=>{if(beforeSave&&await beforeSave()===false)return false;const result=await this.save(date,field,value,options);await onSaved?.(result);
      [...host.querySelectorAll("[data-record-field]")].find(e=>e.dataset.recordField===field.id)?.focus({preventScroll:true});return true;};
    for(const field of this.definitions().filter(f=>f.enabled!==false)){
      let value;try{value=this.read(raw,field);}catch(e){host.createSpan({cls:"noria-card-error",text:e.message});continue;}
      const entry=recent?host.createDiv({cls:'noria-record-entry'}):host;
      const b=entry.createEl("button",{cls:"noria-record-value",attr:{type:"button","aria-haspopup":"dialog","data-record-field":field.id}});
      b.style.setProperty("--noria-record-color",this.color(field));b.dataset.recorded=String(value!=null);
      const state=V.appearance(field,value);if(value!=null&&state.color)b.style.setProperty("--noria-record-color",state.color);
      const icon=b.createSpan({cls:"noria-record-field-icon"});require("./picture-picker.js").renderPicture(this.plugin,icon,value==null?field.icon||"circle":state.icon);
      b.createSpan({cls:"noria-record-label",text:field.name});
      if(value!=null){const current=b.createSpan({cls:"noria-record-current"});if(field.type==="level"&&!state.icon.startsWith("noria-energy"))this.scale(current,field,value);else current.setText(this.display(field,value));}
      else if(recent)b.createSpan({cls:'noria-record-current',text:this.text('未填写','Not recorded')});
      b.setAttribute("aria-label",`${field.name} · ${value==null?this.text("未填写","Not recorded"):this.display(field,value)}`);
      b.disabled=date>this.plugin.getLocalYmd();
      b.onclick=async()=>{try{const spec=await this.plugin.resolveCalendarNoteSpecAsync('daily',date),state=this.snapshot(date,spec.path,raw,field);this.edit(b,field,{value,date,state,onSave:(next,options)=>save(field,next,{...options,expected:{revision:state.revision}}),report,context});}catch(error){report?.(error);}};
      if(this.details(raw,field).multiple)b.title=this.text(this.details(raw,field).aggregation==='sum'?'当日合计 · 点击查看明细':'最近一次 · 点击查看明细',this.details(raw,field).aggregation==='sum'?'Daily total · View entries':'Latest entry · View entries');
      if(recent){const chart=entry.createEl('button',{cls:'noria-record-mini-chart',attr:{type:'button','aria-label':this.text(`${field.name} · 近7天`,`${field.name} · Last 7 days`)}});entry.style.setProperty('--noria-record-color',this.color(field));void this.renderRecent(chart,field,date,{beforeSave,report,refresh,context});}
    }
    const actions=toolsHost||host;
    actions.querySelector?.('[data-noria-record-settings]')?.remove();
    if(settings)iconButton(actions,"settings-2",this.text("设置记录项目","Configure records"),()=>this.manage(false,context)).setAttribute('data-noria-record-settings','');
  }
  async renderRecent(chart,field,date,{beforeSave,report,refresh,context}){
    const start=new Date(Date.parse(date+'T00:00:00Z')-6*86400000).toISOString().slice(0,10),range={start,end:date};
    try{
      const result=await this.plugin.propertyStats.query({source:'diary',property:field.property,calculate:['number','level'].includes(field.type)?'mean':'distribution',scope:'fixed',...range});
      if(!chart.isConnected)return;
      const {dates,series}=require('./property-statistics.js').alignDailyRecords([result],range),points=series[0];chart.empty();
      const plot=require('./daily-record-chart.js').drawRecordChart(chart,field,points,{display:(f,v)=>this.display(f,v),text:(a,b)=>this.text(a,b),compact:true});
      let selected=6;
      const select=i=>{selected=Math.max(0,Math.min(6,i));const point=points[selected],value=point.ambiguous?this.text('多份记录','Multiple records'):point.multiple?this.text('多个状态','Multiple states'):point.value==null?this.text('未填写','Not recorded'):this.display(field,point.value);chart.title=`${dates[selected]} · ${field.name} · ${value}`;chart.setAttribute('aria-label',chart.title+' · '+this.text('左右键选择，回车编辑','Arrow keys to select; Enter to edit'));chart.style.setProperty('--noria-record-cursor',`${(selected+.5)/7*100}%`);};
      chart.onpointermove=e=>{const r=plot.getBoundingClientRect();select(Math.floor((e.clientX-r.left)/r.width*7));};chart.onpointerleave=()=>select(6);
      chart.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();select(e.key==='Home'?0:e.key==='End'?6:selected+(e.key==='ArrowLeft'?-1:1));}};
      chart.onclick=async()=>{const index=selected;try{if(beforeSave&&await beforeSave()===false)return;if(!chart.isConnected)return;await this.plugin.propertyStats.editPoint(chart,points[index].rows,{source:'diary',property:field.property},dates[index],result,{...context,beforeSave,onRecordSaved:async()=>{if(!chart.isConnected)return;await refresh?.();if(chart.isConnected)await this.renderRecent(chart,field,date,{beforeSave,report,refresh,context});}});}catch(error){report?.(error);}};select(6);
    }catch(error){if(chart.isConnected){chart.setText(this.text('趋势暂不可用','Trend unavailable'));chart.title=error.message;}report?.(error);}
  }
  edit(anchor,field,{value,onSave,report,context={page:"home"},title=field.name,state,date}){
    if(state?.multiple)return require('./record-entry-editor.js').editEntries(this,anchor,field,{state,date,onSave,report,title});
    return recordPopover(anchor,title,(popover,close)=>{
        popover.style.setProperty("--noria-record-color",this.color(field));
        const error=popover.createDiv({cls:"noria-card-error",attr:{role:"alert"}});
        let saving=false;const submit=async(next,options)=>{if(saving)return;saving=true;try{if(await onSave(next,options))close();}catch(e){error.setText(e.message);report?.(e);}finally{saving=false;}};
        const choices=popover.createDiv({cls:"noria-record-options"});
        if(field.type==="option"||field.type==="toggle"||field.type==="level"){
          const values=V.choices(field);
          choices.style.setProperty("--noria-options",String(Math.min(values.length,values.some(v=>this.display(field,v).length>8)?2:5)));
          for(const choice of values){const state=V.appearance(field,choice),button=choices.createEl("button",{cls:"noria-record-choice",attr:{type:"button","aria-pressed":String(value===choice)}});
            button.style.setProperty("--noria-record-color",state.color||this.color(field));
            if(field.type==="level"&&!state.icon.startsWith("noria-energy")&&!field.states?.[String(choice)]?.icon)this.scale(button,field,choice);else require("./picture-picker.js").renderPicture(this.plugin,button.createSpan({cls:"noria-record-choice-icon"}),state.icon);
            button.createSpan({text:this.display(field,choice)});button.onclick=()=>submit(choice);}
        }else{
          const form=choices.createEl("form"),input=form.createEl("input",{attr:{type:"number",step:"any",required:"","aria-label":field.name}});input.value=value??"";
          if(field.unit)form.createSpan({cls:"noria-card-secondary",text:field.unit});
          const actions=form.createDiv({cls:"noria-record-actions"});actions.createEl("button",{text:this.text("保存","Save"),cls:"mod-cta",attr:{type:"submit"}});
          const add=actions.createEl("button",{text:this.text("累加","Add to total"),attr:{type:"button"}});add.onclick=()=>{if(input.reportValidity())submit(Number(input.value),{increment:true});};
          form.onsubmit=e=>{e.preventDefault();if(input.reportValidity())void submit(Number(input.value));};
        }
        const actions=popover.createDiv({cls:"noria-record-actions"});
        if(value!=null){const clear=actions.createEl("button",{text:this.text("清除","Clear")});clear.onclick=()=>submit(null);}
        iconButton(actions,"chart-no-axes-combined",this.text("添加统计卡","Add statistics card"),()=>{close();this.plugin.propertyStats.addForField(field,context);});
    });
  }
  scale(host,field,value){const bar=host.createSpan({cls:"noria-record-scale",attr:{"aria-label":this.display(field,value)}});for(const step of V.choices(field))bar.createSpan({attr:{"data-filled":String(step<=value),"aria-hidden":"true"}});return bar;}
  stateEditor(parent,draft,changed){
    const details=parent.createEl("details",{cls:"noria-record-state-editor"});details.createEl("summary",{text:this.text("状态外观","State appearance")});
    const values=V.choices({...draft,options:String(draft.optionText||"").split(/[;；\n]/).map(v=>v.trim()).filter(Boolean)});
    for(const value of values){const row=details.createDiv({cls:"noria-record-state-row"}),state=draft.states?.[String(value)]||{},preview=row.createSpan({cls:"noria-record-choice-icon"});
      const label=row.createEl("input",{attr:{type:"text","aria-label":this.text(`状态 ${value} 的名称`,`Label for ${value}`),placeholder:this.display({...draft,states:{}},value)}});label.value=state.label||"";
      let chosenIcon=V.appearance(draft,value).icon;
      require("./picture-picker.js").pictureField(this.plugin,row,chosenIcon,value=>{chosenIcon=value;save();},this.text("状态图样","State picture"));
      const color=row.createEl("input",{attr:{type:"color","aria-label":this.text("状态颜色","State color")}});color.value=state.color||(/^#/.test(draft.color||"")?draft.color:"#8b7cf6");
      const paint=()=>{require("./picture-picker.js").renderPicture(this.plugin,preview,chosenIcon);preview.style.color=color.value;};paint();
      const save=()=>{draft.states={...draft.states,[String(value)]:{label:label.value,icon:chosenIcon,color:color.value}};paint();changed();};label.oninput=save;color.oninput=save;
    }
  }
  manage(initial=false,context={page:"home"}){
    const presets={sleep:{name:this.text("睡眠时长","Sleep duration"),property:"sleep_hours",type:"number",unit:this.text("小时","hours"),icon:"moon"},reading:{name:this.text("阅读时长","Reading time"),property:"reading_minutes",type:"number",unit:this.text("分钟","minutes"),icon:"book-open"},exercise:{name:this.text("运动","Exercise"),property:"exercise",type:"toggle",unit:"",icon:"footprints"}};
    const typeOptions=[{value:"option",label:this.text("选项","Options")},{value:"level",label:this.text("等级","Scale")},{value:"number",label:this.text("数值","Number")},{value:"toggle",label:this.text("开关","Toggle")}];
    const save=async(draft,original)=>{
      const name=String(draft.name||"").trim(),property=String(draft.property||"").trim();if(!name||!property||/[\r\n]/.test(property)||["__proto__","constructor","prototype"].includes(property))throw Error(this.text("填写有效名称与属性","Enter a valid name and property"));
      const fields=clone(this.definitions());if(fields.some(f=>f.id!==original?.id&&f.property===property))throw Error(this.text("此属性已有记录项目","This property already has a record control"));
      if(original&&(original.property!==property||original.type!==draft.type||String(original.unit||"")!==String(draft.unit||"")))throw Error(this.text("属性、类型或单位不同，请新建记录项目以保留历史含义","Create a separate field for a different property, type or unit"));
      const options=String(draft.optionText||"").split(/[;；\n]/).map(x=>x.trim()).filter(Boolean);
      if(draft.type==="option"&&!options.length)throw Error(this.text("至少填写一个选项","Enter at least one option"));
      if(new Set(options).size!==options.length)throw Error(this.text("选项值不能重复","Option values must be unique"));
      if(original?.type==="option"&&original.options.some(value=>!options.includes(value)))throw Error(this.text("请在状态外观中改显示名称；保留原选项值以读取历史。","Change labels in State appearance; keep stored options for historical records."));
      if(original?.type==="level"&&(original.min!==draft.min||original.max!==draft.max))throw Error(this.text("不同等级范围请新建记录项目，以保留历史含义。","Create a new field for a different scale range."));
      if(draft.type==="level"&&(!Number.isInteger(draft.min)||!Number.isInteger(draft.max)||draft.max<draft.min||draft.max-draft.min>10))throw Error(this.text("等级使用整数，最多 11 级","Use integers with at most 11 levels"));
      const next={...draft,id:original?.id||crypto.randomUUID(),name,property,options,enabled:draft.enabled!==false};delete next.optionText;delete next.preset;
      next.states=V.validateVisuals(next);
      const i=fields.findIndex(f=>f.id===next.id);if(i>=0)fields[i]=next;else fields.push(next);
      const previous=this.plugin.settings.recordFields;this.plugin.settings.recordFields=fields;
      try{await this.plugin.saveSettings();}catch(e){this.plugin.settings.recordFields=previous;throw e;}
      this.plugin.cards.emit();this.plugin.requestNoriaRefresh("home","record-field:definitions");
    };
    const manager=new RecordManager(this.plugin,{title:this.text("记录项目","Record fields"),initial,
      list:async()=>this.definitions().map(f=>({...f,optionText:(f.options||[]).join("; ")})),summary:f=>`${f.property} · ${typeOptions.find(t=>t.value===f.type)?.label}${f.enabled===false?this.text(" · 已停用"," · Disabled"):""}`,
      defaults:()=>({name:"",property:"",type:"number",unit:"",min:1,max:5,optionText:"",icon:"circle",color:"#8b7cf6",enabled:true}),
      fields:d=>[...(!d.id?[{key:"preset",label:this.text("开始方式","Start with"),type:"select",refresh:true,options:[{value:"",label:this.text("已有属性或自定义","Existing property or custom")},...Object.entries(presets).map(([value,p])=>({value,label:p.name}))],onChange:d=>{if(presets[d.preset])Object.assign(d,presets[d.preset]);}}]:[]),{key:"name",label:this.text("显示名称","Display name"),required:true},
        {key:"property",label:this.text("笔记属性（可复用已有属性）","Note property (existing or new)"),type:"property",required:true,disabled:!!d.id,description:this.text("只改显示名称不会重命名笔记属性。","Changing the display name keeps the note property unchanged.")},
        {key:"type",label:this.text("记录方式","Input type"),type:"select",options:typeOptions,disabled:!!d.id,refresh:true},
        {key:"unit",label:this.text("单位","Unit"),disabled:!!d.id,when:d=>d.type==="number"},
        {key:"multiple",label:this.text("日内多次记录","Multiple entries per day"),type:"checkbox",refresh:true},
        {key:"aggregation",label:this.text("日摘要","Daily summary"),type:"select",default:'sum',when:d=>d.multiple&&d.type==='number',options:[{value:'sum',label:this.text('合计','Total')},{value:'latest',label:this.text('最近一次','Latest entry')}],description:this.text('已有明细的日期保留原汇总方式。','Existing days keep their stored summary method.')},
        {key:"optionText",label:this.text("选项，用分号分隔","Options, separated by semicolons"),when:d=>d.type==="option",refresh:true},
        {key:"min",label:this.text("最低等级","Lowest level"),type:"number",step:1,refresh:true,disabled:!!d.id,when:d=>d.type==="level"},
        {key:"max",label:this.text("最高等级","Highest level"),type:"number",step:1,refresh:true,disabled:!!d.id,when:d=>d.type==="level"},
        {key:"icon",label:this.text("图样","Picture"),type:"picture",onChange:d=>{d.iconCustomized=!!d.icon;}},
        {key:"color",label:this.text("颜色","Color"),type:"color",preview:this.color(d)},
        {key:"states",when:d=>["option","level","toggle"].includes(d.type),render:(parent,draft,changed)=>this.stateEditor(parent,draft,changed)},
        {key:"enabled",label:this.text("显示此记录项目","Show this field"),type:"checkbox"}],
      save,actions:f=>[{label:this.text(f.enabled===false?"启用":"停用",f.enabled===false?"Enable":"Disable"),icon:f.enabled===false?"eye":"eye-off",run:()=>save({...f,enabled:f.enabled===false},f)},
        {label:this.text("添加统计卡","Add statistics card"),icon:"chart-no-axes-combined",run:()=>this.plugin.propertyStats.addForField(f,context)}]
    });manager.open();return manager;
  }
}
module.exports={RecordFields};
