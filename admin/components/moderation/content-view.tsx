import { Flag } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { TAP_LINK_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { AccountStatusBadge, ContentStatusBadge } from '@/components/moderation/status-badges';
import { authorLabel } from '@/components/review/hold-badge';
import { HighlightedText } from '@/components/review/highlighted-text';
import { ImageGallery } from '@/components/review/image-gallery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatExact } from '@/lib/format';
import type { LoadedContent } from '@/lib/moderation/content-data';
import { requestNow } from '@/lib/request-time';
import { parseListingExtra, parsePostExtra } from '@/lib/review/content';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

type Props = LoadedContent & {
  /** Mark the keyword that held the item (review queue only). */
  highlightTerm?: boolean;
  /** Actions under the body. */
  children?: ReactNode;
  /** Extra cards under the details (reports, history). */
  aside?: ReactNode;
};

/** The full item as plain text with its images and details. Shared by review, reports and content. */
export function ContentView({ item, images, parentNumber, highlightTerm = false, children, aside }: Props) {
  const post = item.target_type === 'post' ? parsePostExtra(item.extra) : null;
  const listing = item.target_type === 'listing' ? parseListingExtra(item.extra) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl break-words">
            <h1>{item.target_type === 'listing' && item.title ? item.title : 'Content'}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {item.target_type === 'comment' ? (
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
          {item.body ? (
            <HighlightedText text={item.body} term={highlightTerm ? item.matched_term : null} />
          ) : (
            <p className="italic text-muted-foreground">No text</p>
          )}
          <ImageGallery images={images} />
          {children}
        </CardContent>
      </Card>

      <aside className="space-y-4" aria-label="Details">
        <Card>
          <CardContent>
            <dl className="space-y-4">
              <Field label="Status">
                <span className="flex flex-wrap items-center gap-2">
                  <ContentStatusBadge status={item.status} />
                  {item.deleted_at ? <span className="text-xs text-muted-foreground">Deleted by the author</span> : null}
                </span>
              </Field>
              <Field label="Author">
                <span className="flex flex-wrap items-center gap-2">
                  {item.author_deleted ? (
                    <span className="italic text-muted-foreground">{authorLabel(item.nickname)}</span>
                  ) : (
                    <Link href={`/users/${item.author_id}`} className={`font-medium text-primary underline-offset-4 hover:underline ${TAP_LINK_BELOW_MD}`}>
                      {authorLabel(item.nickname)}
                    </Link>
                  )}
                  <AccountStatusBadge status={item.author_status} deleted={item.author_deleted} now={requestNow()} />
                </span>
              </Field>
              <Field label="Created">
                <time dateTime={item.created_at}>{formatExact(item.created_at)}</time>
              </Field>
              {item.post_number ? <Field label="Post number">#{item.post_number}</Field> : null}
              {item.hold_reason ? (
                <Field label="Held because">
                  {item.hold_reason === 'keyword' ? (
                    <>Keyword: <strong>{item.matched_term ?? 'unknown'}</strong></>
                  ) : (
                    'Pre-moderation is on'
                  )}
                </Field>
              ) : null}
              {item.moderated_at ? (
                <Field label="Last moderated">
                  {formatExact(item.moderated_at)}
                  {item.moderated_by_nickname ? ` by ${item.moderated_by_nickname}` : ''}
                </Field>
              ) : null}
              {item.reject_reason ? <Field label="Reason given">{item.reject_reason}</Field> : null}
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
                  <Link
                    href={`/reports/${item.target_type}/${item.target_id}`}
                    className={`inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline ${TAP_LINK_BELOW_MD}`}
                  >
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
        {aside}
      </aside>
    </div>
  );
}
