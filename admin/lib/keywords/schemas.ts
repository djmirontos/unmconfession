import { z } from 'zod';

// Mirrors the checks on public.keywords (the database re-checks every write).
export const TERM_MAX = 200;
export const MATCH_TYPES = ['word', 'contains', 'regex'] as const;
// Display order in the form and the filter (the database CHECK lists the same values).
export const CATEGORIES = [
  'abuse',
  'doxxing',
  'prohibited_item',
  'spam',
  'adult_content',
  'violence',
  'hate_speech',
  'gambling',
  'other',
] as const;
export const SCOPES = ['post', 'comment', 'listing', 'nickname'] as const;

export type MatchType = (typeof MATCH_TYPES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Scope = (typeof SCOPES)[number];

export const MATCH_LABELS: Record<MatchType, string> = { word: 'Whole word', contains: 'Contains', regex: 'Regular expression' };
export const CATEGORY_LABELS: Record<Category, string> = {
  abuse: 'Abuse',
  doxxing: 'Doxxing',
  prohibited_item: 'Prohibited item',
  spam: 'Spam',
  adult_content: 'Adult content',
  violence: 'Violence',
  hate_speech: 'Hate speech',
  gambling: 'Gambling',
  other: 'Other',
};
export const SCOPE_LABELS: Record<Scope, string> = { post: 'Posts', comment: 'Comments', listing: 'Listings', nickname: 'Nicknames' };

/** The add / edit form, shared by the client and the Server Actions. created_by is never part of it. */
export const keywordInputSchema = z.object({
  term: z.string().trim().min(1).max(TERM_MAX),
  match_type: z.enum(MATCH_TYPES),
  category: z.enum(CATEGORIES),
  applies_to: z
    .array(z.enum(SCOPES))
    .min(1)
    .refine((list) => new Set(list).size === list.length, { message: 'duplicate scope' }),
  active: z.boolean(),
});
export type KeywordInput = z.infer<typeof keywordInputSchema>;

export const keywordIdSchema = z.uuid();
export const keywordUpdateSchema = keywordInputSchema.extend({ id: keywordIdSchema });
export const keywordToggleSchema = z.object({ id: keywordIdSchema, active: z.boolean() });

// URL filters (bad values fall back to "all").
export const keywordFiltersSchema = z.object({
  category: z.enum(CATEGORIES).optional().catch(undefined),
  scope: z.enum(SCOPES).optional().catch(undefined),
  match: z.enum(MATCH_TYPES).optional().catch(undefined),
  state: z.enum(['active', 'inactive']).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type KeywordFilters = z.infer<typeof keywordFiltersSchema>;

/** The form's error code for a schema failure. */
export function keywordInputError(issues: readonly { path: readonly PropertyKey[] }[]): string {
  return issues.some((i) => i.path[0] === 'term') ? 'keyword_term_invalid' : 'keyword_invalid';
}
