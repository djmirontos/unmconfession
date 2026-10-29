// Custom profile pictures (migration 20261029100000_custom_avatars.sql). No imports, so
// tests/avatar.test.mjs runs it in Node. A custom picture is stored as a special avatar_key:
// 'c_' + 12 hex, file avatars/<user id>/<key>.jpg. Every upload gets a new key, so a URL
// never changes content and can be cached for good.

export const AVATAR_BUCKET = 'avatars';

const CUSTOM_KEY = /^c_[0-9a-f]{12}$/;
const CUSTOM_FILE = /^c_[0-9a-f]{12}\.jpg$/;

export function isCustomAvatarKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && CUSTOM_KEY.test(key);
}

/** Path inside the bucket. */
export const avatarFilePath = (userId: string, key: string) => `${userId}/${key}.jpg`;

/** Public URL of a custom picture, or null for a preset (or an unknown author). */
export function avatarUrl(
  userId: string | null | undefined,
  key: string | null | undefined,
  baseUrl: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
): string | null {
  if (!userId || !baseUrl || !isCustomAvatarKey(key)) return null;
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${AVATAR_BUCKET}/${avatarFilePath(userId, key)}`;
}

/** A fresh custom key from 6 random bytes (pass expo-crypto's getRandomBytes). */
export function newAvatarKey(randomBytes: (count: number) => Uint8Array): string {
  const bytes = randomBytes(6);
  if (bytes.length !== 6) throw new Error('random_bytes');
  return `c_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * File names in the member's folder that can go: every custom picture except the current
 * one. Anything that is not a custom picture file (a folder placeholder) is left alone.
 */
export function avatarFilesToDelete(fileNames: readonly string[], currentKey: string | null | undefined): string[] {
  const keep = isCustomAvatarKey(currentKey) ? `${currentKey}.jpg` : null;
  return fileNames.filter((name) => CUSTOM_FILE.test(name) && name !== keep);
}
