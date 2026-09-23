// Optional test dependency: react-test-renderer matching the installed React version.
// No API requests or database writes. Markdown leaves are instrumented render counters.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const rendererPath=require.resolve('react-test-renderer');
const req=require('node:module').createRequire(rendererPath),React=req('react'),{act,create}=require(rendererPath);
global.IS_REACT_ACT_ENVIRONMENT=true;
let renders=0,parentRenders=0;const loaded={};
function load(file){if(loaded[file])return loaded[file];const exports={};loaded[file]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>{
if(n==='react'||n==='react/jsx-runtime')return req(n);
if(n==='lucide-react')return new Proxy({},{get:()=>()=>null});
if(n==='@/components/StoryMarkdown'||n==='@/components/PreviewNovelView')return {__esModule:true,default:p=>{renders++;return React.createElement('span',null,p.content)}};
if(n==='@/components/MessageActions')return {__esModule:true,default:()=>null};
if(n.startsWith('@/'))return load(n.slice(2)+'.ts');return require(n);
},requestAnimationFrame:f=>f(),document:{getElementById:()=>null},AbortController});return exports;}
const Input=load('components/ChatInputArea.tsx').default,Messages=load('components/ChatMessagesView.tsx').default;
const media=[],sent=[];let restore,stream,room;function App(){parentRenders++;const [draft,setDraft]=React.useState(),[session,setSession]=React.useState('a'),[messages,setMessages]=React.useState(Array.from({length:100},(_,i)=>({id:String(i+1),role:'assistant',content:'대화 '+i})));restore=setDraft;room=setSession;stream=()=>setMessages(m=>[...m.slice(0,-1),{...m.at(-1),content:m.at(-1).content+' 추가'}]);return React.createElement(React.Fragment,null,React.createElement(Messages,{messages,viewMode:process.env.TEST_VIEW||'chat',showMedia:true,mediaList:media,character:{name:'검사'},activeUserProfile:null,isLoading:false,messagesEndRef:{current:null}}),React.createElement(Input,{key:session,sessionId:session,conversationKey:'stable',restoredDraft:draft,isLoading:false,viewMode:'chat',shortcuts:[{id:'1',name:'확인',prompt:'설정 확인',desc:'',source:'personal'}],onManageShortcuts:()=>{},onSendMessage:t=>sent.push(t)}));}
(async()=>{let tree;await act(()=>{tree=create(React.createElement(App))});const input=()=>tree.root.findByType('input');const type=async value=>act(()=>input().props.onChange({target:{value}}));const send=async()=>act(()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));const before=[parentRenders,renders];await type('안');await type('안녕하세요');assert.deepEqual([parentRenders,renders],before);let prevented=false;input().props.onKeyDown({nativeEvent:{isComposing:true},key:'Enter',preventDefault(){prevented=true}});assert(prevented);assert.equal(sent.length,0);await send();assert.equal(sent[0],'안녕하세요');assert.equal(input().props.value,'');await act(()=>restore({sessionId:'a',text:'실패 입력'}));assert.equal(input().props.value,'실패 입력');await type('새 초안');await act(()=>restore({sessionId:'a',text:'이전 실패'}));assert.equal(input().props.value,'새 초안');let previous=renders;await act(()=>stream());assert.equal(renders,previous+1);await type('/확인');await send();await send();assert(sent.at(-1).includes('설정 확인'));await act(()=>room('b'));assert.equal(input().props.value,'');await act(()=>tree.unmount());
const leaked='The user is again giving a vague action. I think the user wants me to progress the scene.\n\nI should have the NPC respond naturally.\n\n';
const story='*은연희가 서류를 펼쳤다.*\n\n**은연희** | \"Thank you.\"';
for(const viewMode of ['chat','novel']) {
  let legacyTree;
  await act(()=>{legacyTree=create(React.createElement(Messages,{messages:[{id:'1',role:'user',content:leaked},{id:'2',role:'assistant',content:leaked+story}],viewMode,showMedia:false,mediaList:media,character:{name:'검사'},activeUserProfile:null,isLoading:false,messagesEndRef:{current:null}}));});
  const contents=legacyTree.root.findAllByType('span').map(node=>node.props.children);
  assert.deepEqual(contents,[leaked,story],'Legacy assistant plans hidden; original user text and English dialogue retained in '+viewMode);
  await act(()=>legacyTree.unmount());
}
console.log('PASS '+(process.env.TEST_VIEW||'chat')+': 100-message history, no parent/Markdown render on typing; one Markdown leaf on stream; IME Enter guard, send, draft recovery, newer draft preserved, shortcut, room reset. No paid API calls.');})().catch(e=>{console.error(e);process.exitCode=1});
