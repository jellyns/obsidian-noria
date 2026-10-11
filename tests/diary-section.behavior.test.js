const test=require('node:test'),assert=require('node:assert/strict');
const {diarySection,diarySectionTitles}=require('../src/diary-section-model.js');
const {projectRecordSections}=require('../src/diary-section-model.js');
const {projectDiaryProse}=require('../src/diary-prose.js');
const {projectDiaryRecord}=require('../src/diary-prose.js');
const {normalizeDiaryCards,normalizePeriodLayouts,changeDiaryCardLayout}=require('../src/card-layout-model.js');

test('record scope keeps source order, nested content, full-note default and original task identity',()=>{
 const raw='前言\n## 计划\n- [ ] 相同 [due:: 2026-10-08]\n## 阅读\n- [ ] 相同 [due:: 2026-10-08]\n### 感想\n[[原子习惯]]\n## 其他\n私有内容\n## 运动\n骑行\n';
 assert.equal(projectRecordSections(raw).markdown,raw);
 const projected=projectDiaryProse(raw),chosen=projectRecordSections(projected.markdown,['运动','阅读']);
 assert.match(chosen.markdown,/^## 阅读/);assert.match(chosen.markdown,/### 感想\n\[\[原子习惯\]\]/);
 assert.doesNotMatch(chosen.markdown,/私有内容|## 计划|data-noria-prose-task="0"/);
 assert.match(chosen.markdown,/data-noria-prose-task="1"/);assert.equal(projected.tasks[1].line,4);
 assert.equal(projected.tasks[1].rawText,'- [ ] 相同 [due:: 2026-10-08]');assert.equal(chosen.markdown.endsWith('骑行'),true);
});

test('record scope never expands to the full note for missing, duplicate or empty selections',()=>{
 const raw='## 阅读\n一\n## 阅读\n二\n## 唯一\n保留\n# 边界\n排除';
 const result=projectRecordSections(raw,['阅读','未知','唯一']);
 assert.deepEqual(result,{markdown:'## 唯一\n保留',missing:['未知'],ambiguous:['阅读']});
 assert.equal(projectRecordSections(raw,[]).markdown,'');
 assert.deepEqual(projectRecordSections('```md\n## 伪标题\n```\n## 实际\n内容',['伪标题']).missing,['伪标题']);
});

test('managed review and habit filtering retains file line identity and other dates before projecting fields',()=>{
 const body='## 复盘\n回顾\n## 习惯记录\n- [x] 阅读 #habit [due:: 2026-10-08]\n- [ ] 阅读 #habit [due:: 2026-10-09]\n## 想法\n- [ ] 下一步 [due:: 2026-10-08]\n';
 const result=projectDiaryRecord(body,{reviewHeading:'复盘',habitDate:'2026-10-08',sections:['想法','习惯记录'],lineOffset:4});
 assert.doesNotMatch(result.markdown,/回顾|\[x\]/);assert.match(result.markdown,/#habit/);
 assert.equal(result.tasks.length,2);assert.equal(result.tasks[0].line,8);assert.equal(result.tasks[1].line,10);
 assert.match(result.tasks[0].rawText,/2026-10-09/);assert.match(result.markdown,/data-noria-prose-task="1"/);
});

test('record scope survives layout changes and persistence without leaking across period types',()=>{
 const layout=normalizeDiaryCards({cards:{record:{sections:[' 阅读 ','阅读',null,'','坏\n标题','运动']}}});
 assert.deepEqual(layout.cards.record.sections,['阅读','运动']);
 const resized=changeDiaryCardLayout(layout,'record','size','wide');
 const periods=normalizePeriodLayouts({periods:{daily:resized,weekly:{cards:{record:{sections:['总结']}}}}});
 const restored=normalizePeriodLayouts(JSON.parse(JSON.stringify(periods)));
 assert.deepEqual(restored.periods.daily.cards.record.sections,['阅读','运动']);
 assert.deepEqual(restored.periods.weekly.cards.record.sections,['总结']);
 assert.equal(normalizeDiaryCards().cards.record.sections,undefined);
 assert.deepEqual(normalizeDiaryCards({cards:{record:{sections:[]}}}).cards.record.sections,[]);
});
test('diary section isolates one H2 and retains nested headings and source syntax',()=>{
 const raw='---\ntitle: "## 不要读取"\n---\n## 记录\n其他\n## 阅读\n[[作品]]\n### 感想\n自己的理解\n## 复盘\n不属于阅读\n';
 assert.equal(diarySection(raw,'阅读').content,'[[作品]]\n### 感想\n自己的理解');
 assert.deepEqual(diarySectionTitles(raw,'## 模板章节\n'),['记录','阅读','复盘','模板章节']);
});
test('heading candidates ignore fenced code and comments, and duplicate sections never guess',()=>{
 const raw='```md\n## 假标题\n```\n%%\n## 隐藏\n%%\n## 阅读\n一\n## 阅读\n二\n';
 assert.deepEqual(diarySectionTitles(raw),['阅读']);assert.equal(diarySection(raw,'阅读').state,'ambiguous');
 assert.equal(diarySection(raw,'未知').state,'missing');assert.equal(diarySection('## 空\r\n\r\n','空').content,'');
 assert.equal(diarySection('## 阅读\r\n保留\r\n# 上层\r\n排除','阅读').content,'保留');
});
