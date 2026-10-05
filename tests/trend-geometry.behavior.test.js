const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'../src/runtime/views/dashboard');
const files=['home/sections/trends-and-stats/blocks/note-trend/view.js','home/sections/trends-and-stats/blocks/task-trend/view.js','core/components/charts/dual-axis-svg-chart.js'];
test('dense donut labels retain separation without dropping small categories',()=>{
 const d=require('../src/runtime/views/dashboard/core/components/charts/leader-donut-chart.js')._test;
 const items=[{key:'main',value:1000},...Array.from({length:18},(_,i)=>({key:String(i),value:1}))];
 for(const width of [300,560]){
  const layout=d.computeLayout({getBoundingClientRect:()=>({width})},{items}),slices=d.normalizeItems(items,0,['red']);
  assert.equal(slices.length,19);assert.equal(slices.at(-1).key,'17');
  for(const right of [true,false]){
   const labels=d.distributeLabels(slices.filter(s=>(Math.cos((s.midAngle-90)*Math.PI/180)>=0)===right).map(slice=>({targetY:d.polar(layout.cx,layout.cy,layout.lineR,slice.midAngle).y})),layout.minY,layout.maxY,layout.labelGap);
   labels.forEach((label,i)=>{assert.ok(label.y>=layout.minY&&label.y<=layout.maxY);if(i)assert.ok(label.y-labels[i-1].y>=layout.labelGap-1e-8);});
  }
 }
});
test('donut leaders retain direct routing unless it cuts through the ring',()=>{
 const d=require('../src/runtime/views/dashboard/core/components/charts/leader-donut-chart.js')._test;
 assert.equal(d.leaderPoints({x:60,y:0},{x:63,y:0},{x:90,y:20},0,0,60,true).length,3);
 const points=d.leaderPoints({x:0,y:-60},{x:0,y:-63},{x:90,y:30},0,0,60,true);
 assert.equal(points.length,5);
 for(let i=1;i<points.length;i++)for(let j=0;j<=20;j++){
  const t=j/20,a=points[i-1],b=points[i];assert.ok(Math.hypot(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)>=60-1e-8);
 }
});
test('balanced donut labels can move across sides without any leader segment cutting the ring',()=>{
 const d=require('../src/runtime/views/dashboard/core/components/charts/leader-donut-chart.js')._test;
 for(const angle of [20,60,90,140,200,250,270,320]) for(const right of [false,true]) for(const y of [-90,0,90]){
  const points=d.leaderPoints(d.polar(0,0,60,angle),d.polar(0,0,63,angle),{x:right?90:-90,y},0,0,60,right);
  for(let i=1;i<points.length;i++)for(let j=0;j<=40;j++){
   const t=j/40,a=points[i-1],b=points[i];
   assert.ok(Math.hypot(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)>=60-1e-8,`angle ${angle}, side ${right}, end ${y}, segment ${i}`);
  }
 }
});
function pathFunction(source){
 source=source.replace(/\r\n/g,'\n');
 const declaration=source.match(/(?:const (?:smoothPath|countLinePath) = \(\w+\) =>|function (?:smoothPath|countLinePath)\(\w+\)) \{/);
 assert.ok(declaration);const begin=declaration.index;
 // Standalone views use a top-level arrow; the shared chart is an IIFE function.
 const text=source.slice(begin,source.indexOf(declaration[0].startsWith('const')?'\n};':'\n  }\n',begin)+(declaration[0].startsWith('const')?3:4));
 const name=declaration[0].match(/(?:const|function) (\w+)/)[1];
 return vm.runInNewContext(`${text};${name}`);
}
function samplePath(d){
 const parts=d.match(/[MLC][^MLC]*/g)||[];let last,points=[];
 for(const part of parts){const a=part.slice(1).match(/-?\d+(?:\.\d+)?/g).map(Number);
  if(part[0]==='M'||part[0]==='L'){last=a;points.push(a);continue}
  for(let i=1;i<=20;i++){const t=i/20,u=1-t;points.push([0,1].map(k=>u**3*last[k]+3*u*u*t*a[k]+3*u*t*t*a[k+2]+t**3*a[k+4]));}last=a.slice(4);
 }return points;
}
test('count trend paths stay within data bounds, including zero runs around a peak',()=>{
 for(const file of files){const draw=pathFunction(fs.readFileSync(path.join(base,file),'utf8'));
  for(const values of [[],[0],[0,1],[0,1,0,0],[0,0,1,0],[0,8,0,1,0]]){
   const points=values.map((y,x)=>[x*10,100-y*10]),samples=samplePath(draw(points));
   for(const [x,y] of samples)assert.ok(y<=100+1e-8&&y>=Math.min(...points.map(p=>p[1]))-1e-8,`${file}: out-of-range point ${x},${y}`);
  }
 }
});

test('shared dual-axis rate lines break at absent denominators rather than joining through zero',()=>{
 const draw=pathFunction(fs.readFileSync(path.join(base,files[2]),'utf8'));
 assert.equal(draw([[0,10],null,[20,40],[30,50]]).trim(),'M 0 10  M 20 40 L 30 50');
});

test('homepage curves remain smooth without inventing values outside adjacent observations',()=>{
 for(const file of files.slice(0,2)){
  const draw=pathFunction(fs.readFileSync(path.join(base,file),'utf8'));
  for(const values of [[0,17,0,1,0],[4,0,0,8,1],[0,1,100,2,0]]){
   const points=values.map((y,i)=>[i*10,y]),path=draw(points);assert.match(path,/C/);
   for(const [x,y] of samplePath(path)){
    const i=Math.min(values.length-2,Math.floor(x/10));
    assert.ok(y>=Math.min(values[i],values[i+1])-1e-8&&y<=Math.max(values[i],values[i+1])+1e-8,`${file}: curve overshot near ${x},${y}`);
   }
  }
 }
});
function el(tag='div'){return {tag,children:[],style:{},attrs:{},createDiv(){const e=el();this.children.push(e);return e},appendChild(e){this.children.push(e)},setAttribute(k,v){this.attrs[k]=String(v)}}}
test('shared trend axes do not duplicate integer ticks for empty or single-count data',()=>{
 const c=vm.createContext({document:{createElementNS:(_,tag)=>el(tag)}});vm.runInContext(fs.readFileSync(path.join(base,files[2]),'utf8'),c);
 for(const values of [[],[0],[1],[0,1,0]]){
  const host=el();c.dashboardCore.components.charts.dualAxisSvgChart.renderDualAxisSvg(host,{barSeries:values,lineSeries:values});
  const svg=host.children[0].children.find(e=>e.tag==='svg');
  for(const x of ['50','852']){const ticks=svg.children.filter(e=>e.tag==='text'&&e.attrs.x===x).map(e=>e.textContent);assert.deepEqual(ticks,['0','1']);}
 }
});
