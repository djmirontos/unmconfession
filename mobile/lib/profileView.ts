// Public profile page rules. No imports, so tests/profileView.test.mjs runs it in Node.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The route param must be a user id before it reaches a query. */
export function isValidUserId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}

export type ProfileViewState = 'guest' | 'self' | 'missing' | 'deleted' | 'blocked' | 'ok';

export type ProfileViewInput = {
  isGuest: boolean;
  isSelf: boolean;
  /** null: no profile row (or an invalid id). A deleted account keeps its row with a null nickname. */
  profile: { nickname: string | null } | null;
  blockedByMe: boolean;
};

/** Order matters: guests see nothing, your own id goes to the Profile tab, then the row decides. */
export function getProfileViewState({ isGuest, isSelf, profile, blockedByMe }: ProfileViewInput): ProfileViewState {
  if (isGuest) return 'guest';
  if (isSelf) return 'self';
  if (!profile) return 'missing';
  if (profile.nickname === null) return 'deleted';
  if (blockedByMe) return 'blocked';
  return 'ok';
}
