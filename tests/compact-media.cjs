const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const modules=new Map();function load(file){const full=path.resolve(__dirname,'..',file);if(modules.has(full))return modules.get(full);const exports={};modules.set(full,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>load(n.replace('@/','')+'.ts')});return exports;}
const {compactMediaPrompt,restoreMediaReferences}=load('lib/compact-media.ts');
const {automaticMedia,resolveMedia}=load('lib/chat-media.ts');
const items=[{id:'uuid-a',name:'A_미소',category:'A',situation:'미소',url:'https://a',targetScope:'all',hint:'반가울 때'}, {id:'uuid-b',name:'B_미소',category:'B',situation:'미소',url:'https://b',targetScope:'all'},{id:'uuid-c',name:'A_미소',category:'A',situation:'미소',url:'https://c',targetScope:'extra1'}];
const c=compactMediaPrompt(automaticMedia(items,0));
assert(c.prompt.includes('반가울 때'));assert(!c.prompt.includes('uuid-a'));assert.equal(c.ids.size,2);
assert.equal(c.encode('이전 {{media:uuid-b}}'), '이전 {{mediaref:2}}');
const other=compactMediaPrompt(automaticMedia(items,1));assert.equal(other.ids.get('1'),'uuid-c');assert.equal(c.ids.get('1'),'uuid-a');
// Decode the transmitted catalog and verify every original label/condition survives.
function catalogRows(context) {
 const data=JSON.parse(context.prompt.trim().split('\n').at(-1));
 const result=[];
 for(const [category,entries] of Object.entries(data.groups || data)) {
  for(const [id,...labels] of entries) result.push([category,String(id),...labels.map(v=>typeof v==='number'?data.words[v]:v)]);
 }
 return result;
}
const repeated=Array.from({length:400},(_,i)=>({id:'stable-'+i,name:'이미지'+i,url:'/'+i,category:'인물'+(i%20),situation:'걱정하는 상황',hint:'실제로 상대의 상태를 걱정하는 현재 장면에서만 사용하세요. 과거 회상이나 부정하는 대사에는 사용하지 마세요.'}));
const unique=Array.from({length:7},(_,i)=>({id:'unique-'+i,name:'인물',url:'/'+i,situation:String(i),hint:'서로 다른 조건 '+i+' \"인용\" \n 줄바꿈'}));
for(const sample of [repeated,unique,items]) {
 const context=compactMediaPrompt(sample);
 const rows=catalogRows(context);
 assert.equal(rows.length,sample.length);
 for(const row of rows) {
  const original=sample.find(x=>x.id===context.ids.get(row[1]));
  assert.equal(row[0],original.category||original.name);
  assert.equal(row[2],original.situation||'일반');
  assert.equal(row[3],original.hint?.trim());
 }
}
assert(compactMediaPrompt(repeated).prompt.includes('words는'));
assert(!compactMediaPrompt(unique).prompt.includes('words는'));
console.log('PASS lossless dictionary and plain catalogs, numeric labels, quotes/newlines, all image candidates preserved');
async function decode(chunks,context=c){async function* source(){yield* chunks;}let out='';for await(const x of restoreMediaReferences(source(),context.ids))out+=x;return out;}
(async()=>{
 const input='앞 {{mediaref:1}} 중간 {{mediaref:2}} 끝';
 const expected='앞 {{media:uuid-a}} 중간 {{media:uuid-b}} 끝';
 for(let i=0;i<=input.length;i++)assert.equal(await decode([input.slice(0,i),input.slice(i)]),expected);
 assert.equal(await decode([...input]),expected);
 assert.equal(await decode(['x {{mediaref:999}} y']),'x  y');
 assert.equal(await decode(['x {{mediaref:']),'x ');
 assert.equal(await decode(['기존 {{media:uuid-a}} 그대로']),'기존 {{media:uuid-a}} 그대로');
 assert.equal(resolveMedia('{{media:uuid-a}}',items),'https://a');
 assert.equal(await decode(['{{mediaref:1}}'],other),'{{media:uuid-c}}');
 assert.equal(compactMediaPrompt([]).prompt,'');
 if(process.env.MEDIA_ANALYSIS_FILE){
  const data=JSON.parse(fs.readFileSync(process.env.MEDIA_ANALYSIS_FILE,'utf8'));const scoped=automaticMedia(data.media,0);const real=compactMediaPrompt(scoped);assert.equal(real.ids.size,1573);
  for(const [alias,id] of real.ids)assert.equal(await decode([`{{mediaref:${alias}}}`],real),`{{media:${id}}}`);
  console.log('Real work: all 1573 mappings preserved; compact prompt chars',Array.from(real.prompt).length);
 }
 console.log('PASS groups/hints/scopes, every stream split, unknown/truncated tags, legacy tags and per-request isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
