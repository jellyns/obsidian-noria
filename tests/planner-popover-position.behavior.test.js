const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/runtime/views/tasks-calendar/runtime-core.js'),'utf8');
test('quick popover delegates pane placement through the current calendar bridge',()=>{
 const pop={};let called;
 const root={querySelector:()=>pop},anchor={closest:()=>root,getBoundingClientRect:()=>({left:580,right:642,top:55,bottom:83})};
 const start=source.indexOf('function positionTimelineQuickPopover('),end=source.indexOf('function ensureTimelineQuickPopoverTitleRow(',start);
 const position=vm.runInNewContext(source.slice(start,end)+';positionTimelineQuickPopover',{bridgeCfg:{tasksCalendar:{placePopover:(...args)=>called=args}}});
 position(anchor);assert.deepEqual(called,[pop,anchor,root]);
});
test('shared pane placement remains bounded and does not accumulate contained origins',()=>{
 const {placePanePopover}=require('../src/pane-popover.js');
 const win={innerWidth:1200,innerHeight:800},bounds={left:350,right:850,top:40,bottom:600};
 const root={getBoundingClientRect:()=>bounds,closest:()=>null};
 const anchor={ownerDocument:{defaultView:win},getBoundingClientRect:()=>({left:580,right:642,top:55,bottom:83})};
 const pop={style:{},classList:{toggle(){}},getBoundingClientRect(){return {left:350+(parseFloat(this.style.left)||0),top:40+(parseFloat(this.style.top)||0),width:380,height:300};}};
 placePanePopover(pop,anchor,root);assert.equal(pop.getBoundingClientRect().left,358);assert.equal(pop.getBoundingClientRect().top,89);
 placePanePopover(pop,anchor,root);assert.equal(pop.getBoundingClientRect().left,358);assert.equal(pop.getBoundingClientRect().top,89);
});
