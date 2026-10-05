"use strict";

const PERIODS = ["daily", "weekly", "monthly", "yearly"];
const CARD_IDS = ["focus", "tasks", "habits"];
const CARD_SIZES = ["small", "medium", "wide", "full"];
const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === "string" && /^[a-z][\w-]*$/i.test(value) && !["constructor", "prototype", "__proto__"].includes(value);

function insertCard(order,id,target,after=false){
  if(id===target||!order.includes(id)||!order.includes(target))return [...order];
  const next=order.filter(key=>key!==id);next.splice(next.indexOf(target)+(after?1:0),0,id);return next;
}

function normalizeDiaryCards(value = {}) {
  const seen = new Set(CARD_IDS);
  const widgets = (Array.isArray(value?.widgets) ? value.widgets : []).filter(widget => {
    if (!widget || !validId(widget.id) || seen.has(widget.id)) return false;
    seen.add(widget.id); return true;
  }).map(clone);
  const ids = [...CARD_IDS, ...widgets.map(widget => widget.id)];
  const order = Array.isArray(value?.order) ? value.order.filter(id => ids.includes(id)) : [];
  const cards = Object.fromEntries(ids.map(id => {
    const card = value?.cards?.[id] || {}, widget = widgets.find(item => item.id === id);
    const height = Number(card.height);
    const size = CARD_SIZES.includes(card.size) ? card.size : CARD_SIZES.includes(widget?.size) ? widget.size : "medium";
    if (widget) widget.size = size;
    return [id, {size, collapsed: card.collapsed === true, hidden: card.hidden === true,
      ...(card.picture?{picture:card.picture}:{}),
      height: Number.isFinite(height) && height >= 120 ? Math.min(1200, height) : null}];
  }));
  return {
    order: [...new Set([...order, ...ids])],
    cards,
    widgets
  };
}

function changeDiaryCardLayout(layout, id, action, value, visibleIds) {
  const next = normalizeDiaryCards(layout);
  if (action === "reset") return normalizeDiaryCards({widgets: next.widgets.map(widget => ({...widget,size:"medium"}))});
  if (!next.order.includes(id)) return next;
  if (action === "size" && CARD_SIZES.includes(value)) next.cards[id].size = value;
  if (action === "collapsed" || action === "hidden") next.cards[id][action] = value === true;
  if (action === "height") next.cards[id].height = Number(value) >= 120 ? Math.min(1200, Number(value)) : null;
  if (action === "picture" && (!value || require("./picture-model.js").validPicture(value))) next.cards[id].picture = value;
  if(action==="reorder"&&(visibleIds||next.order).includes(value?.target))next.order=insertCard(next.order,id,value.target,value.after);
  if (action === "move" && ["up", "down"].includes(value)) {
    const visible = next.order.filter(key => (visibleIds || next.order).includes(key));
    const at = visible.indexOf(id), target = at + (value === "up" ? -1 : 1);
    if (at >= 0 && target >= 0 && target < visible.length) {
      const from = next.order.indexOf(id), to = next.order.indexOf(visible[target]);
      [next.order[from], next.order[to]] = [next.order[to], next.order[from]];
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
  return {version: 1, periods, legacy, ...(previousLayouts.length ? {previousLayouts} : {})};
}

function migrateDiaryLayouts(value, candidates = []) {
  const next = normalizePeriodLayouts(value);
  if (PERIODS.every(mode => next.periods[mode])) return next;
  const merged = normalizePeriodLayouts({...next, legacy: [...next.legacy, ...candidates]}).legacy;
  if (merged.length > 1) return {...next, legacy: merged};
  const layout = merged[0]?.layout || normalizeDiaryCards();
  for (const mode of PERIODS) if (!next.periods[mode]) next.periods[mode] = clone(layout);
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
  migrateDiaryLayouts, chooseLegacyLayout};
