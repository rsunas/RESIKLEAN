import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({root,server:{host:'127.0.0.1',port:0},plugins:[{name:'account-fixture',resolveId(id){if(id==='/__account.js')return '\0account-fixture';},load(id){if(id==='\0account-fixture')return `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import AccountModal from '/src/components/AccountModal.jsx';import '/src/index.css';function App(){const [open,setOpen]=useState(false);const [account,setAccount]=useState({name:'',contact:'',email:'',password:'',role:'collector',birthday:'',idFile:null,idPreview:'',avatarFile:null,avatarPreview:''});const [submission,setSubmission]=useState({loading:false,error:''});return React.createElement(React.Fragment,null,React.createElement('button',{id:'launch',onClick:()=>setOpen(true)},'Add account'),React.createElement(AccountModal,{isOpen:open,onClose:()=>setOpen(false),account,setAccount,submission,setSubmission,onSubmit:e=>{e.preventDefault();window.submitted=(window.submitted||0)+1;setSubmission({loading:false,error:'This is a long validation message. '.repeat(30)});}}));}createRoot(document.getElementById('root')).render(React.createElement(App));`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url==='/__account'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><body style="min-height:200vh"><div id="root"></div><script type="module" src="/__account.js"></script></body></html>'));}else next();});}}]});
let browser;const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await server.listen();browser=await openBrowser();
 const errors=[];browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const wait=async exp=>{for(let n=0;n<300;n++){if(await browser.evaluate(exp))return;await pause(100);}throw new Error(`Timeout ${exp}: ${errors}`);};
 const click=sel=>browser.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
 const key=async(k,code,modifiers=0)=>{await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,windowsVirtualKeyCode:code,modifiers,...(k==='Enter'?{text:'\r'}:{})});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,windowsVirtualKeyCode:code,modifiers});await pause(50);};
 const backdrop=async()=>{await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:5,y:5,button:'left',clickCount:1});await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:5,y:5,button:'left',clickCount:1});await pause(250);};
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__account'});await wait("!!document.querySelector('#launch')");
 for(const [width,height] of [[1280,720],[1920,1080],[390,844]]){
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await browser.evaluate("document.querySelector('#launch').focus();document.querySelector('#launch').click()");await wait("!!document.querySelector('#account-name')");await pause(250);
  assert.equal(await browser.evaluate('document.activeElement.id'),'account-name');
  const layout=await browser.evaluate(`(()=>{const d=document.querySelector('.account-dialog').getBoundingClientRect(),b=document.querySelector('.account-dialog-body'),f=document.querySelector('.account-dialog-footer').getBoundingClientRect();return {x:d.x,y:d.y,width:d.width,bottom:d.bottom,bodyScroll:b.scrollHeight>b.clientHeight,footerBottom:f.bottom};})()`);
  assert.ok(layout.x>=0&&layout.bottom<=height&&layout.footerBottom<=height,JSON.stringify(layout));
  assert.equal(Math.round(layout.width),width<640?await browser.evaluate('document.documentElement.clientWidth'):600);
  if(width===1280)assert.ok(layout.bodyScroll,'720px body should scroll');
  if(width>=640)assert.ok(Math.abs(layout.y-(height-layout.bottom))<2,'vertically centered');
  else assert.ok(Math.abs(layout.bottom-height)<2,'mobile bottom anchored');
  await click('#account-role');await wait("!!document.querySelector('.account-role-popover [role=option]')");
  assert.equal(await browser.evaluate("document.querySelectorAll('.account-role-popover [role=option]').length"),3);
  await browser.evaluate("[...document.querySelectorAll('.account-role-popover [role=option]')].find(el=>el.textContent==='Admin').click()");await pause(200);
  assert.ok(await browser.evaluate("document.querySelector('#account-role').textContent.includes('Admin')"));
  await click('#account-role');await wait("!!document.querySelector('.account-role-popover [role=option]')");
  await browser.evaluate("[...document.querySelectorAll('.account-role-popover [role=option]')].find(el=>el.textContent==='Driver').click()");await pause(200);
  for(let n=0;n<14;n++){await key('Tab',9);assert.ok(await browser.evaluate("!!document.activeElement.closest('.account-dialog')"),'forward focus trap');}
  for(let n=0;n<14;n++){await key('Tab',9,8);assert.ok(await browser.evaluate("!!document.activeElement.closest('.account-dialog')"),'reverse focus trap');}
  await key('Escape',27);await pause(300);assert.equal(await browser.evaluate("!!document.querySelector('.account-dialog')"),false);assert.equal(await browser.evaluate('document.activeElement.id'),'launch');
 }
 await click('#launch');await pause(250);await backdrop();assert.equal(await browser.evaluate("!!document.querySelector('.account-dialog')"),false,'untouched backdrop closes');
 await click('#launch');await pause(250);
 for(const [sel,text] of [['#account-name','Test Admin'],['#account-email','test@example.com'],['#account-password','secret123']]){await browser.evaluate(`document.querySelector('${sel}').focus()`);await browser.send('Input.insertText',{text});}
 await click('.account-password-toggle');assert.equal(await browser.evaluate("document.querySelector('#account-password').type"),'text');await click('.account-password-toggle');
 await backdrop();assert.ok(await browser.evaluate("!!document.querySelector('.account-dialog')"),'dirty backdrop ignored');
 await browser.evaluate("document.querySelector('#account-password').focus()");await key('Enter',13);await pause(200);assert.equal(await browser.evaluate('window.submitted'),1,JSON.stringify(await browser.evaluate(`({fields:[...document.querySelectorAll('.account-dialog input')].map(i=>({id:i.id,value:i.value,valid:i.validity.valid})),active:document.activeElement.outerHTML})`)));
 assert.ok(await browser.evaluate("document.querySelector('.account-form-error').textContent.length>500"));
 assert.ok(await browser.evaluate("document.querySelector('.account-dialog-footer').getBoundingClientRect().bottom<=innerHeight"));
 await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.account-dialog-container')).animationName"),'none');
 await key('Escape',27);await pause(250);assert.equal(await browser.evaluate('document.activeElement.id'),'launch');assert.deepEqual(errors,[]);
 console.log('PASS: 1280x720, 1920, 390 layouts; scrollable body; focus entry/trap/return; Tab/Shift+Tab/Esc/Enter; untouched/dirty backdrop; password toggle; long errors; reduced motion.');
}finally{if(browser)await browser.close();await server.close();}