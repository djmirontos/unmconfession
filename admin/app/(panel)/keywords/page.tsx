import type { Metadata } from 'next';
import { SearchX, Tags, TriangleAlert } from 'lucide-react';

import { KeywordFilters } from '@/components/keywords/keyword-filters';
import { KeywordTable } from '@/components/keywords/keyword-table';
import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { requireStaff } from '@/lib/auth';
import { fetchKeywords, type KeywordRow } from '@/lib/keywords/data';
import { activeFilterCount } from '@/lib/keywords/query';
import { keywordFiltersSchema } from '@/lib/keywords/schemas';

export const metadata: Metadata = { title: 'Keywords' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KeywordsPage({ searchParams }: PageProps<'/keywords'>) {
  await requireStaff();
  const params = await searchParams;
  const filters = keywordFiltersSchema.parse({
    category: one(params.category),
    scope: one(params.scope),
    match: one(params.match),
    state: one(params.state),
    q: one(params.q) || undefined,
  });
  const filtered = Object.values(filters).some(Boolean);

  let rows: KeywordRow[] | null = null;
  try {
    rows = await fetchKeywords(filters);
  } catch {
    rows = null;
  }

  return (
    <>
      <PageHeader
        title="Keywords"
        description="Terms that hold a post, comment or listing for review, and terms refused in nicknames. Changes apply to new content right away."
      />
      <KeywordFilters activeCount={activeFilterCount(filters)} />
      {rows === null ? (
        <EmptyState icon={TriangleAlert} title="Could not load the keywords" description="Check your connection, then reload the page." />
      ) : (
        <KeywordTable
          rows={rows}
          empty={
            filtered ? (
              <EmptyState icon={SearchX} title="Nothing matches these filters" description="Try another search or clear the filters." />
            ) : (
              <EmptyState icon={Tags} title="No keywords yet" description="Add a term to start holding matching posts for review." />
            )
          }
        />
      )}
    </>
  );
}
