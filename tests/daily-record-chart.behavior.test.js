const test=require('node:test'),assert=require('node:assert/strict');
const {recordTrendScale,drawRecordChart}=require('../src/daily-record-chart.js');

test('mood and focus retain semantic order when options are reordered or the visible range changes',()=>{
  for(const [legacy,options] of [['mood',['很好','很差','稳定','一般','偏低']],['focus',['很专注','易分心','基本专注','难进入状态']]]){
    const field={type:'option',legacy,options},a=recordTrendScale(field,[]),b=recordTrendScale({...field,options:[...options].reverse()},[{value:options[0]}]);
    assert.equal(a.value(options[0]),a.max);assert.equal(b.value(options[0]),b.max);
    assert.equal(a.min,b.min);assert.equal(a.max,b.max);assert.equal(a.value('unknown'),null);
  }
});
test('unordered or extended categories receive no invented numeric rank; numeric zero remains valid',()=>{
  assert.equal(recordTrendScale({type:'option',options:['work','rest']},[]),null);
  assert.equal(recordTrendScale({type:'option',legacy:'mood',options:['很好','复杂']},[]),null);
  const s=recordTrendScale({type:'number'},[{value:0},{value:2},{value:null}]);
  assert.equal(s.min,0);assert.equal(s.max,2);assert.equal(s.value(null),null);assert.equal(s.value(0),0);
});
function element(options={}){
  const el={options,children:[],dataset:{},style:{setProperty(){}},attrs:{},addClass(){},setAttribute(k,v){this.attrs[k]=v;},append(child){this.children.push(child);},createSpan(options){const child=element(options);this.children.push(child);return child;}};
  el.ownerDocument={createElementNS(ns,tag){const child=element();child.tag=tag;child.namespaceURI=ns;return child;}};return el;
}
test('trend connects adjacent observations only and keeps fixed mood levels',()=>{
  const chart=element(),points=['很好','一般',null,'偏低','很差'].map((value,i)=>({value,date:String(i)}));
  const plot=drawRecordChart(chart,{type:'option',legacy:'mood',options:['很好','一般','偏低','很差']},points,{display:(_,v)=>v,text:(_,en)=>en});
  const lines=plot.children[0].children,markers=plot.children.slice(1);
  assert.equal(lines.length,2);assert.equal(markers.length,4);
  assert.equal(markers[0].style.top,'14%');assert.equal(markers.at(-1).style.top,'86%');
});
