const assert=require('node:assert/strict');
const fs=require('fs');const vm=require('vm');const ts=require('typescript');const DB=require('better-sqlite3');
const db=new DB(':memory:');
db.exec('CREATE TABLE characters(id TEXT PRIMARY KEY,editor_config TEXT); CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT);');
db.prepare('INSERT INTO characters VALUES (?,?)').run('c',JSON.stringify({shortcuts:[{id:'1',name:'유저노트확인',desc:'설정 확인',prompt:'노트를 참고해.'}]}));
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>n==='@/lib/db'?db:require(n),Response,URL});return exports;}
const api=load('app/api/shortcuts/route.ts'),utils=load('lib/shortcuts.ts');
const req=(method,body)=>new Request('http://localhost/api/shortcuts?characterId=c',{method,...(body?{body:JSON.stringify(body)}:{})});
(async()=>{
 const prompt='길이가 긴 프롬프트. '.repeat(2000);
 let res=await api.POST(req('POST',{name:'시점전환',desc:'인물의 관점 바꾸기',prompt}));assert.equal(res.status,200);const {id}=await res.json();
 let data=await(await api.GET(req('GET'))).json();assert.equal(data.shortcuts.length,2);let item=data.shortcuts.find(s=>s.id===id);assert.equal(item.prompt,prompt);
 assert.equal(utils.filterShortcuts(data.shortcuts,'/').length,2);
 assert.equal(utils.filterShortcuts(data.shortcuts,'/전')[0].name,'시점전환');
 assert.equal(utils.filterShortcuts(data.shortcuts,'/관점')[0].name,'시점전환');
 assert.equal(utils.filterShortcuts(data.shortcuts,'/','creator').length,1);
 assert.equal(utils.filterShortcuts(data.shortcuts,'/없는글자').length,0);
 assert(utils.shortcutMessage(item).endsWith(prompt));
 assert.equal((await api.PATCH(req('PATCH',{...item,name:'관점전환'}))).status,200);
 assert.equal((await api.PATCH(req('PATCH',{...item,name:'낡은 변경'}))).status,409);
 assert.equal((await api.DELETE(req('DELETE',{id,revision:1}))).status,200);
 assert.equal((await api.POST(req('POST',{name:'',desc:'',prompt:'a'}))).status,400);
 await api.POST(req('POST',{mode:'migrate',characterId:'c',items:[{name:'예전단축어',desc:'설명',prompt:'기존 지시'}]}));
 data=await(await api.GET(req('GET'))).json();const legacy=data.shortcuts.find(s=>s.source==='personal');assert(legacy);
 await api.DELETE(req('DELETE',{id:legacy.id,revision:0}));
 await api.POST(req('POST',{mode:'migrate',characterId:'c',items:[{name:'예전단축어',desc:'설명',prompt:'기존 지시'}]}));
 data=await(await api.GET(req('GET'))).json();assert.equal(data.shortcuts.filter(s=>s.source==='personal').length,0);
 console.log('PASS shortcuts: NAS CRUD, long prompt preserved, Korean substring/description filtering, source tabs, full prompt invocation, stale edit rejection, one-time migration without resurrection. No API charges.');
})().catch(e=>{console.error(e);process.exitCode=1;});
