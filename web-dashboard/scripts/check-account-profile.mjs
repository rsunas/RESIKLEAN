import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
let hasPhoto = true, metadataFails = false, revealFails = false, imageFails = false;
let imageRequests = 0, reveals = 0;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'profile-fixture',
 resolveId(id) { if (id === '/__profile.js') return '\0profile-fixture'; },
 load(id) { if (id === '\0profile-fixture') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import AccountIdentityButton from '/src/components/AccountIdentityButton.jsx'; import '/src/index.css'; createRoot(document.getElementById('root')).render(React.createElement(AccountIdentityButton,{account:{id:'507f1f77bcf86cd799439011',name:'Renejay Batera',role:'collector',email:'rene@example.test',contact:'09661788173',area:'Area 1',shift:'Day shift',assignedRoute:'Area 1 Collection Route'},token:'fixture',apiUrl:'/__profile-api'}));`; },
 configureServer(vite) { vite.middlewares.use(async (req,res,next) => {
  if (req.url.startsWith('/__profile-api/')) {
   assert.equal(req.headers.authorization, 'Bearer fixture');
   res.setHeader('Content-Type','application/json');
   if(req.url.includes('reveal=true')) { reveals++; res.statusCode=revealFails?503:200; res.end(JSON.stringify(revealFails?{success:false,error:'Test reveal failed'}:{success:true,data:{idPhotoUrl:'/__private-id.svg'}})); }
   else { res.statusCode=metadataFails?503:200; res.end(JSON.stringify(metadataFails?{success:false,error:'Test metadata failed'}:{success:true,data:{birthday:hasPhoto?'1994-03-14':null,hasIdPhoto:hasPhoto,assignedTruck:{truckNumber:'36',plateNumber:'ZF-9449'}}})); }
  } else if(req.url==='/__private-id.svg') {
   imageRequests++;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','image/svg+xml');res.statusCode=imageFails?503:200;
   res.end(imageFails?'unavailable':'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#E3F4EB"/><text x="40" y="100">Fixture ID</text></svg>');
  } else if(req.url==='/__profile') { res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__profile.js"></script></body></html>')); }
  else next();
 }); }
}] });
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
try {
 await server.listen();browser=await openBrowser();
 const errors=[];browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const wait=async expr=>{for(let n=0;n<300;n++){assert.deepEqual(errors,[]);if(await browser.evaluate(expr))return;await pause(100);}throw new Error('Timeout: '+expr);};
 const click=s=>browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(s)});el.focus();el.click();})()`);
 const open=async()=>{await click('#root button');await wait("!!document.querySelector('.account-profile-view-id') || document.querySelector('.account-profile-id-copy p')?.textContent==='Not provided' || !!document.querySelector('.account-profile-error')");};
 const close=async()=>{await click('.account-profile-close');await wait("!document.querySelector('.account-profile-dialog')");};
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__profile'});await wait("!!document.querySelector('#root button')");
 await open();assert.equal(imageRequests,0);assert.equal(reveals,0);
 assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.account-profile-grid dt')].map(el=>el.textContent)"),['Email','Contact number','Birthday','Assigned area','Shift','Assigned route','Assigned truck']);
 assert.ok(await browser.evaluate("document.querySelector('.account-profile-grid').textContent.includes('March 14, 1994')"));
 for(const width of [1280,1920,390]) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false});await pause(200);
  const layout=await browser.evaluate(`(()=>{const q=s=>document.querySelector(s),avatar=q('.account-profile-avatar').getBoundingClientRect(),identity=q('.account-profile-identity'),banner=q('.account-profile-banner'),card=q('.account-profile-dialog').getBoundingClientRect();return {avatar:avatar.width,above:+getComputedStyle(identity).zIndex>+getComputedStyle(banner).zIndex,width:card.width,viewport:innerWidth,bottom:card.bottom,height:innerHeight};})()`);
  assert.equal(layout.avatar,96);assert.ok(layout.above);assert.ok(layout.width<=layout.viewport);assert.ok(layout.bottom<=layout.height+1);
 }
 revealFails=true;await click('.account-profile-view-id');await wait("document.querySelector('.account-id-lightbox [role=alert]')?.textContent==='Test reveal failed'");assert.equal(imageRequests,0);
 revealFails=false;imageFails=true;await browser.evaluate("[...document.querySelectorAll('.account-id-lightbox button')].find(b=>b.textContent==='Retry').click()");await wait("document.querySelector('.account-id-lightbox [role=alert]')?.textContent.includes('could not load')");
 imageFails=false;await browser.evaluate("[...document.querySelectorAll('.account-id-lightbox button')].find(b=>b.textContent==='Retry').click()");await wait("document.querySelector('.account-id-lightbox img')?.naturalWidth>0");assert.equal(reveals,3);assert.equal(imageRequests,2);
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('.account-id-lightbox')");
 await wait("document.activeElement===document.querySelector('.account-profile-view-id')");
 await close();await wait("document.activeElement===document.querySelector('#root button')");
 hasPhoto=false;await open();assert.equal(await browser.evaluate("document.querySelectorAll('.account-profile-view-id,.account-profile-id-placeholder').length"),0);assert.ok(await browser.evaluate("document.querySelectorAll('.account-profile-grid dd')[2].textContent==='Not provided'"));await close();
 metadataFails=true;await open();await wait("!!document.querySelector('.account-profile-error')");metadataFails=false;await click('.account-profile-error button');await wait("document.querySelector('.account-profile-id-copy p')?.textContent==='Not provided'");
 assert.deepEqual(errors,[]);console.log('PASS: profile layering, birthday/order, 1280/1920/390 layout, deferred private image, missing ID, metadata/reveal/image failure retries, Escape and focus restoration.');
} finally { if(browser)await browser.close();await server.close(); }
