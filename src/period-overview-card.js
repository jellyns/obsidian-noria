"use strict";
const {setIcon}=require('obsidian');
const M=require('./period-overview-model.js');
const {formatStatRange}=require('./property-statistics.js');
const {dayModel}=require('./time-ring-model.js');
const SOURCE='noria:period-overview';
function overviewTemplate(t){return {id:'period-overview',kind:'overview',style:'records',icon:'chart-no-axes-combined',size:'full',
  title:t('概览','Overview'),description:t('专注、任务、习惯与记录，在同一日期下查看分布','Focus, tasks, habits and writing aligned by date'),props:{scope:'follow'}};}
function registerPeriodOverview(system,plugin){
 const t=(a,b)=>system.text(a,b),definitions=()=>plugin.records.definitions().filter(f=>f.enabled!==false&&['number','level','option','toggle'].includes(f.type));
 const base=[['focus','专注','Focus','timer','#8272e9'],['tasks','任务','Tasks','list-checks','#4786cf'],['habits','习惯','Habits','circle-check','#329888'],['words','码字','Characters','pencil-line','#bc8738'],['notes','笔记','Notes','files','#ad6d93']];
 const choices=()=>[...base.map(([value,zh,en])=>({value,label:t(zh,en)})),...definitions().map(f=>({value:'record:'+f.property,label:f.name})),{value:'none',label:t('不显示','Hidden')}];
 system.register({id:SOURCE,title:t('概览','Overview'),icon:'chart-no-axes-combined',supportsDate:true,defaultSize:'full',
  description:t('同卡多行分布，跟随日记或页面日期；各项保留自己的单位','Multiple distributions following the diary or page date, each with its own unit'),
  fields:config=>[
   ...Array.from({length:6},(_,i)=>({key:'row'+(i+1),label:t('第 '+(i+1)+' 行','Row '+(i+1)),type:'select',default:M.DEFAULT_ROWS[i]||'none',options:choices()})),
   ...plugin.propertyStats.fields(config).filter(f=>['scope','days','start','end'].includes(f.key)).map(f=>f.key==='scope'?{...f,options:f.options.filter(o=>o.value!=='all')}:f)
  ],
  validate:config=>{
   const rows=M.selectedRows(config),valid=new Set(choices().map(o=>o.value));
   if(!rows.length||rows.some(key=>!valid.has(key)))throw Error(t('请选择至少一项有效统计。','Choose at least one valid metric.'));
   plugin.propertyStats.validate({...config,source:'diary',display:'metric'});
   if(config.scope==='all')throw Error(t('请选择有限的日期范围。','Choose a bounded date range.'));
  },
  render:async({container,config,selection,component,context={}})=>{
   container.classList.add('noria-period-overview');let disposed=false,serial=0,timer,model,selected=-1;
   const locale=plugin.getNoriaLocale(),number=new Intl.NumberFormat(locale,{maximumFractionDigits:1}),compact=new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1});
   const shell=context.preview?null:container.closest('.noria-diary-card,.dashboard-home-widget-shell');
   shell?.classList.add('noria-overview-card');
   const tools=shell?.querySelector('.noria-diary-card-tools,.dashboard-guide-card__tools');
   const header=(tools||container).createDiv({cls:'noria-overview-context'}),rangeLabel=header.createSpan({cls:'noria-overview-range'}),inspectLabel=header.createSpan({cls:'noria-overview-date',text:t('本期','Period')});
   if(tools)tools.insertBefore(header,tools.querySelector('.noria-diary-card-menu,.dashboard-home-widget-shell-actions'));
   const status=container.createDiv({cls:'noria-card-secondary',attr:{role:'status'}}),body=container.createDiv({cls:'noria-overview-body'});
   const format=(row,value)=>value==null?'—':row.key==='focus'?(value<1?(value>0?t('<1 分钟','<1 min'):t('0 分钟','0 min')):value<60?number.format(value)+t(' 分钟',' min'):number.format(value/60)+t(' 小时',' h')):row.key==='habits'?number.format(value)+'%':compact.format(value)+(row.unit||'');
   const category=(row,key)=>row.categories?.find(c=>c.key===key)||{key,label:key,color:row.color};
   const readout=(row,point)=>row.categorical?(point.categories?.length===1?category(row,point.categories[0].key).label:point.categories?.length?point.value+t(' 条',' entries'):'—'):format(row,point.value);
   const dateText=bucket=>bucket.key.length===7?new Intl.DateTimeFormat(locale,{month:'short'}).format(new Date(bucket.start+'T12:00:00')):new Intl.DateTimeFormat(locale,{month:'numeric',day:'numeric'}).format(new Date(bucket.start+'T12:00:00'));
   const sources=(row,point)=>{
    const seen=new Set();return point.sources.filter(source=>{const key=source.id||source.path+':'+source.date;if(!source.path||seen.has(key))return false;seen.add(key);return true;}).map(source=>row.key==='focus'?{...source,focusAnchor:source.anchor}:source);
   };
   const open=(row,index)=>{
    const point=index<0?row.total:row.points[index],rows=sources(row,point),title=row.name+' · '+(index<0?formatStatRange(model.range,locale):formatStatRange(model.buckets[index],locale));
    plugin.propertyStats.openRows(rows,{recorded:rows.length,summary:row.definition},title,false,{preview:!!context.preview});
   };
   const inspect=index=>{
    if(!model)return;
    if(!Number.isInteger(index)||index<0||index>=model.buckets.length)index=-1;
    selected=index;inspectLabel.setText(index<0?t('本期','Period'):dateText(model.buckets[index]));
    inspectLabel.title=index<0?formatStatRange(model.range,locale):formatStatRange(model.buckets[index],locale);
    for(const row of model.rows){const point=index<0?row.total:row.points[index];row.valueEl?.setText(row.error?t('未能读取','Unavailable'):readout(row,point));
      row.host?.querySelectorAll('[data-bucket]').forEach(el=>el.classList.toggle('is-inspected',Number(el.dataset.bucket)===index));
      row.plot?.setAttribute('aria-label',row.name+' · '+inspectLabel.title+' · '+readout(row,point)+t('，左右键选择，回车查看来源','; arrow keys to select, Enter for sources'));
    }
   };
   const svgEl=(parent,tag,attrs)=>{const el=container.ownerDocument.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));parent.append(el);return el;};
   const draw=()=>{
    const focused=model?.rows.findIndex(row=>row.plot===container.ownerDocument.activeElement);
    body.empty();if(!model)return;
    for(const row of model.rows){
     const host=row.host=body.createDiv({cls:'noria-overview-row'});host.style.setProperty('--overview-color',row.color);
     const label=host.createEl('button',{cls:'noria-overview-metric',attr:{type:'button',title:row.definition}});
     const name=label.createSpan({cls:'noria-overview-name'});require('./picture-picker.js').renderPicture(plugin,name.createSpan(),row.icon);name.createSpan({text:row.name});
     row.valueEl=label.createSpan({cls:'noria-overview-value'});label.onclick=()=>open(row,selected);
     const plot=row.plot=host.createDiv({cls:'noria-overview-plot',attr:{tabindex:'0',role:'group'}});
     plot.onkeydown=e=>{let next=selected;if(e.key==='ArrowRight')next=Math.min(model.buckets.length-1,selected+1);else if(e.key==='ArrowLeft')next=Math.max(0,selected-1);else if(e.key==='Home')next=0;else if(e.key==='End')next=model.buckets.length-1;else if(e.key==='Enter'||e.key===' '){e.preventDefault();open(row,selected);return;}else if(e.key==='Escape'){inspect(-1);return;}else return;e.preventDefault();inspect(next);};
     if(row.error){plot.createSpan({cls:'noria-card-secondary',text:row.error});continue;}
     if(model.daily){
      if(row.key==='focus'){
       plot.classList.add('is-hours');const track=plot.createDiv({cls:'noria-overview-time-track'}),day=dayModel(row.rows,model.range.start);
       for(const segment of day.segments){const block=track.createDiv({cls:'noria-overview-time-segment',attr:{title:segment.title+' · '+new Date(segment.from).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})+'–'+new Date(segment.to).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}});block.style.left=segment.startFraction*100+'%';block.style.width=Math.max(.2,(segment.endFraction-segment.startFraction)*100)+'%';}
       const axis=plot.createDiv({cls:'noria-overview-hours'});for(const text of ['0:00','12:00','24:00'])axis.createSpan({text});
      }else if(['tasks','habits'].includes(row.key)){
       const list=plot.createDiv({cls:'noria-overview-day-marks'}),rows=row.total.sources;
       for(const source of rows.slice(0,48))list.createSpan({cls:'noria-overview-mark'+(row.key==='tasks'||source.done?' is-done':''),attr:{title:source.title||row.name}});
       if(rows.length>48)list.createSpan({cls:'noria-card-secondary',text:'+'+(rows.length-48)});
       if(!rows.length)list.createSpan({cls:'noria-card-secondary',text:row.key==='habits'?t('没有应打卡项','No scheduled habits'):t('没有完成记录','No completions')});
      }else if(row.categorical){
       const total=(row.total.categories||[]).reduce((sum,c)=>sum+c.count,0),strip=total?plot.createDiv({cls:'noria-overview-category-strip'}):null;
       for(const entry of row.total.categories||[]){const info=category(row,entry.key),part=strip.createSpan({text:info.label,attr:{title:info.label+' · '+entry.count}});part.style.flex=String(entry.count);part.style.setProperty('--category-color',info.color);}
       if(!total)plot.createSpan({cls:'noria-card-secondary',text:t('尚无记录','No records')});
      }else if(row.key.startsWith('record:')){
       if(row.total.value==null)plot.createSpan({cls:'noria-card-secondary',text:t('尚无记录','No records')});
       else if(row.field?.type==='level'){
        const marks=plot.createDiv({cls:'noria-overview-level'});
        for(const value of require('./record-visual.js').choices(row.field))marks.createSpan({cls:value<=row.total.value?'is-filled':'',attr:{title:plugin.records.display(row.field,value)}});
        plot.createSpan({cls:'noria-overview-level-label',text:plugin.records.display(row.field,row.total.value)});
       }else plot.createSpan({cls:'noria-card-secondary',text:row.total.sources.map(source=>source.date).join(' · ')});
      }else {
       const items=plot.createDiv({cls:'noria-overview-day-marks'});
       for(const source of row.total.sources.slice(0,12))items.createSpan({cls:'noria-overview-source-chip',text:source.title||source.file?.basename||source.path?.split('/').pop()?.replace(/\.md$/,'')||row.name,attr:{title:source.path||row.name}});
       if(!row.total.sources.length)items.createSpan({cls:'noria-card-secondary',text:t('尚无记录','No records')});
      }
      plot.onclick=()=>open(row,-1);continue;
     }
     const width=Math.max(120,plot.clientWidth),svg=svgEl(plot,'svg',{viewBox:`0 0 ${width} 62`,preserveAspectRatio:'none','aria-hidden':'true'}),count=model.buckets.length,step=width/count;
     const peakValue=Math.max(...row.points.filter(p=>p.value!=null).map(p=>p.value)),peak=row.points.findIndex(p=>p.value===peakValue&&peakValue!==0),current=model.buckets.findIndex(b=>b.start<=plugin.getLocalYmd()&&b.end>=plugin.getLocalYmd());
     if(row.min<0){const zero=17+row.max/(row.max-row.min)*35;svgEl(svg,'line',{x1:0,x2:width,y1:zero,y2:zero,stroke:'var(--background-modifier-border)','stroke-width':1});}
     for(const [index,point]of row.points.entries()){
      const x=step*(index+.5),barWidth=Math.min(22,step*.6),span=row.max-row.min,height=span>0?Math.max(2,Math.abs(point.value||0)/span*35):2,baseline=span>0?17+row.max/span*35:52;
      if(row.categorical){
       const entries=point.categories||[],total=entries.reduce((sum,c)=>sum+c.count,0);let y=52;
       if(!total)svgEl(svg,'rect',{x:x-barWidth/2,y:27,width:barWidth,height:25,rx:3,fill:'none',stroke:'var(--background-modifier-border)','data-bucket':index});
       for(const entry of entries){const info=category(row,entry.key),h=25*entry.count/total;y-=h;
        const rect=svgEl(svg,'rect',{x:x-barWidth/2,y,width:barWidth,height:h,fill:info.color,'data-bucket':index});svgEl(rect,'title',{}).textContent=info.label+' · '+entry.count;
       }
      }else if(row.key==='habits')svgEl(svg,'rect',{x:x-barWidth/2,y:27,width:barWidth,height:25,rx:Math.min(4,barWidth/3),fill:point.value==null?'none':'currentColor',opacity:point.value==null?1:.15+point.value/100*.85,stroke:point.value==null?'var(--background-modifier-border)':'none','data-bucket':index});
      else svgEl(svg,'rect',{x:x-barWidth/2,y:point.value==null?baseline-2:point.value<0?baseline:baseline-height,width:barWidth,height:point.value==null?2:height,rx:Math.min(3,barWidth/3),fill:'currentColor',opacity:point.future ? .06 : point.value==null ? .12 : point.value===0 ? .22 : .82,'data-bucket':index});
      if(!row.categorical&&point.value!=null&&(index===peak||index===current)&&(index!==current||peak<0||peak===current||Math.abs(peak-current)*step>70)){
       const text=svgEl(svg,'text',{x:Math.max(30,Math.min(width-30,x)),y:row.key==='habits'?18:Math.max(12,baseline-(point.value<0?0:height)-5),'text-anchor':'middle',fill:'var(--text-muted)','font-size':11});text.textContent=row.key==='focus'?readout(row,point):compact.format(point.value)+(row.key==='habits'?'%':'');
      }
     }
     if(!row.points.some(p=>p.value!=null&&p.value!==0))plot.createSpan({cls:'noria-overview-empty',text:row.total.value==null?t('尚无记录','No records'):row.key.startsWith('record:')?t('记录值均为 0','Recorded values are zero'):t('本期暂无记录','No records in this period')});
     plot.onpointermove=e=>{const r=plot.getBoundingClientRect();if(r.width<=0)return;inspect(Math.max(0,Math.min(count-1,Math.floor((e.clientX-r.left)/r.width*count))));};
     plot.onpointerleave=()=>{if(!plot.contains(container.ownerDocument.activeElement))inspect(-1);};plot.onclick=()=>open(row,selected);
    }
    if(!model.daily){const axis=body.createDiv({cls:'noria-overview-axis'}),every=Math.max(1,Math.ceil(model.buckets.length/Math.max(2,Math.floor(axis.clientWidth/48))));for(const [index,bucket]of model.buckets.entries()){const show=index===0||index===model.buckets.length-1||index%every===0&&index<model.buckets.length-1-every/2;const label=axis.createSpan({text:show?dateText(bucket):''});label.style.width=100/model.buckets.length+'%';}}
    inspect(selected>=model.buckets.length?-1:selected);
    if(focused>=0)model.rows[focused]?.plot?.focus({preventScroll:true});
   };
   const load=async()=>{
    const generation=++serial;status.setText(t('正在更新…','Updating…'));container.setAttribute('aria-busy','true');
    try{
     const range=await plugin.propertyStats.range({...config,scope:config.scope||'follow'},selection),keys=M.selectedRows(config);
     let noteData,noteError;if(keys.some(key=>['notes','words'].includes(key)))try{noteData=(await(await plugin.createDataService()).getSnapshot({range:{mode:'custom',...range},include:['notes'],granularity:'day'})).domains.notes;}catch(error){noteError=error;}
     const results=await Promise.allSettled(keys.map(async key=>{
      const definition=definitions().find(f=>'record:'+f.property===key),meta=base.find(m=>m[0]===key),name=definition?.name||t(meta[1],meta[2]);
      let result,rows;const categorical=!!definition&&['option','toggle'].includes(definition.type);
      const palette=['#8272e9','#399b89','#638ec8','#bd8a49','#c77987'];
      const categories=categorical?require('./record-visual.js').choices(definition).map((value,index)=>({key:String(value),label:plugin.records.display(definition,value),color:require('./record-visual.js').appearance(definition,value).color||palette[index%palette.length]})):[];
      if(key==='focus')result=await plugin.propertyStats.query({source:'focus',display:'time-ring',scope:'fixed',...range});
      else if(key==='tasks'||key==='habits')result=await plugin.propertyStats.query({source:key,calculate:key==='habits'?'rate':'count',display:'metric',scope:'fixed',...range});
      else if(key==='words'||key==='notes'){if(noteError)throw noteError;rows=(noteData?.trend?.series||[]).flatMap(point=>point.sources?.[key==='words'?'diary':'created']||[]);}
      else result=await plugin.propertyStats.query({source:'diary',property:definition.property,calculate:categorical?'distribution':'mean',display:categorical?'strip':'line',scope:'fixed',...range});
      const explanation=key==='focus'?t('实际专注；暂停不计时，重叠时段只计算一次。','Actual focus; pauses excluded and overlaps counted once.'):key==='tasks'?t('按完成日期统计；没有完成日期的任务不猜测归属。','Counted by completion date; undated completions are not assigned.'):key==='habits'?t('已达标次数占截至今天按计划应打卡次数。','Completed scheduled check-ins divided by scheduled check-ins through today.'):key==='words'?t('对应日记当前非空白字符数，包含Markdown标记；不是历史编辑增量。','Current non-whitespace diary characters, including Markdown; not historical edits.'):key==='notes'?t('按创建日期统计新增笔记。','Notes counted by creation date.'):categorical?t('各类记录按日期分布；缺失保留空白。','Recorded categories by date; missing values remain empty.'):t('所选日期的记录平均值；缺失保留空白。','Mean recorded value in the selected period; missing values remain empty.');
      return {key,name,categorical,categories,field:definition,icon:meta?.[3]||definition?.icon||'activity',color:meta?.[4]||(definition?plugin.records.color(definition):'#b17aab'),rows:rows||result.rows,unit:definition?.unit||'',definition:explanation};
     }));
     if(disposed||generation!==serial)return;
     const metrics=results.map((result,index)=>result.status==='fulfilled'?result.value:{key:keys[index],name:choices().find(o=>o.value===keys[index])?.label||keys[index],icon:'circle-alert',color:'var(--text-muted)',rows:[],error:result.reason.message});
     model=M.overviewModel(metrics,range,plugin.getLocalYmd());rangeLabel.setText(formatStatRange(range,locale));rangeLabel.title=rangeLabel.textContent;
     if(selection?.mode&&(!config.scope||config.scope==='follow'))rangeLabel.hidden=true;status.empty();draw();
    }catch(error){if(!disposed&&generation===serial){body.empty();status.setText(error.message);const retry=status.createEl('button',{text:t('重试','Retry')});retry.onclick=load;}}
    finally{if(!disposed&&generation===serial)container.removeAttribute('aria-busy');}
   };
   const refresh=()=>{clearTimeout(timer);timer=setTimeout(load,200);};
   for(const event of ['changed','deleted'])component.registerEvent(plugin.app.metadataCache.on(event,refresh));
   component.registerEvent(plugin.app.vault.on('delete',refresh));
   if(!selection?.mode&&plugin.cards.onStatisticRange)component.register(plugin.cards.onStatisticRange(selection?.pageId||'home',value=>{selection={...selection,range:value.range};refresh();}));
   if(plugin.focusTimer){
    let revision=plugin.settings.pomodoro.revision,day=plugin.getLocalYmd();
    component.register(plugin.focusTimer.subscribe(()=>{const next=plugin.settings.pomodoro.revision,today=plugin.getLocalYmd();if(next!==revision||today!==day){revision=next;day=today;refresh();}}));
    const live=setInterval(()=>{if(plugin.getPomodoroState().active?.status==='running'&&!container.matches(':hover')&&!container.contains(container.ownerDocument.activeElement))refresh();},15000);component.register(()=>clearInterval(live));
   }
   let width=container.clientWidth;const observer=new ResizeObserver(()=>{const next=container.clientWidth;if(Math.abs(next-width)>2){width=next;draw();}});observer.observe(container);
   component.register(()=>{disposed=true;++serial;clearTimeout(timer);observer.disconnect();header.remove();shell?.classList.remove('noria-overview-card');});await load();
  }
 });
}
module.exports={SOURCE,overviewTemplate,registerPeriodOverview};
