const test=require('node:test'),assert=require('node:assert/strict');
const {dailySources,statisticUnit,formatStatRange}=require('../src/property-statistics.js');
const {renderChart,comparisonNotes}=require('../src/statistic-charts.js');
test('daily source summary counts notes once and field values separately, including zero and false',()=>{
 const a={path:'A.md',date:'2026-01-01'},b={path:'B.md',date:'2026-01-02'};
 const r=dailySources([{rows:[{...a,value:0},{...b,value:2}],recorded:2,missing:1},{rows:[{...a,value:false}],recorded:1,missing:2}]);
 assert.equal(r.sourceNotes,2);assert.equal(r.recorded,3);assert.equal(r.missing,3);assert.deepEqual(r.rows.map(x=>x.path),['B.md','A.md']);
});

test('daily sources retain field exclusions and deduplicate unreadable notes without counting them as missing',()=>{
 const a={path:'A.md',date:'2026-01-01'},bad={path:'B.md',error:'Cannot read note'};
 const first={rows:[{...a,value:0}],recorded:1,missing:1,invalid:[{...a,reason:'non-numeric'}],unreadable:[bad]};
 const second={rows:[{...a,value:false}],recorded:1,missing:0,invalid:[{path:'C.md',reason:'unsupported-category'}],unreadable:[bad]};
 const r=dailySources([first,second],[{name:'睡眠'},{name:'心情'}]);
 assert.equal(r.sourceNotes,1);assert.equal(r.recorded,2);assert.equal(r.missing,1);
 assert.deepEqual(r.invalid.map(row=>[row.fieldName,row.reason]),[['睡眠','non-numeric'],['心情','unsupported-category']]);
 assert.equal(r.unreadable.length,1);assert.equal(r.unreadable[0].path,'B.md');assert.equal(r.unreadable[0].error,'Cannot read note');
 assert.equal(Object.hasOwn(first.invalid[0],'fieldName'),false);
});
test('only measured aggregations carry field units, explicit unit properties take precedence',()=>{
 const f={unit:'hours'};
 for(const calculate of ['count','distribution'])assert.equal(statisticUnit({calculate},{unit:'minutes'},f),'');
 assert.equal(statisticUnit({calculate:'mean'},{},f),'hours');
 assert.equal(statisticUnit({calculate:'sum',unitProperty:'u'},{unit:'minutes'},f),'minutes');
 assert.equal(statisticUnit({calculate:'sum',unitProperty:'u'},{unit:''},f),'');
 assert.equal(statisticUnit({calculate:'rate'},{},f),'%');
 assert.equal(statisticUnit({source:'tasks',calculate:'sum'},{},f),'');
});
test('localized stat ranges retain both years across a year boundary',()=>{
 for(const locale of ['zh','en']){const text=formatStatRange({start:'2025-12-31',end:'2026-01-02'},locale);assert.match(text,/2025/);assert.match(text,/2026/);}
 assert.match(formatStatRange({start:'2026-01-02',end:'2026-01-02'},'zh'),/2026/);
});
function element(options={}){return {text:options.text||'',cls:options.cls,children:[],empty(){this.children=[];},remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);},querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);},style:{setProperty(k,v){this[k]=v;}},dataset:{},attributes:{},addClass(name){this.cls+=' '+name;},focus(){this.onfocus?.();},scrollIntoView(){},setAttribute(k,v){this.attributes[k]=String(v);},setText(v){this.text=v;},append(child){this.children.push(child);},ownerDocument:{createElementNS(ns,tag){const child=element();child.tag=tag;return child;}},createEl(tag,opt){const child=element(opt);child.parent=this;child.tag=tag;for(const [k,v]of Object.entries(opt?.attr||{})){child.attributes[k]=v;if(k.startsWith('data-'))child.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}this.children.push(child);return child;},createDiv(opt){return this.createEl('div',opt);},createSpan(opt){return this.createEl('span',opt);}};}
const options={text:(a,b)=>b,number:v=>v==null?'—':String(v),display:(f,v)=>v};

