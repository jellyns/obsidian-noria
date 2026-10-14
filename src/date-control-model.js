"use strict";
const iso = d => d.toISOString().slice(0, 10);
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(+d) && iso(d) === value ? d : null;
}
function shiftDate(value, period, amount) {
  const d = date(value); if (!d) return value;
  if (period === 'month' || period === 'year') {
    const day = d.getUTCDate(); d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + amount * (period === 'year' ? 12 : 1));
    const end = new Date(+d); end.setUTCMonth(end.getUTCMonth() + 1, 0);
    d.setUTCDate(Math.min(day, end.getUTCDate()));
  } else d.setUTCDate(d.getUTCDate() + amount * (period === 'week' ? 7 : period === 'last30' ? 30 : 1));
  return iso(d);
}
function periodRange(period, anchor) {
  const d = date(anchor); if (!d) return null;
  let start = new Date(+d), end = new Date(+d);
  if (period === 'week') { start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); end = new Date(+start); end.setUTCDate(end.getUTCDate() + 6); }
  if (period === 'month') { start.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1, 0); }
  if (period === 'year') { start.setUTCMonth(0, 1); end.setUTCMonth(11, 31); }
  if (period === 'last30') start.setUTCDate(start.getUTCDate() - 29);
  return {start: iso(start), end: iso(end)};
}
function rangeLabel(start, end = start, period = 'day', locale = 'zh') {
  if (!date(start) || !date(end)) return '';
  const zh = locale.startsWith('zh'), [y,m,d] = start.split('-').map(Number);
  if (period === 'year') return zh ? `${y}年` : String(y);
  if (period === 'month') return zh ? `${y}年${m}月` : new Intl.DateTimeFormat('en',{year:'numeric',month:'short',timeZone:'UTC'}).format(date(start));
  if (start === end) return zh ? `${y}年${m}月${d}日` : new Intl.DateTimeFormat('en',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(date(start));
  const tail = start.slice(0,4) === end.slice(0,4) ? end.slice(5) : end;
  return start + ' – ' + tail;
}
const currentLabel = (period, locale = 'zh') => locale.startsWith('zh') ? ({day:'今天',week:'本周',month:'本月',year:'今年',last30:'最近',custom:'今天'}[period] || '今天') : ({day:'Today',week:'This week',month:'This month',year:'This year',last30:'Latest',custom:'Today'}[period] || 'Today');
function dateHeading(start, end = start, period = 'day', locale = 'zh') {
  const a=date(start), b=date(end); if(!a||!b)return {primary:'',secondary:''};
  const zh=locale.startsWith('zh'),y=a.getUTCFullYear(),ey=b.getUTCFullYear(),m=a.getUTCMonth()+1,em=b.getUTCMonth()+1,d=a.getUTCDate(),ed=b.getUTCDate();
  const month = value => new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(value);
  if(period==='year')return {primary:rangeLabel(start,end,period,locale),secondary:''};
  if(period==='month')return {primary:zh?`${m}月`:month(a),secondary:String(y)};
  if(period==='day'||start===end)return {primary:zh?`${m}月${d}日`:`${month(a)} ${d}`,secondary:new Intl.DateTimeFormat(zh?'zh-CN':'en',{weekday:'short',timeZone:'UTC'}).format(a)+' · '+y};
  if(period==='week')return {
    primary:y!==ey?`${y}–${ey}`:zh?(m===em?`${y}年${m}月`:`${y}年`):(m===em?`${month(a)} ${y}`:String(y)),
    secondary:y===ey&&m===em?`${d}–${ed}${zh?'日':''}`:`${m}/${d}–${em}/${ed}`
  };
  return {primary:y===ey?`${m}/${d}–${em}/${ed}`:`${y}/${m}/${d}–${ey}/${em}/${ed}`,secondary:y===ey?String(y):''};
}
module.exports = {date,shiftDate,periodRange,rangeLabel,currentLabel,dateHeading};
