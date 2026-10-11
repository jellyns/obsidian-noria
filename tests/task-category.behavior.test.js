const test=require('node:test'),assert=require('node:assert/strict');
const {resolveTaskCategory}=require('../src/task-category.js');
const {focusCategories}=require('../src/focus-categories.js');
const {taskPomodoroMeta}=require('../src/runtime/views/task-timeline/pomodoro-state.js');
const palette={tagColorMap:{work:'#abc','work/deep':'#123456'},tagBucketPalette:['#ff0000','#00ff00']};
test('task categories prefer explicitly colored tags and the nearest configured parent across views',()=>{
 const task={rawText:'Write #task #tl/work #Work/deep #other',tags:['#else']};
 const resolved=resolveTaskCategory(task,palette);assert.equal(resolved.tag,'work/deep');assert.equal(resolved.color,'#123456');
 assert.equal(resolveTaskCategory({text:'Read #work/light'},palette).color,'#aabbcc');
 assert.equal(resolveTaskCategory({text:'Read #work/deep/research'},palette).color,'#123456');
 assert.equal(resolveTaskCategory({text:'Read #unmapped #work/deep'},palette).tag,'work/deep');
 assert.equal(resolveTaskCategory({text:'Read #unmapped #work'},palette).color,'#aabbcc');
 assert.equal(resolveTaskCategory({text:'Read #todo #timeline/event'},palette).color,'');
});
test('project bucket colors use the same hash and normalized palette while ordinary tags stay neutral',()=>{
 const item=resolveTaskCategory({text:'A #proj/a'},palette);assert.equal(item.color,palette.tagBucketPalette[Number(item.bucket)-1]);assert.equal(item.mappedColor,'');
 assert.equal(resolveTaskCategory({tags:['#plain']},palette).color,'');
 assert.equal(resolveTaskCategory({tags:['#project-alpha']},palette).color.length,7);
});
test('focus colors follow a uniquely matched task after a line shift, never a stale line or duplicate title',()=>{
 const original={path:'P.md',line:1,text:'Read #work'};
 const meta=taskPomodoroMeta({noria:{path:original.path,line:1,task:original}});
 const state={tasks:{a:{...meta,titleSnapshot:meta.title}}};
 const moved={...original,line:4};assert.equal(focusCategories(state,[{path:'P.md',line:1,text:'Other #proj/b'},moved],palette).get('a').color,'#aabbcc');
 assert.equal(focusCategories(state,[moved,{...moved,line:5}],palette).has('a'),false);
 assert.equal(focusCategories(state,[moved,moved],palette).get('a').color,'#aabbcc');
 assert.equal(focusCategories(state,[{...moved,path:'Other.md'}],palette).has('a'),false);
});
test('imported Markdown focus records require a unique title in their source note',()=>{
 const state={tasks:{a:{path:'P.md',titleSnapshot:'Read',lineHint:-1}}};
 assert.equal(focusCategories(state,[{path:'P.md',line:2,text:'Read #work'}],palette).get('a').color,'#aabbcc');
 assert.equal(focusCategories(state,[{path:'P.md',line:2,text:'Other #work'}],palette).has('a'),false);
});

test('normalized data-service tasks and calendar runtime rows resolve the same category',()=>{
 const raw='Read #work/deep';
 const data={source:{path:'P.md',line:1,rawLine:'- [ ] '+raw},text:{raw,clean:'Read'}};
 assert.deepEqual(resolveTaskCategory(data,palette),resolveTaskCategory({text:raw},palette));
 assert.deepEqual(resolveTaskCategory({rawLine:'- [ ] '+raw,text:'Read'},palette),resolveTaskCategory(data,palette));
 const state={tasks:{a:{path:'P.md',titleSnapshot:'Read'}}};assert.equal(focusCategories(state,[data],palette).get('a').color,'#123456');
});
