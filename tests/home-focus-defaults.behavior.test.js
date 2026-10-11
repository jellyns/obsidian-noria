const test=require('node:test'),assert=require('node:assert/strict');
const {ensureHomeFocusCards,focusDefaults}=require('../src/home-focus-defaults.js');
test('home defaults preserve existing cards without adding a separate ring',()=>{
 const widgets=[{id:'tasks',order:10},{id:'my-focus',source:'noria:focus',order:42,props:{cardHeight:295}},{id:'next',order:50}];
 const result=ensureHomeFocusCards({widgets});
 assert.equal(result.widgets.length,3);assert.equal(result.widgets.some(w=>w.id==='focus-today-card'),false);
 for(const w of widgets)assert.deepEqual(result.widgets.find(x=>x.id===w.id),w);
 assert.deepEqual(ensureHomeFocusCards(result),result);
});
test('disabled custom cards and explicitly removed defaults stay removed',()=>{
 const home={widgets:[{id:'own',source:'noria:focus',enabled:false,order:1},{id:'own-ring',source:'noria:statistics',props:{source:'focus'},enabled:false,order:2}]};
 assert.equal(ensureHomeFocusCards(home).widgets.length,2);
 assert.equal(ensureHomeFocusCards({widgets:[],removedWidgetIds:focusDefaults.map(w=>w.id)}).widgets.length,0);
 const added=ensureHomeFocusCards({widgets:[]});added.widgets=[];
 assert.equal(ensureHomeFocusCards(added).widgets.length,0);
});
test('new home defaults contain a timer but no standalone ring',()=>{
 assert.equal(focusDefaults.length,1);assert.equal(focusDefaults[0].source,'noria:focus');
 const custom={id:'focus-today-card',source:'noria:statistics',props:{source:'focus'},size:'medium'};
 assert.deepEqual(ensureHomeFocusCards({widgets:[custom]}).widgets.find(w=>w.id===custom.id),custom);
});
