"use strict";
const {parseDailyState}=require("./runtime/views/dashboard/core/utils/diary-day-blocks.js");
function frontmatter(raw,parse){
  const hit=/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(raw);
  if(!hit){if(/^(?:\uFEFF)?---\r?\n/.test(raw))throw Error("Unclosed frontmatter");return {value:{},hit:null};}
  const value=parse(hit[1]);if(value!=null&&(typeof value!=="object"||Array.isArray(value)))throw Error("Frontmatter must be a mapping");
  return {value:value||{},hit};
}
function readProperty(raw,definition,parse){
  const {value}=frontmatter(raw,parse);
  if(Object.hasOwn(value,definition.property))return value[definition.property];
  if(definition.legacy){const found=parseDailyState(raw)[definition.legacy];if(found!==""&&found!=null)return ["number","level"].includes(definition.type)?Number(found):found;}
  return null;
}
function validateValue(definition,value){
  if(value==null)return null;
  if(["number","level"].includes(definition.type)){
    if(typeof value!=="number"||!Number.isFinite(value))throw Error("Enter a valid number");
    if(definition.type==="level"&&(value<definition.min||value>definition.max||!Number.isInteger(value)))throw Error("Value is outside the scale");
  }else if(definition.type==="toggle"){if(typeof value!=="boolean")throw Error("Choose on or off");}
  else if(typeof value!=="string"||!definition.options.includes(value))throw Error("Choose an available option");
  return value;
}
function writeProperty(raw,definition,value,parse){
  validateValue(definition,value);
  const key=String(definition.property||"").trim();if(!key||/[\r\n]/.test(key)||["__proto__","constructor","prototype"].includes(key))throw Error("Invalid property name");
  const {hit}=frontmatter(raw,parse),eol=raw.includes("\r\n")?"\r\n":"\n";
  const lines=hit?hit[1].split(/\r?\n/):[],matches=[];
  for(let i=0;i<lines.length;i++){
    const m=/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#][^:]*):(?:\s|$)/.exec(lines[i]);if(!m)continue;
    let name=m[1];if(name.startsWith('"'))name=JSON.parse(name);else if(name.startsWith("'"))name=name.slice(1,-1).replace(/''/g,"'");
    if(name.trim()===key)matches.push(i);
  }
  if(matches.length>1)throw Error("Duplicate property; resolve it in the source note");
  // Null is an explicit cleared value. It also masks an older inline value without rewriting history.
  const line=`${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  if(matches.length){const start=matches[0];let end=start+1;while(end<lines.length&&/^(?:[ \t]+\S|\s*-\s)/.test(lines[end]))end++;lines.splice(start,end-start,line);}
  else lines.push(line);
  const body=hit?raw.slice(hit[0].length):raw;
  return `---${eol}${lines.join(eol)}${eol}---${eol}`+body;
}
module.exports={frontmatter,readProperty,writeProperty,validateValue};
