import { z } from 'zod';

// Profile pictures. Pure: the loaders, the pages and the tests share it.

/** A member's own uploaded picture (avatars/<user id>/<key>.jpg); any other key is an app preset. */
export const CUSTOM_AVATAR_KEY = /^c_[0-9a-f]{12}$/;

export const isCustomAvatarKey = (key: string | null | undefined): key is string => !!key && CUSTOM_AVATAR_KEY.test(key);

/** Public URL of a custom picture in the avatars bucket, or null for a preset (shown as an initial). */
export function avatarUrl(userId: string, key: string | null | undefined, supabaseUrl: string): string | null {
  if (!isCustomAvatarKey(key) || !z.uuid().safeParse(userId).success) return null;
  return `${new URL(supabaseUrl).origin}/storage/v1/object/public/avatars/${userId}/${key}.jpg`;
}

/** Mirrors mod_remove_avatar: a custom picture, not deleted, and moderators only act on regular users. */
export function canRemoveAvatar(
  viewer: { isAdmin: boolean },
  target: { role: 'user' | 'moderator' | 'admin'; deleted: boolean; avatarKey: string | null },
): boolean {
  return !target.deleted && isCustomAvatarKey(target.avatarKey) && (target.role === 'user' || viewer.isAdmin);
}

export const AVATAR_REASON_MAX = 300;

export const removeAvatarSchema = z.object({
  user: z.uuid(),
  reason: z.string().trim().max(AVATAR_REASON_MAX).optional(),
});

/** Default reason in the Remove avatar dialog when opened from a profile report. */
export function avatarReasonFromReports(reasons: readonly string[]): string {
  return reasons.length > 0 ? `Reported: ${reasons.join(', ')}`.slice(0, AVATAR_REASON_MAX) : '';
}
