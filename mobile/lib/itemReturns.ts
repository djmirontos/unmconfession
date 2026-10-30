// Confirmed returns on Lost & Found listings (Module 13b, Campus Hero). No runtime imports, so
// tests/itemReturns.test.mjs runs it in Node. The RPC calls live in hooks/useListingReturn.ts.

export type LostFoundType = 'lost' | 'found';

/** get_listing_return: the viewer's part in the listing's active or confirmed return. */
export type Return = {
  id: string;
  status: 'pending' | 'confirmed';
  role: 'finder' | 'owner';
  otherId: string;
  otherNickname: string | null;
  otherAvatarKey: string | null;
  createdAt: string;
};

export type ReturnCandidate = { userId: string; nickname: string; avatarKey: string | null };

type ReturnRow = {
  return_id: string | null;
  status: string | null;
  role: string | null;
  other_id: string | null;
  other_nickname: string | null;
  other_avatar_key: string | null;
  created_at: string | null;
};

/** The first valid row, or null (no return, or not a participant). */
export function toReturn(rows: readonly ReturnRow[] | null | undefined): Return | null {
  for (const r of rows ?? []) {
    if (!r.return_id || !r.other_id || !r.created_at) continue;
    if (r.status !== 'pending' && r.status !== 'confirmed') continue;
    if (r.role !== 'finder' && r.role !== 'owner') continue;
    return {
      id: r.return_id,
      status: r.status,
      role: r.role,
      otherId: r.other_id,
      otherNickname: r.other_nickname,
      otherAvatarKey: r.other_avatar_key,
      createdAt: r.created_at,
    };
  }
  return null;
}

export function toCandidates(
  rows: readonly { user_id: string | null; nickname: string | null; avatar_key: string | null }[] | null | undefined,
): ReturnCandidate[] {
  return (rows ?? []).flatMap((r) => (r.user_id && r.nickname ? [{ userId: r.user_id, nickname: r.nickname, avatarKey: r.avatar_key }] : []));
}

export type ReturnView =
  | { kind: 'none' }
  | { kind: 'can_start'; type: LostFoundType }
  | { kind: 'finder_pending'; ret: Return }
  | { kind: 'owner_pending'; ret: Return }
  | { kind: 'confirmed_finder'; ret: Return }
  | { kind: 'confirmed_owner'; ret: Return };

export type ReturnViewInput = {
  /** A full member (signed in, with a nickname). Guests see nothing. */
  member: boolean;
  isAuthor: boolean;
  listingKind: 'sell' | 'lost_found';
  lostFoundType: LostFoundType | null;
  /** undefined while loading: nothing is shown yet (no button that might disappear). */
  ret: Return | null | undefined;
};

/** What the listing screen shows about returns, for this viewer. */
export function returnView({ member, isAuthor, listingKind, lostFoundType, ret }: ReturnViewInput): ReturnView {
  if (!member || listingKind !== 'lost_found' || ret === undefined) return { kind: 'none' };
  if (ret) {
    if (ret.status === 'confirmed') return ret.role === 'finder' ? { kind: 'confirmed_finder', ret } : { kind: 'confirmed_owner', ret };
    return ret.role === 'finder' ? { kind: 'finder_pending', ret } : { kind: 'owner_pending', ret };
  }
  return isAuthor && lostFoundType ? { kind: 'can_start', type: lostFoundType } : { kind: 'none' };
}

const name = (nickname: string | null) => nickname ?? 'Deleted user';

// ---------------------------------------------------------------- wording

/** The author's button: the owner on a lost post, the finder on a found post. */
export const startLabel = (type: LostFoundType) => (type === 'lost' ? 'I got my item back' : 'I returned this item');

export const pickerTitle = (type: LostFoundType) => (type === 'lost' ? 'Who helped?' : 'Who is the owner?');

export const PICKER_EMPTY = 'Nobody eligible has commented yet. Ask them to comment on this post first.';
export const PICKER_NOTE = 'Only members whose accounts are at least 3 days old can be picked.';

export function confirmText(type: LostFoundType, nickname: string): { title: string; message: string; action: string } {
  return type === 'lost'
    ? { title: 'Confirm return', message: `Confirm that ${nickname} helped you get your item back? This closes the post.`, action: 'Confirm' }
    : { title: 'Send request', message: `Send ${nickname} a request to confirm you returned their item?`, action: 'Send' };
}

export function startSuccess(type: LostFoundType, nickname: string): string {
  return type === 'lost' ? `Return confirmed. Thanks, ${nickname}!` : `Request sent to ${nickname}`;
}

/** The banner text for a pending or confirmed return. */
export function bannerText(view: ReturnView): string | null {
  switch (view.kind) {
    case 'finder_pending':
      return `Waiting for ${name(view.ret.otherNickname)} to confirm`;
    case 'owner_pending':
      return `${name(view.ret.otherNickname)} says they returned this item to you.`;
    case 'confirmed_finder':
      return `Returned. ${name(view.ret.otherNickname)} confirmed you returned their item.`;
    case 'confirmed_owner':
      return `Returned. ${name(view.ret.otherNickname)} helped you get this item back.`;
    default:
      return null;
  }
}
