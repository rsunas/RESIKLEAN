// Local QA utility using the already-installed browser, not a new dependency.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function openBrowser() {
  // Keep browser profiles and caches on the project drive, not Windows' system drive.
  const projectDrive = path.parse(fileURLToPath(import.meta.url)).root;
  const qaRoot = process.env.RESIKLEAN_QA_TEMP || (process.platform === 'win32' ? path.join(projectDrive, 'RESIKLEAN-QA-TEMP') : tmpdir());
  await mkdir(qaRoot, { recursive: true });
  const directory = await mkdtemp(path.join(qaRoot, 'resiklean-login-'));
  const child = spawn(process.env.QA_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore', env: { ...process.env, TEMP: qaRoot, TMP: qaRoot, TMPDIR: qaRoot } });
  let failure;
  child.on('error', error => { failure = error; });
  let port;
  for (let n = 0; n < 150; n++) {
    if (failure) throw failure;
    try { port = (await readFile(path.join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  if (!port) { child.kill(); throw new Error('Browser debugging endpoint did not start'); }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  let closing = false;
  const pending = new Map(), listeners = new Map();
  ws.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      if (closing) request.resolve({}); else request.reject(new Error('Browser connection closed unexpectedly'));
    }
    pending.clear();
  });
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    } else listeners.get(message.method)?.forEach(fn => fn(message.params));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const number = ++id;
    const timer = setTimeout(() => { pending.delete(number); reject(new Error(`Timed out: ${method}`)); }, method === 'Page.navigate' ? 90000 : 30000);
    pending.set(number, { resolve, reject, timer }); ws.send(JSON.stringify({ id: number, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  return {
    directory, send,
    on(event, fn) { const entries = listeners.get(event) || []; entries.push(fn); listeners.set(event, entries); },
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    },
    async close() { closing = true; try { await send('Browser.close'); } catch { child.kill(); } finally { ws.close(); } },
  };
}
