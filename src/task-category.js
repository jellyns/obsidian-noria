"use strict";
function hex(value){
 const raw=String(value||'').trim(),s=raw.startsWith('#')?raw:'#'+raw;
 return /^#[\da-f]{3}$/i.test(s)?'#'+[...s.slice(1)].map(c=>c+c).join(''):/^#[\da-f]{6}$/i.test(s)?s:'';
}
function taskTags(task={}){
 const raw=String(task.rawText??task.rawLine??task.source?.rawLine??(typeof task.text==='object'?task.text?.raw:task.text)??''),tags=[];
 const add=value=>{const tag=String(value||'').trim().replace(/^#/,'').toLowerCase();if(tag&&!['task','done','todo'].includes(tag)&&!/^tl\/|^timeline\//.test(tag)&&!tags.includes(tag)&&tags.length<6)tags.push(tag);};
 for(const match of raw.matchAll(/(^|\s)#([^\s#]+)/g))add(match[2]);
 for(const tag of Array.isArray(task.tags)?task.tags:[])add(tag);
 return tags;
}
function resolveTaskCategory(task,palette={}){
 const tags=taskTags(task),map=palette.tagColorMap||{};
 const mappedFor=tag=>{const parts=tag.split('/');while(parts.length){const color=hex(map[parts.join('/')]);if(color)return color;parts.pop();}return '';};
 // An explicit category color wins over an incidental, unconfigured first tag.
 const tag=tags.find(tag=>mappedFor(tag))||tags[0]||'';
 if(!tag)return {tag:'',tags,color:'',mappedColor:'',bucket:''};
 const mappedColor=mappedFor(tag),colors=(palette.tagBucketPalette||[]).map(hex).filter(Boolean).slice(0,8);
 let hash=0;for(let i=0;i<tag.length;i++)hash=((hash<<5)-hash+tag.charCodeAt(i))|0;
 const bucket=String(Math.abs(hash)%(colors.length||6)+1),project=tag==='proj'||tag.startsWith('proj/')||tag.startsWith('project');
 return {tag,tags,color:mappedColor||(project?colors[Number(bucket)-1]||'':''),mappedColor,bucket};
}
module.exports={hex,taskTags,resolveTaskCategory};
