import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ContentView } from '@/components/moderation/content-view';
import { contentStatusLabel } from '@/components/moderation/status-badges';
import { HoldBadge, kindLabel, TypeBadge } from '@/components/review/hold-badge';
import { ReviewActions } from '@/components/review/review-actions';
import { Button } from '@/components/ui/button';
import { requireStaff } from '@/lib/auth';
import { formatExact } from '@/lib/format';
import { loadContent } from '@/lib/moderation/content-data';
import { fetchNeighbors } from '@/lib/review/data';
import { listHref, reviewHref } from '@/lib/review/queue';
import { filterSchema, targetSchema } from '@/lib/review/schemas';

export const metadata: Metadata = { title: 'Review item' };

export default async function ReviewItemPage({ params, searchParams }: PageProps<'/review/[type]/[id]'>) {
  await requireStaff();
  const target = targetSchema.safeParse(await params);
  if (!target.success) notFound();
  const query = await searchParams;
  const filter = filterSchema.parse(typeof query.filter === 'string' ? query.filter : undefined);
  const { type, id } = target.data;

  const loaded = await loadContent(type, id);
  if (!loaded) notFound();
  const { item } = loaded;

  const back = listHref(filter);
  if (item.status !== 'pending') {
    return (
      <div className="mx-auto max-w-xl space-y-6 py-8">
        <h1 className="text-2xl font-semibold">This item is no longer waiting for review</h1>
        <p className="text-muted-foreground">
          Current status: <strong className="text-foreground">{contentStatusLabel(item.status)}</strong>
          {item.moderated_by_nickname ? <> (by {item.moderated_by_nickname}, {formatExact(item.moderated_at)})</> : null}.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={back}>
              <ArrowLeft aria-hidden="true" /> Back to the queue
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/content/${type}/${id}`}>Open in Content</Link>
          </Button>
        </div>
      </div>
    );
  }

  const nav = await fetchNeighbors({ type, id, createdAt: item.created_at }, filter);
  const afterActionHref = `/review/next?${new URLSearchParams({
    type,
    id,
    after: item.created_at,
    ...(filter ? { filter } : {}),
  }).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={back}>
            <ArrowLeft aria-hidden="true" /> Queue
          </Link>
        </Button>
        <TypeBadge type={type} />
        {type !== 'comment' && kindLabel(item.kind) ? <span className="font-medium">{kindLabel(item.kind)}</span> : null}
        <span className="ml-auto">
          <HoldBadge reason={item.hold_reason} term={item.matched_term} />
        </span>
      </div>
      <ContentView {...loaded} highlightTerm>
        <ReviewActions
          type={type}
          id={id}
          body={item.body ?? ''}
          afterActionHref={afterActionHref}
          prevHref={nav.prev ? reviewHref(nav.prev.target_type, nav.prev.target_id, filter) : null}
          nextHref={nav.next ? reviewHref(nav.next.target_type, nav.next.target_id, filter) : null}
        />
      </ContentView>
    </div>
  );
}
