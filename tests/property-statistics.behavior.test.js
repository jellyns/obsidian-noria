const test=require("node:test"),assert=require("node:assert/strict");
const {filterNotes,summarize}=require("../src/property-statistics.js");
const {readProperty,writeProperty}=require("../src/record-properties.js");
const note=(path,value,date="2026-09-17")=>({path,date,tags:["#reading"],properties:{value}});

test('folder groups keep root, single-level and nested notes with correct drilldown',()=>{
  const stats=summarize(['A.md','B.md','Projects/C.md','Projects/D.md','Projects/Sub/E.md'].map(path=>note(path,1)),{group:'folder',calculate:'count'});
  assert.equal(stats.value,5);
  assert.deepEqual(stats.groups.map(g=>[g.key,g.value,g.rows.map(r=>r.path)]),[
    ['/',2,['A.md','B.md']],['Projects',2,['Projects/C.md','Projects/D.md']],['Projects/Sub',1,['Projects/Sub/E.md']]
  ]);
});

test('daily summary preserves sources and distinguishes multiple states, duplicate notes and missing days',()=>{
  const {alignDailyRecords}=require('../src/property-statistics.js');
  const rows=[note('A.md',['read','saved'],'2026-09-01'),note('B.md',['read','read'],'2026-09-02'),note('C.md',false,'2026-09-03'),note('D.md','read','2026-09-04'),note('E.md','saved','2026-09-04')];
  const {series:[points]}=alignDailyRecords([summarize(rows,{property:'value',calculate:'distribution'})],{start:'2026-09-01',end:'2026-09-05'});
  assert.equal(points[0].multiple,true);assert.deepEqual(points[0].rows[0].value,['read','saved']);assert.equal(points[0].value,null);
  assert.equal(points[1].value,'read');assert.equal(points[1].multiple,false);assert.equal(points[2].value,false);
  assert.equal(points[3].ambiguous,true);assert.equal(points[3].rows.length,2);assert.equal(points[3].value,null);
  assert.equal(points[4].ambiguous,false);assert.equal(points[4].multiple,false);assert.equal(points[4].value,null);
  const numeric=alignDailyRecords([summarize([note('zero',0,'2026-09-01')],{property:'value',calculate:'mean'})],{start:'2026-09-01',end:'2026-09-01'});
  assert.equal(numeric.series[0][0].value,0);
});
test("statistics distinguish missing, zero, false and non-numeric values",()=>{
  const rows=[note("A.md",0),note("B.md",2),note("C.md",null),note("D.md",false),note("E.md","3")];
  const stats=summarize(rows,{property:"value",calculate:"mean"});assert.equal(stats.value,1);assert.equal(stats.recorded,2);assert.equal(stats.missing,1);assert.deepEqual(stats.invalid.map(r=>r.path),["D.md","E.md"]);
  assert.equal(summarize(rows,{property:"value",calculate:"count"}).value,4);
});
test("category lists count each note once in each category and preserve drilldown sources",()=>{
  const stats=summarize([note("A.md",["read","read","saved"]),note("B.md","read"),note("C.md",false)],{property:"value",calculate:"distribution"});
  assert.equal(stats.value,3);assert.deepEqual(stats.groups.find(g=>g.key==="read").rows.map(r=>r.path),["A.md","B.md"]);assert.equal(stats.groups.find(g=>g.key==="false").value,1);
  const mixed=summarize([note('empty',[]),note('blanks',[null,'']),note('object',{nested:1}),note('mixed',['read',{nested:1}]),note('valid',['read','read','',null]),note('zero',0)],{property:'value',calculate:'distribution'});
  assert.equal(mixed.recorded,2);assert.equal(mixed.missing,2);assert.deepEqual(mixed.invalid.map(r=>r.path),['object','mixed']);
  assert.equal(mixed.groups.find(g=>g.key==='read').value,1);assert.equal(mixed.matched,mixed.recorded+mixed.missing+mixed.invalid.length);
});
test("folder, descendant tags and exact property conditions compose without copying records",()=>{
  const rows=[note("Books/A.md",0),note("Books/Sub/B.md",2),note("Books2/C.md",3)];rows[1].tags=["#reading/book"];
  assert.deepEqual(filterNotes(rows,{folder:"Books",recursive:false}).map(r=>r.path),["Books/A.md"]);
  assert.deepEqual(filterNotes(rows,{folder:"Books",tag:"reading",filterProperty:"value",filterValue:"0"}).map(r=>r.path),["Books/A.md"]);
  assert.equal(filterNotes(rows,{folder:"Books",recursive:true,tag:"reading"}).length,2);
});
test("date trends use supplied event dates and never insert zero values for missing days",()=>{
  const stats=summarize([note("A.md",2,"2026-09-01"),note("B.md",4,"2026-09-03")],{property:"value",calculate:"sum",display:"trend"});
  assert.deepEqual(stats.groups.map(g=>[g.key,g.value]),[["2026-09-01",2],["2026-09-03",4]]);
});
test("property writes preserve unrelated YAML comments, nested properties and authored body",()=>{
  const raw="---\r\n# keep\r\n睡眠: 7\r\nother:\r\n  - a\r\n  - b\r\n---\r\n\r\n## Notes\r\nAuthored body.\r\n";
  const next=writeProperty(raw,{property:"睡眠",type:"number"},0,()=>({睡眠:7,other:["a","b"]}));
  assert.equal(next,raw.replace("睡眠: 7",'"睡眠": 0'));
  const cleared=writeProperty(next,{property:"睡眠",type:"number"},null,()=>({睡眠:0}));assert.ok(cleared.includes('"睡眠": null'));
  assert.equal(readProperty(cleared,{property:"睡眠",type:"number"},()=>({睡眠:null})),null);
});
test("a cleared preset masks legacy inline state and invalid property data is rejected",()=>{
  const raw="---\nmood: null\n---\n\n[ mood:: 稳定 ]";assert.equal(readProperty(raw,{property:"mood",legacy:"mood"},()=>({mood:null})),null);
  assert.throws(()=>writeProperty("",{property:"x",type:"number"},"0",()=>({})),/valid number/);
  assert.throws(()=>writeProperty("---\nbroken",{property:"x",type:"number"},1,()=>({})),/Unclosed/);
});

test("mixed or missing units are reported instead of silently summed",()=>{
 const rows=[note("A.md",1),note("B.md",60)];rows[0].properties.unit="hours";rows[1].properties.unit="minutes";
 const result=summarize(rows,{property:"value",calculate:"sum",unitProperty:"unit"});assert.equal(result.value,null);assert.equal(result.invalid.length,2);
 rows[1].properties.unit="hours";assert.equal(summarize(rows,{property:"value",calculate:"sum",unitProperty:"unit"}).value,61);
});
test("tag grouping does not double-count duplicated tags or fail on malformed tag types",()=>{
 const row=note("A.md",-2);row.tags=["reading","reading",123];assert.equal(filterNotes([row],{tag:"reading"}).length,1);
 const result=summarize([row],{property:"value",calculate:"sum",group:"tag"});assert.equal(result.groups.find(g=>g.key==="reading").value,-2);
 row.tags=['#reading','reading','#reading/book','reading/book'];
 const normalized=summarize([row],{property:'value',calculate:'sum',group:'tag'});
 assert.deepEqual(normalized.groups.map(g=>[g.key,g.value]),[['reading',-2],['reading/book',-2]]);
});
