const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const db=new(require('better-sqlite3'))(':memory:');db.exec('CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT, tagline TEXT, avatar TEXT, system_prompt TEXT, first_message TEXT, tags TEXT, start_settings TEXT, editor_config TEXT)');
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Response,URL,require:n=>n==='@/lib/db'?db:n==='next/server'?{NextResponse:Response}:n==='next/cache'?{revalidatePath(){}}:n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n)});return exports;}
const create=load('app/api/characters/create/route.ts'),update=load('app/api/characters/update/route.ts'),media=load('app/api/characters/[id]/media/route.ts');
const req=body=>new Request('http://localhost',{method:'POST',body:JSON.stringify(body)});
(async()=>{
 const image={id:'photo',name:'표정',url:'data:image/png;base64,aGVsbG8=',category:'인물',situation:'기쁨'};
 const body={name:'작품',system_prompt:'설정',first_message:'첫 대화',media_list:[image]};
 const created=await(await create.POST(req(body))).json();assert(created.id);const ctx={params:Promise.resolve({id:created.id})};
 let state=await(await media.GET(req({}),ctx)).json();assert.equal(state.items[0].url,image.url);assert.equal(state.items[0].situation,'기쁨');
 const beforeMedia = db.prepare('SELECT items, revision FROM character_media WHERE character_id=?').get(created.id);
 const textOnly = {...body,id:created.id,name:'텍스트만 수정'}; delete textOnly.media_list;
 const textResult = await update.POST(req(textOnly)); assert.equal(textResult.status,200);
 assert.deepEqual(db.prepare('SELECT items, revision FROM character_media WHERE character_id=?').get(created.id),beforeMedia);
 assert.equal(db.prepare('SELECT name FROM characters WHERE id=?').get(created.id).name,'텍스트만 수정');
 const store=load('lib/server-media.ts'); const compact=store.compactMedia(created.id,store.readMedia(created.id));
 const referenceResult=await update.POST(req({...body,id:created.id,media_list:compact.items.map(item=>({...item,situation:'미소'})),media_revision:compact.revision}));
 assert.equal(referenceResult.status,200);
 state=await(await media.GET(req({}),ctx)).json();assert.equal(state.items[0].url,image.url);assert.equal(state.items[0].situation,'미소');
 let res=await update.POST(req({...body,id:created.id,name:'변경',media_revision:0}));assert.equal(res.status,500);assert.equal(db.prepare('SELECT name FROM characters').get().name,'작품');
 res=await update.POST(req({...body,id:created.id,media_list:[],media_revision:state.revision}));assert.equal(res.status,200);
 await media.PUT(req({mode:'migrate',items:[image]}),ctx);state=await(await media.GET(req({}),ctx)).json();assert.equal(state.items.length,0);
 db.prepare('INSERT INTO characters (id,name) VALUES (?,?)').run('old','옛 작품');const old={params:Promise.resolve({id:'old'})};await media.PUT(req({mode:'migrate',items:[image]}),old);assert.equal((await(await media.GET(req({}),old)).json()).items.length,1);
 assert.equal((await media.GET(req({}),{params:Promise.resolve({id:'missing'})})).status,404);
 console.log('PASS NAS media: image and metadata persisted; atomic conflict rollback; empty deletion; legacy migration; no resurrection; missing work.');
})().catch(e=>{console.error(e);process.exitCode=1;});
