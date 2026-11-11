// Explicit asset export only: the supplied illustration is not redrawn or cropped.
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './browser-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const original = process.argv[2];
if (!original) throw new Error('Usage: node scripts/prepare-login-art.mjs <original-jpg>');
const assets = path.join(root, 'src/assets');
const server = createServer(async (_req, res) => {
  try { res.setHeader('Content-Type', 'image/jpeg'); res.end(await readFile(original)); }
  catch { res.statusCode = 500; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await openBrowser();
  const source = `http://127.0.0.1:${server.address().port}/original.jpg`;
  await browser.send('Page.navigate', { url: source });
  const exports = await browser.evaluate(`(async () => {
    const image = new Image(); image.src = ${JSON.stringify(source)}; await image.decode();
    return [800, 1600].map(width => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width * image.height / image.width);
      const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return { width, height: canvas.height, data: canvas.toDataURL('image/webp', .82).split(',')[1] };
    });
  })()`);
  await mkdir(assets, { recursive: true });
  await copyFile(original, path.join(assets, 'swmo-login-original.jpg'));
  await copyFile(path.join(root, '../mobile/assets/images/swmo-resiklean-logo-mobile.png'), path.join(assets, 'resiklean-logo.png'));
  for (const item of exports) {
    const file = path.join(assets, `swmo-login-${item.width}.webp`);
    await writeFile(file, Buffer.from(item.data, 'base64'));
    const bytes = (await stat(file)).size;
    if (bytes > 200000) throw new Error(`Image exceeds 200KB budget: ${file}`);
    console.log(`${path.basename(file)}: ${item.width}x${item.height}, ${bytes} bytes`);
  }
  console.log('Original JPEG preserved; existing ResiKlean logo reused unchanged.');
} finally { if (browser) await browser.close(); server.close(); }
