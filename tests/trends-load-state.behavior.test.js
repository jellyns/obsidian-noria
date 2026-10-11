const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function element(options={}) {
 const node={children:[],style:{},textContent:options.text||'',addClass(){},setAttr(){},setAttribute(){},empty(){this.children=[];},remove(){},getBoundingClientRect(){return {height:0};},createDiv(options){const child=element(options);this.children.push(child);return child;},createEl(tag,options){const child=this.createDiv(options);child.tag=tag;return child;},replaceChildren(...children){this.children=children;}};
 return node;
}
const flatten=node=>[node,...node.children.flatMap(flatten)];
test('statistics retry and range changes clear failed or outdated plots, keeping the selected range',async()=>{
 const mount=element(),requests=[],cleanups=[];let fail=true,onRange,release;
 const bridge={locale:'en',runtime:{subscribeStatisticRange:(_id,fn)=>{onRange=fn;return ()=>{};}},data:{getSnapshot:async request=>{requests.push(request);if(release)await new Promise(resolve=>{release=resolve;});if(fail)throw Error('Diary unavailable');return {label:request.range.start||'initial'};}}};
 const runner=new AsyncFunction('ctx','input','app','window','document','globalThis',fs.readFileSync('src/runtime/views/dashboard/home/sections/trends-and-stats/view.js','utf8'));
 const globals={};
 await runner({io:{load:async path=>path.includes('/blocks/note-trend')?'input.mount.createDiv({text:input.statsSnapshot.label});':''}},{mount,renderMode:'block',block:'note-trend',noriaBridge:bridge,registerCleanup:fn=>cleanups.push(fn)},{},{},{},globals);
 const text=()=>flatten(mount).map(n=>n.textContent).join(' '),retry=()=>flatten(mount).find(n=>n.tag==='button');
 assert.match(text(),/could not be loaded/);
 await retry().onclick();assert.equal(requests.length,2);assert.ok(retry());
 fail=false;await retry().onclick();assert.doesNotMatch(text(),/could not be loaded/);assert.ok(!retry());
 fail=true;onRange({range:{mode:'custom',start:'2026-01-01',end:'2026-01-07'},granularity:'day'});
 await new Promise(r=>setImmediate(r));assert.match(text(),/could not be loaded/);assert.doesNotMatch(text(),/initial/);
 fail=false;await retry().onclick();assert.match(text(),/2026-01-01/);assert.equal(requests.at(-1).range.end,'2026-01-07');
 release=true;onRange({range:{mode:'custom',start:'2026-02-01',end:'2026-02-07'},granularity:'day'});
 await new Promise(r=>setImmediate(r));cleanups.forEach(fn=>fn());fail=true;release();
 await new Promise(r=>setImmediate(r));assert.doesNotMatch(text(),/could not be loaded/,'disposed view ignores a late failure');
});
