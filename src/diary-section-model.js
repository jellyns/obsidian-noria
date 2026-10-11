"use strict";
const {scanAtxHeadings}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');

function diarySection(raw,title){
  const headings=scanAtxHeadings(raw),matches=headings.filter(h=>h.level===2&&h.title===title);
  if(matches.length!==1)return {state:matches.length?'ambiguous':'missing',content:''};
  const heading=matches[0],end=headings.find(h=>h.start>heading.start&&h.level<=2)?.start??raw.length;
  return {state:'found',content:raw.slice(heading.end,end).trim(),line:heading.line};
}
function diarySectionTitles(...documents){
  return [...new Set(documents.flatMap(raw=>scanAtxHeadings(raw).filter(h=>h.level===2).map(h=>h.title)))];
}
function normalizeRecordSections(value){
  return Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&!/[\r\n]/.test(v)).map(v=>v.trim()).filter(Boolean))]:undefined;
}
// Reading projection only. Retain original section order and never guess among
// duplicate headings; task markers already carry their full-source identity.
function projectRecordSections(raw,sections){
  const selected=normalizeRecordSections(sections);
  if(!selected)return {markdown:raw,missing:[],ambiguous:[]};
  const headings=scanAtxHeadings(raw),wanted=new Set(selected),missing=[],ambiguous=[];
  for(const title of selected){
    const count=headings.filter(h=>h.level===2&&h.title===title).length;
    if(!count)missing.push(title);else if(count>1)ambiguous.push(title);
  }
  const markdown=headings.filter(h=>h.level===2&&wanted.has(h.title)&&!ambiguous.includes(h.title)).map(h=>{
    const end=headings.find(next=>next.start>h.start&&next.level<=2)?.start??raw.length;
    return raw.slice(h.start,end).trim();
  }).join('\n\n');
  return {markdown,missing,ambiguous};
}
module.exports={diarySection,diarySectionTitles,normalizeRecordSections,projectRecordSections};
