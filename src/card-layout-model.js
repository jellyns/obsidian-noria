"use strict";

const PERIODS = ["daily", "weekly", "monthly", "yearly"];
const CARD_IDS = ["tasks", "habits", "record", "review"];
const CARD_SIZES = ["small", "medium", "wide", "full"];
const clone = value => JSON.parse(JSON.stringify(value));
const {normalizeRecordSections}=require('./diary-section-model.js');
const validId = value => typeof value === "string" && (/^[a-z][\w-]*$/i.test(value)||/^note:[\p{L}\p{N}_-]+$/u.test(value)) && !["constructor", "prototype", "__proto__"].includes(value);

function insertCard(order,id,target,after=false){
  if(id===target||!order.includes(id)||!order.includes(target))return [...order];
  const next=order.filter(key=>key!==id);next.splice(next.indexOf(target)+(after?1:0),0,id);return next;
}

function normalizeDiaryCards(value = {}) {
  value=value||{};
  const seen = new Set([...CARD_IDS,'focus']);
  const widgets = (Array.isArray(value?.widgets) ? value.widgets : []).filter(widget => {
    if (!widget || !validId(widget.id) || seen.has(widget.id)) return false;
    seen.add(widget.id); return true;
  }).map(clone);
  const ids = [...CARD_IDS, ...widgets.map(widget => widget.id)];
  const order = Array.isArray(value?.order) ? [...new Set(value.order.map(id=>id==='focus'?'tasks':id).filter(id => ids.includes(id)))] : [];
  for(const id of ["tasks","habits"])if(!order.includes(id))order.push(id);
  // Older layouts only owned the top cards. Keep their relative order and
  // place the newly movable prose before supplementary widgets.
  for(const id of ["record","review"])if(!order.includes(id)){
    const anchor=Math.max(-1,...order.map((key,i)=>CARD_IDS.includes(key)?i:-1));
    order.splice(anchor+1,0,id);
  }
  if(!value?.order)order.splice(0,order.length,...CARD_IDS);
  const cards = Object.fromEntries(ids.map(id => {
    const card = value?.cards?.[id] || (id==='tasks'?value.cards?.focus:null) || {}, widget = widgets.find(item => item.id === id);
    const height = Number(card.height);
    const size = CARD_SIZES.includes(card.size) ? card.size : CARD_SIZES.includes(widget?.size) ? widget.size : ["record","review"].includes(id)?"full":"medium";
    if (widget) widget.size = size;
    return [id, {size, collapsed: card.collapsed === true, hidden: card.hidden === true && !(id==='tasks'&&value.cards?.focus?.hidden===false),
      ...(Number.isFinite(card.span)?{span:require("./card-width.js").clampSpan(card.span)}:{}),
      ...(validId(card.stack)?{stack:card.stack}:{}),
      ...(card.picture?{picture:card.picture}:{}),
      ...(id==='record'&&Array.isArray(card.sections)?{sections:normalizeRecordSections(card.sections)}:{}),
      ...(typeof card.title==="string"&&card.title.trim()?{title:card.title.trim()}:{}),
      height: Number.isFinite(height) && height >= 120 ? Math.min(1200, height) : null}];
  }));
  // Retire the date-dependent recommendation once. Manual widths/order stay;
  // automatic placements become ordinary, stable cards alongside tasks.
  const oldFlow=value.overview;
  const overview=widgets.find(widget=>widget.id===oldFlow?.id&&widget.source==='noria:period-overview');
  if(overview){
    if(oldFlow.width){cards[overview.id].size=overview.size='medium';delete cards[overview.id].span;}
    if(oldFlow.position){const at=order.indexOf(overview.id);if(at>=0)order.splice(at,1);order.splice(order.indexOf('tasks')+1,0,overview.id);}
  }
  return {...require('./card-composition.js').normalizeComposition([...new Set([...order,...ids])],cards),widgets};
}

function overviewDiaryLayout(value = {}) {
  const next = normalizeDiaryCards(value);
  let widget = next.widgets.find(item => item.source === "noria:period-overview" && (!item.props?.scope || item.props.scope === "follow"));
  if (!widget) {
    let id = "period-overview", suffix = 2;
    while (next.order.includes(id)) id = `period-overview-${suffix++}`;
    widget = {id, type:"extension", schemaVersion:3, source:"noria:period-overview", enabled:true, size:"medium", props:{scope:"follow"}};
    next.widgets.push(widget);
    next.cards[id] = {size:"medium", hidden:false, collapsed:false, height:null};
  }
  widget.enabled = true;
  widget.props = {...widget.props, scope:"follow"};
  Object.assign(next.cards[widget.id], {size:"medium", hidden:false, collapsed:false});
  delete next.cards[widget.id].span;
  // An overview supplements the action cards; it never replaces them.
  next.cards.tasks.hidden = false;
  const leading = ["tasks",widget.id,"habits","record","review"];
  next.order = [...leading, ...next.order.filter(id => !leading.includes(id))];
  return normalizeDiaryCards(next);
}

