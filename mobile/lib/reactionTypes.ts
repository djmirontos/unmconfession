// The six reaction types and parsing a server top-3 list. Pure (no images), so Node tests can import
// it; lib/reactions.ts re-exports these with the reaction images.
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
