const test=require('node:test'),assert=require('node:assert/strict');
const {datedName,experienceName,experienceMarkdown,readExperience}=require('../src/media-experience-document.js');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf(':');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
test('dates default to days, optional time is explicit, invalid dates and names rejected',()=>{
 assert.equal(experienceName({date:'2026-10-08',title:'重读'}),'2026-10-08 重读.md');
 assert.equal(experienceName({date:'2026-10-08',title:'重读',time:'21:30'}),'2026-10-08 2130 重读.md');
 assert.equal(datedName('2026-10-08 重读.md').time,null);
 for(const name of ['2026-02-30 重读.md','2026-10-08 2430 重读.md','Book.md'])assert.equal(datedName(name),null);
 for(const title of ['../Escape','a/b',''])assert.throws(()=>experienceName({date:'2026-10-08',title}));
 assert.throws(()=>experienceName({date:'2026-10-08',title:'Book',time:'99:00'}));
});
test('standalone source supports ordinary Markdown and explicit work association without UUID or duplicated date',()=>{
 const raw=experienceMarkdown({workPath:'Media/Book.md',title:'Reading',body:'First thought.\n\n### Detail\nMore.'});
 const item=readExperience(raw,{path:'Media/2026-10-08 Reading.md',workPath:'Media/Book.md',parseYaml:parse,resolve:()=> 'Media/Book.md'});
 assert.equal(item.body,'First thought.\n\n### Detail\nMore.');assert.equal(item.time,null);
 assert.doesNotMatch(raw,/uuid|created:|date:|time:|id:/);
 assert.equal(readExperience('Mention [[Media/Book]].',{path:'Media/2026-10-08 mention.md',workPath:'Media/Book.md',parseYaml:parse,resolve:()=> 'Media/Book.md'}),null);
 assert.equal(readExperience(raw,{path:'Media/2026-10-08 Reading.md',workPath:'Media/Other.md',parseYaml:parse,resolve:()=> 'Media/Book.md'}),null);
});
