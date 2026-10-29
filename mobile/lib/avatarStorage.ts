import { AVATAR_BUCKET, avatarFilePath, avatarFilesToDelete, isCustomAvatarKey } from '@/lib/avatar';
import { logError } from '@/lib/log';
import { AVATAR_MAX_BYTES, isNetworkFailure, uploadJpeg } from '@/lib/photos/upload';
import { supabase } from '@/lib/supabase';

/** Names in the member's own folder. A network failure is thrown as network_error (nothing has changed yet). */
export async function listOwnAvatarFiles(userId: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  if (error) {
    logError('avatar.list', error);
    const wrapped = new Error(isNetworkFailure(error) ? 'network_error' : 'upload_failed');
    wrapped.cause = error;
    throw wrapped;
  }
  return data.map((file) => file.name);
}

/** Best effort: a failure is logged, never thrown (the server cleanup queue has the old file too). */
export async function removeAvatarFiles(userId: string, fileNames: readonly string[]): Promise<void> {
  if (fileNames.length === 0) return;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove(fileNames.map((name) => `${userId}/${name}`));
  if (error) logError('avatar.remove', error, { count: fileNames.length });
}

export function removeCustomAvatar(userId: string, key: string | null | undefined): Promise<void> {
  return isCustomAvatarKey(key) ? removeAvatarFiles(userId, [`${key}.jpg`]) : Promise.resolve();
}

/** Clears room for the new file: the bucket allows 5 per member, and only the current one is in use. */
export async function pruneOwnAvatarFiles(userId: string, currentKey: string | null | undefined, names: readonly string[]): Promise<void> {
  await removeAvatarFiles(userId, avatarFilesToDelete(names, currentKey));
}

/** Uploads avatars/<uid>/<key>.jpg, retrying once after a network failure. */
export async function uploadAvatarFile(localUri: string, userId: string, key: string): Promise<void> {
  const upload = () => uploadJpeg(AVATAR_BUCKET, (uid) => avatarFilePath(uid, key), localUri, userId, AVATAR_MAX_BYTES);
  try {
    await upload();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'network_error') throw error;
    await upload();
  }
}
