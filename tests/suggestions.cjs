const assert = require('node:assert/strict');
const fs=require('fs'),vm=require('vm'),ts=require('typescript');
let output='["안녕하세요.","주위를 둘러본다.","어디로 가면 되죠?"]',exists=true,changed=false,calls=0,captured;
class AiError extends Error {constructor(m,status){super(m);this.status=status;}}
const db={prepare:sql=>({get:()=>sql.includes('characters')?{name:'인물'}:exists?{id:'s',character_id:'c',user_note:'메모',user_profile:'프로필'}:undefined})};
const parser={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/suggested-replies.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:parser});
const exportsObj={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/chats/[id]/suggestions/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:exportsObj,require:n=>n==='@/lib/suggested-replies'?parser:n==='@/lib/db'?db:n==='@/lib/memory'?{historyFingerprint:()=>changed&&calls?'new':'old',memoryContext:()=>({prompt:'요약',messages:[{role:'assistant',content:'최근 대화'}]})}:n==='@/lib/ai'?{AiError,describeAiError:e=>({error:e.message,status:e.status||502}),generateAiText:async(...args)=>{calls++;captured=args;return output;}}:require(n),Response});
const run=()=>exportsObj.POST(new Request('http://localhost',{method:'POST'}),{params:Promise.resolve({id:'s'})});
(async()=>{
 let r=await run();assert.equal(r.status,200);assert.equal((await r.json()).replies.length,3);assert(captured[1][0].content.includes('메모'));assert(captured[1][0].content.includes('최근 대화'));
 for(const invalid of ['["하나"]','["같음","같음","다름"]','not json','[1,2,3]']) {output=invalid;assert.equal((await run()).status,502);}
 output='```json\n["하나","둘","셋"]\n```';assert.equal((await run()).status,200);
 for (const valid of [
  '추천입니다: \n```json\n["하나","둘","셋"]\n```\n골라주세요.',
  '{"replies":["하나","둘","셋"]}',
  '[{"text":"하나"},{"text":"둘"},{"text":"셋"}]',
  '추천답변\n1. 하나\n2. 둘\n3. 셋',
  '- 하나\n- 둘\n- 셋',
  JSON.stringify(['[행동] "대사"', '두 번째', '긴 답변'.repeat(100)])
 ]) { output=valid;assert.equal((await run()).status,200,valid); }
 for (const invalid of ['그냥 설명입니다.', '1. 하나\n2. 둘', '1. 하나\n1. 둘\n3. 셋', '["하나","둘",']) {output=invalid;assert.equal((await run()).status,502);}
 output='["하나","둘","셋"]';
 calls=0;changed=true;assert.equal((await run()).status,409);
 exists=false;const before=calls;assert.equal((await run()).status,404);assert.equal(calls,before);
 console.log('PASS: three suggestions, context/note, invalid output, stale conversation, missing room; mocked AI, no API charges.');
})().catch(e=>{console.error(e);process.exitCode=1;});
