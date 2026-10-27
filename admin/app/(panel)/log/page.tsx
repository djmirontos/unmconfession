import type { Metadata } from 'next';
import { History, SearchX, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { LogFilters } from '@/components/log/log-filters';
import { LogList } from '@/components/log/log-list';
import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { requireStaff } from '@/lib/auth';
import { fetchLog, fetchStaffOptions, fetchUser, type LogRow, type Page } from '@/lib/moderation/data';
import { activeLogFilterCount, logFiltersSchema, logHrefWithout } from '@/lib/moderation/log';

export const metadata: Metadata = { title: 'Moderation log' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** A removable filter chip (a link to the same page without that filter). */
function Chip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:min-h-8"
      aria-label={`Remove filter: ${label}`}
    >
      {label} <X className="size-4" aria-hidden="true" />
    </Link>
  );
}

export default async function ModerationLogPage({ searchParams }: PageProps<'/log'>) {
  await requireStaff();
  const params = await searchParams;
  const filters = logFiltersSchema.parse({ target: one(params.target), actor: one(params.actor), subject: one(params.subject) });
  const filtered = Object.values(filters).some(Boolean);

  let initial: Page<LogRow> | null = null;
  let staff: { id: string; nickname: string }[] = [];
  let subjectName: string | null = null;
  try {
    const [log, staffList, subject, actor] = await Promise.all([
      fetchLog(filters),
      fetchStaffOptions(),
      filters.subject ? fetchUser(filters.subject) : null,
      filters.actor ? fetchUser(filters.actor) : null,
    ]);
    initial = log;
    staff = staffList;
    subjectName = filters.subject ? (subject?.nickname ?? 'Deleted user') : null;
    // A former staff member chosen from a link still shows in the list.
    if (actor && filters.actor && !staff.some((s) => s.id === filters.actor)) {
      staff = [...staff, { id: actor.id, nickname: actor.nickname ?? 'Deleted user' }];
    }
  } catch (e) {
    // A redirect from the access check is not a load error.
    unstable_rethrow(e);
    initial = null;
  }

  return (
    <>
      <PageHeader title="Moderation log" description="Every approval, rejection, removal, edit and account action, newest first." />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <LogFilters activeCount={activeLogFilterCount(filters)} staff={staff} />
        {subjectName ? <Chip label={`About ${subjectName}`} href={logHrefWithout(filters, 'subject')} /> : null}
      </div>
      {initial === null ? (
        <EmptyState icon={TriangleAlert} title="Could not load the moderation log" description="Check your connection, then reload the page." />
      ) : initial.rows.length === 0 ? (
        filtered ? (
          <EmptyState icon={SearchX} title="Nothing matches these filters" description="Try another filter or clear the filters." />
        ) : (
          <EmptyState icon={History} title="No actions yet" description="Approvals, removals and account actions appear here." />
        )
      ) : (
        <LogList key={JSON.stringify(filters)} initial={initial} filters={filters} />
      )}
    </>
  );
}
