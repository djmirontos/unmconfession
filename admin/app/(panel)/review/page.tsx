import type { Metadata } from 'next';
import { CheckCircle2, Info } from 'lucide-react';

import { EmptyState } from '@/components/panel/empty-state';
import { PageHeader } from '@/components/panel/page-header';
import { FilterChips } from '@/components/review/filter-chips';
import { QueueList } from '@/components/review/queue-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { requireStaff } from '@/lib/auth';
import { fetchQueuePage } from '@/lib/review/data';
import { filterSchema } from '@/lib/review/schemas';

export const metadata: Metadata = { title: 'Review queue' };

export default async function ReviewPage({ searchParams }: PageProps<'/review'>) {
  await requireStaff();
  const params = await searchParams;
  const filter = filterSchema.parse(typeof params.filter === 'string' ? params.filter : undefined);
  const cleared = params.cleared === '1';
  const { rows, nextCursor } = await fetchQueuePage();

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Posts, comments and listings held by the keyword filter or by pre-moderation. Oldest first."
      />
      {rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="The queue is clear" description="Nothing waiting for review." />
      ) : (
        <div className="space-y-6">
          {cleared ? (
            <Alert>
              <Info />
              <AlertDescription>No more items of this type are waiting.</AlertDescription>
            </Alert>
          ) : null}
          <FilterChips active={filter} />
          <QueueList key={filter ?? 'all'} initialRows={rows} initialCursor={nextCursor} filter={filter} />
        </div>
      )}
    </>
  );
}
