"use strict";
const {scanMarkdownLines,scanAtxHeadings}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
const {locateTask,parseTaskLine,appendProjectTask}=require("./task-document.js");
const compact=value=>String(value||"").replace(/\s+/g," ").trim();
const taskRows=source=>scanMarkdownLines(source,{listContent:true}).filter(row=>row.eligible&&/^[ \t]*[-*+]\s+\[[^\]]\]/.test(row.visible));

// Keep source positions while removing the markup that the reading view hides.
function visibleSource(source) {
  let cells=String(source).split("").map((char,index)=>({char,index}));
  const replace=(pattern,keep)=>{
    const text=cells.map(c=>c.char).join(""),matches=[...text.matchAll(pattern)];
    for(const match of matches.reverse()){
      const part=keep?.(match),offset=part==null?-1:match[0].indexOf(part);
      cells.splice(match.index,match[0].length,...(offset<0?[]:cells.slice(match.index+offset,match.index+offset+part.length)));
    }
  };
  replace(/<!--[\s\S]*?-->|%%[\s\S]*?%%/g);
  replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,m=>m[2]||m[1].split("/").pop());
  replace(/!?\[([^\]]+)\]\([^)]*\)/g,m=>m[1]);
  replace(/^(?:[ \t]*#{1,6}\s+|[ \t]*[-*+]\s+(?:\[[^\]]\]\s*)?|[ \t]*>\s?)/gm);
  replace(/\*\*|__|~~|\`/g);
  const result=[];
  for(const cell of cells){
    if(/\s/.test(cell.char)){if(result.length&&result.at(-1).char!==" ")result.push({...cell,char:" "});}
    else result.push(cell);
  }
  if(result.at(-1)?.char===" ")result.pop();
  return {text:result.map(c=>c.char).join(""),positions:result.map(c=>c.index)};
}

function locateExcerpt(source,quote,{heading="",startHint,taskSelection,range,excludeRange}={}) {
  const view=visibleSource(source),needle=compact(quote),matches=[];
  if(!needle)throw Error("adoption-empty-selection");
  let at=-1;
  const headings=scanAtxHeadings(source),rows=scanMarkdownLines(source,{listContent:true}),tasks=taskRows(source);
  const citations=tasks.flatMap(task=>citationsAfter(source,task));
  while((at=view.text.indexOf(needle,at+1))>=0){
    const start=view.positions[at],end=view.positions[at+needle.length-1]+1;
    if(range&&(start<range.start||end>range.end))continue;
    if(excludeRange&&start>=excludeRange.start&&start<excludeRange.end)continue;
    const row=rows.find(r=>r.start<=start&&r.end>start);
    if(!row?.eligible)continue;
    if(citations.some(c=>start>=c.start&&start<c.end))continue;
    const task=tasks.find(r=>r.start<=start&&r.end>=end);
    if(taskSelection!=null&&!!task!==taskSelection)continue;
    const nearest=headings.filter(h=>h.start<=start).at(-1)?.title||"";
    if(heading&&nearest!==heading)continue;
    matches.push({start,end,line:row.line,heading:nearest,quote:needle,task});
  }
  if(startHint!=null){const exact=matches.find(m=>m.start===startHint);if(exact)return exact;}
  if(matches.length!==1)throw Error(matches.length?"adoption-ambiguous-selection":"adoption-source-changed");
  return matches[0];
}

function escapeQuote(value){return compact(value).replace(/([\\\`*_[\]<>])/g,"\\$1");}
function unescapeQuote(value){return value.replace(/\\([\\\`*_[\]<>])/g,"$1");}
function parseLink(value){
  const wiki=/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(value);
  if(wiki)return {href:wiki[1],label:wiki[2]||wiki[1]};
  const md=/^\[([^\]]+)\]\(<?(.+?)>?\)$/.exec(value);
  if(md)return {href:decodeURIComponent(md[2]),label:md[1]};
  return null;
}
function citationsAfter(source,task) {
  const indent=/^[ \t]*/.exec(task.text)[0]+"  ",citations=[];
  const rows=scanMarkdownLines(source,{listContent:true});
  const tail=rows.filter(row=>row.start>task.start);
  for(let i=0;i<tail.length;i++){
    const row=tail[i];
    if(row.text.trim()&&!row.text.startsWith(indent))break;
    if(!row.text.startsWith(indent+"> "))continue;
    const match=/^> (?:来源|Source): (.+)$/.exec(row.text.slice(indent.length));
    const link=match&&parseLink(match[1]),next=tail[i+1];
    if(!link||!next?.text.startsWith(indent+"> "))continue;
    citations.push({...link,quote:unescapeQuote(next.text.slice(indent.length+2)),start:row.start,end:next.end,link:match[1]});
    i++;
  }
  return citations;
}
function taskCitations(source,request){return citationsAfter(source,locateTask(source,request));}
function attachCitation(source,request,{link,quote,label}) {
  if(/[\r\n]/.test(link)||!parseLink(link))throw Error("adoption-invalid-link");
  const existing=taskCitations(source,request);
  if(existing.some(c=>c.link===link&&c.quote===compact(quote)))return source;
  const task=locateTask(source,request),indent=/^[ \t]*/.exec(task.text)[0]+"  ";
  const eol=source.includes("\r\n")?"\r\n":"\n";
  const at=task.start+task.text.length,separator=source.slice(at).startsWith(eol)?eol:"";
  const block=eol+indent+"> "+label+": "+link+eol+indent+"> "+escapeQuote(quote)+eol;
  return source.slice(0,at)+block+source.slice(at+separator.length);
}
function removeTaskWithCitations(source,request) {
  const row=locateTask(source,request);
  let text=source;
  for(const citation of taskCitations(source,request).reverse())text=text.slice(0,citation.start)+text.slice(citation.end);
  const end=row.start+row.text.length;
  return text.slice(0,row.start)+text.slice(end).replace(/^\r?\n/,"");
}
function findTaskById(source,id) {
  return taskRows(source).find(row=>parseTaskLine(row.text).id===id);
}
function appendDailyTask(source,line,language) {
  const headings=scanAtxHeadings(source),daily=headings.filter(h=>/^(今日任务|Today tasks)$/i.test(h.title));
  if(daily.length>1)throw Error("ambiguous-task-section");
  if(daily.length)return appendProjectTask(source,line,daily[0].title);
  const sections=headings.filter(h=>h.level===2&&/^(待办|Tasks)$/i.test(h.title));
  if(sections.length>1)throw Error("ambiguous-task-section");
  const zh=sections.length?sections[0].title==="待办":language==="zh",eol=source.includes("\r\n")?"\r\n":"\n";
  const chunk="### "+(zh?"今日任务":"Today tasks")+eol+eol+line;
  if(sections.length)return appendProjectTask(source,chunk,sections[0].title);
  const prefix=source+(source&&!source.endsWith("\n")?eol:"")+(source&&!/\r?\n\r?\n$/.test(source)?eol:"");
  return {text:prefix+"## "+(zh?"待办":"Tasks")+eol+eol+chunk+eol};
}
module.exports={compact,visibleSource,locateExcerpt,taskRows,taskCitations,citationsAfter,attachCitation,removeTaskWithCitations,findTaskById,appendDailyTask};
