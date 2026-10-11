const test = require('node:test');
const assert = require('node:assert/strict');
const {peakIndexes, placeLabels, createTrendAnnotations} = require('../src/runtime/views/dashboard/core/components/charts/trend-annotations.js');

test('only absolute maxima are labelled, with one label per plateau and none for missing data', () => {
  assert.deepEqual(peakIndexes([0, 14, 0, 6, 6, 0, null, 9, 0]), [1]);
  assert.deepEqual(peakIndexes([0, 0, null, 0]), []);
  assert.deepEqual(peakIndexes([0, 9, 9, 0, 9, 0]), [1, 4]);
});

test('selected values and peak labels remain disjoint and inside narrow and wide plots', () => {
  for (const width of [150, 420, 1000]) for (const x of [42, width / 2 + 42, width + 42]) for (const y of [20, 100, 200]) {
    const bounds = {left:42, right:width+42, top:20, bottom:200};
    const candidates = [{priority:3,width:40,px:x,py:y,id:'selected-line'}, {priority:3,width:36,px:x,py:y,id:'selected-bar'},
      ...Array.from({length:20}, (_,i)=>({priority:i===0?2:1,width:24,px:42+i/19*width,py:20,id:'peak'+i}))];
    const labels = placeLabels(candidates,bounds);
    assert.ok(labels.some(x=>x.id==='selected-line'));
    assert.ok(labels.some(x=>x.id==='selected-bar'));
    for (const [i,a] of labels.entries()) {
      assert.ok(a.x>=bounds.left && a.x+a.width<=bounds.right && a.y>=bounds.top && a.y+a.height<=bounds.bottom);
      for (const b of labels.slice(i+1)) assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
    }
  }
});

test('selected peaks are drawn once and absent observations are never rendered as zero', () => {
  const node = () => ({children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v;},appendChild(x){this.children.push(x);},
    set textContent(v){this.text=v;this.children=[];},get textContent(){return this.text;},getComputedTextLength(){return 16;}});
  const before=global.document;global.document={createElementNS:node};
  try {
    const svg=node(), api=createTrendAnnotations(svg,{bounds:{left:0,right:200,top:0,bottom:100},series:[
      {values:[0,9,0],xAt:i=>20+i*60,yAt:v=>90-v*8,color:'purple'},
      {values:[0,null,0],xAt:i=>20+i*60,yAt:v=>90-v*8,color:'teal'}]});
    let placed=api.update(1);
    assert.equal(placed.length,1);assert.equal(placed[0].selected,true);assert.equal(placed[0].peak,true);
    placed=api.update(2);
    assert.equal(placed.filter(x=>x.selected).length,2);
    assert.equal(placed.filter(x=>x.peak).length,1);
  } finally {global.document=before;}
});
