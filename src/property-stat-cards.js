"use strict";
const {parseYaml,Modal,setIcon}=require("obsidian");
const {frontmatter,writeProperty}=require("./record-properties.js");
const {filterNotes,summarize,alignDailyRecords,dailySources,statisticUnit,formatStatRange}=require("./property-statistics.js");
const {iconButton}=require("./card-controls.js");
const {recordPopover}=require("./record-popover.js");
const {diaryRange}=require("./diary-tasks.js");
const {dayNumber}=require("./countdown-document.js");
const {fieldPicture}=require("./record-visual.js");
const M=require("./statistic-model.js");
class PropertyStatCards{
  constructor(plugin){this.plugin=plugin;this.app=plugin.app;this.templateLibrary=new (require('./statistic-templates.js').StatisticTemplates)(plugin);this.looks=new (require('./statistic-appearance.js').StatisticLooks)(plugin);}
  text(zh,en){return this.plugin.getNoriaLocale()==="zh"?zh:en;}
  fields(config={}){
    if(config.source==='goals')return require('./progress-rings-fields.js').fields(config,(a,b)=>this.text(a,b));
    const t=(a,b)=>this.text(a,b),options=items=>items.map(([value,zh,en])=>({value,label:t(zh,en)}));
    const fields = [
      {key:"source",section:t("数据来源","Data source"),label:t("来源","Source"),type:"select",default:"diary",refresh:true,options:options([["diary","日期笔记属性","Date note properties"],["notes","任意笔记 / 文件夹","Any notes / folder"],["tasks","任务","Tasks"],["habits","习惯打卡","Habit check-ins"],["focus","专注分段记录","Focus segments"],["goals","多个目标","Multiple goals"]])},
      ...(["tasks","habits"].includes(config.source)?[]:[
        {key:"folder",label:t("文件夹（留空使用已配置资料范围）","Folder (empty for configured note scope)"),type:"folder"},
        {key:"recursive",label:t("包含子文件夹","Include subfolders"),type:"checkbox",default:true},
        {key:"tag",label:t("标签（可选）","Tag (optional)")},
        {key:"property",section:t("字段与计算","Field & calculation"),label:t("统计属性（留空统计笔记数量）","Property (empty to count notes)"),type:"property",refresh:true},
        {key:"calculate",label:t("计算方式","Calculation"),type:"select",default:"count",refresh:true,options:options([["count","有记录的数量","Recorded count"],["sum","合计","Sum"],["mean","平均值","Mean"],["min","最小值","Minimum"],["max","最大值","Maximum"],["distribution","状态分布","Distribution"]])},
        {key:"group",label:t("分组","Group by"),type:"select",default:"",refresh:true,options:options([["","不额外分组","None"],["folder","文件夹","Folder"],["tag","标签","Tag"]])},
        {key:"filterProperty",label:t("筛选属性（可选）","Filter property (optional)"),type:"property"},{key:"filterValue",label:t("属性值（留空表示存在）","Filter value (empty means present)")},
        {key:"unitProperty",label:t("单位属性（不同单位不能合算）","Unit property (different units cannot be combined)"),type:"property"},
        ...(config.source==="notes"?[{key:"dateBasis",label:t("日期依据","Date basis"),type:"select",default:"",refresh:true,options:options([["","未指定","Not specified"],["property","事件日期属性","Event date property"],["created","文件创建时间","File creation date"],["modified","文件修改时间","File modification date"]])},
          ...(config.dateBasis==="property"?[{key:"dateProperty",label:t("事件日期属性","Event date property"),type:"property",required:true}]:[])]:[])]),
      ...(['tasks','habits'].includes(config.source)?[
        {key:'calculate',section:t('字段与计算','Field & calculation'),label:t('计算方式','Calculation'),type:'select',default:'count',refresh:true,options:options([['count','实际完成数','Completed count'],['rate','完成比例','Completion ratio']])},
        ...(config.source==='tasks'&&config.calculate==='rate'?[{key:'cohort',label:t('分母：此范围内的任务','Denominator: tasks in this range'),type:'select',default:'due',options:options([['due','按截止日期','By due date'],['scheduled','按计划日期','By scheduled date']])}]:[]),
        ...(config.source==='habits'?[{key:'habitId',label:t('习惯 ID 或名称（留空为全部）','Habit ID or name (empty for all)')}]:[])]:[]),
      {key:"scope",section:t("时间范围","Time range"),label:t("范围","Range"),type:"select",default:"follow",refresh:true,options:options([["follow","跟随当前页面","Follow page"],["rolling","最近一段时间","Recent days"],["all","不限时间","All dates"],["fixed","固定范围","Fixed range"]])},
      ...(config.scope==='rolling'?[{key:'days',label:t('最近天数（含今天）','Recent days (including today)'),type:'number',default:30,required:true}]:[]),
      ...(config.scope==="fixed"?[{key:"start",label:t("开始","Start"),type:"date",required:true},{key:"end",label:t("结束","End"),type:"date",required:true}]:[]),
      {key:'display',section:t('展示样式','Display'),label:t('图表','Chart'),type:'select',default:'metric',refresh:true,options:this.chartChoices(config)},
      ...(config.display==='progress'&&config.calculate!=='rate'?[{key:'target',label:t('目标（与统计值同单位）','Target (same unit as the value)'),type:'number',required:true}]:[])
    ];
    return config.source==="focus"?[...fields.filter(f=>["source","scope","days","start","end","display"].includes(f.key)),{key:'showSchedule',label:t('对照任务安排','Compare task schedules'),type:'checkbox',default:false},{key:'initialDay',label:t('默认查看','Initially show'),type:'select',default:'latest',options:options([['latest','最近有记录的一天','Latest recorded day'],['today','今天','Today']])}]:fields;
  }
  chartChoices(config){if(config.source==='goals')return [{value:'progress-rings',label:this.text('进度环','Progress rings')}];if(config.source==="focus")return [{value:"time-ring",label:this.text("时间环","Time ring")}];const names={metric:['数字摘要','Number'],trend:['日期柱图','Date columns'],line:['折线','Line'],columns:['柱图','Columns'],bars:['横向条形','Horizontal bars'],donut:['环图','Donut'],composition:['分段占比','Segmented composition'],calendar:['记录日历','Record calendar'],strip:['连续色带','Continuous strip'],progress:['目标进度','Progress'],comparison:['前期对比','Previous period']};
    return M.chartOptions(config,['tasks','habits'].includes(config.source)?null:this.plugin.records.definitions().find(f=>f.property===config.property)).filter(value=>value!=='trend').map(value=>({value,label:this.text(...names[value])}));}
  templateGroups(){return require('./statistic-templates.js').builtInTemplates(this.plugin.records.definitions(),(zh,en)=>this.text(zh,en));}
  templates(){return [...this.templateGroups().recommended,...this.templateLibrary.read().filter(t=>!t.kind)];}
  register(system){system.register({id:"noria:statistics",title:this.text("统计","Statistics"),icon:"chart-no-axes-combined",supportsDate:true,
    description:this.text("记录、笔记属性、文件夹、任务和习惯的真实统计。","Statistics from records, note properties, folders, tasks and habits."),templates:()=>this.templates(),fields:config=>this.fields(config),validate:async(config,context)=>{this.validate(config);if(['donut','composition'].includes(config.display)){const result=await this.query(config,context?.selection);if(result.recorded&&!M.exclusiveGroups(result))throw Error(this.text('分组有重叠或负值，请选择横向条形。','Overlapping or negative groups: choose horizontal bars.'));}},
    render:async({container,config,selection,component,context})=>{
      let generation=0,timer,disposed=false;const viewState={};const clean=()=>{container.__noriaStatChromeCleanup?.();container.querySelectorAll('.noria-leader-donut').forEach(el=>el.__noriaChartCleanup?.());};const paint=async()=>{const serial=++generation;try{const result=await this.query(config,selection);if(serial!==generation)return;const active=container.ownerDocument.activeElement,progressFocus=container.contains(active)?active?.dataset?.progressRing:null,progressReadout=container.contains(active)&&active?.matches('.noria-progress-rings-readout'),focused=container.querySelector('.noria-stat-plot')===active,calendarFocused=container.contains(active)&&active?.matches('.noria-stat-day');const calendar=container.querySelector('.noria-stat-calendar');if(calendar)viewState.calendarScrollLeft=calendar.scrollLeft;clean();container.empty();this.draw(container,result,config,viewState,context);if(focused)container.querySelector('.noria-stat-plot')?.focus({preventScroll:true});else if(calendarFocused)container.querySelector('.noria-stat-day[data-selected="true"]')?.focus({preventScroll:true});else if(progressFocus)[...container.querySelectorAll('[data-progress-ring]')].find(el=>el.dataset.progressRing===progressFocus)?.focus({preventScroll:true});else if(progressReadout)container.querySelector('.noria-progress-rings-readout')?.focus({preventScroll:true});}catch(e){if(serial===generation){clean();container.empty();container.createDiv({cls:"noria-card-empty",text:e.message});}}};
      component.register(()=>{disposed=true;++generation;clearTimeout(timer);clean();});
      await paint();if(disposed)return;const refresh=()=>{clearTimeout(timer);timer=setTimeout(paint,180);};
      if ((!config.scope || config.scope === "follow") && !selection?.mode && this.plugin.cards?.onStatisticRange) {
        component.register(this.plugin.cards.onStatisticRange(selection?.pageId || "home", context => {
          selection = {...selection, range:context.range}; refresh();
        }));
      }
      if(config.source==='focus'&&this.plugin.focusTimer){const stamp=()=>{const c=require('./task-calendar-zone.js').timelineClock(this.plugin.settings.tasksCalendar);return `${c.source}|${c.display}|${c.day(Date.now())}`;};let revision=this.plugin.settings.pomodoro.revision,day=stamp();component.register(this.plugin.focusTimer.subscribe(()=>{const next=this.plugin.settings.pomodoro.revision,today=stamp();if(next!==revision||today!==day){revision=next;day=today;refresh();}}));const live=setInterval(()=>{if(this.plugin.getPomodoroState().active?.status==='running'&&!container.__noriaRingEditing&&!container.matches(':hover')&&!container.contains(container.ownerDocument.activeElement))refresh();},15000);component.register(()=>clearInterval(live));}
      component.registerEvent(this.app.metadataCache.on("changed",refresh));component.registerEvent(this.app.vault.on("delete",refresh));component.registerEvent(this.app.workspace.on('css-change',refresh));
    }});}
  validate(config){
    if(config.display==='composition'&&!['count','sum','distribution'].includes(config.calculate))throw Error(this.text('占比使用数量、合计或状态分布，不能用平均值或极值。','Composition requires counts, sums or distributions, not means or extrema.'));
    require('./statistic-appearance.js').validateAppearance(config.appearance,(zh,en)=>this.text(zh,en));
    if(config.referenceValue!=null&&!Number.isFinite(config.referenceValue))throw Error(this.text('参考值必须为有效数字。','Reference values must be finite numbers.'));
    if(config.scope==='rolling'&&(!Number.isInteger(Number(config.days))||Number(config.days)<1||Number(config.days)>3660))throw Error(this.text('最近天数需为 1–3660 的整数','Recent days must be an integer from 1 to 3660'));
    if(config.scope==="fixed"&&(!Number.isFinite(dayNumber(config.start))||!Number.isFinite(dayNumber(config.end))||config.start>config.end))throw Error(this.text("选择有效的日期范围","Choose a valid date range"));
    if(config.source==='goals'){if(config.display!=='progress-rings')throw Error(this.text('多个目标请使用进度环','Use progress rings for multiple goals'));require('./progress-rings-model.js').validate(config,(a,b)=>this.text(a,b));return;}
    if(config.display==='progress-rings')throw Error(this.text('进度环需要多个目标来源','Progress rings require the multiple goals source'));
    if(config.source==='focus'){if(config.display!=='time-ring')throw Error(this.text('专注分段请使用时间环','Use a time ring for focus segments'));return;}
    if(config.display==='time-ring')throw Error(this.text('时间环需要专注分段记录','Time rings require focus segments'));
    if(config.source==="notes"&&(config.scope!=="all"||M.temporal.has(config.display)||config.display==='comparison')&&!config.dateBasis)throw Error(this.text("为这些笔记选择日期依据，或使用不限时间","Select a date basis, or use All dates"));
    if(config.display==='comparison'&&config.scope==='all')throw Error(this.text('周期对比需要指定时间范围','Period comparison needs a date range'));
    if(config.calculate==='rate'&&!['tasks','habits'].includes(config.source))throw Error(this.text('完成比例需要任务或习惯的明确分母','Completion ratios require tasks or scheduled habits'));
    if(config.display==='progress'&&config.calculate!=='rate'&&(!Number.isFinite(Number(config.target))||!(Number(config.target)>0)))throw Error(this.text('填写大于零的有效目标值','Enter a finite target greater than zero'));
    if(["sum","mean","min","max","distribution"].includes(config.calculate)&&!config.property&&!['tasks','habits'].includes(config.source))throw Error(this.text("选择要统计的属性","Select a property"));
    if(config.folder&&!this.app.vault.getAbstractFileByPath(config.folder)?.children)throw Error(this.text("找不到所选文件夹","Folder not found"));
  }
  async range(config,selection){
    if(config.scope==="all")return null;
    if(config.scope==='rolling'){const end=config.source==='focus'?require('./task-calendar-zone.js').timelineClock(this.plugin.settings.tasksCalendar).day(Date.now()):this.plugin.getLocalYmd();return {start:M.shift(end,1-Number(config.days)),end};}
    if(config.scope==="fixed")return {start:config.start,end:config.end};
    if(selection?.mode)return diaryRange(selection);
    const service=await this.plugin.createDataService({}),request=selection?.range || this.plugin.settings.home?.trendsRange||{};
    return service.resolveRange(config.source==='focus'?{...request,today:require('./task-calendar-zone.js').timelineClock(this.plugin.settings.tasksCalendar).day(Date.now())}:request);
  }
  async query(input={},selection){
    const config={source:"diary",calculate:"count",display:"metric",scope:"follow",...input};this.validate(config);
    const range=await this.range(config,selection),source=config.source;
    if(source==='goals'){
      const model=require('./progress-rings-model.js');
      const series=await Promise.all(model.metrics(config).map(async metric=>{
        let result;try{result=await this.query(model.queryConfig(metric,range),selection);}catch(error){result={rows:[],error:error.message,unreadable:[],invalid:[]};}
        const field=this.plugin.records.definitions().find(f=>f.property===metric.property);
        const label=metric.label||(metric.source==='tasks'?this.text('任务','Tasks'):metric.source==='habits'?metric.habitId||this.text('习惯','Habits'):field?.name||metric.property);
        const unit=metric.unit||field?.unit||(metric.source==='tasks'?this.text('项','tasks'):metric.source==='habits'?this.text('次','check-ins'):'');
        return model.metricModel({...metric,label,unit},result);
      }));
      return {series,range,source,rows:series.flatMap(s=>s.result.rows||[])};
    }
    if(source==='focus'){
      await this.plugin.focusTimer?.ready;
      const model=require('./time-ring-model.js'),state=this.plugin.getPomodoroState(),tasks=await this.plugin.getRuntimeTaskRows('tasks'),data=model.focusSegments(state,new Date().toISOString());
      const categories=require('./focus-categories.js').focusCategories(state,tasks,this.plugin.settings.colorPalette);
      data.rows=data.rows.map(row=>({...row,category:categories.get(row.taskKey)||null}));
      const planned=config.showSchedule===true?model.scheduledSegments(tasks,this.plugin.settings.colorPalette,this.plugin.settings.tasksCalendar):{rows:[],invalid:[]};
      const timeZone=require('./task-calendar-zone.js').timelineClock(this.plugin.settings.tasksCalendar).display;
      return {...data,timeZone,planned:planned.rows,scheduleErrors:planned.invalid,range,source,invalid:[],unreadable:this.plugin.focusTimer?.records?.errors()||[],recorded:data.rows.length};
    }
    if(config.display==='comparison'){
      const periods=M.priorRange(range,this.plugin.getLocalYmd()),read=period=>this.query({...config,display:'metric',scope:'fixed',...period},selection);
      const [current,previous]=await Promise.all([read(periods.current),read(periods.previous)]);
      return {...current,comparison:{previous,periods,...M.delta(current.value,previous.value)}};
    }
    if(["tasks","habits"].includes(source)){
      let rows=[];
      if(source==="tasks"){
        const {getTaskDate,cleanTaskTitle}=require("./runtime/views/dashboard/core/utils/task-display.js");
        const seen=new Set();
        rows=(await this.plugin.getRuntimeTaskRows("tasks")).filter(task=>!/(^|\s)#habit\b/.test(task.text||'')).flatMap(task=>{
          const id=task.id||`${task.path}:${task.line??task.text}`,date=getTaskDate(task,config.calculate==='rate'?(config.cohort||'due'):'done');
          if(seen.has(id)||config.calculate!=='rate'&&!task.completed||range&&(!date||date<range.start||date>range.end))return [];
          seen.add(id);return [{id,path:task.path,date,done:!!task.completed,properties:{value:1},tags:[],title:cleanTaskTitle(task.text),taskRef:{path:task.path,line:task.line,rawText:task.rawText||task.text}}];});
      }else{
        const {readHabitDefinitions}=require('./habit-definition.js'),{DiaryHabitStore}=require('./diary-habits.js'),plan=require('./habit-plan.js');
        const configs=readHabitDefinitions(await this.plugin.loadTextFromVault(this.plugin.getManagedPath('habitRegistry'))).filter(c=>!config.habitId||c.id===config.habitId||c.name===config.habitId);
        const history=await new DiaryHabitStore(this.plugin).history(configs),today=this.plugin.getLocalYmd();
        const knownDates=configs.flatMap(c=>Object.keys(history[c.name]||{})).sort(),period=range||{start:knownDates[0]||today,end:today};
        for(const cfg of configs){const records=history[cfg.name]||{};
          for(const date of M.datesIn(period)){if(date>today)continue;const record=records[date];
            if(config.calculate==='rate'?!plan.due(cfg,date):!record?.done)continue;
            rows.push({id:`${cfg.id||cfg.name}:${date}`,path:record?.path||'',date,done:!!record?.done,properties:{value:1},tags:[],title:cfg.name});}
        }
      }
      const result=config.calculate==='rate'?M.completion(rows):summarize(rows,{property:"value",calculate:"sum",display:M.temporal.has(config.display)?'trend':config.display});
      if(config.calculate!=='rate')result.value??=0;
      return {...result,range,source,calculation:config.calculate==='rate'?'rate':'sum',property:'value',denominatorLabel:source==='tasks'?this.text('所选范围任务的当前完成状态','Current completion of tasks in the selected range'):this.text('截至今天应打卡次数（按历史计划）','Scheduled check-ins through today, using historical plans')};
    }
    const diaryRoot=this.plugin.buildRuntimeBridgeConfig().paths.diaryRoot;
    const roots=config.folder?[config.folder]:source==="diary"?[diaryRoot]:this.plugin.getScopeSpec("notes").roots;
    const files=this.plugin.filesUnderRoots(roots,[".md"]).filter(file=>source!=="diary"||/^\d{4}-\d{2}-\d{2}$/.test(file.basename)&&(!range||file.basename>=range.start&&file.basename<=range.end));
    const candidates=filterNotes(files.map(file=>{const cache=this.app.metadataCache.getFileCache(file);return {file,path:file.path,properties:cache?.frontmatter||{},tags:[...(cache?.tags||[]).map(t=>t.tag),...[cache?.frontmatter?.tags||[]].flat()]};}),{...config,filterProperty:""});
    const rows=[],unreadable=[];
    // Bounded parallel reads. Cached metadata finds candidates; values come from current source text.
    for(let index=0;index<candidates.length;index+=24)await Promise.all(candidates.slice(index,index+24).map(async candidate=>{
      try{const raw=await this.app.vault.cachedRead(candidate.file),properties=frontmatter(raw,parseYaml).value;
        for(const field of this.plugin.records.definitions()){const value=this.plugin.records.read(raw,field);if(value!=null||Object.hasOwn(properties,field.property))properties[field.property]=value;}
        let date=source==="diary"?candidate.file.basename:config.dateBasis==="property"?(properties[config.dateProperty] instanceof Date?properties[config.dateProperty].toISOString().slice(0,10):String(properties[config.dateProperty]||"").slice(0,10)):config.dateBasis?this.plugin.getLocalYmd(new Date(config.dateBasis==="created"?candidate.file.stat.ctime:candidate.file.stat.mtime)):"";
        if((range||M.temporal.has(config.display))&&!Number.isFinite(dayNumber(date))){unreadable.push({path:candidate.path,error:this.text("缺少有效的日期依据","Missing a valid date")});return;}
        if(range&&(date<range.start||date>range.end))return;
        rows.push({...candidate,properties,date});
      }catch(e){unreadable.push({path:candidate.path,error:e.message});}
    }));
    const result=summarize(filterNotes(rows,config),{...config,display:M.temporal.has(config.display)&&config.calculate!=='distribution'?'trend':config.display});return {...result,range,source,unreadable};
  }
  draw(host,result,config,viewState={},context={page:"home"}){
    const openRows=(rows,sourceResult=result,title='',excluded=false)=>this.openRows(rows,sourceResult,title,excluded,{preview:!!context.preview});
    host.__noriaStatChromeCleanup?.();
    host.addClass('noria-property-stat');
    if(config.display==='progress-rings')return require('./progress-rings-chart.js').renderProgressRings(host,result,config,viewState,{plugin:this.plugin,context});
    if(config.display==='time-ring')return require('./time-ring-chart.js').renderTimeRing(host,result,config,viewState,{plugin:this.plugin,context});
    const field=this.plugin.records.definitions().find(f=>f.property===config.property);
    if(field)host.style.setProperty('--noria-record-color',this.plugin.records.color(field));
    const visual=require('./statistic-appearance.js').appearance(config.appearance),color=require('./statistic-appearance.js').accent(visual);
    if(color)host.style.setProperty('--noria-record-color',color);host.dataset.statDensity=visual.density;host.dataset.statColored=String(!!color);
    const shell=context.preview?null:host.closest?.('.noria-diary-card,.dashboard-home-widget-shell');
    const tools=shell?.querySelector('.noria-diary-card-tools,.dashboard-guide-card__tools');
    if(tools)shell.classList.add('noria-stat-card');
    const head=(tools||host).createDiv({cls:'noria-stat-toolbar'+(tools?' noria-stat-header':'')}),range=result.range;
    if(tools)tools.insertBefore(head,tools.querySelector('.noria-diary-card-menu,.dashboard-home-widget-shell-actions'));
    const fullRange=range?formatStatRange(range,this.plugin.getNoriaLocale()):this.text('不限时间','All dates');
    const dateFormat=new Intl.DateTimeFormat(this.plugin.getNoriaLocale(),{...(range&&(range.start.slice(0,4)!==range.end.slice(0,4)||range.end.slice(0,4)!==this.plugin.getLocalYmd().slice(0,4))?{year:'numeric'}:{}),month:'numeric',day:'numeric'});
    const shortRange=range?dateFormat.formatRange(new Date(range.start+'T12:00:00'),new Date(range.end+'T12:00:00')):fullRange;
    head.createSpan({cls:'noria-stat-range',text:shortRange,attr:{title:fullRange}});
    const number=value=>value==null?'—':new Intl.NumberFormat(this.plugin.getNoriaLocale(),{maximumFractionDigits:2}).format(value);
    const caption=({sum:this.text('合计','Sum'),mean:this.text('平均','Mean'),min:this.text('最小值','Minimum'),max:this.text('最大值','Maximum'),distribution:this.text('状态分布','State distribution'),rate:this.text('完成比例','Completion ratio')})[config.calculate]||this.text('数量','Count');
    const unit=statisticUnit(config,result,field),valueText=value=>number(value)+(value!=null&&unit?(unit==='%'?'%':' '+unit):'');
    result={...result,calculationLabel:[caption,field?.name||config.property,unit].filter(Boolean).join(' · ')};
    if(['sum','mean','min','max'].includes(config.calculate))head.createSpan({cls:'noria-stat-calculation',text:caption});
    const action={icon:'list',label:this.text('汇总与来源','Summary & sources'),run:()=>openRows(result.rows,result)};
    if(tools)shell._noriaRecordActions=[...shell._noriaRecordActions||[],action];
    else iconButton(head,action.icon,action.label,action.run);
    host.__noriaStatChromeCleanup=()=>{head.remove();if(tools){shell.classList.remove('noria-stat-card');shell._noriaRecordActions=(shell._noriaRecordActions||[]).filter(item=>item!==action);}delete host.__noriaStatChromeCleanup;};
    if(!config.display||config.display==='metric'){
      host.addClass('noria-property-stat--metric');
      const main=host.createEl('button',{cls:'noria-stat-result',attr:{'aria-label':valueText(result.value)}});main.createSpan({cls:'noria-stat-result-value',text:number(result.value)});if(result.value!=null&&unit)main.createSpan({cls:'noria-stat-result-unit',text:unit});main.onclick=()=>openRows(result.rows,result);
      if(config.calculate==='rate')host.createSpan({cls:'noria-card-secondary',text:result.numerator+' / '+result.denominator});
    }
    if(!result.recorded&&config.display!=='comparison')host.createDiv({cls:'noria-card-empty',text:config.calculate==='rate'?config.source==='habits'?this.text('此范围没有应打卡次数。','No scheduled check-ins in this range.'):this.text('此范围没有纳入完成比例的任务。','No tasks in this completion cohort.'):this.text('此范围还没有可计算的记录。','No usable records in this range yet.')});
    const compactNumber=value=>new Intl.NumberFormat(this.plugin.getNoriaLocale(),{notation:'compact',maximumFractionDigits:1}).format(value);
    require('./statistic-charts.js').renderChart(host,result,config,{text:(a,b)=>this.text(a,b),number,compactNumber,viewState,unit,readOnly:!!context.preview,today:this.plugin.getLocalYmd(),rangeText:range=>formatStatRange(range,this.plugin.getNoriaLocale()),field,display:(f,v)=>this.plugin.records.display(f,v),source:(rows,sourceResult=result)=>openRows(rows,sourceResult),activate:(anchor,rows,date)=>void this.editPoint(anchor,rows,config,date,result,context)});
    if(result.invalid.length||result.unreadable?.length){const b=host.createEl('button',{cls:'noria-review-text-action',text:this.text('查看未纳入的记录','Excluded records')});b.onclick=()=>openRows([...result.invalid,...result.unreadable||[]],result,this.text('未纳入的记录','Excluded records'),true);}
  }
  async editPoint(anchor,rows,config,date,result,context={page:"home"}){
    if(!date&&rows.length===1)date=rows[0].date||'';
    if(context.preview)return this.openRows(rows,result,date,false,{preview:true});
    const fail=message=>recordPopover(anchor,this.text('记录','Record'),pop=>pop.createDiv({cls:'noria-card-secondary',text:message}));
    if(!config.property||['tasks','habits'].includes(config.source))return this.openRows(rows,result,date);
    if(date&&date>this.plugin.getLocalYmd())return fail(this.text('未来日期不能填写实际记录','Actual records cannot be entered for a future date'));
    if(rows.length>1){return recordPopover(anchor,date||this.text('选择来源','Choose a source'),(pop,close)=>{for(const row of rows){const b=pop.createEl('button',{cls:'noria-record-open',text:row.path});b.onclick=()=>{close(false);void this.editPoint(anchor,[row],config,row.date,result,context);};}});}
    try{
      const p=this.plugin,spec=config.source==='diary'&&date?await p.resolveCalendarNoteSpecAsync('daily',date):null;
      const path=rows[0]?.path||spec?.path;if(!path)return fail(this.text('此日期没有可编辑的来源笔记','No editable source note on this date'));
      const file=this.app.vault.getAbstractFileByPath(path),raw=file?await this.app.vault.read(file):'';
      const value=frontmatter(raw,parseYaml).value[config.property];
      const field=p.records.definitions().find(f=>f.property===config.property)||{property:config.property,name:config.property,type:typeof value==='number'?'number':typeof value==='boolean'?'toggle':'option',options:[...new Set(result.rows.flatMap(r=>[r.properties?.[config.property]].flat()).filter(v=>typeof v==='string'))],icon:'circle'};
      if(Array.isArray(value)||value&&typeof value==='object')return this.openRows(rows,result,date);
      const current=p.records.read(raw,field),canonical=spec?.path===path;
      const state=p.records.snapshot(date,path,raw,field);
      if(state.multiple&&!canonical)return this.openRows(rows,result,date);
      p.records.edit(anchor,field,{context,value:current,state,date,title:(date?date+' · ':'')+field.name,onSave:async(next,options)=>{
        if(context.beforeSave&&await context.beforeSave()===false)return false;
        if(canonical)await p.records.save(date,field,next,{...options,expected:{revision:state.revision}});
        else {
          if(!this.app.vault.getAbstractFileByPath(path))throw Error(this.text('源笔记已移除','Source note was removed'));
          await p.processTextAtVaultPath(path,source=>{
            const existing=p.records.read(source,field);if(JSON.stringify(existing)!==JSON.stringify(current))throw Error(this.text('记录已在别处修改，请重新打开。','This record changed elsewhere. Reopen it.'));
            return writeProperty(source,field,options?.increment?(existing??0)+next:next,parseYaml);
          });p.requestNoriaRefresh('tasks','statistics:edit');
        }await context.onRecordSaved?.();return true;
      }});
    }catch(e){fail(e.message);}
  }
  async openSource(row){
    const file=this.app.vault.getAbstractFileByPath(row.path);
    if(!file)throw Error(this.text('源笔记已移除，请刷新统计。','Source note was removed. Refresh the statistics.'));
    let opened;
    if(row.taskRef){
      const source=await this.app.vault.read(file);let task;
      try{task=require('./task-document.js').locateTask(source,row.taskRef);}
      catch{throw Error(this.text('任务已变化或无法唯一定位，请刷新统计后再打开。','The task changed or cannot be located uniquely. Refresh the statistics and try again.'));}
      opened=await this.plugin.openReviewSourceFile(row.path,{line:task.line+1,newLeaf:true});
    }else if(row.focusAnchor){await this.app.workspace.openLinkText(row.path+'#^'+row.focusAnchor,'',true);opened={ok:true};}
    else opened=await this.plugin.openHomeSource(row.path);
    if(!opened?.ok)throw Error(this.text('无法打开来源，请检查笔记后重试。','Could not open the source. Check the note and try again.'));
  }
  openTrendSources(kind,point,{preview=false,title=point?.key}={}){
    if(!point?.sources)return;
    const s=point.sources;
    const groups=kind==='tasks'?[
      {label:this.text(`已完成 ${point.done}`,`Completed ${point.done}`),rows:s.done},
      {label:this.text(`未完成 ${point.open}`,`Open ${point.open}`),rows:s.open}
    ]:[
      {label:this.text(`新建笔记 ${point.notes}`,`New notes ${point.notes}`),rows:s.created},
      {label:this.text(`日记字符 ${point.words}`,`Diary characters ${point.words}`),rows:s.diary.map(row=>({...row,fieldName:this.text(`${row.value} 字符`,`${row.value} characters`)}))}
    ];
    const rows=groups.flatMap(group=>group.rows);
    this.openRows(rows,{recorded:rows.length,sourceGroups:groups,summary:kind==='tasks'?this.text(`活动总量 ${point.planned}`,`Total activity ${point.planned}`):this.text('按创建日期统计笔记，按日记日期统计字符。','Notes use their creation date; characters use the diary date.')},title,false,{preview});
  }
  openRows(rows,result,title="",excluded=false,{preview=false}={}){
    const modal=new Modal(this.app),label=title||this.text("参与统计的记录","Source records");const untrack=this.plugin.cards.trackModal(modal);modal.setTitle(label);
    const contents=modal.contentEl.createDiv(),reader=preview?new (require("./statistic-source-reader.js").StatisticSourceReader)(this.plugin,modal,contents,label):null;
    modal.onClose=()=>{reader?.dispose();untrack();};
    const daily=result.sourceNotes!=null;
    const summary=daily?this.text(`${result.sourceNotes} 篇日记已计入 · ${result.recorded} 项有效`,`${result.sourceNotes} diary notes included · ${result.recorded} usable values`):excluded?this.text(`${rows.length} 条未纳入 · 全部 ${result.recorded} 条有效`,`${rows.length} excluded · ${result.recorded} usable in total`):this.text(`当前 ${rows.length} 条 · 全部 ${result.recorded} 条有效`,`${rows.length} shown · ${result.recorded} usable in total`);
    contents.createDiv({cls:'noria-card-secondary',text:(result.summary??summary)+(result.missing?this.text(` · ${result.missing} 项未填`,` · ${result.missing} missing values`):'')});
    if(result.calculationLabel)contents.createDiv({cls:'noria-card-secondary',text:result.calculationLabel});
    if(result.denominatorLabel)contents.createDiv({cls:'noria-card-secondary',text:result.denominatorLabel});
    if(result.range)contents.createDiv({cls:'noria-card-secondary',text:formatStatRange(result.range,this.plugin.getNoriaLocale())});
    for(const note of require('./statistic-charts.js').comparisonNotes(result,(a,b)=>this.text(a,b)))contents.createDiv({cls:'noria-card-secondary',text:note});
    const list=contents.createDiv({cls:"noria-record-list"});
    const status=contents.createDiv({cls:'noria-card-error',attr:{role:'alert'}});status.hidden=true;
    const renderRow=(parent,row)=>{const b=parent.createEl("button",{cls:"noria-record-open",text:(row.fieldName?row.fieldName+' · ':'')+(row.title||row.path||row.date),attr:{type:'button',title:row.path||''}});b.disabled=!row.path;
      b.onclick=async()=>{b.disabled=true;status.hidden=true;try{if(reader)await reader.show(row,b);else{await this.openSource(row);modal.close();}}catch(error){status.setText(error.message);status.hidden=false;}finally{b.disabled=!row.path;}};
      const detail=[row.title&&row.date,row.taskRef&&row.path].filter(Boolean).join(' · ');if(detail)b.createSpan({cls:'noria-card-secondary',text:detail});
      const error=row.reason==='unsupported-category'?this.text('分类值需为文本、数字、开关或它们的列表','Categories need text, numbers, booleans or lists of these'):row.reason==='non-numeric'?this.text('该值不是有效数字','This value is not a valid number'):row.error;if(error)b.createSpan({cls:"noria-card-secondary",text:error});};
    if(daily&&(result.invalid.length||result.unreadable.length)){
      const details=list.createEl('details',{cls:'noria-stat-source-issues'});details.open=!rows.length;
      const counts=[result.invalid.length?this.text(`${result.invalid.length} 项字段未纳入`,`${result.invalid.length} excluded field values`):'',result.unreadable.length?this.text(`${result.unreadable.length} 篇笔记未读取`,`${result.unreadable.length} unread notes`):''].filter(Boolean);
      details.createEl('summary',{text:counts.join(' · ')});
      for(const row of result.invalid)renderRow(details,row);
      for(const row of result.unreadable)renderRow(details,{...row,title:this.text('未读取 · ','Unread · ')+row.path});
    }
    if(result.sourceGroups)for(const group of result.sourceGroups){
      list.createEl('h3',{cls:'noria-stat-source-heading',text:group.label});
      if(!group.rows.length)list.createDiv({cls:'noria-card-secondary',text:this.text('无记录','No records')});
      for(const row of group.rows)renderRow(list,row);
    }else for(const row of rows)renderRow(list,row);modal.open();
  }
  addForField(field,context){
    const {CardCatalog}=require("./card-catalog.js"),modal=new CardCatalog(this.plugin.cards,context);
    modal.onOpen=()=>{modal.modalEl.addClass("noria-card-catalog");modal.edit({id:`card-${crypto.randomUUID()}`,type:"extension",source:"noria:statistics",title:field.name,size:"medium",enabled:true,order:Date.now(),props:{source:"diary",property:field.property,calculate:field.type==="number"||field.type==="level"?"mean":"distribution",display:field.type==="number"||field.type==="level"?"trend":"bars",scope:"follow"}});};modal.open();
  }
  async renderDailySummary(host,range,{widgetId,fields:configuredFields,context={page:"home"},headerTools,getWidget=id=>this.plugin.settings.home?.widgets?.find(w=>w.id===id),saveWidget=widget=>this.plugin.cards.saveHome(widget)}={}){
    host.addClass("noria-daily-record-card");
    const {Component}=require("obsidian"),component=new Component();component.load();let generation=0,timer,renderedHeader;const viewState={};
    const paint=async()=>{const serial=++generation,definitions=this.plugin.records.definitions(),available=definitions.filter(f=>f.enabled!==false);
      const shell=host.closest(".dashboard-home-widget-shell,.noria-diary-card"),widget=getWidget(widgetId||shell?.dataset.noriaWidgetId);
      const selected=widget?.props?.dailyRecordFields??configuredFields,chosen=Array.isArray(selected)?available.filter(f=>selected.includes(f.id)):available;
      const fields=chosen.slice(0,3);
      const results=await Promise.all(fields.map(field=>this.query({source:"diary",property:field.property,calculate:["number","level"].includes(field.type)?"mean":"distribution",display:["number","level"].includes(field.type)?"trend":"bars",...(range?{scope:"fixed",start:range.start,end:range.end}:{scope:"follow"})})));
      if(serial!==generation)return;const active=host.ownerDocument.activeElement,focused=host.contains(active)||renderedHeader?.contains(active)?active?.dataset?.recordField:null,focusedLabel=active?.classList.contains("noria-daily-series-label");host.empty();
      renderedHeader?.remove();const head=renderedHeader=(headerTools||host).createDiv({cls:"noria-card-heading"});
      if(headerTools)headerTools.insertBefore(head,headerTools.querySelector('.noria-diary-card-menu'));
      else{const title=head.createDiv({cls:"dashboard-panel-title"});setIcon(title.createSpan({cls:"dashboard-card-heading-icon"}),"chart-no-axes-combined");title.createSpan({text:this.text("日常记录","Daily records")});}
      const dateControl=head.createEl("button",{cls:"noria-daily-record-date",attr:{type:"button","data-record-field":"selected-date","aria-haspopup":"dialog"}});
      const picker=widget&&available.length?()=>recordPopover(dateControl,this.text("显示项目 · 最多三项","Display up to three fields"),(pop,close)=>{
        const ids=new Set(fields.map(f=>f.id)),choices=[];
        for(const field of available){const label=pop.createEl("label",{cls:"noria-record-field-choice"}),input=label.createEl("input",{attr:{type:"checkbox"}});input.checked=ids.has(field.id);label.createSpan({text:field.name});choices.push(input);input.onchange=()=>{if(input.checked)ids.add(field.id);else ids.delete(field.id);choices.forEach(c=>c.disabled=!c.checked&&ids.size>=3);};}
        choices.forEach(c=>c.disabled=!c.checked&&ids.size>=3);
        const error=pop.createDiv({cls:"noria-card-error",attr:{role:"alert"}}),actions=pop.createDiv({cls:"noria-record-actions"});
        const manage=actions.createEl("button",{text:this.text("管理项目","Manage fields"),attr:{type:"button"}});manage.onclick=()=>{close();this.plugin.records.manage(false,context);};
        const save=actions.createEl("button",{cls:"mod-cta",text:this.text("应用","Apply"),attr:{type:"button"}});
        save.onclick=async()=>{if(!ids.size){error.setText(this.text("至少选择一项","Select at least one field"));return;}save.disabled=true;
          try{if(widget){await saveWidget({...widget,props:{...widget.props,dailyRecordFields:[...ids]}});close();}else close();}catch(e){error.setText(e.message);save.disabled=false;}};
      }):null;
      const recordActions=picker?[{label:this.text("选择显示项目","Choose displayed fields"),icon:"sliders-horizontal",run:picker}]:[];
      if(fields.length){const period=range||results[0].range,summary=dailySources(results,fields),issues=summary.invalid.length||summary.unreadable.length;
        recordActions.push({icon:'list',label:issues?this.text('汇总与来源 · 有未纳入的记录','Summary & sources · Some records were excluded'):this.text('汇总与来源','Summary & sources'),run:()=>this.openRows(summary.rows,{...summary,range:period},this.text('汇总与来源','Summary & sources'))});
        this.drawDailySeries(host,fields,results,period,viewState,dateControl,context);if(focused)[...head.querySelectorAll("[data-record-field]"),...host.querySelectorAll("[data-record-field]")].find(el=>el.dataset.recordField===focused&&el.classList.contains("noria-daily-series-label")===focusedLabel)?.focus({preventScroll:true});}
      dateControl.hidden=!fields.length;
      if(!fields.length){const empty=host.createDiv({cls:"noria-card-empty"});empty.createDiv({text:!definitions.length?this.text("还没有记录项目。","No record fields yet."):!available.length?this.text("记录项目均已停用。","All record fields are disabled."):this.text("选择要显示的记录项目。","Choose fields to display.")});
        const add=empty.createEl("button",{text:picker?this.text("选择记录项目","Choose record fields"):definitions.length?this.text("管理项目","Manage fields"):this.text("添加记录项目","Add a record field"),cls:"noria-review-text-action",attr:{type:"button"}});add.onclick=()=>picker?picker():this.plugin.records.manage(!definitions.length,context);}
      if(shell){shell._noriaConfigureWidget=()=>this.plugin.records.manage(false,context);shell._noriaRecordActions=recordActions;}
    };const safePaint=()=>paint().catch(e=>{host.empty();host.createDiv({cls:"noria-card-empty",text:e.message});});await safePaint();const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>void safePaint(),180);};
    let definitionsSignature=JSON.stringify(this.plugin.records.definitions());
    component.register(this.plugin.cards.subscribe(()=>{const next=JSON.stringify(this.plugin.records.definitions());if(next!==definitionsSignature){definitionsSignature=next;refresh();}}));
    component.registerEvent(this.app.metadataCache.on("changed",refresh));component.registerEvent(this.app.vault.on("delete",refresh));component.register(()=>{++generation;clearTimeout(timer);renderedHeader?.remove();});return ()=>component.unload();
  }
  drawDailySeries(host,fields,results,range,viewState={},dateControl,context={page:"home"}){
    const {dates,series}=alignDailyRecords(results,range),count=dates.length;
    if(!count)return;
    if(dateControl&&count>1){
      const offset=dates[0].slice(0,4)===dates.at(-1).slice(0,4)?5:2;
      const period=[dates[0],dates.at(-1)].map(date=>date.slice(offset).replaceAll('-','.')).join('–');
      const span=dateControl.parentElement.createSpan({cls:'noria-record-period',text:period,attr:{title:formatStatRange(range,this.plugin.getNoriaLocale())}});dateControl.before(span);
    }
    const grid=host.createDiv({cls:"noria-daily-record-summary"}),previews=[];
    grid.style.setProperty('--noria-record-days',String(count));
    const number=value=>new Intl.NumberFormat(this.plugin.getNoriaLocale(),{maximumFractionDigits:2}).format(value);
    const open=(anchor,field,index)=>{select(selected);return this.editPoint(anchor,series[index][selected].rows,{source:'diary',property:field.property},dates[selected],results[index],context);};
    const today=this.plugin.getLocalYmd();
    if(dateControl)dateControl.dataset.wideDate=String(dates.some(date=>date.slice(0,4)!==today.slice(0,4)));
    let selected=dates.includes(viewState.date)?dates.indexOf(viewState.date):dates.includes(today)?dates.indexOf(today):count-1;
    let committed=selected;
    const select=(index,preview=false)=>{selected=Math.max(0,Math.min(count-1,index));if(!preview){committed=selected;viewState.date=dates[selected];}grid.style.setProperty("--noria-record-cursor",`${(selected+.5)/count*100}%`);
      const date=new Date(dates[selected]+'T12:00:00'),locale=this.plugin.getNoriaLocale();
      if(dateControl){dateControl.setText(dates[selected]===today?this.text("今天","Today"):new Intl.DateTimeFormat(locale,{...(dates[selected].slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{}),month:'short',day:'numeric'}).format(date));dateControl.title=new Intl.DateTimeFormat(locale,{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(date);dateControl.setAttribute("aria-label",this.text("选择日期","Choose date")+' · '+dateControl.title);}
      previews.forEach(({field,el,chart,label},i)=>{const point=series[i][selected],value=point.ambiguous?this.text(`${point.rows.length} 份记录`,`${point.rows.length} records`):point.multiple?this.text("多个状态","Multiple states"):point.value==null?this.text("未填写","Not recorded"):this.plugin.records.display(field,point.value);el.setText(point.ambiguous||point.multiple?value:point.value==null?"—":value);const description=`${field.name} · ${dates[selected]} · ${value}`;label.setAttribute("aria-label",description+' · '+this.text("编辑记录","Edit record"));label.title=description;label.disabled=dates[selected]>today;chart.dataset.scaleSide=selected>=count/2?"left":"right";chart.setAttribute("aria-label",`${description}${chart.dataset.recordScale?" · "+chart.dataset.recordScale:""} · ${this.text("左右键选择日期，回车编辑","Arrow keys select a date; Enter edits")}`);});};
    if(dateControl)dateControl.onclick=()=>recordPopover(dateControl,this.text("选择日期","Choose date"),(pop,close)=>{
      const input=pop.createEl("input",{attr:{type:"date",min:dates[0],max:dates[count-1],"aria-label":this.text("日期","Date")}});input.value=dates[selected];input.onchange=()=>{const index=dates.indexOf(input.value);if(index>=0){select(index);close();}};
      if(dates.includes(today)){const now=pop.createEl("button",{text:this.text("今天","Today"),attr:{type:"button"}});now.onclick=()=>{select(dates.indexOf(today));close();};}
    });
    fields.forEach((field,index)=>{
      const points=series[index],numeric=field.type==="number",row=grid.createDiv({cls:"noria-daily-series"});
      row.style.setProperty("--noria-record-color",this.plugin.records.color(field));
      const label=row.createEl("button",{cls:"noria-daily-series-label",attr:{type:"button","data-record-field":field.id}});require("./picture-picker.js").renderPicture(this.plugin,label.createSpan({cls:"noria-record-field-icon"}),fieldPicture(field));label.createSpan({cls:"noria-daily-series-name",text:field.name});label.onclick=()=>open(label,field,index);
      const preview=label.createSpan({cls:"noria-daily-series-value"});
      const chart=row.createEl("button",{cls:"noria-daily-series-chart"+(numeric?" is-numeric":""),attr:{type:"button","aria-label":`${field.name} · ${this.text("左右键选择日期，回车编辑","Arrow keys select a date; Enter edits")}`}});
      chart.dataset.recordField=field.id;previews.push({field,el:preview,chart,label});
      const pointDate=(event,preview)=>{const r=(chart._noriaRecordPlot||chart).getBoundingClientRect();select(Math.floor((event.clientX-r.left)/r.width*count),preview);};
      chart.onpointermove=event=>pointDate(event,true);chart.onpointerdown=event=>pointDate(event,false);chart.onpointerleave=()=>select(committed);chart.onclick=()=>open(chart,field,index);
      chart.onkeydown=event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();select(selected+(event.key==="ArrowLeft"?-1:1));}else if(event.key==="Home"||event.key==="End"){event.preventDefault();select(event.key==="Home"?0:count-1);}};
      chart.onfocus=()=>select(selected);
      const plot=require('./daily-record-chart.js').drawRecordChart(chart,field,points,{display:(f,v)=>this.plugin.records.display(f,v),text:(a,b)=>this.text(a,b)});
      chart._noriaRecordPlot=plot;
      if(field.type==='number'){
        const values=points.map(p=>p.value).filter(v=>typeof v==='number');
        if(values.length)chart.createSpan({cls:'noria-series-scale',text:`${number(Math.min(...values))}–${number(Math.max(...values))}${field.unit?' '+field.unit:''}`});
      }
    });
    select(selected);
  }
}
module.exports={PropertyStatCards};
