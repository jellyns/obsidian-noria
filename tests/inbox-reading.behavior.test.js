const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/inbox-reading.js'), 'utf8'), {
    module, require: () => ({ Keymap: { isModEvent: event => event.ctrlKey } })
  });
  const host = { isConnected: true }, files = new Map(['a','b','c'].map(name => [name, { path:name, extension:'md' }]));
  const calls = [], leaves = [];
  const owner = { parent:{}, view:{containerEl:{contains:el=>el===host}} }; leaves.push(owner);
  let gate = null;
  const workspace = {
    iterateAllLeaves(fn) { for (const leaf of leaves) if (fn(leaf)) break; },
    createLeafBySplit(from, direction, before) {
      assert.equal(from, owner); assert.equal(direction, 'vertical'); assert.equal(before, false);
      return this.createLeafInParent({children:[]},0);
    },
    createLeafInParent(parent, index) {
      assert.equal(index,parent.children.length);
      const leaf = { parent, pinned:false, ephemeral:{}, view:{ file:null, getViewType:()=> 'markdown' },
        getViewState() { return {pinned:this.pinned,state:{mode:'source'}}; },
        getEphemeralState() { return this.ephemeral; },
        async openFile(file, options) { calls.push(file.path); if (gate) await gate; this.view.file=file; this.ephemeral=options.eState||{}; }
      }; leaves.push(leaf); parent.children.push(leaf); return leaf;
    },
    setActiveLeaf(leaf, options) { assert.equal(options.focus, false); workspace.active=leaf; }
  };
  const plugin = { app:{workspace,vault:{getAbstractFileByPath:path=>files.get(path)}},
    async openHomeSource(path) { calls.push('explicit:'+path); return {ok:true}; }
  };
  const create = () => module.exports.createInboxReader(plugin, host);
  return {create,reader:create(),plugin,workspace,owner,host,leaves,files,calls,setGate(value){gate=value;}};
}

test('sequential reading reuses a side pane, keeps list focus, and restores reading position', async () => {
  const f=fixture(); await f.reader.open('a'); const side=f.leaves[1];
  side.ephemeral={scroll:28,cursor:{line:9,ch:2}};
  await f.reader.open('b'); await f.reader.open('a'); await f.reader.open('a');
  assert.equal(f.leaves.length,2); assert.equal(f.workspace.active,f.owner);
  assert.equal(side.ephemeral.scroll,28); assert.equal(side.ephemeral.cursor.line,9);
  assert.deepEqual(f.calls,['a','b','a']); assert.equal(f.reader.currentPath(),'a');
});

test('card remount reuses the owned reader, while closed readers are recreated', async () => {
  const f=fixture(); await f.reader.open('a'); f.reader.dispose(); const next=f.create();
  await next.open('b'); assert.equal(f.leaves.length,2);
  f.leaves.pop(); await next.open('c'); assert.equal(f.leaves.length,2);
  assert.equal(next.currentPath(),'c');
});

test('pinned and repurposed tabs are never overwritten', async () => {
  for (const kind of ['pin','navigate','move']) {
    const f=fixture(); await f.reader.open('a'); const protectedLeaf=f.leaves[1];
    if(kind==='pin')protectedLeaf.pinned=true;
    if(kind==='navigate')protectedLeaf.view.file=f.files.get('c');
    if(kind==='move')protectedLeaf.parent=f.owner.parent;
    const file=protectedLeaf.view.file;
    await f.reader.open('b'); assert.equal(f.leaves.length,3); assert.equal(protectedLeaf.view.file,file);
    if(kind!=='move')assert.equal(f.leaves[2].parent,protectedLeaf.parent);
  }
});

test('rapid selection is serialized and skipped selections cannot win', async () => {
  const f=fixture(); let release; f.setGate(new Promise(resolve=>{release=resolve;}));
  const first=f.reader.open('a'); await Promise.resolve();
  const second=f.reader.open('b'), third=f.reader.open('c'); release();
  await Promise.all([first,second,third]);
  assert.equal(f.leaves.length,2); assert.equal(f.reader.currentPath(),'c'); assert.deepEqual(f.calls,['a','c']);
});

test('renames retain the same file identity; missing sources do not create blank panes', async () => {
  const f=fixture(); await f.reader.open('a'); const file=f.files.get('a');
  f.files.delete('a'); file.path='renamed'; f.files.set('renamed',file);
  assert.equal(f.reader.currentPath(),'renamed'); await f.reader.open('renamed'); assert.deepEqual(f.calls,['a']);
  f.files.delete('renamed'); assert.equal(f.reader.currentPath(),'');
  assert.equal((await f.reader.open('missing')).reason,'missing'); assert.equal(f.leaves.length,2);
});

test('explicit pane gestures and disposed cards do not redirect the reader', async () => {
  const f=fixture(); await f.reader.open('a',{ctrlKey:true}); assert.equal(f.leaves.length,1);
  f.reader.dispose(); assert.equal((await f.reader.open('b')).cancelled,true);
  assert.deepEqual(f.calls,['explicit:a']);
});

test('closing a reader while opening cannot reactivate the detached leaf', async () => {
  const f=fixture(); let release; f.setGate(new Promise(resolve=>{release=resolve;}));
  const pending=f.reader.open('a'); await Promise.resolve(); f.leaves.pop(); release();
  assert.equal((await pending).cancelled,true); assert.equal(f.workspace.active,undefined);
});

test('cursor restoration returns list focus unless a newer user action interrupts it', async () => {
  for (const interrupt of [false,true]) {
    const f=fixture(),listeners=new Map(); let focuses=0;
    const button={isConnected:true,focus(){focuses++;}};
    f.host.ownerDocument={activeElement:button,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
    f.host.contains=el=>el===button;
    let release; f.setGate(new Promise(resolve=>{release=resolve;}));
    const pending=f.reader.open('a'); await Promise.resolve();
    f.host.ownerDocument.activeElement={};
    if(interrupt)listeners.get('pointerdown')();
    release(); await pending;
    assert.equal(focuses,interrupt?0:1); assert.equal(listeners.size,0);
  }
});
