"use strict";
const {scanMarkdownLines}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');

// Ranges belong to one section revision, never to a stored item ID. Keep nested
// lists and fenced examples with their parent; complex reference documents stay whole.
function suggestionItems(markdown){
  const raw=String(markdown||'');if(!raw.trim())return [];
  const rows=scanMarkdownLines(raw,{listContent:true});
  const whole=()=>[{start:0,end:raw.length,markdown:raw}];
  if(rows.some(r=>r.eligible&&/^ {0,3}(?:\[[^\]]+\]:|<|%%)/.test(r.text)))return whole();
  const heading=rows.filter(r=>r.eligible&&/^###\s+/.test(r.visible));
  const starts=new Set([0]);
  if(heading.length){for(const row of heading)starts.add(row.start);}
  else{
    let inList=false,base=0;
    for(let i=0;i<rows.length;i++){
      const row=rows[i];if(!row.eligible||!row.visible.trim())continue;
      const marker=/^( {0,3})(?:[-+*]|\d+[.)])[ \t]+\S/.exec(row.visible);
      if(marker&&(!inList||marker[1].length<=base)){
        starts.add(row.start);base=marker[1].length;inList=true;
      }else if(i&&rows[i-1].text.trim()===''&&/^\S/.test(row.visible)){
        starts.add(row.start);inList=false;
      }
    }
  }
  const offsets=[...starts].sort((a,b)=>a-b);offsets.push(raw.length);
  return offsets.slice(0,-1).map((start,i)=>{
    let end=offsets[i+1];while(start<end&&/\s/.test(raw[start]))start++;while(end>start&&/\s/.test(raw[end-1]))end--;
    return {start,end,markdown:raw.slice(start,end)};
  }).filter(item=>item.markdown);
}
function replaceSuggestionItem(source,item,markdown){
  if(source.slice(item.start,item.end)!==item.markdown)throw Object.assign(Error('Suggestion changed'),{code:'conflict'});
  return (source.slice(0,item.start)+markdown.trim()+source.slice(item.end)).trim();
}
function appendSuggestionItem(source,markdown){return [source.trim(),markdown.trim()].filter(Boolean).join('\n\n');}
module.exports={suggestionItems,replaceSuggestionItem,appendSuggestionItem};
