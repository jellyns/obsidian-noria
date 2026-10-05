"use strict";
const { randomBytes } = require('node:crypto');
const LOCAL_KEY = 'noria-agent-connection-v1';
const SECRET_KEY = 'noria-agent-connection';

function createAgentConnectionSettings(app, connection) {
  let prefs = {enabled:false,port:0}, activeToken = null, error = null, disposed = false;
  let queue = Promise.resolve();
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) { try { fn(); } catch (_) {} } };
  const unwatch = connection.subscribe(notify);
  const fail = code => Object.assign(Error(code), {code});
  const available = () => typeof app.secretStorage?.getSecret === 'function' && typeof app.secretStorage?.setSecret === 'function' && typeof app.loadLocalStorage === 'function' && typeof app.saveLocalStorage === 'function';
  const check = () => { if(disposed)throw fail('disposed'); };
  const checkStorage = () => {check();if(!available())throw fail('storage-unavailable');};
  const run = fn => {
    const job = queue.then(async()=>{check();error=null;notify();try{return await fn();}catch(e){error=e.code||e.message;throw e;}finally{notify();}});
    queue=job.catch(()=>{});return job;
  };
  const save = async next => {
    check();if(typeof app.saveLocalStorage!=='function'||typeof app.loadLocalStorage!=='function')throw fail('storage-unavailable');
    try {
      await app.saveLocalStorage(LOCAL_KEY,next);
      const stored=await app.loadLocalStorage(LOCAL_KEY);
      if(stored?.enabled!==next.enabled || stored?.port!==next.port)throw fail('preferences-save-failed');
    } catch(e) { await app.saveLocalStorage(LOCAL_KEY,prefs); throw e; }
    prefs=next;
  };
  const writeSecret = async token => {
    checkStorage();await app.secretStorage.setSecret(SECRET_KEY,token);
    if(await app.secretStorage.getSecret(SECRET_KEY)!==token)throw fail('credential-save-failed');
  };
  const readToken = async () => {
    checkStorage();let token=await app.secretStorage.getSecret(SECRET_KEY);
    if(!token){token=randomBytes(32).toString('hex');await writeSecret(token);}
    if(!/^[a-f0-9]{64}$/.test(token))throw fail('credential-invalid');
    return token;
  };
  const start = async token => {
    check();const endpoint=await connection.start({port:prefs.port,token});
    if(disposed){await connection.stop();throw fail('disposed');}
    activeToken=token;return Number(new URL(endpoint.url).port);
  };
  const status = () => ({...connection.status(),...prefs,error:error||connection.status().error,available:available(),canCopy:!!activeToken&&connection.status().state==='listening'});
  const ready = run(async()=>{
    const stored=await app.loadLocalStorage(LOCAL_KEY);
    if(stored){
      if(typeof stored.enabled!=='boolean'||!Number.isInteger(stored.port)||stored.port<0||stored.port>65535)throw fail('preferences-invalid');
      prefs={enabled:stored.enabled,port:stored.port};
    }
    if(prefs.enabled){const port=await start(await readToken());if(port!==prefs.port)await save({...prefs,port});}
  }).catch(async e=>{activeToken=null;await connection.stop();error=e.code||e.message;notify();});
  return {
    ready, status,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    setEnabled(enabled){return run(async()=>{
      if(!enabled){await save({...prefs,enabled:false});activeToken=null;await connection.stop();return;}
      if(activeToken&&connection.status().state==='listening')return;
      const old={...prefs};
      try{const port=await start(await readToken());await save({enabled:true,port});}
      catch(e){activeToken=null;await connection.stop();prefs=old;throw e;}
    });},
    setPort(port){return run(async()=>{
      if(connection.status().state==='listening'||prefs.enabled)throw fail('disable-before-port-change');
      if(!Number.isInteger(port)||port<0||port>65535)throw fail('invalid-port');
      await save({...prefs,port});
    });},
    resetCredential(){return run(async()=>{
      checkStorage();const previous=await app.secretStorage.getSecret(SECRET_KEY)||'',next=randomBytes(32).toString('hex'),resume=prefs.enabled;
      activeToken=null;await connection.stop();
      try{await writeSecret(next);if(resume){const port=await start(next);if(port!==prefs.port)await save({...prefs,port});}}
      catch(e){
        activeToken=null;await connection.stop();
        try{await writeSecret(previous);if(resume&&/^[a-f0-9]{64}$/.test(previous))await start(previous);}catch(_){activeToken=null;await connection.stop();}
        throw e;
      }
    });},
    clientConfig(format='json'){
      check();const current=status();if(!current.canCopy)throw fail('connection-not-running');
      if(format==='codex')return `[mcp_servers.noria]\nurl = "${current.url}"\nhttp_headers = { Authorization = "Bearer ${activeToken}" }\n`;
      if(format!=='json')throw fail('invalid-config-format');
      return {mcpServers:{noria:{type:'http',url:current.url,headers:{Authorization:`Bearer ${activeToken}`}}}};
    },
    dispose(){disposed=true;unwatch();listeners.clear();activeToken=null;return connection.dispose();}
  };
}
module.exports={createAgentConnectionSettings,LOCAL_KEY,SECRET_KEY};
