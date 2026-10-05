"use strict";
const {previewReviewPart}=require('./review-document.js');

// Prefer whole Markdown blocks. A single oversized block gets a plain-text
// excerpt, so a clipped fence, table or link is never executed as new Markdown.
function timelineRecordPreview(markdown,{maxChars=800,previewChars=600}={}){
  const raw=String(markdown||'').trim(),lines=raw.split('\n');
  const images=[...raw.matchAll(/!\[\[|!\[[^\]]*\]\(/g)].length;
  if(raw.length<=maxChars&&lines.length<=18&&images<=2)return {long:false,markdown:raw,plain:''};
  const limit=Math.min(previewChars,lines.slice(0,12).join('\n').length,raw.length-1);
  const preview=previewReviewPart(raw,limit);
  if(preview.markdown)return {long:true,markdown:preview.markdown,plain:''};
  const plain=raw.slice(0,1600)
    .replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm,'')
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,path,label)=>label||path)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/^\s*(?:#{1,6}|>|[-*+] |\d+\. )\s*/gm,'')
    .replace(/[`*_~]/g,'').replace(/\s+/g,' ').trim();
  const points=Array.from(plain);
  return {long:true,markdown:'',plain:points.slice(0,180).join('')+(points.length>180?'…':'')};
}
module.exports={timelineRecordPreview};
