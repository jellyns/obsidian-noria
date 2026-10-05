"use strict";
const queues=new WeakMap();

// Only these settings surfaces use this queue; unrelated plugin settings are not replaced.
function commitSettingsChange(plugin,keys,change){
  const run=async()=>{
    const before=new Map(keys.map(key=>[key,{exists:Object.hasOwn(plugin.settings,key),value:structuredClone(plugin.settings[key])}]));
    try{
      const result=change();
      if(result===false)return false;
      await plugin.saveSettings();
      return result;
    }catch(error){
      for(const [key,old] of before){if(old.exists)plugin.settings[key]=old.value;else delete plugin.settings[key];}
      throw error;
    }
  };
  const pending=(queues.get(plugin)||Promise.resolve()).then(run);
  queues.set(plugin,pending.catch(()=>{}));
  return pending;
}
// Obsidian's setValue calls onChange; restoring a failed toggle must not save again.
function bindSettingToggle(toggle, read, save){
  let restoring=false;
  const sync=()=>{
    restoring=true;
    const value=!!read();toggle.setValue(value);
    const input=toggle.toggleEl.querySelector('input');
    if(input)input.checked=value;
    restoring=false;
  };
  toggle.onChange(async value=>{if(!restoring&&!await save(value))sync();});
  sync();
}
module.exports={commitSettingsChange,bindSettingToggle};
