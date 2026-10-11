const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('template date resolution uses a configured year folder and never lets Moment supply a missing year',async()=>{
 const calls=[],box={exports:{}},parse=(name,format)=>{calls.push([name,format]);return {isValid:()=>name==='2032/04/05'&&format==='YYYY/MM/DD',format:()=> '2032-04-05'};};
 vm.runInNewContext(fs.readFileSync('src/diary-cards-embed.js','utf8'),{module:box,require:id=>id==='obsidian'?{moment:parse}:{}});
 const plugin={cards:{text:(_zh,en)=>en},getCalendarSettings:()=>({}),getCalendarPatternForPeriod:()=> 'YYYY/MM/DD',resolveReviewSelection:value=>value};
 const selection=await box.exports.selectionForNote(plugin,'Diary/2032/04/05.md',{mode:'daily'});
 assert.equal(selection.anchorDate,'2032-04-05');assert.deepEqual(calls,[['2032/04/05','YYYY/MM/DD']]);
 calls.length=0;plugin.getCalendarPatternForPeriod=()=> 'MM-DD';
 await assert.rejects(()=>box.exports.selectionForNote(plugin,'Diary/04-05.md',{mode:'daily'}),/Cannot read the date/);
 assert.equal(calls.some(([,format])=>format==='MM-DD'),false);
});
