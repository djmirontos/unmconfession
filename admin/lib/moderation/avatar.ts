import { z } from 'zod';

// Profile pictures and profile details. Pure: the loaders, the pages and the tests share it.

/** A member's own uploaded picture (avatars/<user id>/<key>.jpg); any other key is an app preset. */
export const CUSTOM_AVATAR_KEY = /^c_[0-9a-f]{12}$/;

export const isCustomAvatarKey = (key: string | null | undefined): key is string => !!key && CUSTOM_AVATAR_KEY.test(key);

/** Public URL of a custom picture in the avatars bucket, or null for a preset (shown as an initial). */
export function avatarUrl(userId: string, key: string | null | undefined, supabaseUrl: string): string | null {
  if (!isCustomAvatarKey(key) || !z.uuid().safeParse(userId).success) return null;
  return `${new URL(supabaseUrl).origin}/storage/v1/object/public/avatars/${userId}/${key}.jpg`;
}

type Viewer = { isAdmin: boolean };
type Target = { role: 'user' | 'moderator' | 'admin'; deleted: boolean };

// mod_remove_avatar and mod_clear_profile_details: moderators act on regular users only.
const mayActOn = (viewer: Viewer, target: Target) => !target.deleted && (target.role === 'user' || viewer.isAdmin);

/** Mirrors mod_remove_avatar: a custom picture on a live account. */
export function canRemoveAvatar(viewer: Viewer, target: Target & { avatarKey: string | null }): boolean {
  return mayActOn(viewer, target) && isCustomAvatarKey(target.avatarKey);
}

/** Mirrors mod_clear_profile_details: some details text on a live account. */
export function canClearDetails(viewer: Viewer, target: Target, details: string | null): boolean {
  return mayActOn(viewer, target) && !!details?.trim();
}

/** Reason limit for both profile tools (kept in the moderation log). */
export const PROFILE_REASON_MAX = 300;

const profileToolSchema = z.object({
  user: z.uuid(),
  reason: z.string().trim().max(PROFILE_REASON_MAX).optional(),
});
export const removeAvatarSchema = profileToolSchema;
export const clearDetailsSchema = profileToolSchema;

/** Default reason in the profile tool dialogs when opened from a profile report. */
export function reasonFromReports(reasons: readonly string[]): string {
  return reasons.length > 0 ? `Reported: ${reasons.join(', ')}`.slice(0, PROFILE_REASON_MAX) : '';
}
