const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {commitSettingsChange}=require('../src/settings-change.js');

function fixture(){
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8');
 const start=source.indexOf('  async persistQueryScopeChange('),end=source.indexOf('\n  renderQueryScopePreview(',start);
 const tab=vm.runInNewContext('({'+source.slice(start,end)+'})',{NORIA_QUERY_SCOPE_IDS:['tasks','notes'],NORIA_DEFAULT_QUERY_SCOPES:{tasks:{mode:'managed',customRoots:[]},notes:{mode:'managed',customRoots:[]}}});
 let fail=true,refresh=0;
 const plugin={settings:{performance:{queryScopes:{tasks:{mode:'managed',customRoots:['Tasks']},notes:{mode:'managed',customRoots:['Notes']}}}},
  getQueryScopeConfig(id){return structuredClone(this.settings.performance.queryScopes[id])},getQueryScopeUnsupportedEntries(){return []},
  normalizeQueryScopes:s=>s,invalidateTaskSnapshots(){refresh++},syncRuntimeBridgeConfig(){refresh++},
  async saveSettings(){if(fail)throw Error('disk')}};
 tab.plugin=plugin;
 tab.saveSettingChange=async(row,keys,change)=>{try{await commitSettingsChange(plugin,keys,change);refresh++;return true}catch(e){row.error=e.message;return false}};
 return {tab,plugin,accept:()=>{fail=false},refresh:()=>refresh};
}

test('failed query scope change retains the old scope and retries without changing the other scope',async()=>{
 const f=fixture(),row={};
 await f.tab.persistQueryScopeChange('tasks',{mode:'custom'},row,{});
 assert.equal(f.plugin.settings.performance.queryScopes.tasks.mode,'managed');
 assert.equal(f.refresh(),0);assert.equal(row.error,'disk');
 f.accept();assert.equal(await f.tab.persistQueryScopeChange('tasks',{mode:'custom'},row,{}),true);
 assert.equal(f.plugin.settings.performance.queryScopes.tasks.mode,'custom');
 assert.deepEqual(f.plugin.settings.performance.queryScopes.notes,{mode:'managed',customRoots:['Notes']});
});

test('failed directory save preserves committed roots and successful retry preserves the selected mode',async()=>{
 const f=fixture(),row={};
 await f.tab.persistQueryScopeChange('notes',{customRoots:['Reading']},row,{});
 assert.deepEqual(f.plugin.settings.performance.queryScopes.notes.customRoots,['Notes']);
 f.accept();await f.tab.persistQueryScopeChange('notes',{customRoots:['Reading']},row,{});
 assert.deepEqual(f.plugin.settings.performance.queryScopes.notes.customRoots,['Reading']);
 assert.equal(f.plugin.settings.performance.queryScopes.notes.mode,'managed');
 assert.deepEqual(f.plugin.settings.performance.queryScopes.tasks.customRoots,['Tasks']);
});
