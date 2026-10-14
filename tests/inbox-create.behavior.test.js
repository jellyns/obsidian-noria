'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInboxNote}=require('../src/inbox-create.js');
function fixture(){
  const files=new Map(),parents=[];
  const plugin={getNoriaLocale:()=> 'zh',getManagedPath:()=> 'Capture',ensureVaultParent:async p=>parents.push(p),requestNoriaRefresh(){},
    app:{vault:{adapter:{exists:async p=>files.has(p)},create:async(path,content)=>{files.set(path,content);return {path};}}}};
  return {plugin,files,parents};
}
test('Inbox creation works before onboarding and writes editable Markdown in the chosen folder',async()=>{
  const {plugin,files,parents}=fixture();
  const note=await createInboxNote(plugin,{title:'带上雨伞',body:'明天出门前看天气'});
  assert.equal(note.path,'Capture/带上雨伞.md');assert.deepEqual(parents,[note.path]);
  assert.equal(files.get(note.path),'## 带上雨伞\n\n明天出门前看天气\n');
});
test('same-name notes and invalid names cannot be overwritten or escape the Inbox',async()=>{
  const {plugin,files,parents}=fixture();files.set('Capture/原文.md','keep');
  await assert.rejects(createInboxNote(plugin,{title:'原文'}),/同名/);
  for(const title of ['../Elsewhere','A/B','A\\B','CON','bad:note','a\nb','a.',''])await assert.rejects(createInboxNote(plugin,{title}));
  assert.equal(files.get('Capture/原文.md'),'keep');assert.equal(files.size,1);assert.equal(parents.length,0);
});
