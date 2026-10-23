import { ImageManipulator, type ImageRef, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

import { logError, logInfo } from '@/lib/log';
import { computeBlurhash } from '@/lib/photos/blurhash';
import { uriScheme } from '@/lib/redact';

const MAX_LONG_SIDE = 1440;
const JPEG_QUALITY = 0.8;

export type ProcessedPhoto = {
  /** Local file of the re-encoded JPEG. */
  uri: string;
  width: number;
  height: number;
  blurhash: string | null;
};

/**
 * Decodes the picked photo (the loader applies EXIF orientation), shrinks it so
 * the long side is at most 1440 px (never enlarges) and re-encodes it as JPEG
 * at 0.8. Re-encoding a decoded bitmap writes no EXIF; upload.ts also strips
 * metadata from the bytes as a second guarantee.
 */
export async function processPhoto(sourceUri: string): Promise<ProcessedPhoto> {
  const refs: ImageRef[] = [];
  const started = Date.now();
  try {
    const original = await ImageManipulator.manipulate(sourceUri).renderAsync();
    refs.push(original);
    logInfo('photos.process', 'decoded', { scheme: uriScheme(sourceUri), width: original.width, height: original.height });

    const long = Math.max(original.width, original.height);
    let image = original;
    if (long > MAX_LONG_SIDE) {
      const resize = original.width >= original.height ? { width: MAX_LONG_SIDE } : { height: MAX_LONG_SIDE };
      image = await ImageManipulator.manipulate(original).resize(resize).renderAsync();
      refs.push(image);
    }

    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    logInfo('photos.process', 'encoded', {
      scheme: uriScheme(saved.uri),
      width: saved.width,
      height: saved.height,
      ...(__DEV__ ? { bytes: new File(saved.uri).size } : {}),
      ms: Date.now() - started,
    });
    const blurhash = await computeBlurhash(image);
    return { uri: saved.uri, width: saved.width, height: saved.height, blurhash };
  } catch (error) {
    logError('photos.process', error, { scheme: uriScheme(sourceUri) });
    throw error;
  } finally {
    // Free the decoded bitmaps right away; full-size ones are large on low-end phones.
    for (const ref of refs) ref.release();
  }
}
