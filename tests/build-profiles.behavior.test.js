const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {build}=require('esbuild');
async function load(name,modules){
 const result=await build({entryPoints:[path.resolve(__dirname,'../src/'+name)],bundle:true,platform:'node',format:'cjs',write:false,metafile:true,external:['obsidian'],define:{__NORIA_MEDIA__:String(modules.includes('media')),__NORIA_MODULES__:JSON.stringify(modules)}});
 const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,structuredClone,console,crypto:require('node:crypto').webcrypto});
 return {value:module.exports,inputs:Object.keys(result.metafile.inputs)};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('public media boundary removes implementations, not just navigation',async()=>{
 const {value,inputs}=await load('media-feature.js',[]);assert.equal(value,null);
 assert.ok(inputs.every(input=>!(/media-/.test(input)&&!input.endsWith('media-feature.js'))));
 const api=await load('public-api.js',[]),instance=api.value.createPublicApi({});
 assert.equal(instance.media,undefined);assert.ok(instance.capabilities().operations.every(op=>!op.name.startsWith('media.')));
});
test('public page edits retain parked private layouts and the preferred private landing page',async()=>{
 const {value:{WorkbenchPages}}=await load('workbench-pages.js',[]);
 const privatePage={id:'media',title:'My books',hidden:false,widgets:[{id:'book',source:'noria:media-library',props:{folder:'Books'},enabled:false}]};
 const health={id:'page-health',title:'Health',widgets:[{id:'sleep',source:'noria:health-sleep',props:{period:30}}]};
 const plugin={settings:{workbenchPages:{version:1,defaultPage:'media',pages:[privatePage,health,{id:'home',title:'Home'}]}},getNoriaLocale:()=> 'en',saveSettings:async()=>{}};
 const store=new WorkbenchPages(plugin),base=store.read(),draft=plain(base);
 assert.equal(base.defaultPage,'home');assert.ok(!base.pages.some(p=>['media','page-health'].includes(p.id)));
 draft.pages.find(p=>p.id==='home').title='My home';await store.configure(draft,base);
 assert.deepEqual(plain(plugin.settings.workbenchPages.pages.find(p=>p.id==='media')),privatePage);
 assert.deepEqual(plain(plugin.settings.workbenchPages.pages.find(p=>p.id==='page-health')),{...health,hidden:false});
 assert.equal(plugin.settings.workbenchPages.defaultPage,'media');
 const full=await load('workbench-pages.js',['media','health']);
 assert.equal(new full.value.WorkbenchPages(plugin).read().defaultPage,'media');
});
test('module selection filters only absent domain cards; third-party and ordinary note cards remain',async()=>{
 const {value}=await load('build-profile.js',['media','rss']);
 assert.ok(value.cardAvailable({source:'noria:media-library'}));assert.ok(value.cardAvailable({source:'noria:rss'}));
 for(const source of ['noria:health-sleep','noria:finance','noria:inventory','noria:wardrobe','noria:travel'])assert.equal(value.cardAvailable({source}),false);
 for(const source of ['noria:note','other:health','noria:period-overview'])assert.ok(value.cardAvailable({source}));
});
