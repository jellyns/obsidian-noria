const test=require('node:test'),assert=require('node:assert/strict');
const {popupRect}=require('../src/pane-popover.js');
process.env.TZ='Asia/Shanghai';
test('popup bounds use available pane width and flip above an edge anchor',()=>{
 const rect=popupRect({left:600,right:630,top:430,bottom:454},{width:360,height:240},{left:328,right:632,top:40,bottom:480});
 assert.deepEqual(rect,{left:328,top:184,width:304,height:240});
 const tiny=popupRect({left:400,right:420,top:70,bottom:90},{width:500,height:800},{left:328,right:632,top:40,bottom:480});
 assert.deepEqual(tiny,{left:328,top:40,width:304,height:440});
});
test('new Media entry precedes statistics, saved custom ordering remains intact',()=>{
 const {normalizePages}=require('../src/workbench-pages.js');const stats={id:'page-stats',widgets:[{source:'noria:statistics'}]};
 assert.deepEqual(normalizePages({pages:[{id:'home'},stats]}).pages.slice(0,3).map(p=>p.id),['home','media','page-stats']);
 const configured=[{id:'home'},stats,{id:'media'}];assert.deepEqual(normalizePages({pages:configured}).pages.slice(0,3).map(p=>p.id),['home','page-stats','media']);
});
