import type { Metadata } from 'next';
import { ArrowLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ContentView } from '@/components/moderation/content-view';
import { ACTION_BAR_SPACE_TWO_ROWS, TAP_LINK_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { contentStatusLabel } from '@/components/moderation/status-badges';
import { ReportActions } from '@/components/reports/report-actions';
import { ReportHistory } from '@/components/reports/report-history';
import { kindLabel, TypeBadge } from '@/components/review/hold-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { requireStaff } from '@/lib/auth';
import { isTopLevelComment, loadContent } from '@/lib/moderation/content-data';
import { fetchReportDetails } from '@/lib/moderation/data';
import { filterSchema, targetSchema } from '@/lib/review/schemas';

export const metadata: Metadata = { title: 'Report' };

export default async function ReportItemPage({ params, searchParams }: PageProps<'/reports/[type]/[id]'>) {
  await requireStaff();
  const target = targetSchema.safeParse(await params);
  if (!target.success) notFound();
  const query = await searchParams;
  const filter = filterSchema.parse(typeof query.filter === 'string' ? query.filter : undefined);
  const { type, id } = target.data;

  const [loaded, reports] = await Promise.all([loadContent(type, id), fetchReportDetails(type, id)]);
  if (!loaded && reports.length === 0) notFound();
  const open = reports.filter((r) => r.status === 'open');
  const back = filter ? `/reports?filter=${filter}` : '/reports';
  // The list is ordered by the earliest open report; the server picks the next item after it.
  const firstOpenAt = open.map((r) => r.createdAt).sort()[0];
  const nextHref = `/reports/next?${new URLSearchParams({
    type,
    id,
    ...(firstOpenAt ? { after: firstOpenAt } : {}),
    ...(filter ? { filter } : {}),
  }).toString()}`;

  // Reports can outlive their content (removed items are purged after the retention period).
  if (!loaded) {
    return (
      <div className={`space-y-6 ${ACTION_BAR_SPACE_TWO_ROWS}`}>
        <Button asChild variant="ghost" size="sm" className="max-lg:hidden">
          <Link href={back}>
            <ArrowLeft aria-hidden="true" /> Reports
          </Link>
        </Button>
        <Alert>
          <Info />
          <AlertDescription>The reported {type} no longer exists. Only its reports are left to handle.</AlertDescription>
        </Alert>
        <ReportActions type={type} id={id} body="" status="missing" openReports={open.length} cascades={false} nextHref={nextHref} />
        <ReportHistory reports={reports} />
      </div>
    );
  }
  const { item } = loaded;

  return (
    <div className={`space-y-6 ${ACTION_BAR_SPACE_TWO_ROWS}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="max-lg:hidden">
          <Link href={back}>
            <ArrowLeft aria-hidden="true" /> Reports
          </Link>
        </Button>
        <TypeBadge type={type} />
        {type !== 'comment' && kindLabel(item.kind) ? <span className="font-medium">{kindLabel(item.kind)}</span> : null}
        <span className="ml-auto text-sm font-semibold">
          {open.length} open {open.length === 1 ? 'report' : 'reports'}
        </span>
      </div>

      {item.status === 'pending' ? (
        <Alert>
          <Info />
          <AlertDescription>
            This item is waiting for review.{' '}
            <Link href={`/review/${type}/${id}`} className={`font-medium text-primary underline underline-offset-4 ${TAP_LINK_BELOW_MD}`}>
              Open it in the review queue
            </Link>{' '}
            to approve or reject it.
          </AlertDescription>
        </Alert>
      ) : null}
      {item.status === 'removed' || item.status === 'rejected' ? (
        <Alert>
          <Info />
          <AlertDescription>
            This content is {contentStatusLabel(item.status).toLowerCase()}
            {item.deleted_at ? ' (deleted by the author)' : ''}. Only the reports are left to handle.
          </AlertDescription>
        </Alert>
      ) : null}

      <ContentView {...loaded} aside={<ReportHistory reports={reports} />}>
        <ReportActions
          type={type}
          id={id}
          body={item.body ?? ''}
          status={item.status}
          openReports={open.length}
          cascades={isTopLevelComment(item)}
          nextHref={nextHref}
        />
      </ContentView>
    </div>
  );
}
