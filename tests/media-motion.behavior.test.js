const test=require('node:test'),assert=require('node:assert/strict');
const {mediaMotion}=require('../src/media-motion.js');
function scene(reduced=false){
 const ghosts=[],animations=[],listeners=new Map();let observer;
 const win={matchMedia:()=>({matches:reduced}),addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}}};
 const doc={defaultView:win,body:{append:g=>ghosts.push(g)}};
 function element(rect){return {isConnected:true,style:{visibility:''},classList:{add(){}},setAttribute(){},getBoundingClientRect:()=>rect,cloneNode:()=>element(rect),remove(){ghosts.splice(ghosts.indexOf(this),1);},animate(frames,options){let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const a={frames,options,finished,cancel(){reject(Error('cancel'));},finish:resolve};animations.push(a);return a;}};}
 const section={hidden:false},motion=mediaMotion({ownerDocument:doc,closest:()=>section});
 const from=element({left:20,top:40,width:100,height:150}),to=element({left:200,top:80,width:200,height:300});
 return {motion,from,to,ghosts,animations,listeners,hide:()=>{section.hidden=true;observer();}};
}
test('cover handoff animates between measured positions and restores the real cover',async()=>{
 const s=scene();s.motion.move(s.motion.capture(s.from),s.to,null);
 assert.equal(s.ghosts.length,1);assert.equal(s.to.style.visibility,'hidden');
 assert.equal(s.animations[0].frames[1].transform,'translate(180px,40px) scale(2,2)');
 s.animations[0].finish();await Promise.resolve();assert.equal(s.to.style.visibility,'');assert.equal(s.ghosts.length,0);s.motion.dispose();
});
test('hidden category, scrolling and disposal cancel moving covers without residual overlays',()=>{
 const s=scene();s.motion.move(s.motion.capture(s.from),s.to,null);s.hide();
 assert.equal(s.to.style.visibility,'');assert.equal(s.ghosts.length,0);
 s.motion.move(s.motion.capture(s.from),s.to,null);s.listeners.get('scroll')();assert.equal(s.ghosts.length,0);
 s.motion.move(s.motion.capture(s.from),s.to,null);s.motion.dispose();assert.equal(s.ghosts.length,0);assert.equal(s.listeners.size,0);
});
test('reduced motion displays the destination directly without animation',()=>{
 const s=scene(true);assert.equal(s.motion.capture(s.from),null);s.motion.move(null,s.to,s.to);assert.equal(s.animations.length,0);assert.equal(s.to.style.visibility,'');s.motion.dispose();
});
