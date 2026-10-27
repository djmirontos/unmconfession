import 'server-only';

import { codeFromError } from '@/lib/errors';
import { formatAgo, formatExact } from '@/lib/format';
import { applyKeywordFilters } from '@/lib/keywords/query';
import { CATEGORIES, type KeywordFilters, MATCH_TYPES, SCOPES } from '@/lib/keywords/schemas';
import { createClient } from '@/lib/supabase/server';

// The list is small (a few hundred terms at most); it loads in one go, like the starter list.
const LIMIT = 1000;

export type KeywordRow = {
  id: string;
  term: string;
  matchType: (typeof MATCH_TYPES)[number];
  category: (typeof CATEGORIES)[number];
  appliesTo: (typeof SCOPES)[number][];
  active: boolean;
  createdExact: string;
  createdAgo: string;
};

const oneOf = <T extends string>(list: readonly T[], value: string, fallback: T): T => list.find((v) => v === value) ?? fallback;

/** Sorted by category, then term. RLS (keywords_staff) limits the table to staff. */
export async function fetchKeywords(filters: KeywordFilters): Promise<KeywordRow[]> {
  const supabase = await createClient();
  const base = supabase.from('keywords').select('id, term, match_type, category, applies_to, active, created_at');
  const { data, error } = await applyKeywordFilters(base, filters)
    .order('category')
    .order('term')
    .limit(LIMIT);
  if (error) throw new Error(codeFromError(error));
  return (data ?? []).map((r) => ({
    id: r.id,
    term: r.term,
    matchType: oneOf(MATCH_TYPES, r.match_type, 'word'),
    category: oneOf(CATEGORIES, r.category, 'other'),
    appliesTo: r.applies_to.flatMap((s) => SCOPES.filter((v) => v === s)),
    active: r.active,
    createdExact: formatExact(r.created_at),
    createdAgo: formatAgo(r.created_at),
  }));
}
