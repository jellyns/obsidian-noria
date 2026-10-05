"use strict";
// Shared default record artwork; every identifier can also be chosen in the picture picker.
const pictures={},names={};
function add(id,zh,en,body){pictures[id]=body;names[id]=[zh,en];}
const face=(mouth,eyes='<path d="M8.5 9.5h.01m7 0h.01" stroke-width="2.6"/>')=>`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".12"/><circle cx="12" cy="12" r="9"/>${eyes}<path d="${mouth}"/>`;
add('noria-mood','心情','Mood',face('M8 15q4 3 8 0'));
['M8 16q4-4 8 0','M9 15.5q3-2 6 0','M9 15h6','M8 14.5q4 4 8 0','M7.5 13.5q4.5 7 9 0Z'].forEach((mouth,i)=>add(`noria-mood-${i+1}`,['很差','偏低','一般','稳定','很好'][i],['Very low','Low','Okay','Steady','Great'][i],face(mouth)));
function energy(level){
 const lit=level==null?0:Math.min(8,level*2),rays=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return `<path d="M${12+8*Math.cos(a)} ${12+8*Math.sin(a)}l${2*Math.cos(a)} ${2*Math.sin(a)}" opacity="${i<lit?1:.2}"/>`;}).join('');
 return `<circle cx="12" cy="12" r="5" fill="currentColor" fill-opacity="${level==null?.06:.12+level*.07}"/><circle cx="12" cy="12" r="5"/>${rays}${level===5?'<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>':''}`;
}
add('noria-energy','精力','Energy',energy(null));
for(let n=1;n<=5;n++)add(`noria-energy-${n}`,`精力 ${n}`,`Energy ${n}`,energy(n));
function focus(level){
 const ring='<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".06"/>';
 if(level==null)return ring+'<circle cx="12" cy="12" r="5" opacity=".4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>';
 const shift=(4-level)*1.4;
 return ring+`<circle cx="12" cy="12" r="5" opacity="${.25+level*.18}"/><circle cx="${12-shift}" cy="${12+shift}" r="${1+level*.3}" fill="currentColor" stroke="none"/>`;
}
add('noria-focus','专注','Focus',focus(null));
for(let n=1;n<=4;n++)add(`noria-focus-${n}`,['难进入状态','易分心','基本专注','很专注'][n-1],`Focus ${n}`,focus(n));
function renderRecordPicture(host,id){
 if(!pictures[id])return false;
 const svg=host.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',class:'svg-icon noria-record-art'}))svg.setAttribute(key,value);
 svg.innerHTML=pictures[id];host.append(svg);return true;
}
module.exports={pictures,names,renderRecordPicture};
