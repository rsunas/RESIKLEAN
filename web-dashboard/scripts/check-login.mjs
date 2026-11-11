import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Prove the submit handler has not changed relative to the repository version.
const original = execFileSync('git', ['show', 'HEAD:web-dashboard/src/pages/Login.jsx'], { cwd: root, encoding: 'utf8' });
const current = await readFile(path.join(root, 'src/pages/Login.jsx'), 'utf8');
const handler = text => text.slice(text.indexOf('  async function handleSubmit'), text.indexOf('\n  return (', text.indexOf('  async function handleSubmit'))).replace(/\r/g, '');
assert.equal(handler(current), handler(original), 'Authentication handler must remain unchanged');
const luminance = color => color.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
const blend = (foreground, background, opacity) => foreground.map((channel, index) => channel * opacity + background[index] * (1 - opacity));
const white = [255, 255, 255], dark = [13, 46, 39];
// Worst case: solid white artwork, before the main art gradient helps contrast.
const backing = blend(dark, white, .78);
for (const background of [backing, blend(white, backing, .18), blend(white, dark, .2)]) {
  assert.ok(1.05 / (luminance(background) + .05) >= 4.5, 'White overlay text contrast');
}

const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__login-qa') } });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
let browser;
let closing = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  browser = await openBrowser();
  const exceptions = [], requests = [];
  let pendingLogin;
  const requestError = error => { if (!closing) exceptions.push(error.message); };
  browser.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  browser.on('Fetch.requestPaused', event => {
    const url = new URL(event.request.url);
    if (url.pathname === '/__login-qa/auth/login') {
      pendingLogin = event.requestId; requests.push(JSON.parse(event.request.postData));
    } else if (url.pathname.startsWith('/__login-qa')) {
      void browser.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, body: Buffer.from(JSON.stringify({ success: true, data: [] })).toString('base64'), responseHeaders: [{ name: 'Content-Type', value: 'application/json' }] }).catch(requestError);
    } else if (url.origin === origin || url.protocol === 'data:') {
      void browser.send('Fetch.continueRequest', { requestId: event.requestId }).catch(requestError);
    } else {
      // No production API, analytics, or external font requests during this test.
      void browser.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(requestError);
    }
  });
  async function waitFor(expression, label) {
    for (let n = 0; n < 300; n++) { if (await browser.evaluate(expression)) return; await pause(100); }
    throw new Error(`Timed out: ${label}; ${JSON.stringify(exceptions)}; ${await browser.evaluate('document.body.innerText.slice(0, 1200)')}`);
  }
  await browser.send('Page.navigate', { url: `${origin}/login` });
  await waitFor(`!!document.querySelector('.login-submit')`, 'login render');
  await waitFor(`[...document.images].every(image => image.complete && image.naturalWidth > 0)`, 'local image decoding');
  const results = [];
  for (const width of [360, 390, 430, 768, 1024, 1280, 1920]) {
    for (const fontSize of [16, 32]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height: width < 640 ? 844 : 1000, deviceScaleFactor: 1, mobile: false });
      await browser.evaluate(`document.documentElement.style.fontSize = '${fontSize}px'; window.scrollTo(0, 0)`);
      await pause(100);
      const layout = await browser.evaluate(`(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right }; };
        return { width: innerWidth, clientWidth: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
          sheet: rect('.login-sheet'), art: rect('.login-art'), form: rect('.login-form'), logo: rect('.login-logo'), footer: rect('.login-footer'),
          fields: [...document.querySelectorAll('.login-input-wrap')].map(el => { const r = el.getBoundingClientRect(); return {x:r.x, right:r.right, height:r.height}; }),
          toggle: rect('.login-password-toggle'), submit: rect('.login-submit'), image: document.querySelector('.login-illustration').currentSrc,
          invalid: [...document.querySelectorAll('.login-heading, .login-note, .login-art-caption h2, .login-footer')].some(el => el.scrollWidth > el.clientWidth + 1),
          fitsHeight: document.querySelector('.login-page').getBoundingClientRect().height >= innerHeight - 1 };
      })()`);
      assert.ok(layout.pageWidth <= width, `Horizontal overflow: ${width}/${fontSize}`);
      assert.equal(layout.invalid, false, `Text overflow: ${width}/${fontSize}`);
      assert.ok(layout.fitsHeight); assert.ok(layout.submit.height >= 56);
      assert.equal(layout.toggle.width, 44); assert.equal(layout.toggle.height, 44);
      layout.fields.forEach(field => { assert.ok(field.height >= 56); assert.ok(field.x >= layout.sheet.x); assert.ok(field.right <= layout.sheet.right); });
      if (width < 1024) {
        assert.equal(layout.art.height, width < 640 ? 260 : 320);
        assert.equal(layout.sheet.y, layout.art.bottom - 28);
        assert.equal(layout.form.x, width < 640 ? 24 : (layout.clientWidth - 480) / 2);
        assert.equal(layout.logo.height, 40);
      } else {
        assert.equal(layout.sheet.width, 640); assert.equal(layout.art.x, 640); assert.equal(layout.art.y, 16);
        assert.equal(layout.form.width, 400); assert.equal(layout.logo.height, 56);
        assert.ok(layout.image.includes('1600'), 'Desktop cover art uses the high-resolution export');
      }
      assert.ok(layout.footer.y >= layout.submit.bottom, 'Footer overlaps form');
      if (fontSize === 16 && [390, 1280, 1920].includes(width)) {
        const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: layout.height, scale: 1 } });
        await writeFile(path.join(browser.directory, `login-${width}.png`), Buffer.from(shot.data, 'base64'));
      }
      results.push({ width, fontScale: fontSize / 16, height: layout.height, image: path.basename(new URL(layout.image).pathname) });
    }
  }
  // Real native constraints/keyboard order, React state and mocked network responses.
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate(`document.documentElement.style.fontSize='16px'; document.activeElement?.blur(); window.scrollTo(0,0)`);
  const tabOrder = [];
  for (let n = 0; n < 4; n++) {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    tabOrder.push(await browser.evaluate(`document.activeElement.id || document.activeElement.className`));
  }
  assert.deepEqual(tabOrder, ['email', 'password', 'login-password-toggle', 'login-submit']);
  assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('.login-submit')).outlineStyle`), 'solid');
  await browser.evaluate(`document.querySelector('form').requestSubmit()`); await pause(100);
  assert.equal(requests.length, 0, 'Empty fields must retain native required validation');
  await browser.evaluate(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; for (const [id,value] of [['email','admin@example.test'], ['password','example-password']]) { const input=document.getElementById(id); set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
  await browser.evaluate(`document.querySelector('.login-password-toggle').click()`);
  await waitFor(`document.getElementById('password').type === 'text'`, 'show password');
  await browser.evaluate(`document.querySelector('.login-password-toggle').click(); document.getElementById('password').focus()`);
  assert.ok((await browser.evaluate(`getComputedStyle(document.querySelector('.login-password-wrap')).boxShadow`)).includes('rgb(10, 127, 79)'));
  assert.equal(await browser.evaluate(`document.getElementById('email').autocomplete`), 'email');
  assert.equal(await browser.evaluate(`document.getElementById('password').autocomplete`), 'current-password');
  async function enter() {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    for (let n = 0; n < 50 && !pendingLogin; n++) await pause(50);
    assert.ok(pendingLogin, `Enter submits the form: ${await browser.evaluate(`JSON.stringify({ active: document.activeElement.id, fields: [...document.querySelectorAll('input')].map(el => ({ id:el.id, valid:el.validity.valid, value:el.value })), error:document.querySelector('.login-error')?.textContent })`)}`);
  }
  async function reply(status, payload) {
    const requestId = pendingLogin; pendingLogin = undefined;
    await browser.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(payload)).toString('base64') });
  }
  await enter();
  assert.deepEqual(requests.at(-1), { email: 'admin@example.test', password: 'example-password' });
  assert.equal(await browser.evaluate(`document.querySelector('.login-submit').disabled`), true);
  assert.equal(await browser.evaluate(`document.querySelector('.login-submit').textContent`), 'Signing in…');
  assert.equal(await browser.evaluate(`document.querySelector('form').getAttribute('aria-busy')`), 'true');
  async function checkStateLayouts(state) {
    for (const width of [360, 390, 430, 768, 1280, 1920]) {
      for (const scale of [1, 2]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
        await browser.evaluate(`document.documentElement.style.fontSize = '${scale * 16}px'; window.scrollTo(0,0)`);
        assert.ok(await browser.evaluate(`document.documentElement.scrollWidth <= innerWidth`), `${state} overflow ${width}/${scale}`);
        assert.ok(await browser.evaluate(`document.querySelector('.login-footer').getBoundingClientRect().y >= document.querySelector('.login-submit').getBoundingClientRect().bottom`), `${state} footer overlap`);
      }
    }
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await browser.evaluate(`document.documentElement.style.fontSize='16px'`);
  }
  await checkStateLayouts('loading');
  const errorText = 'The supplied credentials are invalid. Please check your email and password and try again.';
  await reply(401, { success: false, error: errorText });
  await waitFor(`!!document.getElementById('login-error')`, 'server error');
  assert.equal(await browser.evaluate(`document.getElementById('login-error').textContent`), errorText);
  assert.equal(await browser.evaluate(`document.querySelector('.login-submit').disabled`), false);
  await checkStateLayouts('error');
  assert.ok((await browser.evaluate(`getComputedStyle(document.querySelector('.login-password-wrap')).boxShadow`)).includes('rgb(179, 38, 30)'));
  assert.ok(await browser.evaluate(`document.documentElement.scrollWidth <= 390`));
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('.login-form')).animationName`), 'none');
  // Smaller keyboard viewport must scroll, never clip the submit/footer.
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 420, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate(`document.querySelector('.login-submit').scrollIntoView({block:'center'})`);
  assert.ok(await browser.evaluate(`document.querySelector('.login-submit').getBoundingClientRect().bottom <= innerHeight`));
  await browser.evaluate(`document.getElementById('password').focus()`); await enter();
  await reply(200, { success: true, data: { token: 'test-only', user: { role: 'resident' } } });
  await waitFor(`document.getElementById('login-error')?.textContent === 'This account does not have administrator access.'`, 'role guard');
  assert.equal(await browser.evaluate(`sessionStorage.getItem('resiklean_admin_token')`), null);
  await browser.evaluate(`document.getElementById('password').focus()`); await enter();
  await reply(200, { success: true, data: { token: 'test-only', user: { role: 'admin', name: 'QA only' } } });
  await waitFor(`location.pathname === '/dashboard'`, 'unchanged redirect');
  assert.equal(await browser.evaluate(`sessionStorage.getItem('resiklean_admin_token')`), 'test-only');
  assert.equal(JSON.parse(await browser.evaluate(`sessionStorage.getItem('resiklean_admin_user')`)).role, 'admin');
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  console.log(JSON.stringify({ layouts: results, additionalStateLayouts: 24, interactions: 'PASS: native validation, focus order/rings, Enter, visibility, loading, API error, role guard, session storage, redirect, reduced motion, keyboard-height scrolling', screenshots: browser.directory }, null, 2));
} finally { closing = true; if (browser) await browser.close(); await server.close(); }
