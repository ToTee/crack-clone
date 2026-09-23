const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chat-media.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api});
const items = [
 {id:'a',name:'에리_기쁨.jpg',category:'에리',situation:'기쁨',url:'data:image/png;base64,secret',targetScope:'default'},
 {id:'b',name:'에리_기쁨2.jpg',category:'에리',situation:'기쁨2',url:'two',targetScope:'extra1'},
 {id:'c',name:'숙소.jpg',category:'숙소',situation:'일반',url:'three',targetScope:'all'},
];
assert.equal(api.scopedMedia(items,0).length,2);
assert.equal(api.scopedMedia(items,1)[0].id,'b');
assert.equal(api.resolveMedia('{{media:b}}',items),'two');
assert.equal(api.resolveMedia('{{media:b}}',api.scopedMedia(items,0)),null);
assert.equal(api.resolveMedia('{{img:에리_기쁨2}}',items),'two');
assert.equal(api.resolveMedia('{{img::1}}',items),items[0].url);
assert.equal(api.resolveMedia('{{img:에리}}',items),null);
assert.equal(api.resolveMedia('{{media:missing}}',items),null);
assert.equal(api.mediaLines('대사{{media:a}}다음').join('|'),'대사|{{media:a}}|다음');
assert(api.isMediaLine('{{media:unfinished'));
const prompt=api.mediaInstructions(api.scopedMedia(items,0));
assert(prompt.includes('에리'));assert(prompt.includes('기쁨'));assert(!prompt.includes('secret'));assert(!prompt.includes('기쁨2'));
assert.equal(api.mediaInstructions([]),'');
console.log('PASS: media scope, stable IDs, exact legacy matching, inline/partial tags, metadata-only catalog.');
assert.equal(api.resolveMedia('{{숙소}}',items),'three');
assert.equal(api.resolveMedia('{{에리_기쁨}}',items),items[0].url);
assert.equal(api.resolveMedia('{{에리}}',items),items[0].url);
assert.equal(api.resolveMedia('{{없는분류}}',items),null);
assert.equal(api.mediaLines('입장{{숙소}}도착').join('|'),'입장|{{숙소}}|도착');
assert.equal(api.mediaLines('{{user}}님').join('|'),'{{user}}님');
assert.equal(api.replaceUserName('{user}와 {{user}}', '레나'),'레나와 레나');
assert.equal(api.replaceUserName('{user}', '$&'), '$&');
assert.equal(api.replaceUserName('{user}'), '사용자');
assert.equal(api.resolveMedia('{{에리}}',[...items,{id:'normal',name:'에리_일반.jpg',category:'에리',situation:'일반',url:'normal'}]),'normal');
console.log('PASS: shorthand prologue media, general-scene preference, user-name placeholders.');
