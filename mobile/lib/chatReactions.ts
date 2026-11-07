// Chat message reactions (20261107120000_chat_reactions.sql). Pure, no imports
// (tests/chatReactions.test.mjs). One reaction per member per message from a fixed set of six,
// stored as keys (the app owns the glyphs), silent: no notification, no unread or order change.

export const REACTION_KEYS = ['like', 'love', 'laugh', 'wow', 'sad', 'thanks'] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];

export const REACTION_GLYPH: Readonly<Record<ReactionKey, string>> = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
  thanks: '🙏',
};

export const REACTION_LABEL: Readonly<Record<ReactionKey, string>> = {
  like: 'Like',
  love: 'Love',
  laugh: 'Laugh',
  wow: 'Wow',
  sad: 'Sad',
  thanks: 'Thanks',
};

export const isReactionKey = (v: unknown): v is ReactionKey => (REACTION_KEYS as readonly unknown[]).includes(v);

/** One message's reactions: count per key, and which one is mine. */
export type MessageReactions = { counts: Readonly<Partial<Record<ReactionKey, number>>>; mine: ReactionKey | null };
/** All loaded messages of one chat, by message id (no entry = no reactions). */
export type ReactionsMap = Readonly<Record<string, MessageReactions>>;

export type ReactionRow = { message_id: string; reaction: string; reaction_count: number; mine: boolean };

/** get_message_reactions rows into a map. Unknown keys and empty counts are ignored. */
export function reactionsFromRows(rows: readonly ReactionRow[]): Record<string, MessageReactions> {
  const out: Record<string, { counts: Partial<Record<ReactionKey, number>>; mine: ReactionKey | null }> = {};
  for (const r of rows) {
    if (!isReactionKey(r.reaction) || r.reaction_count <= 0) continue;
    const entry = (out[r.message_id] ??= { counts: {}, mine: null });
    entry.counts[r.reaction] = r.reaction_count;
    if (r.mine) entry.mine = r.reaction;
  }
  return out;
}

export function sameReactions(a: MessageReactions | undefined, b: MessageReactions | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.mine !== b.mine) return false;
  return REACTION_KEYS.every((k) => (a.counts[k] ?? 0) === (b.counts[k] ?? 0));
}

/**
 * A fresh fetch merged into what is cached: an unchanged message keeps its old object, so its
 * bubble (memoized) does not re-render. Returns `prev` itself when nothing changed at all.
 */
export function mergeReactions(prev: ReactionsMap | undefined, next: ReactionsMap): ReactionsMap {
  if (!prev) return next;
  let changed = Object.keys(prev).length !== Object.keys(next).length;
  const out: Record<string, MessageReactions> = {};
  for (const [id, entry] of Object.entries(next)) {
    const old = prev[id];
    if (old && sameReactions(old, entry)) out[id] = old;
    else {
      out[id] = entry;
      changed = true;
    }
  }
  return changed ? out : prev;
}

/** Tapping a reaction: the one I already have removes it (null); any other sets or replaces it. */
export const nextReaction = (current: ReactionKey | null, tapped: ReactionKey): ReactionKey | null => (current === tapped ? null : tapped);

/** My reaction changes to `mine` on one message: the old key loses one, the new one gains one. */
export function withMyReaction(entry: MessageReactions | undefined, mine: ReactionKey | null): MessageReactions | undefined {
  const counts: Partial<Record<ReactionKey, number>> = { ...(entry?.counts ?? {}) };
  const old = entry?.mine ?? null;
  if (old === mine) return entry;
  if (old) {
    const left = (counts[old] ?? 1) - 1;
    if (left > 0) counts[old] = left;
    else delete counts[old];
  }
  if (mine) counts[mine] = (counts[mine] ?? 0) + 1;
  return Object.keys(counts).length > 0 ? { counts, mine } : undefined;
}

/** The map with my reaction on one message changed; every other entry keeps its object. */
export function setMyReaction(map: ReactionsMap | undefined, messageId: string, mine: ReactionKey | null): ReactionsMap {
  const base = map ?? {};
  const entry = withMyReaction(base[messageId], mine);
  if (entry === base[messageId]) return base;
  const { [messageId]: _old, ...rest } = base;
  return entry ? { ...rest, [messageId]: entry } : rest;
}

/** get_message_reactions takes at most 100 ids per call. */
export const REACTION_IDS_PER_CALL = 100;

export function chunkIds(ids: readonly string[], size = REACTION_IDS_PER_CALL): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** The loaded messages that can carry reactions: stored on the server and not deleted. */
export function reactableIds(messages: readonly { id: string; deleted: boolean }[]): string[] {
  return messages.filter((m) => !m.deleted).map((m) => m.id);
}

/** A stable key of the loaded ids (order does not matter), to fetch again only when they change. */
export const idsKey = (ids: readonly string[]): string => [...ids].sort().join(',');

export type ReactionBadge = { key: ReactionKey; glyph: string; count: number; mine: boolean };

/** Badges under a bubble, in the fixed key order; the count is shown only above 1. */
export function reactionBadges(entry: MessageReactions | undefined): ReactionBadge[] {
  if (!entry) return [];
  return REACTION_KEYS.filter((k) => (entry.counts[k] ?? 0) > 0).map((k) => ({
    key: k,
    glyph: REACTION_GLYPH[k],
    count: entry.counts[k] ?? 0,
    mine: entry.mine === k,
  }));
}

/** In a 1:1 chat: how many of this key are the other member's. */
export const theirCount = (entry: MessageReactions | undefined, key: ReactionKey): number =>
  Math.max(0, (entry?.counts[key] ?? 0) - (entry?.mine === key ? 1 : 0));

/**
 * A refresh that lands while my change on some messages is still on its way: those messages keep
 * what is on screen (the optimistic value), everything else takes the server's answer.
 */
export function keepPending(prev: ReactionsMap | undefined, next: ReactionsMap, pending: ReadonlySet<string>): ReactionsMap {
  if (pending.size === 0 || !prev) return next;
  const out: Record<string, MessageReactions> = { ...next };
  for (const id of pending) {
    const kept = prev[id];
    if (kept) out[id] = kept;
    else delete out[id];
  }
  return out;
}
