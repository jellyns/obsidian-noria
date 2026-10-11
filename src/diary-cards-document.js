"use strict";
const {scanMarkdownLines,withoutDiaryCardViews}=require('./runtime/views/dashboard/core/utils/diary-day-blocks.js');
const {normalizeDiaryCards}=require('./card-layout-model.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const VIEW='diary-cards',PREFIX='note:';
const localId=id=>String(id).startsWith(PREFIX);
function cardDefinition(value){
  const {layout,size,order,enabled,type,...card}=clone(value);
  if(type&&type!=='extension')card.type=type;
  return card;
}

// A note owns only its added cards. Shared cards never get copied into the note.
function readNoteCards(raw){
  const blocks=[];let opening;
  for(const row of scanMarkdownLines(raw)){
    if(row.fenceStart)opening=row;
    if(!row.fenceEnd||!opening)continue;
    if(opening.fenceLanguage==='noria-view'){
      const source=raw.slice(opening.end,row.start);let payload;
      try{payload=JSON.parse(source);}catch(_){
        if(/"view"\s*:\s*"diary-cards"/.test(source))throw Error('日记卡片配置格式有误 / Invalid diary card configuration');
      }
      if(payload?.view===VIEW)blocks.push({start:opening.start,end:row.end,payload});
    }opening=null;
  }
  if(opening?.fenceLanguage==='noria-view'&&/"view"\s*:\s*"diary-cards"/.test(raw.slice(opening.end)))throw Error('日记卡片代码块未结束 / Unclosed diary card block');
  if(blocks.length>1)throw Error('请将本篇卡片放在同一个 diary-cards 块中 / Use one diary-cards block per note');
  const block=blocks[0],props=block?.payload.props||{},items=props.cards??[],ids=new Set();
  if(!Array.isArray(items))throw Error('cards 应为列表 / cards must be a list');
  for(const item of items){
    if(!item||typeof item.id!=='string'||! /^[\p{L}\p{N}_-]+$/u.test(item.id)||ids.has(item.id)||typeof item.source!=='string'||!item.source.trim())throw Error('每张卡片需要不同的名称标识与来源 / Each card needs a unique id and source');
    ids.add(item.id);
  }
  return {block,props,items:clone(items)};
}
function noteCardsLayout(shared,items){
  const layout=normalizeDiaryCards(shared);
  let previous='tasks';
  for(const item of items){
    const id=PREFIX+item.id,{layout:state,...widget}=item;
    layout.widgets.push({...widget,id,type:widget.type||'extension',size:state?.size||widget.size||'medium'});
    layout.cards[id]={...state,size:state?.size||widget.size||'medium'};
    const after=state?.after===undefined?previous:state.after,index=layout.order.indexOf(after);
    layout.order.splice(after===null?0:index<0?layout.order.length:index+1,0,id);
    previous=id;
    if(item.replaces&&layout.cards[item.replaces]){
      layout.cards[id]={...layout.cards[item.replaces],...state,hidden:false};
      layout.cards[item.replaces].hidden=true;
      layout.order=layout.order.filter(key=>key!==id);
      layout.order.splice(layout.order.indexOf(item.replaces)+1,0,id);
    }
  }
  return normalizeDiaryCards(layout);
}
function addNoteCard(items,widget){
  const next=clone(items),{id:ignored,order,enabled,...card}=clone(widget);
  const base=String(card.title||card.source.split(':').pop()||'card').trim().replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,60)||'card';
  let id=base,n=2;while(next.some(c=>c.id===id))id=base+'-'+n++;
  next.push({...card,id});return next;
}
function editNoteCard(items,widget,expected){
  const next=clone(items),id=widget.id.slice(PREFIX.length),index=next.findIndex(c=>c.id===id);
  if(index<0)throw Error('此卡片已从本篇设置移除 / This card was removed from this note’s settings');
  if(expected&&JSON.stringify(next[index])!==JSON.stringify(expected))throw Error('本篇卡片设置已改变，请重新打开设置 / This note’s card settings changed; reopen settings');
  const {id:ignored,layout:ignoredLayout,...card}=clone(widget);
  next[index]={...next[index],...card,id};return next;
}
function withoutNoteCards(raw){
  try{readNoteCards(raw);return withoutDiaryCardViews(raw);
  }catch(_){return raw;} // Invalid source remains visible and is never rewritten.
}
module.exports={VIEW,PREFIX,localId,readNoteCards,noteCardsLayout,addNoteCard,editNoteCard,cardDefinition,withoutNoteCards};
