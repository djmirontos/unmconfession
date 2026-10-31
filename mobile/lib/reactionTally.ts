// Reaction counts per type and the "top reactions" cluster, for my own tap on a post or comment.
// No imports, so tests/reactionTally.test.mjs runs it in Node. Callers pass the reaction order
// (REACTION_TYPES from lib/reactions.ts), which breaks ties the same way the server does.

/** Reactions per type, e.g. { like: 5, love: 2 }. Types with 0 are left out. */
export type Tally = Readonly<Record<string, number>>;

/** The cluster shows at most this many types (the feed views' top_reactions). */
export const TOP_REACTIONS_LIMIT = 3;

/** A reaction_breakdown JSON value ({"like":5,"love":2}) as a tally; null when it is not an object. */
export function parseTally(value: unknown, order: readonly string[]): Tally | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [type, n] of Object.entries(value)) {
    if (order.includes(type) && typeof n === 'number' && Number.isFinite(n) && n > 0) out[type] = Math.floor(n);
  }
  return out;
}

/** Most used first, ties in `order` (the server's rule), at most `limit` types, none at 0. */
export function topOf(tally: Tally, order: readonly string[], limit = TOP_REACTIONS_LIMIT): string[] {
  return order
    .filter((t) => (tally[t] ?? 0) > 0)
    .sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0) || order.indexOf(a) - order.indexOf(b))
    .slice(0, limit);
}

/**
 * A best guess at the per-type counts when only the cluster and the total are known (feed rows):
 * one for each shown type (my own type at least one), the rest on the most used type. Exact when
 * every reaction is mine or each shown type has one, which covers the common "my tap made this
 * icon appear / disappear" case; the server's exact counts replace it right after the tap.
 */
export function estimateTally(top: readonly string[], total: number, mine: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (total <= 0) return out;
  for (const t of top) out[t] = 1;
  if (mine && !out[mine]) out[mine] = 1;
  const assigned = Object.values(out).reduce((a, b) => a + b, 0);
  const rest = total - assigned;
  const first = top[0] ?? mine;
  if (rest > 0 && first) out[first] = (out[first] ?? 0) + rest;
  return out;
}

/** My reaction goes from `prev` to `next` (null = none): -1 on prev, +1 on next, never below 0. */
export function applyMyReaction(tally: Tally, prev: string | null, next: string | null): Record<string, number> {
  const out: Record<string, number> = { ...tally };
  if (prev === next) return out;
  if (prev) {
    const left = (out[prev] ?? 0) - 1;
    if (left > 0) out[prev] = left;
    else delete out[prev];
  }
  if (next) out[next] = (out[next] ?? 0) + 1;
  return out;
}

export type ReactionState = {
  /** Exact per-type counts when known (null: only the cluster and the total are known). */
  tally: Tally | null;
  top: readonly string[];
  total: number;
  mine: string | null;
};

/**
 * Everything a card shows after my tap: my reaction, the total and the cluster. The tally stays
 * exact only if it was exact before (an estimate is not kept, so the next tap estimates again).
 */
export function reactAndRank(
  state: ReactionState,
  next: string | null,
  order: readonly string[],
): { tally: Tally | null; top: string[]; total: number; mine: string | null } {
  if (state.mine === next) return { tally: state.tally, top: [...state.top], total: state.total, mine: next };
  const base = state.tally ?? estimateTally(state.top, state.total, state.mine);
  const after = applyMyReaction(base, state.mine, next);
  const delta = state.mine === null ? 1 : next === null ? -1 : 0;
  const total = Math.max(0, state.total + delta);
  return { tally: state.tally ? after : null, top: total === 0 ? [] : topOf(after, order), total, mine: next };
}
