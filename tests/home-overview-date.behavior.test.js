const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('overview today count uses local midnight rather than the UTC date',async()=>{
 const rows=[],element=()=>({style:{},addClass(){},createDiv(){return element();},createEl(tag,opts){if(tag==='small')rows.push({label:opts.text});if(tag==='b')rows.at(-1).value=opts.text;return element();}});
 class LocalDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-01T16:30:00Z']));}getFullYear(){return new Date(this.getTime()+8*3600000).getUTCFullYear();}getMonth(){return new Date(this.getTime()+8*3600000).getUTCMonth();}getDate(){return new Date(this.getTime()+8*3600000).getUTCDate();}}
 const pages=['2026-10-01','2026-10-02','2026-10-02'].map((date,i)=>({created:date,tags:[],file:{path:'Notes/'+i+'.md',name:String(i),extension:'md',mtime:1,tasks:[]}}));
 await vm.runInNewContext(fs.readFileSync('src/runtime/views/dashboard/home/sections/overview-metrics/view.js','utf8'),{Date:LocalDate,Intl,app:{metadataCache:{unresolvedLinks:{}}},ctx:{io:{load:async()=>''}},input:{mount:element(),metricsLayout:'hero',noriaBridge:{t:key=>key,data:{getTasks:async()=>({items:[]})},runtime:{pagesForScope:()=>pages,pagesForManagedPath:()=>[]}}}});
 assert.equal(rows.find(r=>r.label==='runtime.home.metrics.todayNotes').value,'+2');
});
