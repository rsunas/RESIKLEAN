import sharp from 'sharp';
const source = new URL('../src/assets/announcement-bg.jpg', import.meta.url);
const target = new URL('../src/assets/announcement-bg-blurred.jpg', import.meta.url);
await sharp(source.pathname.replace(/^\/(\w:)/, '$1')).resize({ width: 1600 }).blur(8).jpeg({ quality: 85 }).toFile(target.pathname.replace(/^\/(\w:)/, '$1'));
console.log('Prepared locally bundled announcement artwork.');
