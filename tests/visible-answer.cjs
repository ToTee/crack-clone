const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('lib/visible-answer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const box={exports:{}};vm.runInNewContext(code,box);
const {visibleAnswer,createVisibleAnswerFilter,visibleAnswerStream}=box.exports;
const planning='The user is again giving a vague action - "레나가 설명을 한다" without specifying what the explanation is. This is the second time. I think the user wants me to just progress the scene forward without getting stuck on the specifics of Lena\'s business decisions. They seem to want to move through the paperwork quickly.\n\nI should have Eunhee react naturally, accept whatever Lena said, and move to the last document (yellow clip - recording schedule). I won\'t fabricate Lena\'s specific stance but will have Eunhee respond as if she received reasonable input and move on.\n\n';
const body='[상황 이미지](https://example.test/media/image)\n\n**은연희** | "네, 확인했습니다."\n\n*은연희가 서류를 넘겼다.*\n\n```상태창\n📅2030.05.12\n```';
const taggedCases=[['<thinking>PLAN</thinking>본문','본문'],['앞<think>PLAN</think>뒤','앞뒤'],['\\<thinking>PLAN\\</thinking>본문','본문'],['<THINKING>PLAN</THINKING>본문','본문'],['<thinking>PLAN<think>PLAN</think>PLAN</thinking>본문','본문'],['<thinking>PLAN',''],['본문<thinking>PLAN','본문'],['본문<thi','본문'],['**본문** {{media:123}}\n```상태창\n일반 텍스트\n```','**본문** {{media:123}}\n```상태창\n일반 텍스트\n```'],['1 < 2, <div>정상</div> \\path','1 < 2, <div>정상</div> \\path'],['<thinking>PLAN</thinking>A<think>PLAN</think>B','AB']];
const cases=[
 ...taggedCases,
 [planning+body,body],
 ['  \n'+planning+body,body],
 [planning.replaceAll('\n','\r\n')+body,body],
 [planning+'{{img:은연희}}\n*은연희가 웃었다.*','{{img:은연희}}\n*은연희가 웃었다.*'],
 [planning+'{{media:123}}\n*은연희가 웃었다.*','{{media:123}}\n*은연희가 웃었다.*'],
 [planning+'{{img::N은연희::E웃음}}\n**은연희** | "네."','{{img::N은연희::E웃음}}\n**은연희** | "네."'],
 [planning+'![은연희](https://example.test/a)\n본문','![은연희](https://example.test/a)\n본문'],
 [planning+'  **은연희** | "I think the user wants me to help."\n','  **은연희** | "I think the user wants me to help."\n'],
 [planning+'*은연희가 서류를 넘겼다.*\nThe user is a visitor.','*은연희가 서류를 넘겼다.*\nThe user is a visitor.'],
 [planning+'은연희가 서류를 넘겼다.','은연희가 서류를 넘겼다.'],
 [planning+'은연희가 서류를 넘겼다.\n다음 문장.','은연희가 서류를 넘겼다.\n다음 문장.'],
 [planning+'```js\nconst text="The user wants me to help";\n```','```js\nconst text="The user wants me to help";\n```'],
 [planning+'"레나가 설명을 한다."\n\nI should respond naturally.\n\n'+body,body],
 [planning+'사용자의 답변을 추측하지 말아야 한다.\n\n'+body,body],
 [planning+'x'.repeat(3000)+'\n\n'+body,body],
 [planning+'I should still be planning.',''],
 ['The user is again giving a vague action',''],
 ['I should have Eunhee react naturally.\n\n'+body,body],
 ['<thinking>PLAN</thinking>'+planning+body,body],
 [planning+body+'<think>PLAN</think>',body],
 // English is legitimate content. The filter is not applied again after visible prose begins.
 ...[
  'Hello. I should have Eunhee react naturally.\n\n'+body,
  'The user is signed in. Please open Settings.',
  'The user is asking about account settings.\nClick Save to continue.',
  'I should take the train before noon.',
  'I need to speak with you about this letter.',
  'Let me help you with the settings.',
  'I think the user interface is clear.',
  '**Lena** | "The user is again giving a vague action."',
  '*The user is again giving a vague action, she read from the note.*',
  '"The user wants me to leave," Lena said.',
  '> The user is again giving a vague action.',
  '```text\n'+planning+'```',
  '~~~text\n'+planning+'~~~',
  '은연희가 고개를 들었다.\n\nThe user wants me to leave.',
 ].map(value=>[value,value]),
];
let splits=0;
for(const [input,expected] of cases){
 assert.equal(visibleAnswer(input),expected);
 const emitsOnlyExpected=(out)=>assert(expected.startsWith(out),`Unexpected visible prefix: ${JSON.stringify(out.slice(0,100))}`);
 for(let i=0;i<=input.length;i++){
  const f=createVisibleAnswerFilter();
  const a=f.push(input.slice(0,i));emitsOnlyExpected(a);
  const b=f.push(input.slice(i));emitsOnlyExpected(a+b);
  assert.equal(a+b+f.finish(),expected);splits++;
 }
 const f=createVisibleAnswerFilter();let out='';
 for(const char of input){out+=f.push(char);emitsOnlyExpected(out);}
 assert.equal(out+f.finish(),expected);
}
// Bound uncertainty on long ordinary answers, and release ordinary Korean immediately.
{
 const f=createVisibleAnswerFilter();assert.equal(f.push('은연희가'), '은연희가');assert.equal(f.finish(),'');
 const g=createVisibleAnswerFilter();const uncertain='The user '+'is reading '.repeat(40);
 assert.equal(g.push(uncertain),uncertain);assert.equal(g.finish(),'');
 const h=createVisibleAnswerFilter();assert.equal(h.push(planning),'');assert.equal(h.finish(),'');assert.equal(h.finish(),'');
}
(async()=>{
 for(const [input,expected] of [[planning+body,body],['<thinking>PLAN</thinking>본문','본문']]){
  async function* source(){for(let i=0;i<input.length;i+=7)yield input.slice(i,i+7);}
  let out='';for await(const text of visibleAnswerStream(source())){out+=text;assert(expected.startsWith(out));}
  assert.equal(out,expected);
 }
 console.log(`PASS ${cases.length} cases, ${splits} split boundaries, character streaming and async wrapper`);
})().catch(e=>{console.error(e);process.exit(1)});
