const test=require('node:test'),assert=require('node:assert/strict');
const {mediaExcerpt}=require('../src/media-excerpt.js');
const profile={review:'我的感想',intro:'内容介绍'};
test('personal review precedes configured introduction and legacy description',()=>{
 const raw='## 内容介绍\n介绍\n## 我的感想\n**自己的** [理解](https://example.org) 和 [[笔记|联系]]。\n';
 assert.deepEqual(mediaExcerpt(raw,profile,'旧简介'),{kind:'review',label:'我的感想',text:'自己的 理解 和 联系。'});
 assert.equal(mediaExcerpt('## 内容介绍\n实际简介\n',profile,'旧简介').text,'实际简介');
 assert.equal(mediaExcerpt('无关正文',profile,'旧简介').text,'旧简介');
 assert.equal(mediaExcerpt('## 内容介绍\n',profile,'旧简介'),null);
});
test('excerpt skips comments, headings, code and embeds without reading unrelated sections',()=>{
 const raw='## 我的感想\n%% 私有注释 %%\n<!-- 隐藏 -->\n![[图片.png]]\n![图](image.png)\n```js\n代码\n```\n### 观察\n实际评语\n## 私人资料\n不展示';
 assert.equal(mediaExcerpt(raw,profile).text,'实际评语');
 assert.equal(mediaExcerpt('## 私人资料\n不展示',profile),null);
 assert.throws(()=>mediaExcerpt('## 我的感想\na\n## 我的感想\nb',profile),e=>e.code==='ambiguous');
});
