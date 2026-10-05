const test=require('node:test'),assert=require('node:assert/strict');
const {timelineRecordPreview}=require('../src/timeline-record-preview.js');
test('short captures retain complete Markdown and images',()=>{
  const raw='A short thought with [[Link]]\n\n![[image.png]]';assert.deepEqual(timelineRecordPreview(raw),{long:false,markdown:raw,plain:''});
});
test('long records preview complete blocks without clipping code fences',()=>{
  const raw='Opening paragraph.\n\n```js\n'+('const example = "long";\n'.repeat(70))+'```\n\nTail.';
  const result=timelineRecordPreview(raw);assert.equal(result.long,true);assert.equal(result.markdown,'Opening paragraph.');assert.equal(result.plain,'');
});
test('a single long paragraph or code block uses a bounded plain excerpt',()=>{
  for(const raw of ['Long [[path|label]] '+('😀 '.repeat(1000)), '```js\n'+('const x = 1;\n'.repeat(80))+'```']){
    const result=timelineRecordPreview(raw);assert.equal(result.long,true);assert.equal(result.markdown,'');assert.ok(Array.from(result.plain).length<=181);assert.ok(!result.plain.includes('```'));assert.ok(!result.plain.includes('[[path'));
  }
});
test('many short lines and image-only records do not fill the initial stream',()=>{
  for(const raw of [Array.from({length:40},(_,i)=>'row '+i).join('\n'),'![[a.png]] ![[b.png]] ![[c.png]]'])assert.equal(timelineRecordPreview(raw).long,true);
});
test('compact answer previews keep whole blocks without changing the timeline default',()=>{
 const raw='A short opening with [[Source]].\n\n'+('Further context. '.repeat(30));
 assert.equal(timelineRecordPreview(raw).long,false);
 const compact=timelineRecordPreview(raw,{maxChars:360,previewChars:160});
 assert.equal(compact.long,true);assert.equal(compact.markdown,'A short opening with [[Source]].');
 const short='A brief answer with [[Source]].';
 assert.equal(timelineRecordPreview(short,{maxChars:360,previewChars:160}).markdown,short);
});
