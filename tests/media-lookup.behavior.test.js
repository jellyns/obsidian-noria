const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const {createAgentConnection}=require('../src/agent-mcp.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
function load(name,stubs,globals={}) {
 const filename=path.resolve(__dirname,'../src/'+name),module={exports:{}},local=createRequire(filename);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:id=>id in stubs?stubs[id]:local(id),URL,URLSearchParams,Date,setTimeout,...globals});return module.exports;
}
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(responder) {
 let tick=10000;const calls=[];
 class Clock extends Date {static now(){return tick;}}
 const lookup=load('media-lookup.js',{obsidian:{requestUrl:async request=>{calls.push({at:tick,...request});return responder(request,calls.length);}}},{Date:Clock,setTimeout:fn=>{tick+=1000;queueMicrotask(fn);}});
 const {createPublicApi}=load('public-api.js',{'./media-lookup.js':lookup});
 const plugin={_noriaPluginDisposed:false};return {plugin,api:createPublicApi(plugin),calls};
}
const work={key:'/works/OL17267881W',title:'三体',author_name:['刘慈欣'],edition_count:44,number_of_pages_median:450,ratings_average:4.8,cover_i:123};
const edition={key:'/books/OL7353617M',title:'Fantastic Mr. Fox',number_of_pages:96,publishers:['Puffin'],publish_date:'October 1, 1988',isbn_13:['9780140328721'],isbn_10:['0140328726'],covers:[-1,15152634],authors:[{key:'/authors/OL34184A'}],languages:[{key:'/languages/eng'}]};
const authorResponse={status:200,json:{docs:[{key:'OL34184A',name:'Roald Dahl'}]}};

test('public lookup separates title candidates from exact ISBN editions and preserves source identity',async()=>{
 const f=fixture(request=>request.url.includes('/search/authors.json')?authorResponse:({status:200,json:request.url.includes('/search.json')?{numFound:1,docs:[work]}:edition}));
 const found=await f.api.media.lookup({kind:'book',query:'三体'});const item=found.candidates[0];
 assert.equal(new URL(f.calls[0].url).searchParams.get('title'),'三体');assert.equal(new URL(f.calls[0].url).searchParams.has('q'),false);
 assert.equal(item.level,'work');assert.equal(item.pagecount,undefined);assert.equal(item.rating,undefined);assert.equal(item.author,undefined);assert.equal(item.editionCount,44);
 const exact=await f.api.media.lookup({kind:'book',query:'ISBN: 978-0-14-032872-1'});
 assert.equal(exact.candidates[0].level,'edition');assert.equal(exact.candidates[0].pagecount,96);assert.equal(exact.candidates[0].cover,'https://covers.openlibrary.org/b/id/15152634-M.jpg');
 assert.deepEqual(plain(exact.candidates[0].authors),['Roald Dahl']);assert.deepEqual(plain(exact.candidates[0].unresolvedAuthorIds),[]);
 assert.equal(exact.candidates[0].source.url,'https://openlibrary.org/books/OL7353617M');assert.deepEqual(plain(exact.candidates[0].publishers),['Puffin']);
 assert.equal(exact.candidates[0].status,undefined);assert.equal(exact.candidates[0].rating,undefined);assert.equal(exact.candidates[0].finishedAt,undefined);
});

test('work links paginate editions; identical concurrent queries coalesce and cached results are independent',async()=>{
 let finish;const f=fixture(request=>request.url.includes('/search/authors.json')?authorResponse:new Promise(resolve=>finish=()=>resolve({status:200,json:{size:2,entries:[edition]}})));
 const request={kind:'book',query:'https://openlibrary.org/works/OL45804W/Fantastic_Mr_Fox',limit:1};
 const a=f.api.media.lookup(request),b=f.api.media.lookup(request);await new Promise(r=>setImmediate(r));assert.equal(f.calls.length,1);finish();
 const [one,two]=await Promise.all([a,b]);assert.equal(one.nextOffset,1);one.candidates[0].title='Changed';assert.equal(two.candidates[0].title,edition.title);
 const cached=await f.api.media.lookup(request);assert.equal(cached.candidates[0].title,edition.title);assert.equal(f.calls.length,2);
 const next=f.api.media.lookup({...request,offset:1});await new Promise(r=>setImmediate(r));assert.equal(new URL(f.calls[2].url).searchParams.get('offset'),'1');assert.ok(f.calls[1].at-f.calls[0].at>=1000);finish();assert.equal((await next).nextOffset,null);
});

