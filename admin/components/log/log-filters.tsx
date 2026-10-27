'use client';

import { FilterSheet } from '@/components/moderation/filter-sheet';
import { SelectFilter } from '@/components/moderation/url-filters';
import { LOG_SHEET_FILTERS, LOG_TARGET_LABELS, LOG_TARGET_TYPES } from '@/lib/moderation/log';

/** Target type and actor (a staff member, stored in the URL by id only). */
export function LogFilters({ activeCount, staff }: { activeCount: number; staff: { id: string; nickname: string }[] }) {
  return (
    <FilterSheet activeCount={activeCount} names={LOG_SHEET_FILTERS}>
      <div className="md:w-40">
        <SelectFilter name="target" label="Target" options={LOG_TARGET_TYPES.map((t) => ({ value: t, label: LOG_TARGET_LABELS[t] }))} />
      </div>
      <div className="md:w-52">
        <SelectFilter name="actor" label="Staff member" options={staff.map((s) => ({ value: s.id, label: s.nickname }))} />
      </div>
    </FilterSheet>
  );
}
