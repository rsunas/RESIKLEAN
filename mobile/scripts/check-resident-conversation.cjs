// React Native Web layout proxy; native keyboard/gestures still need device QA.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const {pathToFileURL}=require('node:url');
const ts=require('typescript'),React=require('react'),RN=require('react-native-web');const {renderToStaticMarkup}=require('react-dom/server');
let pendingState=null,photoExpanded=false,sendCalls=0;
let scale=1,keyboard=false,reduced=false,cursor=0,styles,events={},effects=[],scrolls=0,changes=[],animations=0;
const isStyle=(style,target)=>style===target||(Array.isArray(style)&&style.some(value=>isStyle(value,target)));
const View=props=>{const tag=['header','trackerWrap','composer','sheet','details','own'].find(key=>isStyle(props.style,styles[key]));return React.createElement(RN.View,{...props,dataSet:tag?{qa:tag}:undefined});};
const Text=({style,...props})=>{const flat=RN.StyleSheet.flatten(style)||{};return React.createElement(RN.Text,{...props,style:[style,{fontSize:(flat.fontSize||14)*scale,...(flat.lineHeight?{lineHeight:flat.lineHeight*scale}:{})}]});};
const Icon=()=>null;
const categoryExports={};
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/waste-categories.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(categoryExports);
const mocks={
 '@/lib/waste-categories':categoryExports,
 './resident-avatar':{ResidentAvatar:()=>null},
 react:{...React,useState:initial=>{const i=cursor++;return [i===0?keyboard:i===2?photoExpanded:i===3?pendingState:initial,value=>changes.push({i,value})];},useRef:()=>({current:{scrollToEnd(){scrolls++;}}}),useEffect:effect=>effects.push(effect)},
 'react-native':{...RN,View,Text,KeyboardAvoidingView:View,Keyboard:{addListener:(name,callback)=>{events[name]=callback;return {remove(){}};}},LayoutAnimation:{Types:{easeInEaseOut:'ease'},configureNext(){animations++;}}},
 'expo/node_modules/@expo/vector-icons':{Feather:Icon,MaterialCommunityIcons:Icon},
 'expo-image':{Image:({style,accessibilityLabel})=>React.createElement(RN.View,{style,accessibilityLabel})},
 '@/components/app-motion':{MotionPressable:RN.Pressable,MotionModal:({visible,children})=>visible?children:null},
 '@/components/loading-skeleton':{SkeletonBlock:()=>React.createElement(RN.View,{style:{height:26}}),SkeletonRows:()=>React.createElement(Text,null,'Loading messages')},
 '@/hooks/use-app-reduced-motion':{useAppReducedMotion:()=>reduced},
};
const source=fs.readFileSync(path.join(__dirname,'../src/components/resident-complaint-conversation.tsx'),'utf8');
const js=ts.transpileModule(source+'\nexport const testStyles=s;', {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsObject={};new Function('require','exports',js)(name=>mocks[name]||require(name),exportsObject);styles=exportsObject.testStyles;
for(const [status,step] of [['pending',0],['verified',1],['scheduled',1],['resolved',2],['rejected',0]])assert.equal(exportsObject.reportStep(status),step);
const report={_id:'r',status:'resolved',createdAt:'2026-10-18T07:30:00Z',barangay:'A long barangay location name',photoUrl:'fixture',aiVerified:true};
const props={report,subject:'Long complaint subject '.repeat(4),body:'Original report note',bags:'0 bags',metadata:'Captured Oct 18, 2026 · GPS 13.62313, 123.17673 · 3060 x 4080px · 641 KB',messages:Array.from({length:40},(_,i)=>({_id:String(i),body:'Long conversation message '.repeat(12),senderRole:i%2?'admin':'resident',createdAt:report.createdAt})),loading:false,sending:false,error:'',draft:'',setDraft(){},send:async()=>{sendCalls++;},onClose(){},bottomInset:0};
function tree(){cursor=0;effects=[];return exportsObject.ResidentComplaintConversation(props);}
for(const option of categoryExports.WASTE_CATEGORY_OPTIONS){report.wasteCategory=option.value;assert.ok(renderToStaticMarkup(tree()).includes(option.label));}
delete report.wasteCategory;assert.ok(renderToStaticMarkup(tree()).includes('Not specified'));
report.wasteCategory='non-biodegradable';
const initial=tree();assert.equal(initial.props.children[0].props.style,styles.header);assert.ok(isStyle(initial.props.children[1].props.style,styles.trackerWrap));assert.equal(initial.props.children[2].type,RN.ScrollView);assert.ok(isStyle(initial.props.children[3].props.style,styles.composer));
effects.forEach(effect=>effect());assert.ok(scrolls>0,'Scrolls on open/live change');events.keyboardDidShow();assert.ok(changes.some(change=>change.i===0&&change.value===true));assert.equal(animations,1);
reduced=true;tree();effects.forEach(effect=>effect());events.keyboardDidHide();assert.equal(animations,1,'No reduced-motion animation');
const oldScrolls=scrolls;props.messages=[...props.messages,{_id:'live',body:'Live reply',senderRole:'admin',createdAt:report.createdAt}];tree();effects.forEach(effect=>effect());assert.ok(scrolls>oldScrolls,'Live reply triggers scrolling');
props.draft='Retry this message';tree().props.children[3].props.children[2].props.onPress();assert.equal(sendCalls,1);assert.ok(changes.some(change=>change.i===3&&change.value?.state==='sending'));
pendingState={body:'Retry this message',state:'sending'};props.error='Could not send';tree();effects.forEach(effect=>effect());const failure=changes.filter(change=>change.i===3&&typeof change.value==='function').at(-1);assert.equal(failure.value(pendingState).state,'failed');
pendingState={body:'Retry this message',state:'failed'};assert.ok(renderToStaticMarkup(tree()).includes('Failed to send. Your message is kept below.'));
photoExpanded=true;assert.ok(renderToStaticMarkup(tree()).includes('Close photo'));photoExpanded=false;pendingState=null;props.error='';props.draft='';
const cases=[];
for(const font of [1,1.6])for(const open of [false,true]){scale=font;keyboard=open;const html=renderToStaticMarkup(tree());assert.equal((html.match(/Original report note/g)||[]).length,1);assert.ok(!html.includes('Manual Review'));cases.push(`<section data-scale="${font}" data-keyboard="${open}" style="width:360px;height:${open?400:720}px;display:flex;flex-direction:column;justify-content:flex-end">${html}</section>`);}
props.messages=[];props.loading=true;scale=1;keyboard=false;assert.ok(renderToStaticMarkup(tree()).includes('Loading messages'));props.loading=false;assert.ok(renderToStaticMarkup(tree()).includes('No messages yet.'));
const checks=()=>{const failures=[];for(const section of document.querySelectorAll('section')){const sheet=section.querySelector('[data-qa=sheet]'),header=section.querySelector('[data-qa=header]'),tracker=section.querySelector('[data-qa=trackerWrap]'),composer=section.querySelector('[data-qa=composer]');const r=sheet.getBoundingClientRect(),c=composer.getBoundingClientRect();if(c.bottom>r.bottom+1)failures.push('Composer outside sheet');if(section.scrollWidth>361)failures.push('Horizontal overflow');if(c.top-tracker.getBoundingClientRect().bottom<60)failures.push('Thread too short');const scroller=tracker.nextElementSibling;scroller.scrollTop=100;const before=tracker.getBoundingClientRect().top;scroller.scrollTop=200;if(tracker.getBoundingClientRect().top!==before)failures.push('Tracker moved with thread');if(header.getBoundingClientRect().top<r.top-1)failures.push('Header outside sheet');}document.querySelector('#result').textContent=JSON.stringify(failures);};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'resident-conversation-'));const file=path.join(dir,'test.html');fs.writeFileSync(file,`<html><head><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent}</style></head><body>${cases.join('')}<pre id="result"></pre><script>(${checks})()</script></body></html>`);
const dom=execFileSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run',`--user-data-dir=${path.join(dir,'browser')}`,'--dump-dom',pathToFileURL(file).href],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:10*1024*1024,stdio:['ignore','pipe','pipe']});
const failures=JSON.parse(dom.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]||'null');assert.deepEqual(failures,[]);
console.log('PASS: 360px layout, large text, compact keyboard tracker, pinned header/tracker/composer, long thread, report once, status stages, loading/empty, auto-scroll and reduced motion.');