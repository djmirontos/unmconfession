'use client';

import { FilterSheet } from '@/components/moderation/filter-sheet';
import { SelectFilter } from '@/components/moderation/url-filters';
import { STATUSES } from '@/lib/announcements/schemas';
import { STATUS_LABELS } from '@/lib/announcements/time';

const NAMES = ['status'] as const;

/** Status filter: inline from md, in the Filters sheet on phones. */
export function AnnouncementFilters({ activeCount }: { activeCount: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <FilterSheet activeCount={activeCount} names={NAMES}>
        <div className="md:w-40">
          <SelectFilter name="status" label="Status" options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
        </div>
      </FilterSheet>
    </div>
  );
}
