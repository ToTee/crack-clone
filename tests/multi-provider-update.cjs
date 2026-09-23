// Offline integration tests; isolated SQLite and synthetic SDK streams only.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE characters(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE chat_sessions(id TEXT PRIMARY KEY,character_id TEXT);
CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,content TEXT);
INSERT INTO characters VALUES('c','테스트'); INSERT INTO chat_sessions VALUES('s','c');`);
let events = [], calls = [], aborted = 0, fetchCalls = [], pages = [];
class FakeSDK {
  constructor(options) {
    const create = async (body, request) => {
      calls.push({ options, body, request });
      if (body.model === 'o1-pro') return { status: 'completed', output_text: '완료 답변', usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } } };
      const current = events;
      return { controller: { abort() { aborted++; } }, async *[Symbol.asyncIterator]() { for (const e of current) { if(e instanceof Error) throw e; yield e; } } };
    };
    this.responses = { create }; this.messages = { create }; this.chat = { completions: { create } };
  }
}
const cache = new Map();
const root = path.resolve(__dirname, '..');
function load(file) {
  if(cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file,exports);
  const js = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mockRequire = name => name === '@/lib/db' ? db : name === 'next/server' ? {NextResponse:Response} : ['openai','@anthropic-ai/sdk'].includes(name) ? FakeSDK : name.startsWith('@/') ? load(name.slice(2)+'.ts') : require(name);
  vm.runInNewContext(js,{exports,require:mockRequire,process:{env:{}},URL,Response,Request,AbortSignal,AbortController,console,
    fetch:async(url,options)=>{fetchCalls.push({url:String(url),options}); const page=pages.shift(); if(!page) throw new Error('Unexpected network'); return Response.json(page.body,{status:page.status||200});}}, {filename:file});
  return exports;
}
const config = load('lib/ai-config.ts'), settings = load('lib/settings.ts'), ai = load('lib/ai.ts');
const wallet = load('lib/stars.ts'), api = load('app/api/settings/route.ts'), starApi = load('app/api/stars/route.ts');
const request = (body, method='POST', headers={}) => new Request('http://localhost/api/test',{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const configure = async (provider, extra={}) => { const res = await api.POST(request({provider,models:{...config.DEFAULT_MODELS},maxTokens:3500,temperature:.8,...extra})); assert.equal(res.status,200,await res.clone().text()); return res.json(); };
async function consume(stream) { let text=''; try { for await(const piece of stream.text) text+=piece; return text; } finally { stream.abort(); } }
const chatEvents = (finish='stop', usage={prompt_tokens:1000,completion_tokens:100,prompt_tokens_details:{cached_tokens:600}}) => [
  {choices:[{delta:{reasoning_content:'secret reasoning',content:null},finish_reason:null}]},
  {choices:[{delta:{content:'한국어 답변'},finish_reason:null}]},
  {choices:[{delta:{},finish_reason:finish}]}, ...(usage ? [{choices:[],usage}] : []),
];
(async()=>{
  await configure('anthropic',{anthropicApiKey:'sk-ant-test',openaiApiKey:'sk-proj-test',geminiApiKey:'gemini-test',deepseekApiKey:'sk-deepseek-test'});
  assert.equal(settings.getAiSettings().summaryProvider,'anthropic');
  const pub=settings.publicAiSettings();
  for(const p of config.AI_PROVIDERS) assert(pub.keys[p].hasApiKey);
  assert(!JSON.stringify(pub).includes('gemini-test'));
  await configure('gemini',{geminiApiKey:''});
  assert.equal(settings.getProviderKey(settings.getAiSettings()),'gemini-test');
  assert.equal(settings.getAiSettings().summaryProvider,'same'); // legacy GPT/non-Claude behavior
  wallet.depositStars({amount:'100',initial:true,key:'initial-wallet-123456'});
  for(const p of ['gemini','deepseek']) {
    await configure(p,{summaryProvider:'same'}); events=chatEvents();
    const stream=await ai.openAiTextStream('설정',[{role:'user',content:'안녕'}],undefined,3500,true,'s');
    assert.equal(await consume(stream),'한국어 답변');
    assert.equal(calls.at(-1).options.baseURL,config.COMPATIBLE_BASE_URLS[p]);
    assert.equal(calls.at(-1).body.model,config.DEFAULT_MODELS[p]);
    assert.equal(calls.at(-1).body.stream_options.include_usage,true);
    const row=wallet.listStars('전체내역','전체',0).rows[0];
    assert.deepEqual(JSON.parse(row.tokens),{input:400,output:100,write:0,read:600});
  }
  await configure('anthropic',{summaryProvider:'gemini',summaryModel:'gemini-3.1-flash-lite'});
  events=chatEvents(); await ai.generateAiText('JSON 기억',[{role:'user',content:'요약'}],1500,undefined,{kind:'요약',sessionId:'s'});
  assert.equal(calls.at(-1).options.apiKey,'gemini-test');
  assert.equal(calls.at(-1).body.model,'gemini-3.1-flash-lite');
  assert.equal(calls.at(-1).body.response_format.type,'json_object');
  assert.equal(ai.resolveAi().model,'claude-opus-4-6');
  events=chatEvents('length'); await assert.rejects(()=>ai.generateAiText('JSON',[{role:'user',content:'요약'}],100,undefined,{kind:'요약'}));
  events=chatEvents(null); await assert.rejects(()=>ai.generateAiText('JSON',[{role:'user',content:'요약'}],100,undefined,{kind:'요약'}));
  events=chatEvents('content_filter'); await assert.rejects(()=>ai.generateAiText('JSON',[{role:'user',content:'요약'}],100,undefined,{kind:'요약'}));
  await configure('gemini',{summaryProvider:'same'}); events=chatEvents('stop',null);
  await consume(await ai.openAiTextStream('s',[{role:'user',content:'hi'}],undefined,100,true,'s'));
  let last=wallet.listStars('전체내역','전체',0).rows[0]; assert.equal(last.amount_nano,null); assert.equal(JSON.parse(last.pricing).usageMissing,true);
  events=[...chatEvents().slice(0,2),new Error('disconnect')];
  const aiStream=await ai.openAiTextStream('s',[{role:'user',content:'hi'}],undefined,100,true,'s'); await assert.rejects(()=>consume(aiStream));
  await configure('openai',{summaryProvider:'same',models:{...config.DEFAULT_MODELS,openai:'gpt-5.6-luna'}});
  events=[{type:'response.output_text.delta',delta:'본문'},{type:'response.completed',response:{usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:500,cache_write_tokens:200}}}}];
  await consume(await ai.openAiTextStream('s',[{role:'user',content:'hi'}],undefined,100,true,'s'));
  last=wallet.listStars('전체내역','전체',0).rows[0]; assert.deepEqual(JSON.parse(last.tokens),{input:300,output:100,write:200,read:500});
  assert.equal(last.amount_nano,-240000);
  await configure('openai',{summaryProvider:'same',models:{...config.DEFAULT_MODELS,openai:'o1-pro'}});
  assert.equal(await consume(await ai.openAiTextStream('s',[{role:'user',content:'hi'}],undefined,100,true,'s')),'완료 답변');
  assert.equal(calls.at(-1).body.stream,undefined);
  const u=load('lib/provider-usage.ts'); assert.equal(u.compatibleUsage({prompt_tokens:3,completion_tokens:2,prompt_cache_hit_tokens:5}),null);
  assert.equal((await api.POST(request({provider:'gemini',models:{...config.DEFAULT_MODELS,gemini:'https://evil/'},maxTokens:3500,temperature:.8}))).status,400);
  const discover=load('lib/model-discovery.ts').discoverModels;
  pages=[{body:{data:[{id:'claude-haiku-4-5-20251001'}],has_more:true,last_id:'page1'}},{body:{data:[{id:'claude-opus-5'},{id:'bad'}],has_more:false}}];
  assert.equal((await discover('anthropic','test')).length,2); assert(fetchCalls.at(-1).url.includes('after_id=page1'));
  pages=[{body:{data:[{id:'models/gemini-3.8-flash'},{id:'gemini-3.8-live'},{id:'gemini-3.1-flash-image'}]}}];
  assert.equal((await discover('gemini','test')).length,1); assert.equal(fetchCalls.at(-1).options.redirect,'error');
  pages=[{status:401,body:{error:'secret-provider-response'}}]; await assert.rejects(()=>discover('deepseek','test'));
  assert.deepEqual(Array.from(wallet.priceFor('deepseek-flash','5m',100,'2026-09-21T02:00:00Z')),[.3,1.2,0,.006]);
  assert.deepEqual(Array.from(wallet.priceFor('deepseek-v4-pro','5m',100,'2026-09-20T02:00:00Z')),[.66,1.98,0,.022]);
  const original=wallet.listStars('구매내역','전체',0).rows[0];
  const before=wallet.starBalance().balance, costBefore=wallet.starCostSummary('all').cost;
  const edit={id:original.id,amount:'49.82',expectedAmount:original.amount_nano,key:'correct-deposit-123456'};
  let res=await starApi.PATCH(request(edit,'PATCH',{'sec-fetch-site':'same-origin'})); assert.equal(res.status,200,await res.clone().text());
  assert.equal(wallet.starBalance().balance,before-50180000000);
  assert.equal(wallet.starCostSummary('all').cost,costBefore);
  const after=wallet.starBalance().balance;
  await starApi.PATCH(request(edit,'PATCH')); assert.equal(wallet.starBalance().balance,after);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM star_deposit_edits').get().n,1);
  assert.throws(()=>wallet.editStarDeposit({...edit,key:'stale-request-123456',amount:'60'}));
  assert.throws(()=>wallet.editStarDeposit({...edit,id:last.id,key:'usage-row-test-123456',expectedAmount:last.amount_nano}));
  for(const amount of ['-1','NaN','1.001','10001']) assert.throws(()=>wallet.editStarDeposit({...edit,amount}));
  assert.equal((await starApi.PATCH(request({...edit},'PATCH',{'sec-fetch-site':'cross-site',origin:'https://evil.example'}))).status,403);
  wallet.editStarDeposit({...edit,amount:'0',expectedAmount:49820000000,key:'zero-deposit-123456'});
  assert.equal(wallet.listStars('구매내역','전체',0).rows[0].amount_nano,0);
  assert(aborted>0);
  console.log('PASS four-provider settings, key masking, summary routing, compatible streams, thought exclusion, incomplete summaries, cache accounting, missing usage, discovery pagination/filter, deposit edits/retries/conflicts/validation/CSRF and unchanged usage totals');
})().catch(e=>{console.error(e);process.exitCode=1;});
