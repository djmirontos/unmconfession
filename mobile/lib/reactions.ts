import type { ImageSourcePropType } from 'react-native';

import { parseTally, reactAndRank, type Tally, topOf } from '@/lib/reactionTally';
import { Constants, type Database } from '@/types/database';

export type ReactionType = Database['public']['Enums']['reaction_type'];

/** Picker order, from the generated enum (like, love, haha, wow, sad, angry). */
export const REACTION_TYPES: readonly ReactionType[] = Constants.public.Enums.reaction_type;

export const isReactionType = (value: unknown): value is ReactionType =>
  typeof value === 'string' && (REACTION_TYPES as readonly string[]).includes(value);

/** A server top_reactions array, keeping only known types (null / missing = none). */
export function parseTopReactions(value: unknown): ReactionType[] {
  return Array.isArray(value) ? value.filter(isReactionType).slice(0, 3) : [];
}

/**
 * Top 3 from a reaction_breakdown tally ({"like":5,"love":2}): most used first, ties in
 * REACTION_TYPES order. Same rule as the feed views, for rows read without them.
 */
export function topFromBreakdown(breakdown: unknown): ReactionType[] {
  if (typeof breakdown !== 'object' || breakdown === null || Array.isArray(breakdown)) return [];
  const counts = breakdown as Record<string, unknown>;
  return REACTION_TYPES.filter((t) => typeof counts[t] === 'number' && (counts[t] as number) > 0)
    .sort((a, b) => (counts[b] as number) - (counts[a] as number) || REACTION_TYPES.indexOf(a) - REACTION_TYPES.indexOf(b))
    .slice(0, 3);
}

/** A reaction_breakdown value as exact per-type counts, or null when it is missing or invalid. */
export const breakdownTally = (value: unknown): Tally | null => parseTally(value, REACTION_TYPES);

/**
 * My tap on a post or comment: the new total, the cluster (re-ranked like the server) and the
 * per-type counts (still exact only if they were exact). See lib/reactionTally.ts.
 */
export function reactWithCluster(
  state: { tally: Tally | null; top: readonly ReactionType[]; total: number; mine: ReactionType | null },
  next: ReactionType | null,
): { tally: Tally | null; top: ReactionType[]; total: number } {
  const r = reactAndRank(state, next, REACTION_TYPES);
  return { tally: r.tally, top: r.top.filter(isReactionType), total: r.total };
}

/** The cluster for exact counts (a reconcile after my tap). */
export const clusterOf = (tally: Tally): ReactionType[] => topOf(tally, REACTION_TYPES).filter(isReactionType);

// Microsoft Fluent Emoji (3D, MIT), resized to 96 px. Notice: app/licenses.tsx.
export const REACTIONS: Record<ReactionType, { label: string; image: ImageSourcePropType }> = {
  like: { label: 'Like', image: require('@/assets/reactions/like.png') },
  love: { label: 'Love', image: require('@/assets/reactions/love.png') },
  haha: { label: 'Haha', image: require('@/assets/reactions/haha.png') },
  wow: { label: 'Wow', image: require('@/assets/reactions/wow.png') },
  sad: { label: 'Sad', image: require('@/assets/reactions/sad.png') },
  angry: { label: 'Angry', image: require('@/assets/reactions/angry.png') },
};