test('monthly columns retain empty and cross-year months without expanding into daily observations',()=>{
 const periods=[{key:'2025-12',value:3,rows:[{path:'A.md'}]},{key:'2026-01',value:0,rows:[]},{key:'2026-02',value:1,rows:[{path:'B.md'}]}],host=element(),state={};let opened;
 renderChart(host,{periods},{display:'columns'},{...options,unit:'works',viewState:state,activate:(_,rows,date)=>opened={rows,date}});
 const plot=host.children[0].children[0],columns=plot.children.at(-1),buttons=columns.children;
 assert.equal(buttons.length,3);assert.deepEqual(buttons.map(b=>b.dataset.period),periods.map(p=>p.key));
 assert.deepEqual(buttons.map(b=>b.children[2].text),['Dec','Jan','Feb']);
 assert.equal(buttons[1].children[0].hidden,true);assert.deepEqual(buttons.map(b=>b.tabIndex),[-1,-1,0]);
 assert.deepEqual(buttons.map(b=>b.children[1].hidden),[false,true,false]);
 buttons[1].onpointerenter();assert.deepEqual(buttons.map(b=>b.children[1].hidden),[false,false,true]);
 assert.equal(state.date,'2026-02');columns.onpointerleave();assert.equal(buttons[2].children[1].hidden,false);
 buttons[2].onkeydown({key:'ArrowLeft',preventDefault(){}});buttons[1].onclick();
 assert.deepEqual(opened,{date:'2026-01',rows:[]});assert.equal(state.date,'2026-01');
 const refreshed=element();renderChart(refreshed,{periods},{display:'columns'},{...options,viewState:state});
 assert.deepEqual(refreshed.children[0].children[0].children.at(-1).children.map(b=>b.tabIndex),[-1,0,-1]);
 buttons[1].onkeydown({key:'Home',preventDefault(){}});buttons[0].onclick();assert.deepEqual(opened.rows,[{path:'A.md'}]);
});

test('monthly peak labels collapse flat summits and all-zero periods retain a usable axis and source entry',()=>{
 const render=values=>{const host=element();renderChart(host,{periods:values.map((value,i)=>({key:`2026-0${i+1}`,value,rows:[]}))},{display:'columns'},options);return host.children[0].children[0];};
 const equal=render([2,2,1]).children.at(-1).children;assert.deepEqual(equal.map(b=>b.children[1].hidden),[false,true,false]);
 const zero=render([0,0,0]);assert.deepEqual(zero.children.slice(0,-1).map(e=>e.style.bottom),['100%','0%']);
 assert.ok(zero.children.at(-1).children.every(b=>b.children[0].hidden));
 assert.deepEqual(zero.children.at(-1).children.map(b=>b.children[1].hidden),[true,true,false]);
});

test('dot columns encode exact counts, including partial tiles, without changing monthly source selection',()=>{
 const periods=[{key:'2026-01',value:0,rows:[]},{key:'2026-02',value:37,rows:[{path:'Finished.md'}]},{key:'2026-03',value:5,rows:[]}],host=element(),viewState={};let opened;
 renderChart(host,{periods},{display:'columns',periodStyle:'dots'},{...options,unit:'works',viewState,activate:(_,rows,date)=>opened={rows,date}});
 const chart=host.children[0],buttons=chart.children[0].children.at(-1).children;
 assert.equal(chart.children[1].text,'2 works per tile');
 assert.deepEqual(buttons.map(b=>b.children[0].children.reduce((sum,tile)=>sum+Number(tile.dataset.fraction)*2,0)),[0,37,5]);
 assert.equal(buttons[1].children[0].children.filter(tile=>Number(tile.dataset.fraction)===.5).length,1);
 assert.ok(buttons[0].children[0].children.every(tile=>tile.children.length===0));
 assert.equal(buttons[1].children[1].text,'37');assert.deepEqual(buttons.map(b=>b.children[1].hidden),[true,false,false]);
 buttons[1].onclick();assert.deepEqual(opened,{rows:[{path:'Finished.md'}],date:'2026-02'});
 buttons[1].onkeydown({key:'Home',preventDefault(){}});assert.equal(viewState.date,'2026-01');
});

