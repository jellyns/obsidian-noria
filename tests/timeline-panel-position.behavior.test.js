const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={module:{exports:{}},require:n=>n==='./pane-popover.js'?require('../src/pane-popover.js'):{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/timeline-workspace.js'),'utf8'),ctx);
const {TimelineWorkspace}=ctx.module.exports;
test('timeline panels fit the pane and reposition after pane or content resize',()=>{
 let resize,disconnected=false,frame;const listeners=new Map(),win={innerWidth:1200,innerHeight:800,requestAnimationFrame:fn=>(frame=fn,1),cancelAnimationFrame:()=>frame=null,ResizeObserver:class{constructor(fn){resize=fn;}observe(){}disconnect(){disconnected=true;}},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 let width=400,height=300;const root={getBoundingClientRect:()=>({left:600,right:600+width,top:100,bottom:100+height})};
 const panel={style:{},isConnected:true,getBoundingClientRect(){return {width:parseFloat(this.style.width),height:Math.min(420,parseFloat(this.style.maxHeight))};}};
 const anchor={isConnected:true,ownerDocument:{defaultView:win},getBoundingClientRect:()=>({left:820,right:848,top:110,bottom:138})};
 const w=new TimelineWorkspace({plugin:{},hostEl:root}),cleanup=w.bindPanelPosition(panel,anchor);
 assert.equal(panel.style.width,'320px');assert.equal(panel.style.maxHeight,'284px');assert.equal(panel.style.top,'108px');
 width=240;height=220;resize();frame();assert.equal(panel.style.width,'224px');assert.equal(panel.style.left,'608px');assert.equal(panel.style.maxHeight,'204px');
 cleanup();assert.equal(disconnected,true);assert.equal(listeners.size,0);assert.equal(frame,null);
});