test('invalid identifiers and unsupported links never request data; provider failures remain failures',async()=>{
 const f=fixture(()=>({status:429}));
 for(const query of ['ISBN: 9780140328722','https://example.org/books/OL7353617M','https://openlibrary.org@localhost/books/OL7353617M','https://openlibrary.org:8080/books/OL7353617M']) await assert.rejects(f.api.media.lookup({kind:'book',query}),e=>['invalid-input','unsupported'].includes(e.code));
 assert.equal(f.calls.length,0);await assert.rejects(f.api.media.lookup({kind:'book',query:'三体'}),e=>e.code==='rate-limited');
 await assert.rejects(f.api.media.lookup({kind:'book',query:'Another book'}),e=>e.code==='rate-limited');assert.equal(f.calls.length,1);
 const unavailable=fixture(()=>{throw Error('network');});await assert.rejects(unavailable.api.media.lookup({kind:'book',query:'三体'}),e=>e.code==='network-error');
 const missing=fixture(()=>({status:404}));assert.deepEqual(plain((await missing.api.media.lookup({kind:'book',query:'9780140328721'})).candidates),[]);
 f.plugin._noriaPluginDisposed=true;await assert.rejects(f.api.media.lookup({kind:'book',query:'三体'}),e=>e.code==='unsupported');assert.equal(f.calls.length,1);
});

test('actual MCP transport exposes lookup as an external read and returns the same edition facts',async t=>{
 const f=fixture(request=>request.url.includes('/search/authors.json')?authorResponse:({status:200,json:edition})),connection=createAgentConnection({getApi:()=>f.api,version:'test'});t.after(()=>connection.stop());
 const endpoint=await connection.start(),client=new Client({name:'lookup-test',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:`Bearer ${endpoint.token}`}}}));t.after(()=>client.close());
 const listed=await client.listTools(),tool=listed.tools.find(x=>x.name==='noria_media_lookup');assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.openWorldHint,true);
 const result=await client.callTool({name:tool.name,arguments:{kind:'book',query:'0140328726'}});assert.equal(result.structuredContent.candidates[0].pagecount,96);assert.match(f.calls[0].url,/\/isbn\/0140328726.json$/);
 const rejected=await client.callTool({name:tool.name,arguments:{kind:'movie',query:'Example'}});assert.equal(rejected.isError,true);assert.equal(f.calls.length,2);
});


test('edition authors are matched by identifier, preserve source order and expose unresolved names',async()=>{
 const row={...edition,authors:[{key:'/authors/OL2A'},{key:'/authors/OL1A'},{key:'/authors/OL3A'}]};
 const f=fixture(request=>request.url.includes('/search/authors.json')?{status:200,json:{docs:[{key:'OL1A',name:'Second author'},{key:'OL2A',name:'First author'},{key:'OL999A',name:'Unrelated author'}]}}:{status:200,json:row});
 const result=await f.api.media.lookup({kind:'book',query:'9780140328721'}),item=result.candidates[0];
 assert.deepEqual(plain(item.authors),['First author','Second author']);assert.deepEqual(plain(item.unresolvedAuthorIds),['/authors/OL3A']);
 assert.equal(f.calls.length,2);assert.match(new URL(f.calls[1].url).searchParams.get('q'),/^key:\(/);
 assert.equal(item.pagecount,96);assert.equal(item.rating,undefined);
});

test('author request failure preserves edition facts and a deliberate retry can fill missing names',async()=>{
 let attempt=0;const f=fixture(request=>request.url.includes('/search/authors.json')?(++attempt===1?{status:503}:authorResponse):{status:200,json:edition});
 const request={kind:'book',query:'9780140328721'},first=await f.api.media.lookup(request);
 assert.equal(first.candidates[0].pagecount,96);assert.deepEqual(plain(first.candidates[0].authors),[]);assert.deepEqual(plain(first.candidates[0].unresolvedAuthorIds),['/authors/OL34184A']);
 const second=await f.api.media.lookup(request);assert.deepEqual(plain(second.candidates[0].authors),['Roald Dahl']);assert.equal(f.calls.filter(x=>x.url.includes('/isbn/')).length,1);
});
