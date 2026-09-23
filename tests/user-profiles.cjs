const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const db=new(require('better-sqlite3'))(':memory:');
db.exec('CREATE TABLE chat_sessions(id TEXT PRIMARY KEY,user_profile TEXT,updated_at TEXT)');
const p={id:'legacy',name:'레나',label:'프로필',info:'설명'};
db.prepare('INSERT INTO chat_sessions VALUES (?,?,?)').run('room',JSON.stringify(p),'2026-01-01');
const exportsObj={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/user-profiles/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:exportsObj,require:n=>n==='@/lib/db'?db:n==='next/server'?{NextResponse:Response}:require(n),Response});
const patch=body=>exportsObj.PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(body)}));
(async()=>{
 let state=await(await exportsObj.GET()).json();assert.equal(state.profiles[0].name,'레나');
 let r=await patch({...state,profiles:[{...p,name:'수정'}],sessionId:'room'});assert.equal(r.status,200);let next=await r.json();assert.equal(JSON.parse(db.prepare('SELECT user_profile FROM chat_sessions').get().user_profile).name,'수정');
 assert.equal((await patch(state)).status,409);
 r=await patch({...next,profiles:[],activeId:'',sessionId:'room'});assert.equal(r.status,200);
 await patch({mode:'migrate',profiles:[p]});state=await(await exportsObj.GET()).json();assert.equal(state.profiles.length,0);
 state=await(await patch({mode:'migrate',profiles:[{...p,id:'other'}]})).json();assert.equal(state.profiles.length,1);
 state=await(await patch({mode:'migrate',profiles:[{...p,id:'other',name:'낡은값'}]})).json();assert.equal(state.profiles[0].name,'레나');
 assert.equal((await patch({...state,sessionId:'missing'})).status,404);
 console.log('PASS NAS profiles: recovery, persistence, session selection, conflict, migration, deletion tombstones.');
})().catch(e=>{console.error(e);process.exitCode=1;});
