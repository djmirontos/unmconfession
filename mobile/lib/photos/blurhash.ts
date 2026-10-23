import { encode } from 'blurhash';
import { ImageManipulator, type ImageRef, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import { logError, logInfo } from '@/lib/log';

// Tiny copy for the hash: 32 px wide is plenty for a 4x3-component blurhash.
const HASH_WIDTH = 32;
const COMPONENTS_X = 4;
const COMPONENTS_Y = 3;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Pure-JS blurhash for Expo Go: the manipulator shrinks the image to 32 px,
 * jpeg-js decodes that tiny JPEG, and `blurhash` encodes the pixels. The JS
 * work is on ~1 000 pixels, so it stays far below the 300 ms budget.
 * Returns null on any failure; the app then shows a plain placeholder.
 * TODO(dev build): swap for a native encoder if on-device timing disappoints.
 */
export async function computeBlurhash(image: ImageRef): Promise<string | null> {
  const started = Date.now();
  let tiny: ImageRef | null = null;
  try {
    tiny = await ImageManipulator.manipulate(image).resize({ width: HASH_WIDTH }).renderAsync();
    const saved = await tiny.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    if (!saved.base64) return null;
    const { data, width, height } = decodeJpeg(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: true });
    const hash = encode(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height, COMPONENTS_X, COMPONENTS_Y);
    logInfo('photos.blurhash', `done in ${Date.now() - started} ms`);
    return hash;
  } catch (error) {
    logError('photos.blurhash', error);
    return null;
  } finally {
    tiny?.release();
  }
}
