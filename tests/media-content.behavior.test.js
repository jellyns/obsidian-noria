const test=require('node:test'),assert=require('node:assert/strict');
const {contentProfile,sectionTitles,readSection,writeSection,templateContent,loadTemplate,mediaReadingParts}=require('../src/media-content-model.js');
const parse=raw=>Object.fromEntries(raw.split('\n').filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).replaceAll('"',''),JSON.parse(line.slice(i+1))];}));
test('sections ignore code, comments and metadata while retaining nested headings',()=>{
 const raw='---\ntitle: "## fake"\n---\n## 简介\n\n介绍\n```md\n## 评语\n```\n\n## 评语\n\n我的话\n### 细节\n补充\n\n## 其他\n保留\n';
 assert.deepEqual(sectionTitles(raw),['简介','评语','其他']);const binding=readSection(raw,'评语');
 assert.equal(binding.content,'我的话\n### 细节\n补充');
 const changed=writeSection(raw,binding,'新评语\n### 细节\n新补充');assert.ok(changed.includes('```md\n## 评语\n```'));assert.ok(changed.endsWith('## 其他\n保留\n'));
});
test('section edits merge independent changes and reject concurrent same-section writes',()=>{
 const raw='## 简介\n旧简介\n\n## 评语\n旧评语\n',binding=readSection(raw,'评语');
 assert.ok(writeSection(raw.replace('旧简介','新简介'),binding,'新评语').includes('新简介'));
 assert.throws(()=>writeSection(raw.replace('旧评语','他处编辑'),binding,'新评语'),e=>e.code==='conflict');
 assert.equal(writeSection(raw,binding,'旧评语'),raw);
 assert.throws(()=>readSection(raw+'\n## 评语\n重复','评语'),e=>e.code==='ambiguous');
});
test('missing sections append only on edits and malformed boundaries never consume neighboring text',()=>{
 const raw='## 其他\r\n保留\r\n',binding=readSection(raw,'评语');assert.equal(writeSection(raw,binding,''),raw);
 const created=writeSection(raw,binding,'新评语');assert.ok(created.startsWith(raw));assert.equal(readSection(created,'评语').content,'新评语');assert.equal(created.replace(/\r\n/g,'').includes('\n'),false);
 for(const value of ['## 其他\n覆盖','```\n未闭合','%% 未闭合'])assert.throws(()=>writeSection(raw,binding,value),e=>e.code==='structure');
 assert.throws(()=>writeSection(raw+'```\n',readSection(raw+'```\n','评语'),'正文'),e=>e.code==='structure');
});
test('templates initialize one note with caller facts and selected type while preserving custom body and fields',()=>{
 const raw='---\ntags: ["book","topic/habits"]\nauthor: "模板作者"\ncustom: {"source":"local"}\n---\n## 简介\n{{title}}\n\n## 评语\n\n## 摘录\n{{date}}\n';
 const next=templateContent(raw,{title:'A "quoted" title',tags:['book'],author:['实际作者']},{date:'2026-10-08',parse});
 assert.ok(next.includes('"custom": {"source":"local"}'));assert.ok(next.includes('"author": ["实际作者"]'));assert.ok(next.endsWith('## 摘录\n2026-10-08\n'));
 assert.ok(next.includes('"tags": ["book","topic/habits"]'));assert.ok(next.includes('## 简介\nA "quoted" title'));
 assert.throws(()=>templateContent(raw,{title:'Movie',tags:['movie']},{parse}),e=>e.code==='template');
 assert.equal(raw.includes('{{title}}'),true);
});
test('profiles and missing templates have explicit boundaries',async()=>{
 assert.deepEqual(contentProfile({settings:{},getNoriaLocale:()=> 'zh'},'book'),{template:'',intro:'简介',review:'评语',sections:[],sectionMode:'all'});
 const p={normalizePath:x=>x,app:{vault:{getAbstractFileByPath:()=>null}}};
 await assert.rejects(loadTemplate(p,'../private.md'),e=>e.code==='template');await assert.rejects(loadTemplate(p,'missing.md'),e=>e.code==='template');
});

test('a template identity is retained without adding another alias, while untyped templates receive one',()=>{
 const create=tags=>templateContent('---\ntags: '+JSON.stringify(tags)+'\n---\n## 评语\n',{title:'原子习惯',tags:['book']},{parse});
 for(const tag of ['#图书','arts/books','BOOK'])assert.ok(create([tag,'习惯']).includes('"tags": '+JSON.stringify([tag,'习惯'])));
 assert.ok(create(['习惯']).includes('"tags": ["习惯","book"]'));
});

test('custom template sections follow source order without registration and free prose is retained',()=>{
 const profile=contentProfile({settings:{},getNoriaLocale:()=> 'zh'},'book');
 const raw='---\ntitle: "作品"\n---\n开篇\n## 摘录\n### 子标题\n文字\n# 补充\n自由内容\n## 简介\n简介正文\n## 评语\n自己的话\n## 自定义\n';
 const parts=mediaReadingParts(raw,profile,parse);
 assert.deepEqual(parts.map(p=>p.name||p.content.trim()),['开篇','摘录','# 补充\n自由内容','简介','评语','自定义']);
 assert.equal(parts.some(p=>p.content?.includes('title:')),false);
 const unstructured=mediaReadingParts('一段普通笔记\n\n[[关联]]',profile,parse);
 assert.equal(unstructured.find(p=>p.kind==='prose').content,'一段普通笔记\n\n[[关联]]');
});

test('prior deliberate section selections are retained and can explicitly return to following the note',()=>{
 const p={settings:{mediaContent:{book:{sections:['摘录']}}},getNoriaLocale:()=> 'zh'};
 let profile=contentProfile(p,'book');assert.equal(profile.sectionMode,'selected');
 assert.deepEqual(mediaReadingParts('## 未选择\n内容',profile,parse).map(p=>p.name),['简介','评语','摘录']);
 p.settings.mediaContent.book.sectionMode='all';profile=contentProfile(p,'book');
 assert.equal(mediaReadingParts('## 未选择\n内容',profile,parse).some(p=>p.name==='未选择'),true);
});

test('duplicate headings remain readable without exposing unsafe section editing',()=>{
 const profile=contentProfile({settings:{}},'book');
 const parts=mediaReadingParts('## 重复\n一\n## 重复\n二\n',profile,parse);
 assert.deepEqual(parts.filter(p=>p.kind==='prose').map(p=>p.content),['## 重复\n一\n','## 重复\n二\n']);
 assert.equal(parts.some(p=>p.name==='重复'),false);
});

test('opening a Markdown template uses the actual file in an editor and never creates a missing file',async()=>{
 const {openMarkdownTemplate}=require('../src/template-file.js'),file={path:'Templates/书.temple.md',extension:'md'},calls=[];
 const p={getNoriaLocale:()=> 'zh',normalizePath:p=>p,app:{vault:{getAbstractFileByPath:p=>p===file.path?file:null},workspace:{getLeaf:type=>({openFile:(f,options)=>calls.push({type,file:f,options})})}}};
 await openMarkdownTemplate(p,file.path);assert.deepEqual(calls,[{type:'tab',file,options:{state:{mode:'source'}}}]);
 await assert.rejects(openMarkdownTemplate(p,''),/选择模板/);await assert.rejects(openMarkdownTemplate(p,'不存在.md'),/不存在/);assert.equal(calls.length,1);
});
