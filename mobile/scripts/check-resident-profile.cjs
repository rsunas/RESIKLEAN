const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('typescript'),React=require('react'),RN=require('react-native-web');
const {renderToStaticMarkup}=require('react-dom/server');
let state=[],cursor=0,alerts=[],granted=true,asset={uri:'local',width:1000,height:800,type:'image',fileSize:500000},saved=0,closed=0,scale=1,refs=[],refCursor=0,searchOpen=false,scrollCalls=[];
const hooks={...React,useEffect(){},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];}};
const Text=({style,...props})=>React.createElement(RN.Text,{...props,style:[style,{fontSize:(RN.StyleSheet.flatten(style)?.fontSize||14)*scale}]});
const mocks={react:hooks,'react-native':{...RN,Platform:{OS:'android'},KeyboardAvoidingView:RN.View,Alert:{alert:(...v)=>alerts.push(v)},BackHandler:{addEventListener:()=>({remove(){}})},Linking:{openSettings(){}}},
'expo/node_modules/@expo/vector-icons':{Feather:()=>null},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:0})},
'./app-text':{AppText:Text},'./app-motion':{MotionPressable:RN.Pressable,MotionModal:({visible,children})=>visible?children:null},
'./barangay-picker':{BarangayPicker:({value})=>React.createElement(RN.View,{testID:'location-picker'},React.createElement(RN.Text,{style:{minHeight:56}},value),searchOpen?React.createElement(RN.View,{testID:'suggestions',style:{height:220}},React.createElement(RN.Text,null,'Abella'),React.createElement(RN.Text,null,'Balatas')):null)},'./resident-avatar':{ResidentAvatar:({size,name})=>React.createElement(RN.View,{style:{width:size,height:size}},React.createElement(RN.Text,null,name.charAt(0)))},'./resident-settings-modal':{ChangePasswordModal:()=>null},
'expo-image-picker':{requestCameraPermissionsAsync:async()=>({granted}),requestMediaLibraryPermissionsAsync:async()=>({granted}),launchCameraAsync:async()=>({assets:[asset]}),launchImageLibraryAsync:async()=>({assets:[asset]})},
'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},ImageManipulator:{manipulate:()=>({crop(){},resize(){},release(){},renderAsync:async()=>({saveAsync:async()=>({uri:'prepared',width:512,height:512}),release(){}})})}},'expo-file-system/legacy':{getInfoAsync:async()=>({exists:true,size:100000})}};
const exportsObject={};const source=fs.readFileSync(path.join(__dirname,'../src/components/resident-profile-editor.tsx'),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports','requestAnimationFrame',js)(name=>mocks[name]||require(name),exportsObject,fn=>fn());
const p={session:{token:'test',user:{name:'Richard',phone:'09661488173',location:'Abella'}},apiUrl:'https://mock',name:'Richard',phone:'09661488173',location:'Abella',photo:null,removed:false,busy:false,error:'',setName(v){p.name=v;},setPhone(v){p.phone=v;},setLocation(v){p.location=v;},setPhoto(v){p.photo=v;},setRemoved(v){p.removed=v;},save(){saved++;},close(){closed++;}};
function tree(){cursor=0;refCursor=0;return exportsObject.ResidentProfileEditor(p);}
function nodes(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(nodes)];}
const text=node=>typeof node==='string'?node:!node||typeof node!=='object'?'':React.Children.toArray(node.props?.children).map(text).join('');
function button(label){return nodes(tree()).find(n=>n.type===RN.Pressable&&(text(n)===label||n.props.accessibilityLabel===label));}
(async()=>{
 assert.equal(button('Save changes').props.disabled,true);button('Back').props.onPress();assert.equal(closed,1);
 p.name='Updated';assert.equal(button('Save changes').props.disabled,false);button('Back').props.onPress();assert.equal(alerts.length,1);assert.equal(closed,1);alerts[0][2][1].onPress();assert.equal(closed,2);
 button('Change photo').props.onPress();assert.equal(button('Remove photo'),undefined);
 granted=false;await button('Take photo').props.onPress();assert.ok(text(tree()).includes('Camera access is needed'));assert.ok(button('Open settings'));
 granted=true;button('Change photo').props.onPress();asset.fileSize=6*1024*1024;await button('Choose from gallery').props.onPress();assert.ok(text(tree()).includes('smaller than 5 MB'));assert.equal(p.photo,null);
 button('Change photo').props.onPress();asset.fileSize=500000;await button('Choose from gallery').props.onPress();assert.equal(p.photo.uri,'prepared');assert.equal(saved,0,'Picking never uploads');assert.equal(p.photo.width,512);
 p.error='Upload failed';assert.ok(text(tree()).includes('Your changes are kept here'));assert.equal(p.photo.uri,'prepared');button('Save changes').props.onPress();assert.equal(saved,1);
 button('Change photo').props.onPress();button('Remove photo').props.onPress();assert.equal(p.photo,null);assert.equal(p.removed,true);
 p.session.user.profilePhotoUrl='https://image';p.name='Richard';p.error='';assert.equal(button('Save changes').props.disabled,false,'Removing saved photo is dirty');
 p.busy=true;assert.equal(button('Save changes').props.disabled,true);p.busy=false;
 const picker=()=>nodes(tree()).find(n=>n.type===mocks['./barangay-picker'].BarangayPicker);
 const container=nodes(tree()).find(n=>n.type===RN.ScrollView);
 assert.ok(nodes(container).some(n=>n.props?.accessibilityLabel==='Save changes'),'Save scrolls with the form, never floats over suggestions');
 refs[0].current={scrollTo:args=>scrollCalls.push(args)};
 const locationField=nodes(tree()).find(n=>n.type===RN.View&&typeof n.props.onLayout==='function');
 locationField.props.onLayout({nativeEvent:{layout:{y:540}}});picker().props.onSearchFocus();
 assert.equal(scrollCalls.at(-1).y,528);
 container.props.onLayout();container.props.onContentSizeChange();assert.equal(scrollCalls.length,3,'Reveal after keyboard resize and options layout');
 picker().props.onSearchBlur();container.props.onLayout();assert.equal(scrollCalls.length,3,'Do not jump after selection');
 p.photo={uri:'prepared'};p.error='No valid fields to update';assert.ok(text(tree()).includes('profile-photo server update'));assert.ok(!text(tree()).includes('Check your connection'));p.error='';
 searchOpen=true;
 const fixtures=[];for(const font of [1,2])for(const height of [740,400]){scale=font;fixtures.push(`<section style="display:flex;flex-direction:column;width:360px;height:${height}px">${renderToStaticMarkup(tree())}</section>`);}
 if(process.argv.includes('--layout')){
 const os=require('node:os'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'resident-profile-'));const file=path.join(dir,'index.html');
 fs.writeFileSync(file,`<html><head><style>${RN.StyleSheet.getSheet().textContent}</style></head><body>${fixtures.join('')}<pre id="result"></pre><script>const errors=[];try{document.querySelectorAll('section').forEach(s=>{if(s.scrollWidth>361)errors.push('horizontal overflow');const buttons=[...s.querySelectorAll('[role=button]')];const save=buttons.find(b=>b.textContent==='Save changes');if(!save)errors.push('missing save');const picker=s.querySelector('[data-testid=location-picker]');let scroller=picker.parentElement;while(scroller&&getComputedStyle(scroller).overflowY!=='auto'&&getComputedStyle(scroller).overflowY!=='scroll')scroller=scroller.parentElement;if(!scroller){errors.push('missing scroll container');return;}scroller.scrollTop+=picker.getBoundingClientRect().top-scroller.getBoundingClientRect().top-12;const options=s.querySelector('[data-testid=suggestions]');if(options.getBoundingClientRect().top+44>scroller.getBoundingClientRect().bottom)errors.push('suggestions below keyboard viewport');scroller.scrollTop=scroller.scrollHeight;if(save.getBoundingClientRect().bottom>scroller.getBoundingClientRect().bottom+1)errors.push('save unreachable');});}catch(error){errors.push(error.message);}document.querySelector('#result').textContent=JSON.stringify(errors);</script></body></html>`);
 let dom;try{dom=execFileSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--disable-extensions',`--user-data-dir=${path.join(dir,'browser')}`,'--dump-dom',pathToFileURL(file).href],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:10*1024*1024,stdio:['ignore','pipe','pipe']});}catch(error){if(error.code!=='ETIMEDOUT'||!error.stdout?.includes('<pre id="result">'))throw error;dom=error.stdout;console.log('Browser produced layout results but timed out during shutdown.');}assert.deepEqual(JSON.parse(dom.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]||'null'),[]);
 }
 console.log('PASS: pristine/dirty save, back confirmation, no photo, permissions denied, oversize rejection, 512px preview, save retry, removal, busy state, and 360px/large-font fixtures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
