const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseEntries,changeEntry,assignEntry}=require('../src/inbox-entries.js');
const block=(source,title='问题',work='我：阅读')=>`- [[${source}|${title}]]${work ? ` [inbox-work:: ${work}]` : ''}\n  待比较原文。\n`;

test('independent sections retain free prose, multiple sources and exact CRLF bytes',()=>{
 const a=block('a'),b=block('b','另一问题');const text=('前言\n'+a+'\n'+b+'后记\n').replace(/\n/g,'\r\n');
 const rows=parseEntries(text);assert.equal(rows.length,2);assert.equal(rows[0].line,1);
 const changed=changeEntry(text,rows[0],assignEntry(rows[0],'SI：比较结论'));
 assert.ok(changed.includes('[inbox-work:: SI：比较结论]\r\n'));assert.ok(changed.includes(b.replace(/\n/g,'\r\n')));
 assert.ok(changed.endsWith('后记\r\n'));assert.ok(changed.includes('待比较原文。'));
});
test('ordinary linked lists work without identifiers; examples and unrelated text remain ordinary text',()=>{
 assert.equal(parseEntries('```md\n'+block('example')+'```\n').length,0);
 assert.equal(parseEntries('## 交接\n\n- [[Resources/论文]] 已归位，还需阅读。\n')[0].name,'论文');
 assert.equal(parseEntries('普通说明\n- 尚无链接的想法\n').length,0);
 const duplicate=block('a')+block('a');assert.equal(parseEntries(duplicate).length,2);
 assert.throws(()=>changeEntry(duplicate,parseEntries(duplicate)[0],''));
 assert.throws(()=>parseEntries(block('a').replace('[inbox-work:: 我：阅读]','[inbox-work:: 我：阅读] [inbox-work:: SI：整理]')));
});
test('stale edits and finish never erase later text; unrelated entry edits are allowed',()=>{
 const a=block('a'),b=block('b');const before=parseEntries(a+b)[0];
 assert.throws(()=>changeEntry(a.replace('待比较原文。','我补充了依据。')+b,before,''));
 assert.equal(changeEntry(a+b.replace('待比较原文。','另一条已改。'),before,''),b.replace('待比较原文。','另一条已改。'));
});

