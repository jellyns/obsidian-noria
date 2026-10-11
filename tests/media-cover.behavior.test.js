const test=require('node:test'),assert=require('node:assert/strict');
const {bindCoverImage,watchCoverImages}=require('../src/media-cover.js');
function fixture(){
 const classes=new Set(),images=[],placeholder={hidden:false};let source='app://cover.jpg?v=1';
 const host={dataset:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},createEl:()=>{const image={remove(){this.removed=true;}};images.push(image);return image;}};
 bindCoverImage(host,()=>source,{placeholder});
 return {host,classes,images,placeholder,set:value=>source=value};
}
test('replacing an asset changes only its image and restores fallback while loading or failing',()=>{
 const f=fixture(),first=f.images[0];first.onload();assert.equal(f.placeholder.hidden,true);
 f.set('app://cover.jpg?v=2');f.host._noriaRefreshCover();assert.equal(first.removed,true);assert.equal(f.placeholder.hidden,false);
 const second=f.images[1];assert.equal(second.src,'app://cover.jpg?v=2');second.onerror();assert.equal(second.removed,true);assert.equal(f.classes.has('has-cover'),false);assert.equal(f.placeholder.hidden,false);
 f.host._noriaRefreshCover(true);assert.equal(f.images.length,3);f.images[2].onload();assert.equal(f.placeholder.hidden,true);
});
test('late image events cannot hide the fallback or clear a newer cover',()=>{
 const f=fixture(),first=f.images[0];f.set('app://new.jpg');f.host._noriaRefreshCover();first.onload();assert.equal(f.placeholder.hidden,false);
 f.images[1].onload();first.onerror();assert.equal(f.placeholder.hidden,true);assert.equal(f.classes.has('has-cover'),true);
});
test('unrelated refresh and reconnect do not reload a successful cover; missing references stay readable',()=>{
 const f=fixture();f.images[0].onload();f.host._noriaRefreshCover();f.host._noriaRefreshCover(true);assert.equal(f.images.length,1);
 f.set('');f.host._noriaRefreshCover();assert.equal(f.images[0].removed,true);assert.equal(f.placeholder.hidden,false);
 f.host._noriaRefreshCover(true);assert.equal(f.images.length,1);
});
test('image events coalesce, note edits are ignored and disposal removes listeners',async()=>{
 const vault=new Map(),windowEvents=new Map(),cleanup=[],calls=[];
 const component={registerEvent:r=>cleanup.push(()=>vault.delete(r)),register:fn=>cleanup.push(fn)};
 const container={querySelectorAll:()=>[{_noriaRefreshCover:v=>calls.push(v)}],ownerDocument:{defaultView:{addEventListener:(n,f)=>windowEvents.set(n,f),removeEventListener:n=>windowEvents.delete(n)}}};
 watchCoverImages({app:{vault:{on:(n,f)=>{vault.set(n,f);return n;}}}},component,container);
 vault.get('modify')({path:'Book.md'});await new Promise(r=>setTimeout(r,120));assert.equal(calls.length,0);
 vault.get('modify')({path:'Cover.jpg'});vault.get('create')({path:'Cover.jpg'});await new Promise(r=>setTimeout(r,120));assert.deepEqual(calls,[false]);
 windowEvents.get('online')();assert.deepEqual(calls,[false,true]);vault.get('rename')({path:'Cover.txt'},'Cover.jpg');cleanup.forEach(fn=>fn());await new Promise(r=>setTimeout(r,120));assert.deepEqual(calls,[false,true]);assert.equal(vault.size,0);assert.equal(windowEvents.size,0);
});
