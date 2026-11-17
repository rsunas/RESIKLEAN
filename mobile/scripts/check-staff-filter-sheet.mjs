// Interaction/layout proxy using the real filter and AppSelect JSX on React Native Web.
// Native keyboard, system-back and drag gestures still need an Android/iOS device.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { build } from '../../web-dashboard/node_modules/vite/dist/node/index.js';
import { openBrowser } from '../../web-dashboard/scripts/browser-check.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const qaRoot='D:/RESIKLEAN-QA-TEMP'; await mkdir(qaRoot,{recursive:true});
const directory=await mkdtemp(path.join(qaRoot,'staff-filters-'));
const files={controls:'src/components/staff-controls.tsx',select:'src/components/app-select.tsx',text:'src/components/app-text.tsx'};
const modules={};
for(const [key,file] of Object.entries(files)){
 let source=await readFile(path.join(root,file),'utf8');
 source=source.replaceAll("'react-native'","'qa:native'").replaceAll("'expo/node_modules/@expo/vector-icons'","'qa:icons'").replaceAll("'@/components/app-motion'","'qa:motion'").replaceAll("'@/components/app-text'","'qa:text'").replaceAll("'@/components/app-select'","'qa:select'").replaceAll("'@/constants/theme'","'qa:theme'").replaceAll("'react-native-safe-area-context'","'qa:safe'").replaceAll("'heroui-native'","'qa:hero'").replaceAll("'@/components/searchable-select'","'qa:unused'");
 modules[key]=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
}
modules.native=`import React from 'react';import * as RN from 'react-native-web';export * from 'react-native-web';const scale=Number(new URLSearchParams(location.search).get('scale')||1);export const useWindowDimensions=()=>({...RN.useWindowDimensions(),fontScale:scale});const wrap=Component=>React.forwardRef(({style,allowFontScaling,...props},ref)=>{const flat=RN.StyleSheet.flatten(style)||{};return React.createElement(Component,{...props,ref,style:[style,allowFontScaling===false?null:{fontSize:(flat.fontSize||14)*scale,...(flat.lineHeight?{lineHeight:flat.lineHeight*scale}:{})}]});});export const Text=wrap(RN.Text);export const TextInput=wrap(RN.TextInput);`;
modules.motion=`export {Modal as MotionModal,Pressable as MotionPressable} from 'react-native-web';`;
modules.icons=`import React from 'react';import {View} from 'react-native-web';export const Feather=({size=20})=>React.createElement(View,{style:{width:size,height:size,flexShrink:0}});`;
modules.safe=`export const useSafeAreaInsets=()=>({top:24,right:0,bottom:0,left:0});`;
modules.theme=`export const AuthColors={};`;
modules.unused=`export const SearchableSelect=()=>null;`;
modules.hero=`import React from 'react';import {Pressable,Text,TextInput} from 'react-native-web';export const Button=({children,onPress,...props})=>React.createElement(Pressable,{onPress,...props},children);Button.Label=Text;export const Input=TextInput;export const Slider=()=>null;`;
modules.entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {View,Text} from 'react-native-web';import {StaffHistoryFilters,filterStaffHistory} from 'qa:controls';const rows=Array.from({length:10},(_,i)=>({driver:i<5?'Peter Parker':'A very long driver name that must truncate instead of overlapping the chevron',barangay:i===0?'Dinaga':'Area '+i+' with a long area name',truckPlate:i%2?'ABC-123':'XYZ-456',status:i%2?'Pending':'Synced',submittedAt:'Nov 11'}));function App(){const [value,setValue]=useState(['','','','','']);const [empty,setEmpty]=useState(false);window.qa={empty:()=>setEmpty(true)};const data=empty?[]:rows;const visible=filterStaffHistory(data,...value);return React.createElement(View,{style:{padding:20}},React.createElement(Text,{},'Submission history'),React.createElement(Text,{testID:'count'},visible.length<data.length?visible.length+' of '+data.length+' records':data.length+' records'),React.createElement(StaffHistoryFilters,{rows:data,value,onChange:(...next)=>setValue(next)}),React.createElement(Text,{testID:'applied'},JSON.stringify(value)),React.createElement(Text,{testID:'list'},visible.map(row=>row.barangay).join(';')));}createRoot(document.getElementById('root')).render(React.createElement(App));`;
await build({configFile:false,root,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production'),__DEV__:'false'},resolve:{alias:[{find:/^react$/,replacement:path.join(root,'node_modules/react/index.js')},{find:/^react-dom\/client$/,replacement:path.join(root,'node_modules/react-dom/client.js')}]},plugins:[{name:'qa-filter-source',resolveId(id){if(id.startsWith('qa:'))return '\0'+id;},load(id){if(id.startsWith('\0qa:'))return modules[id.slice(4)];}}],build:{outDir:directory,emptyOutDir:false,minify:false,rollupOptions:{input:'qa:entry',output:{entryFileNames:'app.js'}}}});
const app=await readFile(path.join(directory,'app.js'));
const server=createServer((req,res)=>{if(req.url.startsWith('/app.js')){res.setHeader('Content-Type','text/javascript');res.end(app);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;min-height:100%;}</style><div id="root"></div><script type="module" src="/app.js"></script>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser; const errors=[];const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 browser=await openBrowser();browser.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
 const wait=async expression=>{for(let i=0;i<100;i++){assert.deepEqual(errors,[]);if(await browser.evaluate(expression))return;await pause(60);}throw Error('Timeout: '+expression);};
 const click=async label=>{await browser.evaluate(`(()=>{const el=[...document.querySelectorAll('[role="button"]')].find(el=>el.getAttribute('aria-label')===${JSON.stringify(label)}||el.textContent===${JSON.stringify(label)});if(!el)throw Error('Missing '+${JSON.stringify(label)});el.click();})()`);await pause(80);};
 const text=selector=>browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent`);
 const fill=async(label,value)=>{await browser.evaluate(`(()=>{const input=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(80);};
 const applied=()=>text('[data-testid="applied"]');
 for(const scale of [1,2]){
  await browser.send('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
  await browser.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?scale=${scale}`});await wait("!!document.querySelector('[aria-label=\"Filters\"]')");
  assert.equal(await text('[data-testid="count"]'),'10 records');
  await browser.evaluate('document.querySelector("input").focus()');await click('Filters');await wait("!!document.querySelector('[aria-label=\"Driver, All drivers\"]')");
  assert.ok(await browser.evaluate("document.activeElement?.tagName!=='INPUT'"));
  await click('Driver, All drivers');await click('Peter Parker');await click('Close filters without applying');assert.equal(await applied(),'["","","","",""]');
  await click('Filters');await click('Driver, All drivers');await click('Peter Parker');await click('Show 5 results');assert.equal(await text('[data-testid="count"]'),'5 of 10 records');
  await click('Filters, 1 active');await click('Truck, All trucks');await click('ABC-123');await click('Sync status, All statuses');await click('Pending');await click('Show 2 results');assert.equal(await text('[data-testid="count"]'),'2 of 10 records');
  await click('Filters, 3 active');await click('Area, All areas');await fill('Search Area','Dinaga');await click('Dinaga');await wait("[...document.querySelectorAll('[role=button]')].some(el=>el.textContent==='No results'&&el.getAttribute('aria-disabled')==='true')");
  await click('Reset');await click('Close filters without applying');assert.ok((await applied()).includes('ABC-123'));
  await click('Remove Truck filter: ABC-123');assert.equal(await text('[data-testid="count"]'),'2 of 10 records');await click('Clear all');assert.equal(await text('[data-testid="count"]'),'10 records');
  await click('Filters');await click('Driver, All drivers');await click('A very long driver name that must truncate instead of overlapping the chevron');
  const bounds=await browser.evaluate(`(()=>{const trigger=document.querySelector('[aria-label^="Driver, A very long"]');const rect=trigger.getBoundingClientRect();const label=[...trigger.children].find(el=>el.textContent.includes('A very long'));return {right:rect.right,left:rect.left,height:rect.height,overflow:getComputedStyle(label).textOverflow};})()`);
  assert.ok(bounds.left>=20 && bounds.right<=340,JSON.stringify(bounds));assert.equal(bounds.overflow,'ellipsis');assert.ok(bounds.height>=52);
  const footer=await browser.evaluate("[...document.querySelectorAll('[role=button]')].find(el=>el.textContent==='Show 5 results').getBoundingClientRect().bottom");assert.ok(footer<=800,footer);
  await pause(400);
  const shot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,`sheet-scale-${scale}.png`),Buffer.from(shot.data,'base64'));
  await click('Close filters without applying');await fill('Search submission history','XYZ');assert.equal(await text('[data-testid="count"]'),'5 of 10 records');await fill('Search submission history','');
  await click('Filters');await pause(400);await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('[aria-label=\"Close filters without applying\"]')");assert.equal(await applied(),'["","","","",""]');
  await click('Filters');await pause(400);const handle=await browser.evaluate("(()=>{const heading=[...document.querySelectorAll('[role=heading]')].find(el=>el.textContent==='Filters');const r=heading.parentElement.previousElementSibling.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await browser.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[handle]});await pause(40);await browser.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handle.x,y:handle.y+30}]});await pause(40);await browser.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handle.x,y:handle.y+120}]});await pause(40);await browser.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait("!document.querySelector('[aria-label=\"Close filters without applying\"]')");
  await browser.evaluate('window.qa.empty()');await click('Filters');await wait("[...document.querySelectorAll('[role=button]')].some(el=>el.textContent==='No results'&&el.getAttribute('aria-disabled')==='true')");
 }
 assert.deepEqual(errors,[]);console.log('PASS: 360px at 1x/2x text; draft/apply/cancel/reset, combined filters, chips/clear, search, long labels, empty results. '+directory);
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
