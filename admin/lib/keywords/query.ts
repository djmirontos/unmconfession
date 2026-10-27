// Pure builders for the keywords table: the filters → query steps, and the rows written.

import type { KeywordFilters, KeywordInput } from '@/lib/keywords/schemas';
import { withoutParams } from '@/lib/url-params';

/** The subset of the Supabase query builder the list uses (so tests can record the calls). */
export interface KeywordQuery<Q> {
  eq(column: string, value: string | boolean): Q;
  contains(column: string, value: string[]): Q;
  ilike(column: string, pattern: string): Q;
}

/** The filters behind the phone "Filters" button (the search box stays outside it). */
export const SHEET_FILTERS = ['category', 'scope', 'match', 'state'] as const;

/** How many of those are set (the badge on the button). */
export function activeFilterCount(filters: KeywordFilters): number {
  return SHEET_FILTERS.filter((name) => filters[name] !== undefined).length;
}

/** The URL query after "Clear": every sheet filter removed, the search (and anything else) kept. */
export function clearSheetFilters(query: string): string {
  return withoutParams(query, SHEET_FILTERS);
}

/** "%term%" with LIKE wildcards escaped, so a search for "50%" means the text "50%". */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Applies the URL filters: category, scope (applies_to contains), match type, active state, term search. */
export function applyKeywordFilters<Q extends KeywordQuery<Q>>(query: Q, filters: KeywordFilters): Q {
  let q = query;
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.scope) q = q.contains('applies_to', [filters.scope]);
  if (filters.match) q = q.eq('match_type', filters.match);
  if (filters.state) q = q.eq('active', filters.state === 'active');
  if (filters.q) q = q.ilike('term', likePattern(filters.q));
  return q;
}

export type KeywordWrite = {
  term: string;
  match_type: string;
  category: string;
  applies_to: string[];
  active: boolean;
};

/** The columns an edit may change. created_by is never among them. */
export function keywordUpdateRow(input: KeywordInput): KeywordWrite {
  return {
    term: input.term,
    match_type: input.match_type,
    category: input.category,
    applies_to: [...input.applies_to],
    active: input.active,
  };
}

/** A new row: the form's columns plus created_by from the validated session (never from the form). */
export function keywordInsertRow(input: KeywordInput, userId: string): KeywordWrite & { created_by: string } {
  return { ...keywordUpdateRow(input), created_by: userId };
}
