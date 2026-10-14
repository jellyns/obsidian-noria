"use strict";
const {normalizeDiaryCards}=require('./card-layout-model.js');
const clone=value=>JSON.parse(JSON.stringify(value));

// Extract presentation independently of the note's chosen card definitions.
function presentation(layout){
  const normalized=normalizeDiaryCards(layout);
  return {order:normalized.order,cards:normalized.cards,...(layout.deleted?.length?{deleted:[...layout.deleted]}:{})};
}
function applyPresentation(layout,saved){
  if(!saved)return layout;
  const order=[...(saved.order||[]).filter(id=>layout.order.includes(id))];
  for(const id of layout.order)if(!order.includes(id)){
    const preceding=layout.order.slice(0,layout.order.indexOf(id)).reverse().find(key=>order.includes(key));
    order.splice(preceding?order.indexOf(preceding)+1:0,0,id);
  }
  const cards=Object.fromEntries(layout.order.map(id=>[id,{...layout.cards[id],...saved.cards?.[id]}]));
  for(const widget of layout.widgets)if(widget.replaces&&cards[widget.replaces])cards[widget.replaces].hidden=true;
  const deleted=saved.deleted||[];
  for(const id of deleted)if(cards[id])cards[id]={hidden:true};
  return {...normalizeDiaryCards({...layout,widgets:layout.widgets.filter(widget=>!deleted.includes(widget.id)),order,cards}),deleted};
}
function renamedNotes(notes,oldPath,newPath){
  return Object.fromEntries(Object.entries(notes||{}).map(([path,value])=>[
    path===oldPath?newPath:path.startsWith(oldPath+'/')?newPath+path.slice(oldPath.length):path,clone(value)
  ]));
}
module.exports={presentation,applyPresentation,renamedNotes};
