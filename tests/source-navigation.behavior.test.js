const test=require('node:test'),assert=require('node:assert/strict');
const {captureCardFocus,rememberSourceReturn}=require('../src/source-navigation.js');
function fixture(){
 const doc={activeElement:null},cards=[],listeners=new Set(),cleanups=[];
 const root={isConnected:true,querySelectorAll:()=>cards,contains:el=>!!el?.inside};
 const leaf={view:{containerEl:root,workbench:{active:'page-inventory'}}};
 const workspace={activeLeaf:leaf,iterateAllLeaves:fn=>fn(leaf),on(event,fn){const ref={event,fn};listeners.add(ref);return ref;},offref(ref){listeners.delete(ref);}};
 const plugin={app:{workspace},register:fn=>cleanups.push(fn)};
 const emit=(event,arg)=>{for(const ref of [...listeners])if(ref.event===event)ref.fn(arg);};
 const activate=next=>{workspace.activeLeaf=next;emit('active-leaf-change',next);};
 function card(id){const children=[],host={isConnected:true,hasAttribute:()=>false,getAttribute:()=>id,getClientRects:()=>[{}],querySelectorAll:()=>children};cards.push(host);
  function button(key){const attr={'data-ni-focus':key},b={inside:true,isConnected:true,tagName:'BUTTON',ownerDocument:doc,closest:s=>s==='.workspace-leaf'?root:host,hasAttribute:k=>k in attr,getAttribute:k=>attr[k],getClientRects:()=>b.isConnected?[{}]:[],focus(){doc.activeElement=b;},matches:()=>true};children.push(b);return b;}
  return {host,button};
 }
 return {root,leaf,plugin,workspace,activate,emit,doc,card,listeners,cleanups};
}
const settled=()=>new Promise(r=>setTimeout(r,70));
test('replaced source buttons resolve only inside their original card',()=>{
 const f=fixture(),first=f.card('first'),second=f.card('second'),b=first.button('source'),resolve=captureCardFocus(b);second.button('source');b.isConnected=false;
 assert.equal(resolve(),null);const replacement=first.button('source');assert.equal(resolve(),replacement);
});
test('return from a source restores the original control and releases listeners',async()=>{
 const f=fixture(),b=f.card('first').button('source');rememberSourceReturn(f.plugin,b);f.activate({});f.activate(f.leaf);await settled();
 assert.equal(f.doc.activeElement,b);assert.equal(f.listeners.size,0);
});
test('intentional input on return is not displaced',async()=>{
 const f=fixture(),b=f.card('first').button('source');rememberSourceReturn(f.plugin,b);f.activate({});f.activate(f.leaf);
 const input={inside:true,matches:()=>true};f.doc.activeElement=input;await settled();assert.equal(f.doc.activeElement,input);
});
test('changing page or closing the originating leaf cancels focus restoration',async()=>{
 const f=fixture(),b=f.card('first').button('source');rememberSourceReturn(f.plugin,b);f.activate({});f.leaf.view.workbench.active='home';f.activate(f.leaf);await settled();assert.equal(f.doc.activeElement,null);
 rememberSourceReturn(f.plugin,b);f.root.isConnected=false;f.workspace.iterateAllLeaves=()=>{};f.emit('layout-change');assert.equal(f.listeners.size,0);
});
test('detaching an inactive tab is not treated as closing its leaf',async()=>{
 const f=fixture(),b=f.card('first').button('source');rememberSourceReturn(f.plugin,b);f.activate({});f.root.isConnected=false;f.emit('layout-change');assert.equal(f.listeners.size,2);
 f.root.isConnected=true;f.activate(f.leaf);await settled();assert.equal(f.doc.activeElement,b);
});
test('new navigation replaces the pending origin and plugin cleanup cancels the return',async()=>{
 const f=fixture(),first=f.card('first').button('source'),second=f.card('second').button('source');rememberSourceReturn(f.plugin,first);rememberSourceReturn(f.plugin,second);assert.equal(f.listeners.size,2);assert.equal(f.cleanups.length,1);
 f.activate({});f.activate(f.leaf);f.cleanups[0]();await settled();assert.equal(f.doc.activeElement,null);assert.equal(f.listeners.size,0);
});
