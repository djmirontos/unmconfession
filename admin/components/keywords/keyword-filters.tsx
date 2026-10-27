'use client';

import { FilterSheet } from '@/components/moderation/filter-sheet';
import { SearchBox, SelectFilter } from '@/components/moderation/url-filters';
import { SHEET_FILTERS } from '@/lib/keywords/query';
import { CATEGORIES, CATEGORY_LABELS, MATCH_LABELS, MATCH_TYPES, SCOPE_LABELS, SCOPES } from '@/lib/keywords/schemas';

/** The search box stays visible; the four filters sit inline from md and in the Filters sheet on phones. */
export function KeywordFilters({ activeCount }: { activeCount: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <SearchBox label="Search terms" placeholder="Part of a term" className="max-md:min-w-0" />
      <FilterSheet activeCount={activeCount} names={SHEET_FILTERS}>
        <div className="md:w-40">
          <SelectFilter name="category" label="Category" options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
        </div>
        <div className="md:w-36">
          <SelectFilter name="scope" label="Applies to" options={SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))} />
        </div>
        <div className="md:w-44">
          <SelectFilter name="match" label="Match type" options={MATCH_TYPES.map((m) => ({ value: m, label: MATCH_LABELS[m] }))} />
        </div>
        <div className="md:w-32">
          <SelectFilter
            name="state"
            label="State"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </div>
      </FilterSheet>
    </div>
  );
}
