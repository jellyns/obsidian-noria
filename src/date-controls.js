"use strict";
const {setIcon} = require('obsidian');
const model = require('./date-control-model.js');

function button(host, label, icon, action) {
  const b = host.createEl('button',{cls:'noria-control-button',attr:{type:'button','aria-label':label,title:label}});
  if (icon) setIcon(b,icon); else b.setText(label);
  b.onclick = action; return b;
}
function bindSegments(group) {
  group.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    const items=[...group.querySelectorAll('button')].filter(b=>!b.disabled),i=items.indexOf(e.target);if(i<0)return;
    const n=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowLeft'?-1:1)+items.length)%items.length;
    e.preventDefault();items[n]?.focus();items[n]?.click();
  });
}
// Popovers belong to the invoking pane, even when mounted outside clipped cards.
function openPopover(anchor, render, label) {
  const doc = anchor.ownerDocument, win = doc.defaultView;
  const panel = doc.body.createDiv({cls:'noria-date-popover',attr:{role:'dialog','aria-label':label}});
  anchor.setAttribute('aria-expanded','true'); let closed = false;
  function close(focus = false) {
    if (closed) return; closed = true;
    panel.remove(); observer.disconnect(); resize.disconnect();
    doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', key, true);
    doc.removeEventListener('focusin', focusOut); win.removeEventListener('resize', position); doc.removeEventListener('scroll', position, true);
    anchor.setAttribute('aria-expanded','false'); if (focus && anchor.isConnected) anchor.focus({preventScroll:true});
  }
  function position() {
    if (!anchor.isConnected) { close(); return; }
    const a = anchor.getBoundingClientRect(), pane = anchor.closest('.workspace-leaf-content')?.getBoundingClientRect();
    const left = Math.max(8, pane?.left || 0), right = Math.min(win.innerWidth - 8, pane?.right || win.innerWidth - 8);
    panel.style.maxWidth = Math.max(0, right-left) + 'px';
    const width = panel.offsetWidth, height = panel.offsetHeight;
    panel.style.left = Math.max(left, Math.min(a.left, right-width))+'px';
    panel.style.top = Math.max(8, Math.min(a.bottom+6, win.innerHeight-height-8))+'px';
  }
  const outside = e => {if (!panel.contains(e.target) && !anchor.contains(e.target)) close();};
  const focusOut = e => {if (!panel.contains(e.target) && !anchor.contains(e.target)) close();};
  const key = e => {if (e.key==='Escape') {e.preventDefault();e.stopPropagation();close(true);}};
  const observer = new win.MutationObserver(()=>{if(!anchor.isConnected)close();}); observer.observe(doc.body,{childList:true,subtree:true});
  const resize = new win.ResizeObserver(position); resize.observe(panel);
  doc.addEventListener('pointerdown',outside,true); doc.addEventListener('keydown',key,true); doc.addEventListener('focusin',focusOut);
  win.addEventListener('resize',position); doc.addEventListener('scroll',position,true);
  render(panel, close); position();
  (panel.querySelector('[aria-current="date"]')||panel.querySelector('input,button'))?.focus({preventScroll:true});
  return close;
}
function openDatePicker(anchor, options) {
  const zh = !options.locale || options.locale.startsWith('zh'), kind = options.kind || 'day';
  const now = new Date(), today = options.today || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  let value = model.date(options.value) ? options.value : today, cursor=value.slice(0,7)+'-01', view=kind;
  return openPopover(anchor,(panel,close)=>{
    const nav=panel.createDiv({cls:'noria-date-picker-nav'});
    const prev=button(nav,zh?'向前浏览':'Browse previous','chevron-left',()=>browse(-1));
    const title=button(nav,'',null,()=>{view=view==='day'?'month':view==='month'?'year':kind;paint();});
    const next=button(nav,zh?'向后浏览':'Browse next','chevron-right',()=>browse(1));
    const grid=panel.createDiv({cls:'noria-date-picker-grid',attr:{role:'group','aria-label':zh?'选择日期':'Choose date'}});
    function browse(n) {cursor=model.shiftDate(cursor,view==='day'?'month':'year',n*(view==='year'?12:1));paint();}
    function choose(v) {
      if(view==='year' && kind!=='year'){cursor=v;view='month';paint();return;}
      if(view==='month' && kind==='day'){cursor=v;view='day';paint();return;}
      close(true);options.onSelect(v);
    }
    function paint() {
      const restore=grid.contains(panel.ownerDocument.activeElement);
      const d=model.date(cursor), year=d.getUTCFullYear(), month=d.getUTCMonth(), startYear=Math.floor(year/12)*12;
      title.setText(view==='day'?model.rangeLabel(cursor,cursor,'month',options.locale||'zh'):view==='month'?String(year):`${startYear}–${startYear+11}`);
      title.setAttribute('aria-label',title.textContent+' · '+(zh?'选择月份或年份':'Choose month or year'));
      grid.empty(); grid.dataset.view=view;
      let items=[];
      if(view==='day'){
        for(const day of zh?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'])grid.createSpan({cls:'noria-date-weekday',text:day});
        const first=model.shiftDate(cursor,'day',-((d.getUTCDay()+6)%7));
        items=Array.from({length:42},(_,i)=>{const v=model.shiftDate(first,'day',i);return [v,String(Number(v.slice(-2))),v.slice(0,7)!==cursor.slice(0,7)];});
      } else if(view==='month') items=Array.from({length:12},(_,i)=>[`${year}-${String(i+1).padStart(2,'0')}-01`,zh?`${i+1}月`:new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,i,1)))]);
      else items=Array.from({length:12},(_,i)=>[`${startYear+i}-01-01`,String(startYear+i)]);
      for(const [v,text,muted] of items){const b=button(grid,text,null,()=>choose(v));b.dataset.date=v;b.classList.toggle('is-adjacent',!!muted);b.setAttribute('aria-label',v);if(v.slice(0,view==='year'?4:view==='month'?7:10)===value.slice(0,view==='year'?4:view==='month'?7:10))b.setAttribute('aria-current','date');}
      if(restore)(grid.querySelector('[aria-current="date"]')||grid.querySelector('button'))?.focus({preventScroll:true});
    }
    grid.onkeydown=e=>{
      const cols=view==='day'?7:3,step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-cols,ArrowDown:cols}[e.key];
      if(!step)return;const items=[...grid.querySelectorAll('button')],i=items.indexOf(panel.ownerDocument.activeElement);if(i<0)return;e.preventDefault();items[Math.max(0,Math.min(items.length-1,i+step))].focus();
    };
    const footer=panel.createDiv({cls:'noria-date-picker-footer'});
    button(footer,zh?'今天':'Today',null,()=>{close(true);options.onSelect(today);});
    if(options.onCustom)button(footer,zh?'自选范围…':'Custom range…',null,()=>{close();options.onCustom(anchor);});
    paint();
  },zh?'选择日期':'Choose date');
}
function openRangePicker(anchor, options) {
  const zh=!options.locale||options.locale.startsWith('zh');
  return openPopover(anchor,(panel,close)=>{
    panel.classList.add('noria-stat-date-panel');
    const fields={};
    for(const key of ['start','end']){
      const row=panel.createEl('label');
      row.createSpan({text:key==='start'?(zh?'开始日期':'Start date'):(zh?'结束日期':'End date')});
      fields[key]=row.createEl('input',{attr:{type:'date',value:options[key]||''}});
    }
    const error=panel.createDiv({cls:'noria-card-error',attr:{role:'alert'}});error.hidden=true;
    const actions=panel.createDiv({cls:'noria-date-picker-footer'});
    const cancel=button(actions,zh?'取消':'Cancel',null,()=>close(true));
    const apply=button(actions,zh?'应用':'Apply',null,async()=>{
      const start=fields.start.value,end=fields.end.value;
      if(!model.date(start)||!model.date(end)||start>end){error.setText(zh?'请选择有效的起止日期':'Choose valid start and end dates');error.hidden=false;return;}
      apply.disabled=true;cancel.disabled=true;error.hidden=true;
      try{if(await options.onApply({start,end})!==false){close(true);return;}error.setText(zh?'未能保存，请重试':'Could not save. Try again.');}
      catch(e){error.setText(String(e?.message||e));}
      finally{apply.disabled=false;cancel.disabled=false;}
      error.hidden=false;
    });
    apply.classList.add('mod-cta');
  },zh?'选择日期范围':'Choose date range');
}
function mountDateNavigation(host, options) {
  const locale=options.locale||'zh',zh=locale.startsWith('zh');
  const root=host.createDiv({cls:'noria-date-navigation',attr:{role:'group','aria-label':zh?'日期导航':'Date navigation'}});
  let state={},close;
  const prev=button(root,zh?'上一周期':'Previous period','chevron-left',()=>options.onShift(-1));
  const date=button(root,zh?'选择日期':'Choose date',null,()=>{
    if(date.getAttribute('aria-expanded')==='true'){close?.(true);close=null;return;}
    close=options.onOpen?options.onOpen(date):openDatePicker(date,{locale,kind:state.period==='month'?'month':state.period==='year'?'year':'day',value:state.anchor||state.start,onSelect:options.onSelect});
  });date.classList.add('noria-date-label');date.setAttribute('aria-haspopup','dialog');
  date.empty();const label=date.createSpan({cls:'noria-date-copy'}),primary=label.createSpan({cls:'noria-date-primary'}),secondary=label.createSpan({cls:'noria-date-secondary'}),chevron=date.createSpan({cls:'noria-date-chevron'});setIcon(chevron,'chevron-down');
  const next=button(root,zh?'下一周期':'Next period','chevron-right',()=>options.onShift(1));
  const current=button(root,zh?'今日':'Today',null,()=>options.onCurrent());current.classList.add('noria-date-current');
  prev.classList.add('noria-date-previous');next.classList.add('noria-date-next');root.append(date,prev,next,current);
  return {root,date,prev,next,current,update(nextState){state=nextState;const heading=model.dateHeading(state.start,state.end,state.period,locale);primary.setText(heading.primary);secondary.setText(heading.secondary);secondary.hidden=!heading.secondary;date.title=state.label||model.rangeLabel(state.start,state.end,state.period,locale);date.setAttribute('aria-label',date.title+' · '+(zh?'选择日期':'Choose date'));current.setText(model.currentLabel(state.period,locale));current.title=zh?'返回'+current.textContent:'Return to '+current.textContent;current.setAttribute('aria-label',current.title);for(const b of [prev,date,next,current])b.disabled=!!state.busy;prev.disabled ||= !!state.disablePrevious;next.disabled ||= !!state.disableNext;root.dataset.period=state.period;},destroy(){close?.();root.remove();}};
}
module.exports={...model,button,bindSegments,openPopover,openDatePicker,openRangePicker,mountDateNavigation};
