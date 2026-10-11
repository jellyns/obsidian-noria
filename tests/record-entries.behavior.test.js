const test=require('node:test'),assert=require('node:assert/strict');
const {readEntries,changeEntry}=require('../src/record-entries.js');
const parse=s=>Object.fromEntries(s.split(/\r?\n/).flatMap(l=>{const m=/^("[^"]+"|[^:]+):\s*(.+)$/.exec(l);return m?[[m[1].replace(/^"|"$/g,''),JSON.parse(m[2])]]:[]}));
const field={id:'reading',name:'阅读时长',property:'minutes',type:'number',multiple:true,aggregation:'sum'};
test('first addition retains the original daily value without inventing its time',()=>{
 const raw='---\nminutes: 20\n---\n## Thoughts\nKeep this.\n';
 const next=changeEntry(raw,field,{operation:'append',value:15,time:'09:10'},parse);
 const state=readEntries(next,field,parse);assert.equal(state.value,35);assert.deepEqual(state.entries,[{time:'',value:20},{time:'09:10',value:15}]);assert.ok(next.includes('Keep this.'));assert.match(next,/"minutes": 35/);
});
test('individual edits preserve prose; removing the last entry stays empty, even after disabling multiple mode',()=>{
 let raw=changeEntry('---\nminutes: 0\n---\n',field,{operation:'append',value:4,time:''},parse);
 raw+='A personal observation.\n';raw=changeEntry(raw,field,{operation:'delete',entry:1},parse);raw=changeEntry(raw,field,{operation:'delete',entry:0},parse);
 assert.equal(readEntries(raw,{...field,multiple:false},parse).value,null);assert.equal(readEntries(raw,field,parse).entries.length,0);assert.match(raw,/A personal observation/);
});
test('latest means the latest recorded time, with an untimed original value as baseline',()=>{
 const f={...field,type:'option',options:['Good','Low'],aggregation:'latest'};
 let raw=changeEntry('---\nminutes: "Good"\n---\n',f,{operation:'append',value:'Low',time:'18:00'},parse);
 raw=changeEntry(raw,f,{operation:'append',value:'Good',time:'09:00'},parse);assert.equal(readEntries(raw,f,parse).value,'Low');
 raw=changeEntry(raw,f,{operation:'edit',entry:1,value:'Good',time:'18:00'},parse);assert.equal(readEntries(raw,f,parse).value,'Good');
});
test('stored daily aggregation survives a setting change; malformed or duplicate sections reject writes',()=>{
 const raw=changeEntry('',field,{operation:'append',value:4,time:'10:00'},parse);
 const next=changeEntry(raw,{...field,aggregation:'latest'},{operation:'append',value:6,time:'11:00'},parse);assert.equal(readEntries(next,field,parse).value,10);
 for(const bad of [raw+'\n## Duplicate [record:: minutes] [summary:: sum]\n',raw.replace('- 10:00 · 4','- broken')])assert.throws(()=>changeEntry(bad,field,{operation:'append',value:1,time:''},parse));
 assert.throws(()=>changeEntry(raw,field,{operation:'edit',entry:5,value:1,time:''},parse));
 assert.throws(()=>changeEntry(raw,field,{operation:'append',value:1,time:'25:00'},parse));
});
test('code examples do not become records; unrelated sections and CRLF are preserved',()=>{
 const raw='```md\r\n## Example [record:: minutes] [summary:: sum]\r\n- 99\r\n```\r\n## Keep\r\nText.\r\n';
 const next=changeEntry(raw,field,{operation:'append',value:0,time:''},parse);assert.equal(readEntries(next,field,parse).value,0);assert.ok(next.includes(raw));assert.equal(next.replace(/\r\n/g,'').includes('\n'),false);
});
