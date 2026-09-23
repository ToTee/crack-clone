const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const db = new (require('better-sqlite3'))(':memory:');
db.exec(`CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT, tagline TEXT, avatar TEXT, system_prompt TEXT, first_message TEXT, tags TEXT, start_settings TEXT, editor_config TEXT);`);
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file,exports);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,Response,console,require: name => {
    if(name==='@/lib/db') return db;
    if(name==='next/cache') return {revalidatePath(){}};
    if(name==='next/server') return {NextResponse:Response};
    if(name.startsWith('@/')) return load(name.slice(2)+'.ts');
    return require(name);
  }});
  return exports;
}
const templates=load('lib/prompt-templates.ts');
const create=load('app/api/characters/create/route.ts');
const update=load('app/api/characters/update/route.ts');
const request=body=>new Request('http://localhost',{method:'POST',body:JSON.stringify(body)});
(async()=>{
  const raw='자유 형식\n**말투** 유지\n'+ '긴 설정 '.repeat(4000);
  const config={version:1,template:'rp',prompt:raw,examples:[{id:'1',user:'안녕',assistant:'반가워'}],keywords:[],shortcuts:[],stats:[{name:'호감도',value:'50'}],registration:{description:'긴 설명 '.repeat(500)+'{{description-image:test-1}}'+'사진 뒤 문장',descriptionImages:{'test-1':{url:'data:image/png;base64,aGVsbG8=',name:'사진.png'}},genre:'시뮬레이션',target:'전체',conversation:'1:1 대화',recommendedMode:'스토리',lengthMode:'individual',length:1,gptLength:1.5,claudeLength:3,hashtags:['모험'],audience:'all',visibility:'private',commentsClosed:true}};
  const payload={name:'테스트',system_prompt:raw,first_message:'시작',start_settings:[],editor_config:config};
  const created=await(await create.POST(request(payload))).json();
  assert.ok(created.id);
  for(const template of templates.PROMPT_TEMPLATES){
    const changed={...payload,id:created.id,editor_config:{...config,template:template.id}};
    assert.equal((await update.POST(request(changed))).status,200);
    assert.equal((await update.POST(request(changed))).status,200);
    const saved=db.prepare('SELECT * FROM characters WHERE id=?').get(created.id);
    const editor=templates.parseEditorConfig(saved.editor_config);
    assert.equal(JSON.stringify(editor.registration),JSON.stringify(config.registration));
    assert.equal(JSON.stringify(editor.stats),JSON.stringify(config.stats));
    assert.equal(editor.prompt,raw);
    assert.equal(editor.template,template.id);
    assert.equal(editor.examples[0].assistant,'반가워');
    assert.equal(saved.system_prompt,raw);
    const instructions=templates.characterInstructions(saved);
    if(template.id==='custom') assert.equal(instructions,raw);
    else assert.ok(instructions.startsWith(`[템플릿: ${template.title}]\n${template.instruction}`));
    assert.ok(instructions.endsWith(raw));
  }
  assert.equal(templates.characterInstructions({system_prompt:'기존 원문'}),'기존 원문');
  assert.equal((await update.POST(request({...payload,id:created.id,editor_config:{...config,template:'unknown'}}))).status,400);
  console.log('PASS: all six templates, create/update persistence, long freeform prompt, repeated saves, custom and legacy preservation.');
  db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
