// Offline matching tests using excerpts supplied by the user; no API calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n)});return exports;}
const {directKeywordSources,keywordInstructions,keywordSearchText}=load('lib/keyword-book.ts');
const names=['린','모나','해인','가희','채연','다나','이안','아나이스','다인'];
const old='**해인** | "린."\n**린** | "뭐."\n```상태창\n《 린 》(운동복)\n❔ 저녁 모임(다인·아나이스·채연·가희·다나)\n```';
const latest='*린이 센터에 서 있고, 해인은 왼쪽, 모나는 오른쪽.*\n*채연이 보낸 건 다인·아나이스·가희·다나가 있는 저녁 모임 방이었다.*\n*이안과의 대화방.*\n**해인** | "밥이나 먹자."\n```상태창\n《 해인 》(돌핀팬츠)\n❔ 린은 자기 방으로 복귀.\n```';
const history=[{role:'assistant',content:latest},{role:'user',content:'[이어서 진행]'},{role:'assistant',content:old},{role:'user',content:'[이어서 진행]'}];
const config=mode=>({version:1,prompt:'',template:'custom',keywords:names.map(name=>({title:name,info:name+' 상세 설정',keywords:[name],...(mode?{triggerMode:mode}:{})}))});
function select(conf,input='[이어서 진행]',messages=history){const items=[];keywordInstructions(conf,0,[...messages.map(m=>keywordSearchText(m.content,m.role,true)),input],items,undefined,directKeywordSources(messages,input));return items;}
assert.deepEqual(Array.from(select(config()).map(x=>x.title)),names);
assert.deepEqual(Array.from(select(config('direct')).map(x=>x.title)),['린','해인']);
assert.deepEqual(Array.from(select(config('direct'),'모나에게 물어본다').map(x=>x.title)),['린','모나','해인']);
const statusOnly=[{role:'assistant',content:'```상태창\n《 다인 》\n❔ 모나도 있음\n```'},{role:'assistant',content:'```상태창\n《 이안 》\n```'}];
assert.deepEqual(Array.from(select(config('direct'),'계속',statusOnly).map(x=>x.title)),['다인']);
const aliases=config('direct');aliases.keywords=[{title:'한다인',info:'다인',triggerMode:'direct',keywords:['한다인','다인']}];
assert.equal(select(aliases,'계속',[{role:'assistant',content:'| **한다인** | "안녕"'}])[0].title,'한다인');
assert.equal(select(config('direct'),'계속',[{role:'assistant',content:'*린이 문을 열었다.*'}]).length,0);
assert.equal(select(config('direct'),'계속',[{role:'assistant',content:'**열린** | "안녕"'}]).length,0);
const scoped=config('direct');scoped.keywords.forEach(n=>n.appliedTargets=['extra1']);assert.equal(select(scoped).length,0);
const direct=select(config('direct'));assert.ok(direct.every(x=>x.mode==='direct'));assert.ok(direct[0].matches[0].sources.some(s=>s.includes('대사 인물')));
console.log('PASS general 9 vs direct 2, explicit user mention, latest status only, aliases, exact speaker match, scope and diagnostic reasons');
const titles=(input,messages=[])=>Array.from(select(config('direct'),input,messages).map(x=>x.title));
const reported='알았어요 미안해요ㅎ 내일뵈요 (답장)\u00a0*그때 이안의 방문이 열린다.* ';
assert.deepEqual(titles(reported),['이안']);
for(const input of ['열린다','들린다','린다','린스','린이라는말','어린이','린2','a린','_린']) assert.deepEqual(titles(input),[],input);
for(const input of ['린','린이 온다','린에게 물어본다','린에게는','린과는','린아!','린이라고 했다','(린)','**린**','열린다. 린이 들어온다']) assert.deepEqual(titles(input),['린'],input);
assert.deepEqual(titles('계속',[{role:'user',content:reported}]),['이안']);
assert.deepEqual(titles('계속',[{role:'assistant',content:'**린** | 안녕\n```상태창\n《 이안 》\n```'}]),['린','이안']);
// General keyword mode deliberately retains substring searches.
assert.deepEqual(Array.from(select(config(),'문이 열린다',[]).map(x=>x.title)),['린']);
const latin={version:1,prompt:'',template:'custom',keywords:[{title:'Alice',info:'Alice detail',triggerMode:'direct',keywords:['Alice']}]};
assert.equal(select(latin,'ALICE에게 말한다',[]).length,1);
assert.equal(select(latin,'Malice',[]).length,0);
console.log('PASS reported 열린다 false positive, particles, punctuation, recent user input, unchanged speaker/status and general matching');