test('dot scale bounds the displayed grid rather than creating one node per work',()=>{
 const {periodDotScale}=require('../src/statistic-period-columns.js');
 assert.deepEqual(periodDotScale([0,1,12]),{step:1,rows:8,capacity:24});
 for(const maximum of [0,24,35,36,37,109,10000]){const scale=periodDotScale([maximum]);assert.ok(scale.capacity>=maximum);assert.ok(scale.rows>=8&&scale.rows<=12);assert.equal(scale.step,Math.ceil(maximum/36)||1);}
});
test('record calendar reads signed values and absence, opens original rows, and retains keyboard selection',()=>{
 const {summarize}=require('../src/property-statistics.js'),config={property:'v',calculate:'mean',display:'calendar'},viewState={};
 const rows=[-5,0,5].map((v,i)=>({path:i+'.md',date:'2026-09-0'+(i+1),properties:{v}})),result={...summarize(rows,config),range:{start:'2026-09-01',end:'2026-09-04'}},host=element();let opened;
 renderChart(host,result,config,{...options,viewState,activate:(_,rows,date)=>opened={rows,date}});
 const section=host.children.find(e=>e.cls==='noria-stat-record-calendar'),grid=section.children[1],cells=()=>grid.children.filter(e=>e.cls==='noria-stat-calendar-cell');
 assert.deepEqual(cells().slice(0,4).map(b=>b.children[1].text),['-5','0','5','—']);assert.equal(cells()[1].dataset.missing,'false');assert.equal(cells()[3].dataset.missing,'true');
 assert.equal(cells().filter(b=>b.tabIndex===0).length,1);cells()[2].onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(viewState.date,'2026-09-02');cells()[1].onclick();assert.equal(opened.rows[0].path,'1.md');
 const next=element();renderChart(next,result,config,{...options,viewState});assert.equal(next.querySelectorAll('button').find(b=>b.dataset.selected==='true').dataset.date,'2026-09-02');
});
test('record calendar keeps month coordinates and clamps navigation to the queried dates',()=>{
 const host=element(),state={date:'2026-10-01'},config={property:'v',calculate:'mean',display:'calendar'};
 renderChart(host,{rows:[],groups:[],range:{start:'2026-09-28',end:'2026-10-04'}},config,{...options,viewState:state});
 const section=host.children.find(e=>e.cls==='noria-stat-record-calendar'),head=section.children[0],grid=section.children[1];
 const first=grid.children.findIndex(c=>c.dataset.date==='2026-10-01');assert.equal(first,10);assert.equal(head.children[2].disabled,true);
 head.children[0].onclick();assert.equal(head.children[0].disabled,true);assert.equal(state.month,'2026-09');assert.equal(grid.children.filter(c=>c.tag==='button'&&!c.disabled).length,3);
});

