"use strict";
const {MarkdownRenderChild,moment}=require('obsidian');
const {readNoteCards,noteCardsLayout}=require('./diary-cards-document.js');

async function selectionForNote(plugin,path,props){
  const modes=['daily','weekly','monthly','yearly'];
  const name=path.split('/').at(-1).replace(/\.md$/i,'');
  const inferred=/^\d{4}-\d{2}-\d{2}(?: |$)/.test(name)?'daily':/^\d{4}-W\d{2}(?: |$)/.test(name)?'weekly':/^\d{4}-\d{2}(?: |$)/.test(name)?'monthly':/^\d{4}(?: |$)/.test(name)?'yearly':null;
  const mode=modes.includes(props.mode)?props.mode:inferred;
  if(!mode)throw Error(plugin.cards.text('无法识别笔记周期，请设置 mode 和 date','Cannot determine note period; set mode and date'));
  if(props.date)return plugin.resolveReviewSelection({mode,anchorDate:props.date});
  const formats=[plugin.getCalendarPatternForPeriod(mode).replace(/\.md$/i,''),{daily:'YYYY-MM-DD',weekly:'GGGG-[W]WW',monthly:'YYYY-MM',yearly:'YYYY'}[mode]];
  if(mode==='daily'&&plugin.getCalendarSettings().calendarIntegrationMode==='daily-notes')formats.unshift((await plugin.readDailyNotesPluginConfig()).format);
  const parse=moment||globalThis.moment;
  for(const format of formats){
    const tokens=format.replace(/\[[^\]]*\]/g,''),day=(/M/.test(tokens)&&/D/.test(tokens))||/DDD/.test(tokens);
    // Moment otherwise fills missing date parts from today. A reusable block
    // must identify the whole period, including a year stored in a folder.
    if(!/(?:YYYY|GGGG|gggg)/.test(tokens)||mode==='daily'&&!day||mode==='weekly'&&!day&&!/[Ww]/.test(tokens)||mode==='monthly'&&!day&&!/M/.test(tokens))continue;
    const candidate=path.replace(/\.md$/i,'').split('/').slice(-format.split('/').length).join('/');
    const date=parse(candidate,format,true);
    if(date.isValid())return plugin.resolveReviewSelection({mode,anchorDate:date.format('YYYY-MM-DD')});
  }
  throw Error(plugin.cards.text('无法从文件名识别日期，可在卡片块中设置 date','Cannot read the date from this filename; set date in the card block'));
}

async function renderNoteCards(plugin,props,el,ctx){
  if(el.closest('.noria-note-cards')){el.createDiv({cls:'noria-card-error',text:plugin.cards.text('不重复嵌入本篇卡片','Recursive note cards are not embedded')});return;}
  const child=new MarkdownRenderChild(el);ctx.addChild(child);let serial=0,disposed=false,cleanups=[];
  const clear=()=>{cleanups.forEach(fn=>fn());cleanups=[];};
  child.register(()=>{disposed=true;++serial;clear();});
  const paint=async()=>{
    const token=++serial;clear();el.empty();
    try{
      const selection=await selectionForNote(plugin,ctx.sourcePath,props);
      await plugin.cards.ready;if(disposed||token!==serial)return;
      const items=plugin.cards.noteItems(ctx.sourcePath,readNoteCards('```noria-view\n'+JSON.stringify({view:'diary-cards',props})+'\n```').items);
      const layout=plugin.cards.noteLayout(ctx.sourcePath,noteCardsLayout(plugin.cards.layout(selection.mode),items));
      const widgets=layout.widgets.filter(w=>w.id.startsWith('note:')||props.shared===true);
      const grid=el.createDiv({cls:'noria-note-cards'});
      for(const id of layout.order){
        const widget=widgets.find(w=>w.id===id),state=layout.cards[id];if(!widget||state.hidden)continue;
        const host=grid.createEl('details',{cls:'noria-note-card noria-diary-card dashboard-guide-card'});host.open=!state.collapsed;
        host.style.setProperty('--noria-note-card-span',String(state.span||({small:3,medium:6,wide:8,full:12}[state.size])||6));
        const head=host.createEl('summary',{cls:'dashboard-guide-card__head noria-diary-card-head'});head.createSpan({cls:'dashboard-guide-card__title',text:state.title||plugin.cards.title(widget)});
        head.createDiv({cls:'dashboard-guide-card__tools noria-diary-card-tools'});
        const body=host.createDiv({cls:'noria-note-card-body'});
        if(state.height){body.style.maxHeight=state.height+'px';body.style.overflow='auto';}
        const cleanup=await plugin.cards.render(widget,body,selection,{page:'diary',mode:selection.mode,selection});
        if(disposed||token!==serial){cleanup();return;}cleanups.push(cleanup);
      }
    }catch(error){if(!disposed&&token===serial)el.createDiv({cls:'noria-card-error',text:error.message});}
  };
  child.register(plugin.cards.subscribe(()=>void paint()));
  await paint();
}
module.exports={renderNoteCards,selectionForNote};
