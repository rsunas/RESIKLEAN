import { Image as NativeImage } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import type { GuideCategoryId, GuideItemId } from './segregation-guide';

export const BIN_IMAGES: Record<GuideCategoryId, number> = {
  biodegradable: require('../../assets/guide/bins/biodegradable.png'),
  'non-biodegradable': require('../../assets/guide/bins/non-biodegradable.png'),
  recyclables: require('../../assets/guide/bins/recyclables.png'),
  hazardous: require('../../assets/guide/bins/hazardous.png'),
};

// Metro bundles optional photos by item id; e.g. food-scraps.webp needs no code edit.
const photos = require.context('../../assets/guide/items', false, /\.(jpg|jpeg|webp)$/i);
export const ITEM_IMAGES: Partial<Record<GuideItemId, ImageSource | number>> = Object.fromEntries(
  photos.keys().sort().map(path => [path.replace(/^\.\//, '').replace(/\.[^.]+$/, ''), photos(path)]),
);

export function prefetchGuideBins() {
  const uris = Object.values(BIN_IMAGES).map(source => {
    // React Native Web exports bundled assets directly and has no resolveAssetSource.
    if (typeof NativeImage.resolveAssetSource === 'function') return NativeImage.resolveAssetSource(source)?.uri;
    const webSource = source as unknown as string | { uri?: string };
    return typeof webSource === 'string' ? webSource : webSource?.uri;
  }).filter((uri): uri is string => typeof uri === 'string');
  if (!uris.length) return Promise.resolve(false);
  return Image.prefetch(uris, { cachePolicy: 'memory-disk' }).catch(() => false);
}