test('composition uses exclusive counts, retains false and zero, and opens the selected sources',()=>{
 const {summarize}=require('../src/property-statistics.js'),config={property:'v',calculate:'distribution',display:'composition'};
 const rows=[false,false,0,null].map((v,i)=>({path:`${i}.md`,properties:{v}})),result=summarize(rows,config),host=element();let opened;
 renderChart(host,result,config,{...options,activate:(anchor,rows)=>opened=rows});
 const track=host.children.find(el=>el.cls==='noria-distribution-track'),legend=host.children.find(el=>el.cls==='noria-distribution-legend');
 assert.equal(track.children.length,2);assert.ok(Math.abs(track.children.reduce((s,c)=>s+parseFloat(c.style.width),0)-100)<1e-9);
 const index=result.groups.findIndex(g=>g.key==='false');track.children[index].onclick();assert.deepEqual(opened.map(r=>r.path),['0.md','1.md']);
 legend.children[index].onclick();assert.equal(opened.length,2);assert.equal(result.missing,1);
 const hidden=element();renderChart(hidden,result,{...config,appearance:{showLegend:false}},{...options,activate:()=>{}});assert.equal(hidden.children.filter(c=>c.cls==='noria-distribution-legend').length,0);assert.equal(hidden.children[0].children.length,2);
 for(const values of [[['A','B'],'A'],[-1,3]]){
   const cfg={...config,...(typeof values[0]==='number'?{calculate:'sum',group:'folder'}:{})};
   const bad=summarize(values.map((v,i)=>({path:`F${i}/a.md`,properties:{v}})),cfg);
   assert.throws(()=>renderChart(element(),bad,cfg,options),/Overlapping, negative/);
 }
 const empty=element();renderChart(empty,summarize([],config),config,options);assert.equal(empty.children.length,0);
});
test('unregistered category strips show text, distinguish states and retain multi-value sources',()=>{
 const {summarize}=require('../src/property-statistics.js'),config={property:'v',calculate:'distribution',display:'strip'};
 const rows=['read',false,['read','saved']].map((value,i)=>({path:`${i}.md`,date:`2026-01-0${i+1}`,properties:{v:value}}));
 const result={...summarize(rows,config),range:{start:'2026-01-01',end:'2026-01-04'}},host=element();let opened;
 renderChart(host,result,config,{...options,number:v=>String(Number(v)),activate:(anchor,rows,date)=>opened={rows,date}});
 const cells=host.children.find(el=>el.cls==='noria-stat-calendar noria-stat-calendar--strip').children;
 assert.match(cells[0].attributes['aria-label'],/read/);assert.match(cells[1].attributes['aria-label'],/false/);assert.notEqual(cells[0].style.background,cells[1].style.background);
 assert.equal(cells[2].dataset.multiple,'true');assert.equal(cells[2].dataset.missing,'false');assert.equal(cells[3].dataset.missing,'true');
 cells[2].onclick();assert.equal(opened.rows[0].path,'2.md');assert.equal(opened.date,'2026-01-03');
});
test('comparison opens the selected period result and formats its own unit and range',()=>{
 const previous={value:0,rows:[{path:'old'}],range:{start:'2025-12-30',end:'2025-12-31'}},current={value:2,rows:[],range:{start:'2026-01-01',end:'2026-01-02'},comparison:{previous,absolute:2,percent:null,periods:{partial:false}}};
 const host=element();let opened;
 renderChart(host,current,{display:'comparison',calculate:'mean'},{...options,unit:'h',source:(rows,result)=>opened={rows,result}});
 const previousButton=host.children[0].children[1];assert.equal(previousButton.children[0].text,'Previous');assert.equal(previousButton.children[1].text,'0 h');previousButton.onclick();assert.equal(opened.result,previous);assert.equal(opened.rows,previous.rows);
});
test('completion progress keeps the denominator a count rather than a percentage',()=>{
 const host=element();renderChart(host,{numerator:1,denominator:2,rows:[]},{display:'progress',calculate:'rate'},{...options,unit:'%',source:()=>{}});
 assert.equal(host.children[0].children[1].text,'1 / 2 · 50%');
});
test('dense chart editing follows plotted dates and keyboard selection, including missing and zero values',()=>{
 const M=require('../src/statistic-model.js'),{summarize}=require('../src/property-statistics.js');
 const dates=M.datesIn({start:'2026-01-01',end:'2026-03-01'});
 const rows=dates.flatMap((date,i)=>i===1?[]:[{path:date+'.md',date,properties:{v:i===0?0:i===2?-2:i},tags:[]}]);
 const config={display:'line',property:'v',calculate:'mean'},result={...summarize(rows,config),range:{start:dates[0],end:dates.at(-1)}};
 const host=element();let opened;
 renderChart(host,result,config,{...options,activate:(anchor,rows,date)=>opened={rows,date}});
 const plot=host.children.find(el=>el.cls==='noria-stat-plot'),svg=plot.children[0];
 svg.getBoundingClientRect=plot.getBoundingClientRect=()=>({left:100,width:300});
 const hover=i=>plot.onpointermove({clientX:100+(15+(i+.5)/dates.length*570)/2});
 hover(0);plot.onclick();assert.equal(opened.date,dates[0]);assert.equal(opened.rows[0].value,0);
 hover(dates.length-1);plot.onclick();assert.equal(opened.date,dates.at(-1));
 plot.onkeydown({key:'Home',preventDefault(){}});plot.onkeydown({key:'ArrowRight',preventDefault(){}});plot.onclick();
 assert.equal(opened.date,dates[1]);assert.deepEqual(opened.rows,[]);
 assert.match(plot.attributes['aria-label'],/2026-01-02.*No record/);
 const cursor=svg.children.find(el=>el.attributes.class==='noria-stat-cursor');
 assert.equal(Number(cursor.attributes.x1),15+1.5/dates.length*570);
 plot.onkeydown({key:'ArrowRight',preventDefault(){}});plot.onclick();assert.equal(opened.rows[0].value,-2);
});
test('empty numeric series omits the plot and retains explicit historical diary entry',()=>{
 const config={source:'diary',property:'energy',calculate:'mean',display:'line'},host=element();let opened;
 const result={rows:[],groups:[],range:{start:'2026-01-01',end:'2026-01-07'}};
 renderChart(host,result,config,{...options,today:'2026-01-05',activate:(anchor,rows,date)=>opened={rows,date}});
 assert.equal(host.children.some(el=>el.cls==='noria-stat-plot'),false);
 const row=host.children.find(el=>el.cls==='noria-stat-empty-entry'),date=row.children[0].children[1];assert.equal(date.value,'2026-01-05');date.value='2026-01-02';row.children[1].onclick();assert.deepEqual(opened,{rows:[],date:'2026-01-02'});
 const preview=element();renderChart(preview,result,config,{...options,today:'2026-01-05',readOnly:true});assert.equal(preview.children.some(el=>el.cls==='noria-stat-empty-entry'),false);
});

