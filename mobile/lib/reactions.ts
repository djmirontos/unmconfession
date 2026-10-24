import type { ImageSourcePropType } from 'react-native';

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

/**
 * Optimistic top 3 after my reaction goes prev -> next. Other people's per-type counts are
 * not known on the device, so this approximates and the next refetch (or realtime row)
 * brings the exact order:
 *  - total 0: none;
 *  - added: the type joins at the end if fewer than 3 are shown, otherwise no change;
 *  - changed: the old type is replaced by the new one if the old is shown and the new is not;
 *  - removed (others still react): no change.
 */
export function approxTopReactions(
  top: readonly ReactionType[],
  prev: ReactionType | null,
  next: ReactionType | null,
  total: number,
): ReactionType[] {
  if (total <= 0) return [];
  if (prev === null && next !== null) return top.includes(next) || top.length >= 3 ? [...top] : [...top, next];
  if (prev !== null && next !== null && prev !== next && top.includes(prev) && !top.includes(next)) {
    return top.map((t) => (t === prev ? next : t));
  }
  return [...top];
}

// Microsoft Fluent Emoji (3D, MIT), resized to 96 px. Notice: app/licenses.tsx.
export const REACTIONS: Record<ReactionType, { label: string; image: ImageSourcePropType }> = {
  like: { label: 'Like', image: require('@/assets/reactions/like.png') },
  love: { label: 'Love', image: require('@/assets/reactions/love.png') },
  haha: { label: 'Haha', image: require('@/assets/reactions/haha.png') },
  wow: { label: 'Wow', image: require('@/assets/reactions/wow.png') },
  sad: { label: 'Sad', image: require('@/assets/reactions/sad.png') },
  angry: { label: 'Angry', image: require('@/assets/reactions/angry.png') },
};
