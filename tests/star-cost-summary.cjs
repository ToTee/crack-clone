// Offline ledger aggregation: no provider calls or user database access.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const db = new (require('better-sqlite3'))(':memory:');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/stars.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, {
 exports: exportsForTest, require: name => { assert.equal(name,'@/lib/db'); return db; }
});
const {initStars,starCostSummary,listStars}=exportsForTest;
initStars();
assert.equal(starCostSummary().average,null);
let seq=0;
function row(kind,cost,age='-1 hour',complete=1) {
 db.prepare("INSERT INTO star_ledger(request_key,created_at,kind,title,amount_nano,completed) VALUES (?,datetime('now',?),?,'test',?,?)").run('key'+(++seq),age,kind,cost===null?null:-cost*1e6,complete);
}
row('채팅',100);row('채팅',200);row('재생성',50);row('요약',30);row('기타 생성',10);
row('시작 잔액',-20000);row('충전 등록',-10000);
row('채팅',300,'-2 days');row('요약',60,'-8 days');
let s=starCostSummary('24h');
assert.equal(s.chat.calls,3);assert.equal(s.cost,380e6);assert.equal(s.average,380e6/3);assert.equal(s.other.cost,10e6);
assert.equal(starCostSummary('7d').cost,680e6);
assert.equal(starCostSummary('all').cost,740e6);
// Statistics must not change with pagination or type/kind filters.
for(let i=0;i<55;i++)row('충전 등록',-1);
assert.deepEqual(listStars('이용내역','채팅',0).costs,listStars('전체내역','전체',1).costs);
row('요약',null);
s=starCostSummary();assert.equal(s.summary.pending,1);assert.equal(s.average,null);assert.equal(s.cost,380e6);
db.prepare('DELETE FROM star_ledger WHERE amount_nano IS NULL').run();
row('채팅',25,'-1 hour',0);
s=starCostSummary();assert.equal(s.chat.partial,1);assert.equal(s.chat.calls,4);assert.equal(s.average,405e6/4);
db.exec('DELETE FROM star_ledger');row('요약',20);
assert.equal(starCostSummary().average,null);assert.equal(starCostSummary().cost,20e6);
console.log('PASS periods, chat+regeneration+summary totals, deposits excluded, pagination independence, pending/partial and zero denominator');
db.exec('DELETE FROM star_ledger');
function boundary(cost, modifier) {
 db.prepare("INSERT INTO star_ledger(request_key,created_at,kind,title,amount_nano) VALUES (?,datetime('now','+9 hours','start of day','-9 hours',?),'채팅','boundary',?)").run('key'+(++seq),modifier,-cost*1e6);
}
boundary(1,'-1 day'); // yesterday 00:00 KST: included yesterday
boundary(2,'-1 second'); // yesterday 23:59:59 KST
boundary(4,'+0 seconds'); // today 00:00 KST: not yesterday
boundary(8,'+86399 seconds'); // today 23:59:59 KST
boundary(16,'+1 day'); // tomorrow excluded
boundary(32,'-86401 seconds'); // day before yesterday excluded
assert.equal(starCostSummary('yesterday').cost,3e6);
assert.equal(starCostSummary('today').cost,12e6);
assert.equal(starCostSummary('today').chat.calls,2);
assert.equal(listStars('전체내역','전체',0,'yesterday').costs.period,'yesterday');
console.log('PASS Korea calendar day boundaries: inclusive midnight, exclusive next midnight');
db.close();