test('refresh preserves the inspected date without making it a persisted statistic setting',()=>{
 const {summarize}=require('../src/property-statistics.js'),config={property:'v',calculate:'mean',display:'line'},viewState={};
 const rows=[{path:'a',date:'2026-01-01',properties:{v:0}},{path:'b',date:'2026-01-03',properties:{v:7}}];
 const result=()=>({...summarize(rows,config),range:{start:'2026-01-01',end:'2026-01-03'}});
 const first=element();renderChart(first,result(),config,{...options,viewState});
 first.children.find(el=>el.cls==='noria-stat-plot').onkeydown({key:'Home',preventDefault(){}});
 rows[0].properties.v=5;const refreshed=element();renderChart(refreshed,result(),config,{...options,viewState});
 assert.deepEqual(refreshed.children.find(el=>el.cls==='noria-stat-selection').children[0].children.map(el=>el.text),['2026-01-01','5']);
 assert.equal(Object.hasOwn(config,'date'),false);
});
test('hidden markers retain isolated observations and fixed-scale references cannot clip data',()=>{
 const {summarize}=require('../src/property-statistics.js'),config={property:'v',calculate:'mean',display:'line',appearance:{showPoints:false,axis:'fixed',min:0,max:5},referenceValue:9};
 const rows=[{path:'a',date:'2026-01-01',properties:{v:0}},{path:'b',date:'2026-01-03',properties:{v:7}}],host=element();
 renderChart(host,{...summarize(rows,config),range:{start:'2026-01-01',end:'2026-01-03'}},config,{...options,activate:()=>{}});
 const svg=host.children.find(el=>el.cls==='noria-stat-plot').children[0];assert.equal(svg.children.filter(el=>el.attributes.class==='noria-series-point').length,2);assert.equal(svg.children.filter(el=>el.attributes.class==='noria-series-line').length,0);
 const reference=svg.children.find(el=>el.attributes.class==='noria-stat-reference');assert.ok(Number(reference.attributes.y1)>=12&&Number(reference.attributes.y1)<=146);
 assert.ok(host.children.some(el=>el.cls==='noria-card-secondary noria-stat-scale-notice'));
});


test('signed comparisons put losses left of zero and explain missing or zero baselines',()=>{
 const make=(value,prior)=>{const previous={value:prior,rows:[],range:{start:'2026-01-01',end:'2026-01-02'}};return {value,rows:[],range:{start:'2026-01-03',end:'2026-01-04'},comparison:{previous,periods:{partial:true},...require('../src/statistic-model.js').delta(value,prior)}};};
 const host=element();renderChart(host,make(-5,10),{display:'comparison',calculate:'sum'},options);
 const rows=host.children[0].children,negative=rows[0].children[3].children[0],positive=rows[1].children[3].children[0];
 assert.equal(negative.style.left,'25%');assert.equal(negative.style.width,'25%');assert.equal(positive.style.left,'50%');assert.equal(positive.style.width,'50%');
 assert.match(rows[2].text,/-15.*-150%/);
 const zero=element();renderChart(zero,make(3,0),{display:'comparison',calculate:'count'},options);
 assert.ok(comparisonNotes(make(3,0),options.text).some(note=>note.includes('percentage change is undefined')));
 const absent=element();renderChart(absent,make(3,null),{display:'comparison',calculate:'mean'},options);
 assert.match(absent.children[0].children[1].children[1].text,/No record/);assert.match(absent.children[0].children[2].text,/Not enough records/);
});

