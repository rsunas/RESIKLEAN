import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const MAX_PROOF_PHOTO_DIMENSION = 1600;
const PROOF_PHOTO_COMPRESSION = 0.68;

/**
 * Ask the Android picker to return its original file. Recompressing in the picker
 * requires it to decode the full camera frame while the external camera activity
 * is closing, which is an avoidable low-memory crash path on older devices.
 */
export const proofCameraOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  base64: false,
  cameraType: ImagePicker.CameraType.back,
  exif: false,
  mediaTypes: ['images'],
  quality: 1,
};

function proofPhotoName(fileName?: string | null) {
  const baseName = fileName?.replace(/\.[^.]+$/, '') || `resiklean-proof-${Date.now()}`;
  return `${baseName}.jpg`;
}

async function getLocalFileSize(uri: string, fallback?: number) {
  if (!uri.startsWith('file://')) return fallback;
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && 'size' in info && typeof info.size === 'number' ? info.size : fallback;
}

/**
 * Bounds camera images before they reach React state, previews, AI scanning, or
 * multipart uploads. The transformation is native/background work and keeps JS
 * free of large base64 strings.
 */
export async function optimizeProofPhoto(asset: ImagePicker.ImagePickerAsset): Promise<ImagePicker.ImagePickerAsset> {
  if (!asset.uri) throw new Error('The camera did not return a usable photo. Please try again.');

  // The native crash path affects Android/iOS. On web, preserve the browser File
  // object because it is the upload source.
  if (Platform.OS === 'web') return asset;

  const width = Number(asset.width) || 0;
  const height = Number(asset.height) || 0;
  const largestDimension = Math.max(width, height);
  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;

  try {
    if (largestDimension > MAX_PROOF_PHOTO_DIMENSION) {
      if (width >= height) context.resize({ width: MAX_PROOF_PHOTO_DIMENSION });
      else context.resize({ height: MAX_PROOF_PHOTO_DIMENSION });
    }

    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      base64: false,
      compress: PROOF_PHOTO_COMPRESSION,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const fileSize = await getLocalFileSize(saved.uri, asset.fileSize);

    return {
      ...asset,
      base64: null,
      file: undefined,
      fileName: proofPhotoName(asset.fileName),
      fileSize,
      height: saved.height,
      mimeType: 'image/jpeg',
      uri: saved.uri,
      width: saved.width,
    };
  } finally {
    // These own native bitmaps. Release after saving, including on failure,
    // rather than retaining camera-sized frames until JS garbage collection.
    try {
      rendered?.release();
    } finally {
      context.release();
    }
  }
}
