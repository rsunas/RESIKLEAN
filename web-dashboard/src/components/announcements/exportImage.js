import { toJpeg, getFontEmbedCSS } from 'html-to-image';
export async function exportAnnouncement(node) {
  await document.fonts.ready;
  await Promise.all([...node.querySelectorAll('img')].map(image => image.decode()));
  const fontEmbedCSS = await getFontEmbedCSS(node, { preferredFontFormat: 'woff2' });
  for (const quality of [.9, .75, .6]) {
    const url = await toJpeg(node, { quality, pixelRatio: 2, cacheBust: true, fontEmbedCSS });
    const bytes = Uint8Array.from(atob(url.split(',')[1]), character => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    if (blob.size <= 1024 * 1024) return blob;
  }
  throw new Error('Could not prepare an image under 1 MB. Please retry.');
}
export function downloadAnnouncement(blob, fields) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `announcement-${fields.areaLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}-${fields.date}.jpg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
