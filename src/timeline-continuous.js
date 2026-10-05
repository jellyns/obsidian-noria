"use strict";
const {createActivityReader,validDate,fileActivities}=require('./activity-model.js');
const {buildStream,dateKey,normalizeFilter}=require('./timeline-stream-model.js');
const {shiftDate}=require('./diary-tasks.js');

// Match the same numeric tokens supported by formatCalendarPattern, then verify
// the complete resolved path. Never infer a diary from a date-like basename alone.
function dateFromPattern(pattern,path){
  const fields=[];let source='';
  for(const token of String(pattern).match(/\[[^\]]*\]|YYYY|yyyy|YY|MMMM|MMM|MM|M|DD|D|gggg|ww|w|Q|./g)||[]){
    if(/^\[/.test(token)){source+=escape(token.slice(1,-1));continue;}
    const type=/^(YYYY|yyyy|YY)$/.test(token)?'year':/^M+$/.test(token)?'month':/^D+$/.test(token)?'day':'';
    if(type){fields.push([type,token]);source+=token==='YY'?'(\\d{2})':type==='year'?'(\\d{4})':'(\\d{1,2})';}
    else source+=/^(gggg|ww|w|Q)$/.test(token)?'\\d+':escape(token);
  }
  const match=new RegExp('^'+source+'$').exec(path);if(!match)return '';
  const values={};for(let i=0;i<fields.length;i++){const [type,token]=fields[i];let value=Number(match[i+1]);if(token==='YY')value+=value>68?1900:2000;if(values[type]!==undefined&&values[type]!==value)return '';values[type]=value;}
  if(!values.year||!values.month||!values.day)return '';
  return validDate(`${values.year}-${String(values.month).padStart(2,'0')}-${String(values.day).padStart(2,'0')}`);
}
function escape(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
async function dailyDates(plugin,signal){
  const settings=plugin.getCalendarSettings(),dailyNotesConfig=settings.calendarIntegrationMode==='daily-notes'?await plugin.readDailyNotesPluginConfig():null;
  const folder=dailyNotesConfig?dailyNotesConfig.folder||'':settings.calendarRootFolder;
  const format=dailyNotesConfig?dailyNotesConfig.format||'YYYY-MM-DD':plugin.getCalendarPatternForPeriod('daily',settings);
  const prefix=String(folder||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
  const pattern=String(format).replace(/\\/g,'/').replace(/^\//,'').replace(/\.md$/i,'');
  const dates=[];
  // An explicitly root-level Daily Notes setup also permits root Markdown files.
  const children=prefix?[]:plugin.app.vault.getRoot().children;
  const files=prefix?plugin.filesUnderRoots([prefix],[".md"]):[...children.filter(f=>!f.children&&/\.md$/i.test(f.path)),...plugin.filesUnderRoots(children.filter(f=>f.children).map(f=>f.path),['.md'])];
  for(const file of files){
    if(signal?.aborted)throw cancelled();
    if(prefix&&!file.path.startsWith(prefix+'/'))continue;
    const relative=file.path.slice(prefix?prefix.length+1:0).replace(/\.md$/i,'');
    const date=dateFromPattern(pattern,relative);
    if(date&&plugin.resolveCalendarNoteSpec('daily',date,{settings,dailyNotesConfig}).path===file.path)dates.push(date);
  }
  return {dates,ambiguous:!/(YYYY|yyyy|YY)/.test(pattern)||!pattern.includes('M')||!pattern.includes('D')};
}
function cancelled(){const e=new Error('Timeline request cancelled');e.name='AbortError';return e;}

class ContinuousTimeline {
  constructor(plugin,model,filter){this.plugin=plugin;this.model=model;this.filter=normalizeFilter(filter);this.controller=new AbortController();this.cache=new Map();this.pageSize=7;this.maxDates=35;}
  async init(anchor){
    this.anchor=validDate(anchor)||this.plugin.getLocalYmd();
    const {dates,ambiguous}=this.filter.records?await dailyDates(this.plugin,this.controller.signal):{dates:[],ambiguous:false};
    this.recordDates=dates;this.ambiguous=ambiguous;
    const taskDates=buildStream(this.model,[],{startMs:+new Date('0001-01-01T00:00:00'),endMs:+new Date('9999-12-31T23:59:59')},this.filter).items.map(e=>e.date).filter(validDate);
    const activity=this.filter.ctime||this.filter.mtime?fileActivities(this.plugin.filesUnderRoots(this.plugin.getScopeSpec('notes').roots,['.md']),{start:'0001-01-01',end:'9999-12-31'},this.filter,d=>this.plugin.getLocalYmd(d),this.plugin.getLocalYmd()):[];
    this.dates=[...new Set([...dates,...(this.filter.tasks?taskDates:[]),...activity.map(e=>e.date),this.anchor,this.plugin.getLocalYmd()])].sort();
    const index=this.dates.indexOf(this.anchor);this.start=Math.max(0,index-this.pageSize);this.end=Math.min(this.dates.length,index+this.pageSize+1);
    await this.read(this.start,this.end);return this;
  }
  async read(start,end){
    const dates=this.dates.slice(start,end),missing=dates.filter(date=>!this.cache.has(date));if(!missing.length)return;
    const reader=await createActivityReader(this.plugin,{range:{start:missing[0],end:missing.at(-1)},recordDates:this.recordDates.filter(date=>missing.includes(date)),includeDates:missing,onlyDates:missing,config:{...this.filter,tasks:false},order:'asc',signal:this.controller.signal});
    const page=await reader.next(missing.length);
    if(this.controller.signal.aborted)throw cancelled();
    // Commit only a complete page: retry after an I/O failure cannot drop dates.
    const groups=new Map(page.groups.map(g=>[g.date,g.items]));for(const date of missing)this.cache.set(date,groups.get(date)||[]);
  }
  async load(direction){
    if(this.pending)return this.pending;
    this.pending=(async()=>{let start=this.start,end=this.end;
      if(direction<0)start=Math.max(0,start-this.pageSize);else end=Math.min(this.dates.length,end+this.pageSize);
      await this.read(start,end);
      if(direction<0)end=Math.min(end,start+this.maxDates);else start=Math.max(start,end-this.maxDates);
      this.start=start;this.end=end;
      // Keep only a small adjacent cache; scrolling does not retain the vault body.
      const keep=new Set(this.dates.slice(Math.max(0,start-this.pageSize),end+this.pageSize));for(const date of this.cache.keys())if(!keep.has(date))this.cache.delete(date);
      return this.snapshot();
    })().finally(()=>{this.pending=null;});return this.pending;
  }
  snapshot(){
    const dates=this.dates.slice(this.start,this.end),first=dates[0],last=dates.at(-1);
    const window={startMs:+new Date(first+'T00:00:00'),endMs:+new Date(shiftDate(last,1)+'T00:00:00')};
    const result=buildStream(this.model,dates.flatMap(date=>this.cache.get(date)||[]),window,this.filter);
    return {...result,dates,anchor:this.anchor,earlier:this.start>0,later:this.end<this.dates.length,ambiguous:this.ambiguous};
  }
  dispose(){this.controller.abort();}
}
module.exports={dateFromPattern,dailyDates,ContinuousTimeline};
