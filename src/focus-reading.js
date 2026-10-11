"use strict";
const {readFocusDocument,dayOf}=require('./focus-document.js');

function readingSummary(record,locale='zh'){
  const zh=locale==='zh',seconds=Math.floor(record.durationMs/1000),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
  const duration=hours?`${hours} ${zh?'小时':'h'}${minutes%60?' '+minutes%60+' '+(zh?'分':'min'):''}`:minutes?`${minutes} ${zh?'分钟':'min'}`:`${seconds||'<1'} ${zh?'秒':'s'}`;
  const clock=value=>new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',...(record.durationMs<60000?{second:'2-digit'}:{}),hourCycle:'h23'}).format(new Date(value));
  const stamp=value=>(dayOf(value)===dayOf(record.start)?'':dayOf(value)+' ')+clock(value);
  const mode=record.mode==='BREAK'?(zh?'休息':'Break'):record.timerMode==='stopwatch'?(zh?'自由计时':'Stopwatch'):record.completed?(zh?'番茄完成':'Pomodoro completed'):(zh?'专注':'Focus');
  const spans=record.segments.map(span=>`${stamp(span.start)}–${stamp(span.end)}`);
  return {duration,mode,spans};
}

// The Markdown stays the editable source of truth. Only recognized, valid
// records gain a reading presentation; malformed or ambiguous lines stay visible.
async function renderFocusReading(plugin,el,ctx){
  const items=[...el.querySelectorAll('li')].filter(li=>!li.querySelector('ul,ol,.noria-focus-reading')&&/\d{2}:\d{2}.* · /.test(li.textContent));
  if(!items.length)return;
  const info=ctx.getSectionInfo?.(el),file=plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  const raw=info?.text??(file?await plugin.app.vault.cachedRead(file):'');
  const day=ctx.sourcePath.match(/(?:^|\/)(\d{4}-\d{2}-\d{2})/)?.[1]||plugin.focusTimer.records.documents.get(ctx.sourcePath)?.day;
  if(!day)return;
  const lines=raw.split(/\r?\n/),records=readFocusDocument(raw,day).records;
  const plain=value=>{const decoder=el.ownerDocument.createElement('textarea');decoder.innerHTML=value;return decoder.value.replace(/\s+/g,' ').trim();};
  for(const li of items){
    const matches=[...records.values()].filter(record=>plain(lines[record.line].replace(/^- /,'').replace(/\[\[[^|]+\|([^\]]+)\]\]/g,'$1').replace(/\s*\^focus-[\w-]+\s*$/,''))===li.textContent.replace(/\s+/g,' ').trim());
    if(matches.length!==1)continue;
    const record=matches[0],summary=readingSummary(record,plugin.getNoriaLocale()),link=li.querySelector('a.internal-link');
    const details=el.ownerDocument.createElement('details');details.className='noria-focus-reading';
    const heading=details.createEl('summary');
    if(link)heading.append(link);else heading.createSpan({cls:'noria-focus-reading-title',text:record.title});
    heading.createSpan({cls:'noria-focus-reading-duration',text:summary.duration});
    const toggle=heading.createSpan({cls:'noria-focus-reading-toggle',attr:{'aria-hidden':'true'}});
    require('obsidian').setIcon(toggle,'chevron-right');
    const body=details.createDiv({cls:'noria-focus-reading-detail'});
    body.createDiv({text:summary.mode});
    for(const span of summary.spans)body.createDiv({text:span});
    const bullet=li.querySelector(':scope > .list-bullet');
    li.replaceChildren(...(bullet?[bullet]:[]),details);
  }
}
module.exports={readingSummary,renderFocusReading};