test('long category charts expand without dropping source rows or changing their scale',()=>{
 const groups=Array.from({length:13},(_,i)=>({key:`Folder ${i}`,value:i+1,rows:[{path:`${i}.md`}]}));
 const result={groups,recorded:91,value:91,rows:groups.flatMap(g=>g.rows)},host=element(),viewState={};let opened;
 renderChart(host,result,{display:'bars',calculate:'count'},{...options,viewState,activate:(anchor,rows)=>opened=rows});
 const list=host.children[0],more=host.children[1],scale=list.children[0].children[1].children[0].style['--noria-stat-ratio'];
 assert.equal(list.children.filter(b=>!b.hidden).length,6);assert.equal(more.text,'All 13 categories');
 more.onclick();assert.equal(list.children.filter(b=>!b.hidden).length,13);assert.equal(more.attributes['aria-expanded'],'true');
 list.children[12].onclick();assert.deepEqual(opened,[{path:'12.md'}]);
 assert.equal(list.children[0].children[1].children[0].style['--noria-stat-ratio'],scale);
 more.onclick();assert.equal(list.children.filter(b=>!b.hidden).length,6);
});

test('count charts use integral ticks while measured averages retain fractional scales',()=>{
 const {summarize}=require('../src/property-statistics.js');
 for(const [config,values,expected] of [[{calculate:'count',display:'columns'},[1],[1,0]],[{property:'v',calculate:'mean',display:'line'},[5],[5,2.5,0]]]){
  const rows=values.map((v,i)=>({path:String(i),date:'2026-01-01',properties:{v}})),result={...summarize(rows,config),range:{start:'2026-01-01',end:'2026-01-03'}},host=element();
  renderChart(host,result,config,options);const plot=host.children.find(x=>x.cls==='noria-stat-plot'),ruler=plot.children.find(x=>x.cls==='noria-stat-ruler');assert.deepEqual(ruler.children.map(x=>Number(x.text)),expected);
 }
});
test('numeric readout keeps date and value separate and preserves missing versus zero on selection',()=>{
 const {summarize}=require('../src/property-statistics.js'),config={property:'v',calculate:'mean',display:'line'};
 const rows=[{path:'a.md',date:'2026-01-01',properties:{v:0}}],host=element();let opened;
 renderChart(host,{...summarize(rows,config),range:{start:'2026-01-01',end:'2026-01-02'}},config,{...options,activate:(_,rows,date)=>opened={rows,date}});
 const plot=host.children.find(x=>x.cls==='noria-stat-plot'),pick=host.children.find(x=>x.cls==='noria-stat-selection').children[0];
 assert.deepEqual(pick.children.map(x=>x.text),['2026-01-01','0']);
 plot.onkeydown({key:'End',preventDefault(){}});assert.deepEqual(pick.children.map(x=>x.text),['2026-01-02','No record']);pick.onclick();assert.deepEqual(opened,{rows:[],date:'2026-01-02'});
});

test('strip date anchors belong to its scroll grid and calendars avoid duplicate range footers',()=>{
 const result={rows:[],groups:[],range:{start:'2025-12-29',end:'2026-01-05'}};
 for(const style of ['strip']){
  const host=element();renderChart(host,result,{property:'mood',calculate:'distribution',display:style},options);
  assert.equal(host.children.some(x=>x.cls==='noria-stat-axis'),false);
  const grid=host.children.find(x=>x.cls?.includes('noria-stat-calendar')),dates=grid.children.filter(x=>x.cls==='noria-stat-strip-date');
  assert.equal(dates.length,style==='strip'?2:0);
  if(style==='strip'){
   assert.deepEqual(dates.map(x=>x.text),['2025-12-29','2026-01-05']);assert.deepEqual(dates.map(x=>x.style.gridColumn),['1 / span 4','5 / span 4']);
   const cells=grid.children.filter(x=>x.cls==='noria-stat-day');assert.deepEqual(cells.map(x=>x.style.gridColumn),['1','2','3','4','5','6','7','8']);assert.ok(cells.every(x=>x.style.gridRow==='1'));
  }
 }
});
test('category readout keeps the complete selected value available without moving the date into it',()=>{
 const {summarize}=require('../src/property-statistics.js'),config={property:'v',calculate:'distribution',display:'strip'};
 const name='A long personal state with important details',rows=[{path:'A.md',date:'2026-01-01',properties:{v:name}}],host=element();
 renderChart(host,{...summarize(rows,config),range:{start:'2026-01-01',end:'2026-01-02'}},config,options);
 const pick=host.children.find(x=>x.cls==='noria-stat-selection').children[0];assert.deepEqual(pick.children.map(x=>x.text),['2026-01-01',name]);assert.match(pick.attributes['aria-label'],new RegExp(name));assert.ok(pick.title.endsWith(name));
});
