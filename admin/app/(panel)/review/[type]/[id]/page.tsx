import type { Metadata } from 'next';
import { ArrowLeft, Flag } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { authorLabel, HoldBadge, kindLabel, TypeBadge } from '@/components/review/hold-badge';
import { HighlightedText } from '@/components/review/highlighted-text';
import { ImageGallery } from '@/components/review/image-gallery';
import { ReviewActions } from '@/components/review/review-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaff } from '@/lib/auth';
import { formatDate, formatExact } from '@/lib/format';
import { parseListingExtra, parsePostExtra } from '@/lib/review/content';
import { contentImages, fetchContent, fetchNeighbors, fetchParentPostNumber } from '@/lib/review/data';
import { listHref, reviewHref } from '@/lib/review/queue';
import { filterSchema, targetSchema } from '@/lib/review/schemas';

export const metadata: Metadata = { title: 'Review item' };

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  pending: 'Pending review',
  rejected: 'Rejected',
  removed: 'Removed',
};

function AccountBadge({ status, deleted }: { status: string | null; deleted: boolean }) {
  if (deleted) return <Badge variant="outline">Deleted</Badge>;
  if (status === 'banned') return <Badge variant="destructive">Banned</Badge>;
  if (status === 'suspended') return <Badge className="bg-gold text-gold-foreground">Suspended</Badge>;
  return <Badge variant="secondary">Active</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function ReviewItemPage({ params, searchParams }: PageProps<'/review/[type]/[id]'>) {
  await requireStaff();
  const target = targetSchema.safeParse(await params);
  if (!target.success) notFound();
  const query = await searchParams;
  const filter = filterSchema.parse(typeof query.filter === 'string' ? query.filter : undefined);
  const { type, id } = target.data;

  const item = await fetchContent(type, id);
  if (!item) notFound();

  const back = listHref(filter);
  if (item.status !== 'pending') {
    return (
      <div className="mx-auto max-w-xl space-y-6 py-8">
        <h1 className="text-2xl font-semibold">This item is no longer waiting for review</h1>
        <p className="text-muted-foreground">
          Current status: <strong className="text-foreground">{STATUS_LABEL[item.status] ?? item.status}</strong>
          {item.moderated_by_nickname ? <> (by {item.moderated_by_nickname}, {formatExact(item.moderated_at)})</> : null}.
        </p>
        <Button asChild>
          <Link href={back}>
            <ArrowLeft aria-hidden="true" /> Back to the queue
          </Link>
        </Button>
      </div>
    );
  }

  const [nav, parentNumber] = await Promise.all([
    fetchNeighbors({ type, id, createdAt: item.created_at }, filter),
    type === 'comment' && item.post_id ? fetchParentPostNumber(item.post_id) : Promise.resolve(null),
  ]);
  const images = contentImages(item);
  const post = type === 'post' ? parsePostExtra(item.extra) : null;
  const listing = type === 'listing' ? parseListingExtra(item.extra) : null;
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
        {item.post_number ? <span className="text-muted-foreground">#{item.post_number}</span> : null}
        <span className="ml-auto">
          <HoldBadge reason={item.hold_reason} term={item.matched_term} />
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              <h1>{type === 'listing' && item.title ? item.title : 'Content'}</h1>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {type === 'comment' ? (
              <p className="text-sm text-muted-foreground">
                {item.post_id
                  ? parentNumber
                    ? `Comment on post #${parentNumber}`
                    : `Comment on post ${item.post_id}`
                  : `Comment on listing ${item.listing_id ?? ''}`}
              </p>
            ) : null}
            {post?.target_name ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Shoutout to</span> <strong>{post.target_name}</strong>
              </p>
            ) : null}
            {item.body ? <HighlightedText text={item.body} term={item.matched_term} /> : <p className="italic text-muted-foreground">No text</p>}
            <ImageGallery images={images} />
            <ReviewActions
              type={type}
              id={id}
              body={item.body ?? ''}
              afterActionHref={afterActionHref}
              prevHref={nav.prev ? reviewHref(nav.prev.target_type, nav.prev.target_id, filter) : null}
              nextHref={nav.next ? reviewHref(nav.next.target_type, nav.next.target_id, filter) : null}
            />
          </CardContent>
        </Card>

        <aside className="space-y-4" aria-label="Details">
          <Card>
            <CardContent>
              <dl className="space-y-4">
                <Field label="Author">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={item.nickname ? 'font-medium' : 'italic text-muted-foreground'}>{authorLabel(item.nickname)}</span>
                    <AccountBadge status={item.author_status} deleted={item.author_deleted} />
                  </span>
                </Field>
                <Field label="Created">
                  <time dateTime={item.created_at}>{formatExact(item.created_at)}</time>
                </Field>
                <Field label="Held because">
                  {item.hold_reason === 'keyword' ? (
                    <>Keyword: <strong>{item.matched_term ?? 'unknown'}</strong></>
                  ) : item.hold_reason === 'pre_moderation' ? (
                    'Pre-moderation is on'
                  ) : (
                    'No hold record'
                  )}
                </Field>
                {item.kind === 'poll' && post?.ends_at ? <Field label="Poll ends">{formatExact(post.ends_at)}</Field> : null}
                {listing ? (
                  <>
                    {listing.price != null ? <Field label="Price">₱{Number(listing.price).toLocaleString('en-PH')}</Field> : null}
                    {listing.condition ? <Field label="Condition">{listing.condition.replace('_', ' ')}</Field> : null}
                    {listing.lost_found_type ? <Field label="Lost or found">{listing.lost_found_type === 'lost' ? 'Lost' : 'Found'}</Field> : null}
                    {listing.location ? <Field label="Location">{listing.location}</Field> : null}
                    {listing.event_date ? <Field label="Date">{formatDate(listing.event_date)}</Field> : null}
                    <Field label="State">{listing.is_closed ? 'Closed' : 'Open'}</Field>
                  </>
                ) : null}
                <Field label="Open reports">
                  {item.open_report_count > 0 ? (
                    <Link href="/reports" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                      <Flag className="size-3.5" aria-hidden="true" />
                      {item.open_report_count}
                    </Link>
                  ) : (
                    'None'
                  )}
                </Field>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
