const test=require('node:test'),assert=require('node:assert/strict');
const {createPublicApi}=require('../src/public-api.js');
const {createAgentConnection}=require('../src/agent-mcp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');

function fixture(){
 const values=new Map([
  ['Media/Books/A.md',{tags:['#book'],status:'进行中',author:['Author'],rating:0,grade:'未评级',pagecount:0,pageprogress:24,privateField:'not part of catalog'}],
  ['Media/Film/B.md',{tags:['#movie','#anime','#tv'],status:'已看',rating:9.2,grade:'★★★★★',viewtime:null}],
  ['Media/Game/C.md',{tags:['#game'],status:'进行中',playtime:'12 hours',finishedAt:null}],
  ['Media/模板-图书条目.md',{tags:['#book']}],['Media/清单-游戏.md',{tags:['#game']}],
  ['Media/Other.md',{tags:['other']}],['Media/Unindexed.md',null],['Media-copy/Outside.md',{tags:['#book']}]
 ]);
 const files=[...values.keys()].map(path=>({path,basename:path.split('/').at(-1).slice(0,-3)}));
 const plugin={normalizePath:p=>p.replaceAll('\\','/'),filesUnderRoots:(roots,extensions)=>{assert.deepEqual(extensions,['.md']);return files.filter(file=>roots.some(root=>file.path.startsWith(root+'/')));},app:{vault:{getAbstractFileByPath:path=>['Media','Media/Books','Empty'].includes(path)?{path,children:[]}:null},metadataCache:{getFileCache:file=>values.get(file.path)===null?null:{frontmatter:values.get(file.path)}}}};
 return {plugin,values,api:createPublicApi(plugin)};
}

test('media queries preserve legacy meaning, exact scope and stable pagination without reading bodies',async()=>{
 const {api,values}=fixture(),before=JSON.stringify([...values]);
 const first=await api.media.list({folder:'Media',limit:2});
 assert.deepEqual(first.items.map(row=>row.path),['Media/Books/A.md','Media/Film/B.md']);
 assert.equal(first.total,3);assert.equal(first.unindexed,1);assert.equal(first.nextOffset,2);
 assert.deepEqual(first.items[0].properties,{status:'进行中',rating:0,grade:'未评级',author:['Author'],pagecount:0,pageprogress:24});
 assert.deepEqual(first.items[1].kinds,['movie']);assert.equal(first.items[1].properties.viewtime,null);
 const last=await api.media.list({folder:'Media',offset:first.nextOffset,limit:2});
 assert.deepEqual(last.items.map(row=>row.path),['Media/Game/C.md']);assert.equal(last.nextOffset,null);assert.equal(last.items[0].properties.playtime,'12 hours');
 first.items[0].properties.author.push('Changed');assert.equal(JSON.stringify([...values]),before);
 assert.equal((await api.media.list({folder:'Media',recursive:false})).total,0);
});

test('media search reads current metadata, supports existing states and reports unavailable scope',async()=>{
 const {api,values,plugin}=fixture();
 assert.equal((await api.media.list({folder:'Media',kind:'book',query:'AUTHOR',status:'进行中'})).total,1);
 values.get('Media/Books/A.md').status='搁置';
 assert.equal((await api.media.list({folder:'Media',kind:'book',status:'进行中'})).total,0);
 assert.equal((await api.media.list({folder:'Empty'})).total,0);
 await assert.rejects(api.media.list({folder:'Missing'}),e=>e.code==='not-found');
 await assert.rejects(api.media.list({folder:'../Media'}),e=>e.code==='invalid-input');
 await assert.rejects(api.media.list({folder:'Media',limit:0}),e=>e.code==='invalid-input');
 plugin._noriaPluginDisposed=true;await assert.rejects(api.media.list({folder:'Media'}),e=>e.code==='unsupported');
});

test('configured templates stay outside the catalog regardless of filename or index state',async()=>{
 const {api,plugin}=fixture();plugin.settings={mediaContent:{book:{template:'Media\\Books\\A.md'},movie:{template:'Media/Unindexed.md'}}};
 const result=await api.media.list({folder:'Media'});
 assert.deepEqual(result.items.map(row=>row.path),['Media/Film/B.md','Media/Game/C.md']);assert.equal(result.unindexed,0);
});

test('music tags and artist search are independent of film and book categories',async()=>{
 const {api,values}=fixture();values.set('Media/Other.md',{title:'One Day',tags:['arts/music'],artist:'Matisyahu'});
 const result=await api.media.list({folder:'Media',kind:'music',query:'matisyahu'});
 assert.equal(result.total,1);assert.deepEqual(result.items[0].kinds,['music']);assert.equal(result.items[0].properties.artist,'Matisyahu');
 assert.equal((await api.media.list({folder:'Media',kind:'book',query:'matisyahu'})).total,0);
});

test('actual MCP transport exposes read-only media queries using the same public catalog',async t=>{
 const {api}=fixture(),connection=createAgentConnection({getApi:()=>api,version:'1'});
 t.after(()=>connection.dispose());const endpoint=await connection.start(),client=new Client({name:'media-contract',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));t.after(()=>client.close());
 const tool=(await client.listTools()).tools.find(tool=>tool.name==='noria_media_list');assert.equal(tool.annotations.readOnlyHint,true);
 const result=await client.callTool({name:'noria_media_list',arguments:{folder:'Media',kind:'movie'}});
 assert.equal(result.isError,undefined);assert.equal(result.structuredContent.total,1);assert.equal(result.structuredContent.items[0].properties.viewtime,null);
 const error=await client.callTool({name:'noria_media_list',arguments:{folder:'Missing'}});assert.equal(error.isError,true);assert.equal(error.structuredContent.error.code,'not-found');
});
