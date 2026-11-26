// Mounted component and real browser geometry; only the OS keyboard's visual
// viewport and non-layout services (icons/images/motion) are substituted.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import ts from 'typescript';
import { build } from '../../web-dashboard/node_modules/vite/dist/node/index.js';
import { openBrowser } from '../../web-dashboard/scripts/browser-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'resiklean-conversation-'));
process.env.RESIKLEAN_QA_TEMP = directory;
const files = {
  conversation: 'src/components/resident-complaint-conversation.tsx',
  viewport: 'src/hooks/use-keyboard-viewport.ts',
  keyboard: 'src/components/keyboard-viewport.tsx',
  themed: 'src/hooks/use-themed-styles.ts',
  palette: 'src/constants/mobile-palette.ts',
  categories: 'src/lib/waste-categories.ts',
  settings: 'src/components/resident-settings-modal.tsx',
  reset: 'app/reset-password.tsx',
  auth: 'src/components/auth-ui.tsx',
  colors: 'src/constants/theme.ts',
};
const aliases = {
  'react-native': 'qa:native',
  '@/hooks/use-keyboard-viewport': 'qa:viewport',
  '@/components/keyboard-viewport': 'qa:keyboard',
  '@/hooks/use-themed-styles': 'qa:themed',
  '@/constants/mobile-palette': 'qa:palette',
  '@/hooks/app-preferences': 'qa:preferences',
  '@/lib/waste-categories': 'qa:categories',
  './resident-avatar': 'qa:avatar',
  'expo/node_modules/@expo/vector-icons': 'qa:icons',
  'expo-image': 'qa:image',
  '@/components/app-motion': 'qa:motion',
  '@/components/loading-skeleton': 'qa:skeleton',
  '@/components/auth-ui': 'qa:auth',
  '@/constants/theme': 'qa:colors',
  '@/components/app-text': 'qa:apptext',
  '@/components/brand-mark': 'qa:brand',
  '@/lib/notifications': 'qa:notifications',
  '@/lib/password-recovery': 'qa:recovery',
  'react-native-safe-area-context': 'qa:safe',
  'expo-linear-gradient': 'qa:gradient',
  'expo-router': 'qa:router',
  'heroui-native': 'qa:hero',
};
const modules = {};
for (const [key, file] of Object.entries(files)) {
  let source = await readFile(path.join(root, file), 'utf8');
  for (const [from, to] of Object.entries(aliases)) source = source.replaceAll(`'${from}'`, `'${to}'`);
  source = source.replace("import '@/global.css';", '');
  modules[key] = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
}
modules.native = `import React from 'react'; import * as RN from 'react-native-web'; export * from 'react-native-web';
const scale = Number(new URLSearchParams(location.search).get('scale') || 1);
export const useWindowDimensions = () => ({...RN.useWindowDimensions(), fontScale:scale});
export const Text = ({style,...props}) => { const flat=RN.StyleSheet.flatten(style)||{}; return React.createElement(RN.Text,{...props,style:[style,{fontSize:(flat.fontSize||14)*scale,...(flat.lineHeight?{lineHeight:flat.lineHeight*scale}:{})}]}); };`;
modules.preferences = `export const useAppTheme = () => new URLSearchParams(location.search).get('theme') || 'light'; export const useAppPreferences=()=>({preferences:{},updatePreferences(){}});`;
modules.motion = `import React from 'react'; import {Modal} from 'react-native-web'; import {KeyboardViewport} from 'qa:keyboard'; export {Pressable as MotionPressable} from 'react-native-web'; export const MotionModal=({children,...props})=>React.createElement(Modal,props,React.createElement(KeyboardViewport,{active:props.visible!==false},children)); export const MotionChevron=({children})=>children; export const AccordionBody=({expanded,children})=>expanded?children:null;`;
modules.apptext = `export {Text as AppText} from 'qa:native';`;
modules.brand = `import React from 'react'; import {View} from 'react-native-web'; export const BrandMark=({width,height})=>React.createElement(View,{style:{width,height}});`;
modules.notifications = `export const setCollectionReminderPreference=()=>{};`;
modules.recovery = `export const passwordRecoveryRequest=async()=>{throw Error('Fixture prevents account changes');};`;
modules.safe = `import React from 'react'; import {View} from 'react-native-web'; export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0}); export const SafeAreaView=({edges,...props})=>React.createElement(View,props);`;
modules.gradient = `import React from 'react'; import {View} from 'react-native-web'; export const LinearGradient=({colors,start,end,...props})=>React.createElement(View,props);`;
modules.router = `export const useRouter=()=>({replace(){},setParams(){}});export const useLocalSearchParams=()=>({});`;
modules.hero = `export const Tabs=()=>null;`;
modules.avatar = `import React from 'react'; import {View} from 'react-native-web'; export const ResidentAvatar=({size})=>React.createElement(View,{style:{width:size,height:size,flexShrink:0}});`;
modules.icons = `import React from 'react'; import {View} from 'react-native-web'; export const Feather=({size=20})=>React.createElement(View,{style:{width:size,height:size,flexShrink:0}}); export const MaterialCommunityIcons=Feather;`;
modules.image = `import React from 'react'; import {View} from 'react-native-web'; export const Image=({source,contentFit,...props})=>React.createElement(View,props);`;
modules.skeleton = `import React from 'react'; import {Text} from 'react-native-web'; export const SkeletonBlock=()=>React.createElement(Text,null,'Loading subject'); export const SkeletonRows=()=>React.createElement(Text,null,'Loading messages');`;
modules.entry = `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {Modal,View} from 'react-native-web'; import {ResidentComplaintConversation} from 'qa:conversation'; import {KeyboardViewport} from 'qa:keyboard'; import {ChangePasswordModal} from 'qa:settings'; import ResetPasswordScreen from 'qa:reset';
window.qaCase=location.search;
const report={_id:'report',status:new URLSearchParams(location.search).get('status')||'resolved',createdAt:'2026-11-23T07:54:00Z',barangay:'Back to Bagumbayan Sur',wasteCategory:'recyclable',photoUrl:'fixture',aiVerified:true};
function App(){
 const [open,setOpen]=useState(true),[draft,setDraft]=useState(''),[messages,setMessages]=useState([]),[sending,setSending]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 window.qa={open:()=>setOpen(true),long:()=>setMessages(Array.from({length:25},(_,i)=>({_id:String(i),body:'Conversation message '+i+' '+('Please collect it. '.repeat(4)),createdAt:report.createdAt,senderRole:i%2?'admin':'resident'}))),reply:()=>setMessages(rows=>[...rows,{_id:'live'+rows.length,body:'New collection team reply',createdAt:report.createdAt,senderRole:'admin'}]),fail:window.qa?.fail||false,loading:setLoading};
 const send=async()=>{setSending(true);setError('');await new Promise(resolve=>setTimeout(resolve,60));if(window.qa.fail)setError('Could not send');else{setMessages(rows=>[...rows,{_id:'sent'+rows.length,body:draft,createdAt:report.createdAt,senderRole:'resident'}]);setDraft('');}setSending(false);};
 return React.createElement(View,{style:{height:1200}},React.createElement(Modal,{animationType:'none',visible:open,onRequestClose:()=>setOpen(false)},React.createElement(KeyboardViewport,{active:open},React.createElement(View,{style:{flex:1,justifyContent:'flex-end'}},React.createElement(ResidentComplaintConversation,{report,subject:'Missed Collection in Bayan Sur',body:'Please collect it.',bags:'1 bag',metadata:'GPS 13.62313, 123.17673',messages,loading,sending,error,draft,setDraft,send,onClose:()=>setOpen(false),bottomInset:0})))));
}
function Forms(){const [open,setOpen]=useState(true);window.qaForms={open:()=>setOpen(true),close:()=>setOpen(false)};return React.createElement(KeyboardViewport,null,new URLSearchParams(location.search).get('form')==='reset'?React.createElement(ResetPasswordScreen):React.createElement(ChangePasswordModal,{visible:open,onClose:()=>setOpen(false),apiUrl:'',token:'',isPasswordSet:true}));}
createRoot(document.getElementById('root')).render(React.createElement(new URLSearchParams(location.search).has('form')?Forms:App));`;
await build({ configFile:false,root,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production'),__DEV__:'false'},resolve:{alias:[{find:/^react$/,replacement:path.join(root,'node_modules/react/index.js')},{find:/^react-dom\/client$/,replacement:path.join(root,'node_modules/react-dom/client.js')}]},plugins:[{name:'conversation-regression',resolveId(id){if(id.startsWith('qa:'))return '\0'+id;},load(id){if(id.startsWith('\0qa:'))return modules[id.slice(4)];}}],build:{outDir:directory,emptyOutDir:false,minify:false,rollupOptions:{input:'qa:entry',output:{entryFileNames:'app.js'}}}});
const bundle = await readFile(path.join(directory,'app.js'));
const server = createServer((req,res) => {
  if(req.url.startsWith('/app.js')) { res.setHeader('Content-Type','text/javascript'); res.end(bundle); }
  else { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script type="module" src="/app.js"></script>'); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
try {
  browser = await openBrowser();
  browser.on('Runtime.exceptionThrown',event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`const vv=new EventTarget();Object.assign(vv,{height:800,width:Number(new URLSearchParams(location.search).get('width')||360),offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});window.qaViewport=vv;`});
  const wait = async expression => { for(let i=0;i<80;i++){assert.deepEqual(errors,[]);if(await browser.evaluate(expression))return;await pause(50);}throw Error('Timeout: '+expression); };
  const click = async label => { await browser.evaluate(`document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`); await pause(100); };
  const fill = async value => { await browser.evaluate(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause(60); };
  const geometry = async () => browser.evaluate(`(()=>{const rect=id=>{const r=document.querySelector('[data-testid="'+id+'"]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};const thread=document.querySelector('[data-testid="complaint-thread"]');return {sheet:rect('complaint-conversation'),header:rect('complaint-header'),tracker:rect('complaint-tracker'),thread:rect('complaint-thread'),composer:rect('complaint-composer'),input:document.querySelector('textarea').getBoundingClientRect().bottom,scrollTop:thread.scrollTop,scrollHeight:thread.scrollHeight,clientHeight:thread.clientHeight};})()`);
  const check = async (height,top=0) => {
    const g = await geometry();
    assert.ok(Math.abs(g.sheet.top-(top+height*0.1))<2,JSON.stringify(g));
    assert.ok(Math.abs(g.composer.bottom-(top+height))<2,JSON.stringify(g));
    assert.ok(g.header.bottom<=g.tracker.top+1 && g.tracker.bottom<=g.thread.top+1 && g.thread.bottom<=g.composer.top+1,JSON.stringify(g));
    assert.ok(g.input<=top+height && g.thread.height>=40,JSON.stringify(g));
    assert.ok(g.sheet.left>=0 && g.sheet.right<=await browser.evaluate('innerWidth')+1,JSON.stringify(g));
    assert.equal(await browser.evaluate("document.body.style.overflow"),'hidden');
    return g;
  };
  for (const [width,scale,theme] of [[360,1,'dark'],[320,1.6,'light'],[420,2,'dark']]) {
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:true});
    await browser.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?scale=${scale}&theme=${theme}&width=${width}`});
    await wait(`window.qaCase === '?scale=${scale}&theme=${theme}&width=${width}'`);
    await wait("!!document.querySelector('[data-testid=\"complaint-thread\"]')");
    await pause(150);
    let g = await check(800);
    await browser.evaluate("document.querySelector('[data-testid=\"complaint-thread\"]').scrollTop=0");await pause(120);
    assert.equal(await browser.evaluate("document.querySelector('[data-testid=\"complaint-details\"]').getBoundingClientRect().top >= document.querySelector('[data-testid=\"complaint-thread\"]').getBoundingClientRect().top"),true);
    await click('Complaint details');
    assert.equal(await browser.evaluate("document.body.textContent.includes('Detected bag count')"),false);
    await click('Complaint details');
    await click('Photo metadata');
    assert.equal(await browser.evaluate("document.body.textContent.includes('GPS 13.62313')"),true);
    await click('Photo metadata');
    // Keep the layout viewport at 800px while simulating the keyboard covering
    // its bottom half. Merely resizing the browser misses the reported defect.
    // Exercise closing and reopening before the keyboard is shown.
    await click('Back to complaints');
    assert.equal(await browser.evaluate("document.body.style.overflow"),'');
    await browser.evaluate('window.qa.open()');
    await wait("!!document.querySelector('textarea')");
    await browser.evaluate("document.querySelector('textarea').focus();Object.assign(window.qaViewport,{height:400});window.qaViewport.dispatchEvent(new Event('resize'))");
    await pause(180); await check(400);
    assert.equal(await browser.evaluate("document.body.textContent.includes('STATUS TRACKER')"),false);
    await fill('Hello');
    await fill('A longer draft\nwith several lines\nthat stays inside\nthe composer\nwhile the keyboard\nis visible');
    await check(400);
    await fill('Hello');
    await browser.evaluate("Object.assign(window.qaViewport,{offsetTop:65});window.qaViewport.dispatchEvent(new Event('scroll'))");
    await pause(120); await check(400,65);
    await click('Send message');
    await wait("document.querySelector('textarea')?.value === ''");
    assert.ok(await browser.evaluate("document.body.textContent.includes('Hello')"));
    g = await check(400,65);
    assert.ok(g.scrollHeight-g.scrollTop-g.clientHeight<3,'Last message stays above composer');
    await browser.evaluate("document.querySelector('textarea').blur();Object.assign(window.qaViewport,{height:800,offsetTop:0});window.qaViewport.dispatchEvent(new Event('resize'))");
    await pause(150); await check(800);
    await browser.evaluate('window.qa.long()');await pause(180);
    g = await check(800); assert.ok(g.scrollHeight-g.scrollTop-g.clientHeight<3,JSON.stringify(g));
    await browser.evaluate("document.querySelector('[data-testid=\"complaint-thread\"]').scrollTop=0");await pause(120);
    await browser.evaluate('window.qa.reply()');await pause(150);
    assert.equal((await geometry()).scrollTop,0,'An incoming reply does not pull the user away from earlier details');
    await browser.evaluate("document.querySelector('textarea').focus();Object.assign(window.qaViewport,{height:400});window.qaViewport.dispatchEvent(new Event('resize'))");
    await pause(180); g=await check(400);assert.ok(g.scrollHeight-g.scrollTop-g.clientHeight<3,JSON.stringify(g));
    await fill('Keep this draft');await browser.evaluate('window.qa.fail=true');await click('Send message');
    await wait("document.body.textContent.includes('Failed to send.')");
    assert.equal(await browser.evaluate("document.querySelector('textarea').value"),'Keep this draft');
    const screenshot = await browser.send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width,height:400,scale:1}});
    await writeFile(path.join(directory,`keyboard-${width}-${theme}.png`),Buffer.from(screenshot.data,'base64'));
    await click('Back to complaints');
    assert.equal(await browser.evaluate("document.body.style.overflow"),'');
    await browser.evaluate("Object.assign(window.qaViewport,{height:800,offsetTop:0});window.qaViewport.dispatchEvent(new Event('resize'));window.qa.open()");
    await wait("!!document.querySelector('textarea')");await pause(120);await check(800);
    await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await wait("!document.querySelector('textarea')");
    assert.equal(await browser.evaluate("document.documentElement.style.overflow"),'');
  }
  // Every form uses the real shared viewport. A nested password modal must not
  // release the root's scroll lock, or shift the underlying profile page.
  for(const form of ['change','reset']) for(const theme of ['light','dark']) {
    await browser.send('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
    const query=`?form=${form}&theme=${theme}`;
    await browser.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/${query}`});
    await wait(`window.qaCase === ${JSON.stringify(query)} && document.querySelectorAll('input').length >= 3`);
    await pause(150);
    const count=await browser.evaluate("document.querySelectorAll('input').length");
    for(let index=0;index<count;index++) {
      await browser.evaluate(`document.querySelectorAll('input')[${index}].focus();window.qaViewport.height=400;window.qaViewport.dispatchEvent(new Event('resize'));`);
      await pause(180);
      const bounds=await browser.evaluate(`(()=>{const r=document.activeElement.getBoundingClientRect();let el=document.activeElement.parentElement;let top=0,bottom=400;while(el){const css=getComputedStyle(el);if(['auto','scroll','hidden'].includes(css.overflowY)){const p=el.getBoundingClientRect();top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom);}el=el.parentElement;}return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,visibleTop:top,visibleBottom:bottom};})()`);
      assert.ok(bounds.top>=bounds.visibleTop-1 && bounds.bottom<=bounds.visibleBottom+1,`${form}/${theme} field ${index}: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.left>=0 && bounds.right<=361,JSON.stringify(bounds));
      await browser.evaluate(`(()=>{const el=document.activeElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'fixture123');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    }
    const buttonLabel=form==='change'?'Update Password':'Reset password';
    const button=await browser.evaluate(`(()=>{const el=[...document.querySelectorAll('[role=button]')].find(e=>e.textContent===${JSON.stringify(buttonLabel)});el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};})()`);
    assert.ok(button.top>=0 && button.bottom<=401,`${form} submit remains reachable: ${JSON.stringify(button)}`);
    await browser.evaluate("document.activeElement.blur();window.qaViewport.height=800;window.qaViewport.dispatchEvent(new Event('resize'))");
    await pause(120);
    assert.equal(await browser.evaluate("document.querySelectorAll('input')[0].value"),'fixture123');
    if(form==='change') {
      await browser.evaluate('window.qaForms.close()');await pause(150);
      assert.equal(await browser.evaluate('document.body.style.overflow'),'hidden','Closing nested modal retains root scroll lock');
      await browser.evaluate('window.qaForms.open()');await wait("document.querySelectorAll('input').length===3");
      await browser.evaluate("document.querySelectorAll('input')[2].focus();window.qaViewport.height=400;window.qaViewport.dispatchEvent(new Event('resize'))");await pause(180);
      assert.ok(await browser.evaluate('document.activeElement.getBoundingClientRect().bottom<=401'));
    }
    const screenshot=await browser.send('Page.captureScreenshot',{format:'png'});
    await writeFile(path.join(directory,`${form}-${theme}.png`),Buffer.from(screenshot.data,'base64'));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: real Change Password sheet and Reset Password form, every field revealed, submit reachable, values retained, keyboard hide/reopen, nested modal locks, light/dark.');
  console.log('PASS: mounted browser at 320/360/420px, 1x/1.6x/2x text, both themes; open/details/scroll/focus/type/send/retry/keyboard hide/reopen; visual viewport resize and pan; footer bounds and scroll anchoring.');
  console.log('Browser screenshots: '+directory);
} finally {
  if(browser) await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
