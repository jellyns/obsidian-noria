const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
const code=main.slice(main.indexOf('class NoriaTasksView'),main.indexOf('class NoriaTaskTimelineView'));
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const calls=[],cleaned=[],errors=[];let shot={};
 const host=()=>({root:null,querySelector(){return this.root},querySelectorAll(){return this.root?[this.root]:[]},createEl(tag,options){errors.push(options.text)}});
 const container={empty(){},createDiv(){return host()}};
 const plugin={settings:{tasksCalendar:{defaultView:'month'}},isModuleEnabled:()=>true,consumeTasksItemViewInput(){const next=shot;shot={};return next},
  runNoriaView(type,input,target){return new Promise((resolve,reject)=>calls.push({input,target,finish(){target.root={getAttribute:k=>k==='view'||k==='data-noria-current-view'?input.view:k==='data-noria-current-anchor'?input.startPosition:null,__noriaTasksCalendarCleanup(){cleaned.push(target)}};resolve()},reject}));}};
 const View=vm.runInNewContext(code+';NoriaTasksView',{NoriaPaneView:class{constructor(leaf,p){this.plugin=p;this.containerEl=container}},NORIA_DEFAULT_TASKS_CALENDAR:{defaultView:'month'},console:{error(){}}});
 const view=new View({},plugin);view.hostEl=host();view.hostEl.root={getAttribute:k=>k==='view'||k==='data-noria-current-view'?'week':k==='data-noria-current-anchor'?'2026-12-27':null};
 return {view,calls,cleaned,errors,setShot:value=>{shot=value}};
}

test('overlapping refreshes retain the date and view and coalesce repeated work',async()=>{
 const f=fixture(),pending=[f.view.reload()];await tick();
 for(let i=0;i<8;i++)pending.push(f.view.reload());
 assert.equal(f.calls.length,1,'only one renderer is active while its read is pending');
 f.calls[0].finish();await tick();assert.equal(f.calls.length,2,'one fresh pass catches changes made during the first read');
 assert.equal(f.calls[1].input.view,'week');assert.equal(f.calls[1].input.startPosition,'2026-12-27');
 f.calls[1].finish();await Promise.all(pending);
 assert.equal(f.view.captureCurrentTasksRuntimeInput().view,'week');
});

test('a navigation during a pending refresh wins over the previous date',async()=>{
 const f=fixture(),first=f.view.reload();await tick();
 f.setShot({view:'day',startPosition:'2026-12-30'});const next=f.view.reload();
 f.calls[0].finish();await tick();
 assert.equal(f.calls.at(-1).input.view,'day');assert.equal(f.calls.at(-1).input.startPosition,'2026-12-30');
 f.calls.at(-1).finish();await Promise.all([first,next]);
 assert.equal(f.view.captureCurrentTasksRuntimeInput().view,'day');
});

test('closing during a read disposes late content and cancels queued renders',async()=>{
 const f=fixture(),pending=[f.view.reload()];await tick();pending.push(f.view.reload());await f.view.onClose();
 for(const call of f.calls)call.finish();await Promise.all(pending);
 assert.equal(f.calls.length,1);assert.equal(f.view.hostEl,null);assert.ok(f.cleaned.includes(f.calls[0].target));
});

test('a read failure allows a later refresh and retains its navigation context',async()=>{
 const f=fixture(),pending=f.view.reload();await tick();f.calls[0].reject(Error('read failed'));await pending;
 const next=f.view.reload();await tick();assert.equal(f.calls.at(-1).input.view,'week');
 f.calls.at(-1).finish();await next;assert.equal(f.errors.length,1);
});


test('a background refresh cannot overwrite navigation queued behind a partially painted old view',async()=>{
 const f=fixture(),first=f.view.reload();await tick();
 f.setShot({view:'day',startPosition:'2026-12-30'});const navigation=f.view.reload();
 f.view.hostEl.root={getAttribute:k=>k==='view'||k==='data-noria-current-view'?'week':k==='data-noria-current-anchor'?'2026-12-27':null};
 const background=f.view.reload();f.calls[0].finish();await tick();
 const next=f.calls.at(-1);next.finish();await Promise.all([first,navigation,background]);
 assert.equal(next.input.view,'day');assert.equal(next.input.startPosition,'2026-12-30');
});

test('a closed pane ignores a failed late read and can reopen with a new navigation',async()=>{
 const f=fixture(),first=f.view.reload();await tick();await f.view.onClose();f.calls[0].reject(Error('late read'));await first;
 assert.deepEqual(f.errors,[]);f.setShot({view:'day',startPosition:'2027-01-02'});
 const open=f.view.onOpen();await tick();f.calls.at(-1).finish();await open;
 assert.equal(f.view.captureCurrentTasksRuntimeInput().startPosition,'2027-01-02');
});
