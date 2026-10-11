"use strict";
const {cardSpan,clampSpan}=require('./card-width.js');

// A stack is a one-level relationship between existing cards, never a new card.
function normalizeComposition(order,cards){
  order=[...new Set(order.filter(id=>Object.hasOwn(cards,id)))];
  const next=Object.fromEntries(order.map(id=>[id,{...cards[id]}])),groups=new Map();
  for(const id of order){const key=next[id].stack;if(typeof key==='string'&&key){
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(id);
  }else delete next[id].stack;}
  const members=new Map();
  for(const ids of groups.values()){
    if(ids.length<2){delete next[ids[0]].stack;continue;}
    const key=ids[0];for(const id of ids){next[id].stack=key;members.set(id,ids);}
  }
  const seen=new Set(),sorted=[];
  for(const id of order)for(const member of members.get(id)||[id])if(!seen.has(member)){seen.add(member);sorted.push(member);}
  return {order:sorted,cards:next};
}
function changeComposition(layout,id,action,value={}){
  const next=normalizeComposition(layout.order,layout.cards),{cards}=next;
  if(!cards[id])return next;
  const members=key=>cards[key]?.stack?next.order.filter(item=>cards[item].stack===cards[key].stack):[key];
  if(action==='width'){
    for(const key of members(id))cards[key].span=clampSpan(value);return next;
  }
  if(action==='unstack'){
    const group=members(id);if(group.length<2)return next;
    // Retain the remaining group's identity when its former first card leaves.
    for(const key of group.filter(key=>key!==id))cards[key].stack=group.find(key=>key!==id);
    delete cards[id].stack;
    next.order=next.order.filter(key=>key!==id);
    next.order.splice(next.order.indexOf(group.filter(key=>key!==id).at(-1))+1,0,id);
  }else if(['stack','reorder'].includes(action)){
    const {target,after=false}=value;if(id===target||!cards[target])return next;
    const origin=members(id),destination=members(target);
    if(action==='reorder'&&origin.includes(target)&&value.keepStack){
      next.order=next.order.filter(key=>key!==id);next.order.splice(next.order.indexOf(target)+(after?1:0),0,id);
    }else{
      for(const key of origin.filter(key=>key!==id))cards[key].stack=origin.find(key=>key!==id);
      delete cards[id].stack;
      next.order=next.order.filter(key=>key!==id);
      if(action==='stack'){
        const group=destination.filter(key=>key!==id),anchor=group[0];
        for(const key of [...group,id]){cards[key].stack=anchor;cards[key].span=cardSpan(cards[target]);}
        next.order.splice(next.order.indexOf(target)+(after?1:0),0,id);
      }else{
        const group=destination.filter(key=>key!==id),edge=after?group.at(-1):group[0];
        next.order.splice(next.order.indexOf(edge)+(after?1:0),0,id);
      }
    }
  }
  return normalizeComposition(next.order,cards);
}
function widgetComposition(widgets){
  const sorted=[...widgets].sort((a,b)=>(a.order||0)-(b.order||0));
  return normalizeComposition(sorted.map(w=>w.id),Object.fromEntries(sorted.map(w=>[w.id,{...w.layout,size:w.size}])));
}
function composeWidgets(widgets,id,action,value){
  const next=changeComposition(widgetComposition(widgets),id,action,value);
  return next.order.map((key,index)=>{const widget=widgets.find(w=>w.id===key),state=next.cards[key],layout={...widget.layout};
    delete layout.stack;if(state.stack)layout.stack=state.stack;if(state.span!=null)layout.span=state.span;
    return {...widget,order:(index+1)*10,...(widget.layout||Object.keys(layout).length?{layout}:{})};
  });
}
module.exports={normalizeComposition,changeComposition,widgetComposition,composeWidgets};
