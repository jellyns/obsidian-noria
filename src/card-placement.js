"use strict";
const clone=value=>JSON.parse(JSON.stringify(value));
function homeCopy(widget){
  const copy=clone(widget);
  if(copy.type==='builtin')copy.builtinId=copy.builtinId||copy.id;
  delete copy.replaces;
  copy.id=`card-${globalThis.crypto.randomUUID()}`;copy.enabled=true;copy.collapsed=false;
  copy.layout={...(copy.layout||{})};delete copy.layout.stack;
  copy.order=Date.now();
  return copy;
}
// Compare content and display choices, not independently owned placement geometry.
function contentKey(widget){
  const props=clone(widget.props||{});delete props.cardHeight;delete props.lazy;delete props.cardContent;
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
  return JSON.stringify(sorted({type:widget.type,builtinId:widget.type==='builtin'?(widget.builtinId||widget.id):undefined,source:widget.source,title:widget.title||'',props}));
}
function homeMatch(widgets,widget){const key=contentKey(widget);return widgets.find(item=>contentKey(item)===key&&item.enabled!==false)||widgets.find(item=>contentKey(item)===key);}
function forgetWidget(page,id){
  page.widgets=page.widgets.filter(widget=>widget.id!==id);
  if(page.statisticsView){page.statisticsView.pinned=page.statisticsView.pinned?.filter(key=>key!==id)||[];if(page.statisticsView.placement)delete page.statisticsView.placement[id];}
}
module.exports={homeCopy,homeMatch,contentKey,forgetWidget};