function fixture(){
 const files=new Map(),contents=new Map(),events=[];
 const parseYaml=s=>Object.fromEntries(s.split('\n').filter(x=>x.includes(':')).map(x=>{const n=x.indexOf(':');const v=x.slice(n+1).trim();return [x.slice(0,n),v==='true'?true:v];}));
 const add=(path,text)=>{const file={path,name:path.split('/').at(-1),basename:path.split('/').at(-1).replace(/\.md$/,''),extension:'md',stat:{mtime:1}};files.set(path,file);contents.set(file,text);return file;};
 const vault={getAbstractFileByPath:p=>files.get(p),read:async f=>{if(!contents.has(f))throw Error('missing');return contents.get(f);},
  async create(path,text){if(files.has(path))throw Error('exists');return add(path,text);},
  async process(file,edit){if(vault.failWrite)throw Error('write failed');contents.set(file,edit(contents.get(file)));}
 };
 const metadataCache={getFileCache:f=>({frontmatter:parseYaml(/^---\n([\s\S]*?)\n---/.exec(contents.get(f))?.[1]||'')})};
 const fileManager={
  async renameFile(f,path){if(fileManager.failRename)throw Error('rename failed');events.push([f.path,path]);files.delete(f.path);f.path=path;files.set(path,f);},
  async processFrontMatter(f,edit){const raw=contents.get(f),match=/^---\n([\s\S]*?)\n---\n/.exec(raw);const fm=parseYaml(match?.[1]||'');edit(fm);contents.set(f,'---\n'+Object.entries(fm).map(([k,v])=>k+': '+v).join('\n')+'\n---\n'+raw.slice(match?.[0].length||0));},
  generateMarkdownLink:f=>'[['+f.path+']]'
 };
 const plugin={app:{vault,fileManager,metadataCache},getManagedPath:()=> 'Inbox',filesUnderRoots:()=>[...files.values()].filter(f=>f.extension==='md'&&f.path.startsWith('Inbox/'))};
 files.set('Resources',{path:'Resources',children:[]});
 const obsidian={parseYaml};let work,entries;
 function load(name){const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/'+name),'utf8'),{module,structuredClone,require:id=>id==='obsidian'?obsidian:id==='./inbox-work.js'?work:require(id)});return module.exports;}
 work=load('inbox-work.js');entries=load('inbox-entries.js');
 const source=add('Inbox/资料.md','---\ninbox-work: 我：阅读\ninbox-next: old\nsubject: research\n---\n## 原文\n正文不变。');
 return {plugin,files,contents,vault,fileManager,source,entries,add,events};
}
test('move retains a linked entry, removes temporary fields and undo restores the source',async()=>{
 const f=fixture(),receipt=await f.entries.moveWithEntry(f.plugin,f.source.path,'Resources',{keep:true});
 assert.equal(f.source.path,'Resources/资料.md');assert.ok(!f.contents.get(f.source).includes('inbox-'));assert.ok(f.contents.get(f.source).includes('subject: research'));
 const state=await f.entries.loadEntries(f.plugin);assert.equal(state.entries.length,1);assert.equal(state.entries[0].work,'');assert.ok(state.entries[0].raw.includes('[[Resources/资料.md]]'));
 await f.entries.undoWithEntry(f.plugin,receipt);assert.equal(f.source.path,'Inbox/资料.md');assert.ok(f.contents.get(f.source).includes('inbox-work: 我：阅读'));assert.equal((await f.entries.loadEntries(f.plugin)).entries.length,0);
});
test('later entry edits block undo before any source move',async()=>{
 const f=fixture(),receipt=await f.entries.moveWithEntry(f.plugin,f.source.path,'Resources',{keep:true});const store=receipt.continuation.file;
 f.contents.set(store,f.contents.get(store).replace('[[Resources/资料.md]]','[[Resources/资料.md]]\n  新的要求'));
 await assert.rejects(f.entries.undoWithEntry(f.plugin,receipt));assert.equal(f.source.path,'Resources/资料.md');assert.ok(f.contents.get(store).includes('新的要求'));
});
test('plain move creates no central file; keeping a link appends to ordinary Inbox.md without replacing prose',async()=>{
 const f=fixture();await f.entries.moveWithEntry(f.plugin,f.source.path,'Resources');assert.ok(!f.files.has('Inbox/Inbox.md'));
 const g=fixture();g.add('Inbox/Inbox.md','个人笔记');await g.entries.moveWithEntry(g.plugin,g.source.path,'Resources',{keep:true});assert.ok(g.contents.get(g.files.get('Inbox/Inbox.md')).startsWith('个人笔记\n'));
});
test('failed entry write restores original location and fields; failed undo restores entry',async()=>{
 const f=fixture();f.vault.failWrite=true;await assert.rejects(f.entries.moveWithEntry(f.plugin,f.source.path,'Resources',{keep:true}));assert.equal(f.source.path,'Inbox/资料.md');assert.ok(f.contents.get(f.source).includes('inbox-work: 我：阅读'));
 const g=fixture(),receipt=await g.entries.moveWithEntry(g.plugin,g.source.path,'Resources',{keep:true});g.fileManager.failRename=true;
 await assert.rejects(g.entries.undoWithEntry(g.plugin,receipt));assert.equal((await g.entries.loadEntries(g.plugin)).entries.length,1);
});
test('finish and restore affect only the entry; source text remains unchanged',async()=>{
 const f=fixture(),receipt=await f.entries.moveWithEntry(f.plugin,f.source.path,'Resources',{keep:true});const {file,entry}=receipt.continuation,text=f.contents.get(f.source);
 await f.entries.editEntry(f.plugin,file,entry,'');assert.equal(f.contents.get(f.source),text);assert.equal((await f.entries.loadEntries(f.plugin)).entries.length,0);
 await f.entries.appendEntry(f.plugin,file,entry.raw);assert.equal((await f.entries.loadEntries(f.plugin)).entries.length,1);
 await assert.rejects(f.entries.appendEntry(f.plugin,file,entry.raw));
});

test('migration writes just a Markdown link, without UUID, markers, container properties or inherited assignment',async()=>{
 const f=fixture(),receipt=await f.entries.moveWithEntry(f.plugin,f.source.path,'Resources',{keep:true});
 assert.equal(f.contents.get(receipt.continuation.file),'## Inbox\n\n- [[Resources/资料.md]]\n');
 assert.equal(receipt.continuation.entry.work,'');
});
