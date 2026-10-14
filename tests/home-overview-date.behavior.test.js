const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('overview today count uses local midnight rather than the UTC date',async()=>{
 const rows=[],element=()=>({style:{},addClass(){},createDiv(){return element();},createEl(tag,opts){if(tag==='small')rows.push({label:opts.text});if(tag==='b')rows.at(-1).value=opts.text;return element();}});
 class LocalDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-01T16:30:00Z']));}getFullYear(){return new Date(this.getTime()+8*3600000).getUTCFullYear();}getMonth(){return new Date(this.getTime()+8*3600000).getUTCMonth();}getDate(){return new Date(this.getTime()+8*3600000).getUTCDate();}}
 const pages=['2026-10-01','2026-10-02','2026-10-02'].map((date,i)=>({created:date,tags:[],file:{path:'Notes/'+i+'.md',name:String(i),extension:'md',mtime:1,tasks:[]}}));
 await vm.runInNewContext(fs.readFileSync('src/runtime/views/dashboard/home/sections/overview-metrics/view.js','utf8'),{requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){} disconnect(){}},Date:LocalDate,Intl,app:{metadataCache:{unresolvedLinks:{}}},ctx:{io:{load:async()=>''}},input:{mount:element(),metricsLayout:'hero',noriaBridge:{t:key=>key,data:{getTasks:async()=>({items:[]})},runtime:{pagesForScope:()=>pages,pagesForManagedPath:()=>[]}}}});
 assert.equal(rows.find(r=>r.label==='runtime.home.metrics.todayNotes').value,'+2');
});
test('overview distinguishes empty notes from failed reads and retries unchanged files',async()=>{
 const source=fs.readFileSync('src/runtime/views/dashboard/home/sections/overview-metrics/view.js','utf8');
 const rows=[],element=()=>({style:{},addClass(){},setAttribute(){},createDiv(){return element();},createEl(tag,opts){if(tag==='small')rows.push({label:opts.text});if(tag==='b')rows.at(-1).value=opts.text;return element();}});
 const pages=['empty','unread','ok'].map(name=>({tags:[],file:{path:`Notes/${name}.md`,name,mtime:1,tasks:[]}}));
 const reads={},context=vm.createContext({requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){} disconnect(){}},Intl,app:{metadataCache:{unresolvedLinks:{}}},ctx:{io:{load:async path=>{reads[path]=(reads[path]||0)+1;if(path.includes('unread')&&fail)throw Error('read unavailable');return path.includes('empty')?'':'abc';}}},input:{mount:element(),metricsLayout:'hero',overviewFields:['totalWords'],noriaBridge:{locale:'en',runtime:{pagesForScope:()=>pages,pagesForManagedPath:()=>[]}}}});
 let fail=true;
 await vm.runInContext(source,context);assert.equal(rows.at(-1).value,'—');
 fail=false;await vm.runInContext(source,context);assert.equal(rows.at(-1).value,'6');
 assert.equal(reads['Notes/empty.md'],1);assert.equal(reads['Notes/ok.md'],1);assert.equal(reads['Notes/unread.md'],2);
});
test('overview discards old caches that may contain false zeroes',async()=>{
 const rows=[],element=()=>({style:{},addClass(){},createDiv(){return element();},createEl(tag,opts){if(tag==='b')rows.push(opts.text);return element();}});
 const page={tags:[],file:{path:'Notes/a.md',name:'a',mtime:1,tasks:[]}};
 await vm.runInNewContext(fs.readFileSync('src/runtime/views/dashboard/home/sections/overview-metrics/view.js','utf8'),{requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){} disconnect(){}},Intl,__noria_home_overview_metrics_cache_v1:{byPath:{'Notes/a.md':{mtime:'1',length:0}}},app:{metadataCache:{unresolvedLinks:{}}},ctx:{io:{load:async()=> 'abc'}},input:{mount:element(),overviewFields:['totalWords'],noriaBridge:{runtime:{pagesForScope:()=>[page],pagesForManagedPath:()=>[]}}}});
 assert.deepEqual(rows,['3']);
});
