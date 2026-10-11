"use strict";
const {scanAtxHeadings}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
const {frontmatter}=require('./record-properties.js');
const {mediaTypes}=require('./media-catalog.js');
const clean=value=>String(value??'').replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'');
const fail=(code,message)=>Object.assign(Error(message),{code});
const title=value=>typeof value==='string'&&!/[\r\n]/.test(value)?value.trim():'';
function contentProfile(plugin,kind){
  const value=plugin.settings?.mediaContent?.[kind]||{},zh=plugin.getNoriaLocale?.()!=='en';
  const sections=[...new Set((Array.isArray(value.sections)?value.sections:[]).map(title).filter(Boolean))];
  return {template:typeof value.template==='string'?value.template:'',intro:title(value.intro)|| (zh?'简介':'Description'),review:title(value.review)||(zh?'评语':'Review'),sections,
    sectionMode:value.sectionMode==='all'?'all':value.sectionMode==='selected'||sections.length?'selected':'all'};
}
// Preserve free prose and source order, including notes without H2 headings.
// Ambiguous headings stay readable; only uniquely named sections are editable here.
function mediaReadingParts(raw,profile,parse){
  const {hit}=frontmatter(raw,parse),body=raw.slice(hit?.[0].length||0);
  if(profile.sectionMode==='selected')return [...new Set([profile.intro,profile.review,...profile.sections])].map(name=>({kind:'section',name}));
  const headings=scanAtxHeadings(body),sections=headings.filter(h=>h.level===2),parts=[];
  let cursor=0;
  for(const h of sections){
    if(h.start>cursor&&body.slice(cursor,h.start).trim())parts.push({kind:'prose',content:body.slice(cursor,h.start)});
    const end=headings.find(next=>next.start>h.start&&next.level<=2)?.start??body.length;
    if(sections.filter(item=>item.title===h.title).length===1)parts.push({kind:'section',name:h.title});
    else parts.push({kind:'prose',content:body.slice(h.start,end)});
    cursor=end;
  }
  if(body.slice(cursor).trim())parts.push({kind:'prose',content:body.slice(cursor)});
  if(!sections.some(h=>h.title===profile.intro))parts.unshift({kind:'section',name:profile.intro});
  if(!sections.some(h=>h.title===profile.review))parts.push({kind:'section',name:profile.review});
  return parts;
}
function sectionTitles(raw){return [...new Set(scanAtxHeadings(raw).filter(h=>h.level===2).map(h=>h.title))];}
function readSection(raw,name){
  const headings=scanAtxHeadings(raw),found=headings.filter(h=>h.level===2&&h.title===name);
  if(found.length>1)throw fail('ambiguous','存在同名章节，请先在作品笔记中区分 / Duplicate section headings; distinguish them in the note');
  const heading=found[0],start=heading?.end??raw.length,end=heading?(headings.find(h=>h.start>heading.start&&h.level<=2)?.start??raw.length):raw.length;
  return {title:name,exists:!!heading,start,end,content:clean(raw.slice(start,end))};
}
function writeSection(raw,binding,draft){
  const current=readSection(raw,binding.title),content=clean(draft);
  if(current.exists!==binding.exists||current.content!==binding.content)throw fail('conflict','这段内容已在别处修改，当前输入已保留，请核对原笔记 / This section changed elsewhere; compare the original before saving');
  if(content===current.content)return raw;
  const probe=scanAtxHeadings('## start\n'+content+'\n## end\n').filter(h=>h.level<=2);
  if(probe.length!==2||probe.at(-1).title!=='end')throw fail('structure','本段可使用三级及以下标题；二级标题或未闭合代码请在原笔记中调整 / Use subheadings inside this section and close code blocks');
  const eol=raw.includes('\r\n')?'\r\n':'\n',body=content.replace(/\n/g,eol);
  const next=current.exists?raw.slice(0,current.start)+eol+body+eol+eol+raw.slice(current.end):raw+(raw.endsWith(eol+eol)?'':raw.endsWith(eol)?eol:eol+eol)+'## '+binding.title+eol+eol+body+eol;
  const check=readSection(next,binding.title);
  if(!check.exists||check.content!==content)throw fail('structure','原文结构无法安全插入章节，请打开作品笔记 / Open the note to resolve its Markdown structure');
  return next;
}
function templateContent(raw,properties,{date,parse}){
  const {value,hit}=frontmatter(raw,parse),types=mediaTypes(value).types,kind=properties.tags[0];
  if(types.some(type=>type!==kind))throw fail('template','模板类型与作品不符 / Template media type does not match');
  const replace=text=>text.replace(/\{\{(title|date)\}\}/g,(_,key)=>key==='title'?properties.title:date||'');
  const substitute=value=>typeof value==='string'?replace(value):Array.isArray(value)?value.map(substitute):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,substitute(v)])):value;
  const tags=Array.isArray(value.tags)?value.tags:typeof value.tags==='string'?value.tags.split(/[ ,]+/).filter(Boolean):[];
  const addedTags=types.includes(kind)?properties.tags.filter(tag=>!mediaTypes({tags:[tag]}).types.includes(kind)):properties.tags;
  const fields={...substitute(value),...properties,tags:[...new Set([...tags,...addedTags])]};
  return '---\n'+Object.entries(fields).map(([key,value])=>`${JSON.stringify(key)}: ${JSON.stringify(value)}`).join('\n')+'\n---\n'+replace(raw.slice(hit?.[0].length||0));
}
async function loadTemplate(plugin,path){
  if(!path||/^[\\/]|^[a-z]:|(^|[\\/])\.\.([\\/]|$)/i.test(path))throw fail('template','请选择库内模板笔记 / Choose a template inside the vault');
  const file=plugin.app.vault.getAbstractFileByPath(plugin.normalizePath(path));
  if(!file||file.extension!=='md')throw fail('template','模板不存在，请重新选择 / Template is missing; choose it again');
  return plugin.app.vault.read(file);
}
module.exports={contentProfile,sectionTitles,readSection,writeSection,templateContent,loadTemplate,mediaReadingParts};
