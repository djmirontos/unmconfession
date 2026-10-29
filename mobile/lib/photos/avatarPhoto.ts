import { File } from 'expo-file-system';
import { ImageManipulator, type ImageRef, SaveFormat } from 'expo-image-manipulator';

import { logError, logInfo } from '@/lib/log';
import { AVATAR_MAX_BYTES } from '@/lib/photos/upload';
import { uriScheme } from '@/lib/redact';

const MAX_SIDE = 512;
// Tried in order; every attempt encodes the same decoded bitmap, so there is only one lossy pass.
const QUALITIES = [0.9, 0.85, 0.8, 0.75] as const;

/** Error whose message is a code from lib/errors.ts. */
function fail(code: 'image_too_large' | 'photo_read_failed', cause?: unknown): Error {
  const error = new Error(code);
  error.cause = cause;
  return error;
}

/**
 * The picker's square crop, scaled down to at most 512 x 512 (never up) and encoded once as
 * JPEG, at the first quality that fits the bucket's 512 KB. Re-encoding a decoded bitmap writes
 * no EXIF; uploadJpeg also strips metadata from the bytes. Returns the local file URI.
 */
export async function processAvatarPhoto(sourceUri: string): Promise<string> {
  const refs: ImageRef[] = [];
  try {
    let image: ImageRef;
    try {
      image = await ImageManipulator.manipulate(sourceUri).renderAsync();
    } catch (error) {
      throw fail('photo_read_failed', error);
    }
    refs.push(image);
    if (Math.max(image.width, image.height) > MAX_SIDE) {
      const resize = image.width >= image.height ? { width: MAX_SIDE } : { height: MAX_SIDE };
      image = await ImageManipulator.manipulate(image).resize(resize).renderAsync();
      refs.push(image);
    }

    for (const compress of QUALITIES) {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress });
      const bytes = new File(saved.uri).size;
      logInfo('photos.avatar', 'encoded', { width: saved.width, height: saved.height, compress, bytes });
      // Stripping only shrinks the file, so a fit here fits after upload's strip too.
      if (bytes <= AVATAR_MAX_BYTES) return saved.uri;
    }
    throw fail('image_too_large');
  } catch (error) {
    logError('photos.avatar', error, { scheme: uriScheme(sourceUri) });
    throw error;
  } finally {
    for (const ref of refs) ref.release();
  }
}
