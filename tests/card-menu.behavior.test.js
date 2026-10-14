const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Menu {
  constructor(){this.items=[];Menu.last=this;}
  addItem(build){const item={setTitle(v){this.title=v;return this;},setIcon(v){this.icon=v;return this;},setChecked(v){this.checked=v;return this;},setDisabled(v){this.disabled=v;return this;},onClick(fn){this.click=fn;return this;},setSubmenu(){return this.sub=new Menu();}};build(item);this.items.push(item);return this;}
  addSeparator(){this.items.push({separator:true});}
  onHide(fn){this.onHideCallback=fn;}
  hide(){this.onHideCallback?.();}
  showAtPosition(){Menu.open=this;}
}
function load(){const module={exports:{}},errors=[];vm.runInNewContext(fs.readFileSync(require.resolve('../src/card-controls.js'),'utf8'),{module,require:()=>({Menu,Notice:class{constructor(message){errors.push(message);}}})});return {...module.exports,errors};}
test('all cards put the width chooser, boundary-aware movement and auto height inside Layout',async()=>{
 const {addCardLayoutMenuItems}=load(),menu=new Menu(),calls=[];
 addCardLayoutMenuItems(menu,{state:()=>({size:'wide',first:true,last:false,collapsed:false}),t:k=>k,run:fn=>fn(),openWidth:()=>calls.push(['width']),move:v=>calls.push(['move',v]),height:v=>calls.push(['height',v]),collapse:v=>calls.push(['collapse',v])});
 assert.deepEqual(menu.items.map(i=>i.title),['layout']);const sub=menu.items[0].sub.items.filter(i=>!i.separator);
 assert.deepEqual(sub.map(i=>i.title),['width','up','down','autoHeight','collapse']);
 assert.ok(sub.every(i=>i.icon),'every layout action has an icon and a readable label');
 assert.equal(sub[1].disabled,true);assert.equal(sub[2].disabled,false);
 sub[0].click();sub[2].click();sub[3].click();sub[4].click();
 assert.deepEqual(calls,[['width'],['move','down'],['height',null],['collapse',true]]);
});
test('native card menu preserves content actions, failure feedback, and focus on Escape',async()=>{
 const api=load(),doc={body:{},activeElement:null},attrs={},events=[];
 const anchor={ownerDocument:doc,closest:()=>null,setAttribute:(k,v)=>attrs[k]=v,focus:()=>events.push('focus'),getBoundingClientRect:()=>({right:20,bottom:30})};
 const close=api.openCardMenu({anchor,t:k=>k,state:()=>({size:'medium',collapsed:true}),actions:[{label:'Manage',run:()=>events.push('manage')}],width:async()=>{},move:async()=>{throw Error('disk full');},collapse(){},copy(){},remove:()=>events.push('remove')});
 const menu=Menu.open;assert.equal(attrs['aria-haspopup'],'menu');assert.equal(menu.items[0].title,'Manage');
 assert.deepEqual(menu.items.filter(i=>!i.separator).map(i=>i.title),['Manage','layout','remove']);
 const sub=menu.items.find(i=>i.title==='layout').sub.items;
 assert.ok(sub.find(i=>i.title==='expand'));assert.ok(sub.find(i=>i.title==='copy'));assert.ok(menu.items.find(i=>i.title==='remove'));assert.ok(!sub.find(i=>i.title==='hide'));
 close();assert.equal(attrs['aria-expanded'],'false');assert.deepEqual(events,['focus']);
 await menu.items.find(i=>i.title==='layout').sub.items.find(i=>i.title==='down').click();assert.deepEqual(api.errors,['disk full']);
});
