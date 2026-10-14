const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
function fixture(read){
 const file=path.resolve(__dirname,'../src/shortcut-card.js'),local=createRequire(file),entry={exports:{}},opened=[];
 const links=[],stubs={obsidian:{SuggestModal:class{},Modal:class{}},'./card-controls.js':{},'./picture-picker.js':{},'./media-card.js':{},'./link-target.js':{openVaultLink:async(...args)=>links.push(args.slice(1))},'./media-feature.js':{openReading:read,openWork:async(...args)=>opened.push(args.slice(1))}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:entry,require:id=>id in stubs?stubs[id]:local(id)});
 const plugin={getNoriaLocale:()=> 'zh',app:{metadataCache:{getFirstLinkpathDest:()=>({path:'Books/原子习惯.md'})}}};
 return {open:(shortcut={kind:'media',target:'Books/原子习惯.md'})=>entry.exports.openShortcut(plugin,shortcut),opened,links};
}

test('note shortcuts use the shared reader navigation and retain explicit anchors',async()=>{
 const f=fixture();await f.open({kind:'file',target:'Notes/习惯.md#结论'});
 assert.deepEqual(f.links,[['Notes/习惯.md#结论','']]);assert.equal(f.opened.length,0);
});
test('a working shortcut opens its destination and an unconfigured one opens work details',async()=>{
 const working=fixture(async()=>true);await working.open();assert.equal(working.opened.length,0);
 const empty=fixture(async()=>false);await empty.open();assert.deepEqual(empty.opened,[['Books/原子习惯.md']]);
});
test('only destination errors lead to the original work repair flow',async()=>{
 const broken=fixture(async()=>{throw Object.assign(Error('Choose it again'),{code:'media-destination'});});await broken.open();
 assert.deepEqual(broken.opened,[['Books/原子习惯.md',false,'Choose it again']]);
 const failure=Error('Disk unavailable'),other=fixture(async()=>{throw failure;});await assert.rejects(other.open(),e=>e===failure);assert.equal(other.opened.length,0);
});
