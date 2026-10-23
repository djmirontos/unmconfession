import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';

import { logError, logInfo } from '@/lib/log';
import { stripJpegMetadata } from '@/lib/photos/jpegMetadata';
import { uriScheme } from '@/lib/redact';
import { supabase } from '@/lib/supabase';

export const PHOTO_BUCKET = 'post-images';
// Matches the bucket's file_size_limit.
const MAX_BYTES = 3 * 1024 * 1024;
const SCOPE = 'photos.upload';

/** Error whose message is a code from lib/errors.ts, keeping the real error as `cause`. */
function fail(code: 'photo_read_failed' | 'upload_failed' | 'network_error' | 'image_too_large' | 'not_authenticated', cause?: unknown): Error {
  const error = new Error(code);
  error.cause = cause; // assigned, not passed: the options argument is not guaranteed on Hermes
  return error;
}

const NETWORK = /network|timed? ?out|timeout|offline|unable to resolve host|failed to connect|connection (reset|refused|abort)/i;

function isNetworkFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { message?: unknown; originalError?: unknown; cause?: unknown };
  return (
    (typeof e.message === 'string' && NETWORK.test(e.message)) ||
    isNetworkFailure(e.originalError) ||
    isNetworkFailure(e.cause)
  );
}

/**
 * Reads the processed JPEG with expo-file-system's native File API (no fetch of a
 * file:// URL: SDK 57's global fetch is expo/fetch). Strips EXIF/XMP/IPTC.
 */
async function readJpeg(localUri: string): Promise<ArrayBuffer> {
  let raw: Uint8Array;
  try {
    const file = new File(localUri);
    logInfo(SCOPE, 'read start', { scheme: uriScheme(localUri), exists: file.exists, size: file.size, via: 'expo-file-system File.bytes()' });
    raw = await file.bytes();
  } catch (error) {
    logError(`${SCOPE}.read`, error, { scheme: uriScheme(localUri) });
    throw fail('photo_read_failed', error);
  }

  let stripped: { bytes: Uint8Array; removed: number };
  try {
    stripped = stripJpegMetadata(raw);
  } catch (error) {
    const head = Array.from(raw.subarray(0, 4), (b) => b.toString(16).padStart(2, '0')).join(' ');
    logError(`${SCOPE}.strip`, error, { bytesRead: raw.length, firstBytes: head });
    throw fail('photo_read_failed', error);
  }
  logInfo(SCOPE, 'bytes ready', { bytesRead: raw.length, bytesAfterStrip: stripped.bytes.length, metadataSegmentsRemoved: stripped.removed });
  if (stripped.bytes.length > MAX_BYTES) throw fail('image_too_large');

  // Exact-size ArrayBuffer, as in Supabase's React Native upload example.
  const { bytes } = stripped;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Uploads a processed JPEG to post-images/<uid>/<uuid>.jpg and returns the path. */
export async function uploadPhoto(localUri: string, userId: string): Promise<string> {
  const body = await readJpeg(localUri);

  // The storage policy requires the first folder to be auth.uid(), so the session must match.
  const { data } = await supabase.auth.getSession();
  const sessionUserId = data.session?.user.id ?? null;
  if (!sessionUserId) {
    logError(SCOPE, new Error('no session'), { hasSession: false });
    throw fail('not_authenticated');
  }
  if (sessionUserId !== userId) logError(SCOPE, new Error('session user differs from form user'), { pathUser: userId, sessionUser: sessionUserId });

  const path = `${sessionUserId}/${randomUUID()}.jpg`;
  logInfo(SCOPE, 'upload start', { bucket: PHOTO_BUCKET, path, contentType: 'image/jpeg', bytes: body.byteLength });
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) {
    logError(`${SCOPE}.storage`, error, { path });
    throw fail(isNetworkFailure(error) ? 'network_error' : 'upload_failed', error);
  }
  logInfo(SCOPE, 'upload done', { path });
  return path;
}
