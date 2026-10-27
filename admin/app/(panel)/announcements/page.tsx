import type { Metadata } from 'next';
import { Megaphone, SearchX, TriangleAlert } from 'lucide-react';

import { AnnouncementFilters } from '@/components/announcements/announcement-filters';
import { AnnouncementList } from '@/components/announcements/announcement-list';
import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { type AnnouncementRow, fetchAnnouncements, LIST_LIMIT } from '@/lib/announcements/data';
import { announcementFiltersSchema } from '@/lib/announcements/schemas';
import { requireStaff } from '@/lib/auth';
import { requestNow } from '@/lib/request-time';

export const metadata: Metadata = { title: 'Announcements' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AnnouncementsPage({ searchParams }: PageProps<'/announcements'>) {
  await requireStaff();
  const params = await searchParams;
  const filters = announcementFiltersSchema.parse({ status: one(params.status) });
  const now = requestNow();

  let result: { rows: AnnouncementRow[]; limitHit: boolean } | null = null;
  try {
    result = await fetchAnnouncements(filters, now);
  } catch {
    result = null;
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Users see only the text, at the top of the feed, until they close it or it ends."
      />
      <AnnouncementFilters activeCount={filters.status ? 1 : 0} />
      {result === null ? (
        <EmptyState icon={TriangleAlert} title="Could not load the announcements" description="Check your connection, then reload the page." />
      ) : (
        <AnnouncementList
          rows={result.rows}
          now={now}
          limitNote={result.limitHit ? `Showing the newest ${LIST_LIMIT}. Delete old announcements to see older ones.` : null}
          empty={
            filters.status ? (
              <EmptyState icon={SearchX} title="Nothing matches this filter" description="Choose another status or clear the filter." />
            ) : (
              <EmptyState icon={Megaphone} title="No announcements yet" description="Create one to show a message at the top of the feed." />
            )
          }
        />
      )}
    </>
  );
}
