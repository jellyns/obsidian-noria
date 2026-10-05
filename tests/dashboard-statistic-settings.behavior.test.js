const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {validateDashboardStatistic}=require('../src/dashboard-statistic-settings.js');
const text=zh=>zh;
const plugin={isIsoDateText:value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&new Date(value).toISOString().slice(0,10)===value};

test('card settings reject reversed dates and empty metrics, while retaining legacy defaults',()=>{
  assert.doesNotThrow(()=>validateDashboardStatistic({id:'metrics',props:{}},plugin,text));
  assert.throws(()=>validateDashboardStatistic({id:'a',builtinId:'metrics',props:{overviewFields:[]}},plugin,text),/至少/);
  assert.throws(()=>validateDashboardStatistic({id:'a',builtinId:'note-trend-card',props:{statsRange:{mode:'custom',start:'2026-10-02',end:'2026-10-01'}}},plugin,text),/日期/);
});

test('range events reach only their page and stop after unmount',()=>{
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync('src/card-system.js','utf8'),{module,require:()=>({}),console});
  const system=Object.create(module.exports.CardSystem.prototype);system.statisticRangeListeners=new Map();
  const received=[];const stop=system.onStatisticRange('one',value=>received.push(value));
  system.onStatisticRange('two',()=>assert.fail('cross-page range event'));
  system.emitStatisticRange('one',{range:{mode:'month'}});assert.equal(received.length,1);
  stop();system.emitStatisticRange('one',{range:{mode:'year'}});assert.equal(received.length,1);assert.equal(system.statisticRangeListeners.has('one'),false);
});

test('overview filters selected dated metrics but preserves the current character total',async()=>{
  const source=fs.readFileSync('src/runtime/views/dashboard/home/sections/overview-metrics/view.js','utf8');
  async function render(props){
    const rows=[],element=()=>({style:{},addClass(){},setAttribute(){},createDiv(){return element();},createEl(tag,opts){if(tag==='small')rows.push({label:opts.text});if(tag==='b')rows.at(-1).value=opts.text;return element();}});
    const pages=['2026-09-01','2026-09-30','2026-10-01'].map((date,i)=>({created:date,tags:[],file:{path:`Notes/${i}.md`,name:String(i),extension:'md',mtime:1,tasks:[]}}));
    let taskRequest;
    await vm.runInNewContext(source,{Date,Intl,app:{metadataCache:{unresolvedLinks:{}}},ctx:{io:{load:async()=>'abcdef'}},input:{mount:element(),metricsLayout:'hero',...props,noriaBridge:{locale:'zh',t:key=>key,homeSettings:{trendsRange:{mode:'custom',start:'2026-09-01',end:'2026-09-30'}},data:{resolveRange:async({range})=>range,getTasks:async request=>{taskRequest=request;return {items:[{},{},{}]};}},runtime:{pagesForScope:()=>pages,pagesForManagedPath:()=>[]}}}});
    return {rows,taskRequest};
  }
  const original=await render({});assert.equal(original.rows.length,8);assert.equal(original.taskRequest.rangePolicy,"allFacts");assert.equal(original.taskRequest.bucketBy,"completion");
  const selected=await render({overviewFields:['todayNotes','completedTasks','totalWords'],statsRange:{mode:'homeCurrent'}});
  assert.equal(selected.rows.length,3);
  assert.equal(selected.rows.find(r=>r.label==='区间新建笔记').value,'+2');
  assert.equal(selected.rows.find(r=>r.label==='区间完成事项').value,'3');
  assert.equal(selected.rows.find(r=>r.label==='当前字符量').value,original.rows.find(r=>r.label==='当前字符量').value);
  assert.equal(selected.taskRequest.rangePolicy,'range');assert.equal(selected.taskRequest.bucketBy,'completion');assert.equal(selected.taskRequest.range.end,'2026-09-30');
});