function defaultDiaryCards() {return overviewDiaryLayout();}

function changeDiaryCardLayout(layout, id, action, value, visibleIds) {
  const next = normalizeDiaryCards(layout);
  if (action === "reset") return normalizeDiaryCards({widgets: next.widgets.map(widget => ({...widget,size:"medium"}))});
  if (!next.order.includes(id)) return next;
  if(['stack','unstack','reorder','width'].includes(action)){
    if(value?.target&&!(visibleIds||next.order).includes(value.target))return next;
    return {...next,...require('./card-composition.js').changeComposition(next,id,action,value)};
  }
  if (action === "size" && CARD_SIZES.includes(value)) {
    next.cards[id].size = value;delete next.cards[id].span;
    if(next.cards[id].stack)return {...next,...require('./card-composition.js').changeComposition(next,id,'width',require('./card-width.js').cardSpan(next.cards[id]))};
  }
  if (action === "collapsed" || action === "hidden") next.cards[id][action] = value === true;
  if (action === "height") next.cards[id].height = Number(value) >= 120 ? Math.min(1200, Number(value)) : null;
  if (action === "picture" && (!value || require("./picture-model.js").validPicture(value))) next.cards[id].picture = value;
  if (action === "move" && ["up", "down"].includes(value)) {
    const visible = next.order.filter(key => (visibleIds || next.order).includes(key));
    const at = visible.indexOf(id), target = at + (value === "up" ? -1 : 1);
    if (at >= 0 && target >= 0 && target < visible.length) {
      return {...next,...require('./card-composition.js').changeComposition(next,id,'reorder',{target:visible[target],after:value==='down',keepStack:true})};
    }
  }
  return next;
}

function normalizePeriodLayouts(value = {}) {
  const periods = {};
  for (const mode of PERIODS) if (value?.periods?.[mode]) periods[mode] = normalizeDiaryCards(value.periods[mode]);
  const seen = new Set();
  const legacy = (Array.isArray(value?.legacy) ? value.legacy : []).filter(item => item?.layout).map((item, index) => ({
    id: String(item.id || `legacy-${index}`), label: String(item.label || ""), layout: normalizeDiaryCards(item.layout)
  })).filter(item => {const key = JSON.stringify(item.layout); if (seen.has(key)) return false; seen.add(key); return true;});
  const previousLayouts = (Array.isArray(value?.previousLayouts) ? value.previousLayouts : [])
    .filter(item => item?.layout).map(item => ({id:String(item.id),label:String(item.label || ""),layout:normalizeDiaryCards(item.layout)}));
  return {version: 1, periods, legacy, ...(previousLayouts.length ? {previousLayouts} : {}),
    ...(value?.notes&&typeof value.notes==='object'?{notes:clone(value.notes)}:{})};
}

function migrateDiaryLayouts(value, candidates = []) {
  const next = normalizePeriodLayouts(value);
  if (PERIODS.every(mode => next.periods[mode])) return next;
  const merged = normalizePeriodLayouts({...next, legacy: [...next.legacy, ...candidates]}).legacy;
  if (merged.length > 1) return {...next, legacy: merged};
  const layout = merged[0]?.layout;
  for (const mode of PERIODS) if (!next.periods[mode]) next.periods[mode] = layout ? clone(layout) : defaultDiaryCards(mode);
  next.legacy = [];
  return next;
}

function chooseLegacyLayout(value, id) {
  const next = normalizePeriodLayouts(value);
  const source = next.legacy.find(item => item.id === id);
  if (!source) throw new Error("layout-choice-missing");
  for (const mode of PERIODS) if (!next.periods[mode]) next.periods[mode] = clone(source.layout);
  // Keep the unchosen layouts recoverable without leaving two live owners.
  return {...next, legacy: [], previousLayouts: clone(next.legacy)};
}

module.exports = {insertCard,PERIODS, CARD_IDS, CARD_SIZES, normalizeDiaryCards, changeDiaryCardLayout, normalizePeriodLayouts,
  migrateDiaryLayouts, chooseLegacyLayout, overviewDiaryLayout, defaultDiaryCards};
