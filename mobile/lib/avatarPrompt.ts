// The Profile "Pick your avatar" card (v1.0.4): shown once, only right after onboarding. Pure, storage
// injected (tests/avatarPrompt.test.mjs).
//
// PENDING is set at the two onboarding moments only (the sign-up code accepted, the first nickname
// saved). The card shows while pending and not SEEN. The first time it is shown, seen is stored and
// pending removed at once; the card stays on screen for that visit only. Existing members never get
// the pending flag, so they never see it. Both keys contain the user id, so account deletion removes them.

export const avatarPendingKey = (userId: string) => `unm-avatar-prompt-pending:${userId}`;
export const avatarSeenKey = (userId: string) => `unm-avatar-picker-seen:${userId}`;

export type AvatarPromptState = { pending: boolean; seen: boolean };

/** Shown only to a member who just finished onboarding and has not seen it yet. */
export const shouldShowAvatarPrompt = (state: AvatarPromptState): boolean => state.pending && !state.seen;

/** What it reads as once shown, dismissed or the picker opened: nothing more to show. */
export const SEEN_STATE: AvatarPromptState = { pending: false, seen: true };

export type AvatarPromptStorage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export async function readAvatarPrompt(storage: AvatarPromptStorage, userId: string): Promise<AvatarPromptState> {
  const [pending, seen] = await Promise.all([storage.get(avatarPendingKey(userId)), storage.get(avatarSeenKey(userId))]);
  return { pending: pending === '1', seen: seen === '1' };
}

/** An onboarding moment: this member may see the card once. */
export const writePending = (storage: AvatarPromptStorage, userId: string): Promise<void> =>
  storage.set(avatarPendingKey(userId), '1');

/** First shown, dismissed or the picker opened: seen for good, and pending gone. */
export const writeSeen = (storage: AvatarPromptStorage, userId: string): Promise<unknown> =>
  Promise.all([storage.set(avatarSeenKey(userId), '1'), storage.remove(avatarPendingKey(userId))]);

/**
 * The card for this visit. `stored` is what was read at mount (null while unread); `showingFor` is
 * the user it is being shown to in this visit (it stays up after the once-shown write). Only a
 * member's own profile, only after the read.
 */
export function avatarPromptVisible(input: {
  userId: string | null;
  member: boolean;
  stored: AvatarPromptState | null;
  showingFor: string | null;
}): boolean {
  if (!input.userId || !input.member) return false;
  if (input.showingFor === input.userId) return true;
  return input.stored !== null && shouldShowAvatarPrompt(input.stored);
}
