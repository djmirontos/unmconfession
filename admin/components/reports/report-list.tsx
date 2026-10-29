'use client';

import { ImageIcon } from 'lucide-react';
import Link from 'next/link';

import { loadMoreReports } from '@/app/(panel)/reports/actions';
import { LoadMore } from '@/components/moderation/load-more';
import { ContentStatusBadge } from '@/components/moderation/status-badges';
import { useKeyset } from '@/components/moderation/use-keyset';
import { UserAvatar } from '@/components/moderation/user-avatar';
import { authorLabel, TypeBadge } from '@/components/review/hold-badge';
import { Badge } from '@/components/ui/badge';
import type { Page, ReportRow } from '@/lib/moderation/data';
import type { ReportTargetType } from '@/lib/review/schemas';

/** Reported items, oldest first report first; the type filter applies to the loaded rows. */
export function ReportList({ initial, filter }: { initial: Page<ReportRow>; filter?: ReportTargetType }) {
  const { rows, hasMore, pending, loadMore } = useKeyset(initial, loadMoreReports, (r) => r.key);
  const shown = filter ? rows.filter((r) => r.type === filter) : rows;

  return (
    <div className="space-y-4">
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No reported {filter ? `${filter}s` : 'items'} in the loaded part of the list.{hasMore ? ' Load more to check older reports.' : ''}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Reported items, oldest first">
          {shown.map((row) => (
            <li key={row.key}>
              <Link
                href={`/reports/${row.type}/${row.id}${filter ? `?filter=${filter}` : ''}`}
                className="block space-y-2 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <TypeBadge type={row.type} />
                  {row.type === 'profile' ? (
                    <>
                      {row.status === 'removed' ? <Badge variant="outline">Deleted account</Badge> : null}
                      <UserAvatar nickname={row.nickname} src={row.avatarUrl} />
                    </>
                  ) : (
                    <>
                      {row.status ? <ContentStatusBadge status={row.status} /> : <Badge variant="outline">Missing</Badge>}
                      <span className="text-muted-foreground">by</span>
                    </>
                  )}
                  <span className={row.nickname ? 'font-medium' : 'italic text-muted-foreground'}>{authorLabel(row.nickname)}</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {row.count} {row.count === 1 ? 'report' : 'reports'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.reasons.map((reason) => (
                    <Badge key={reason} variant="outline">
                      {reason}
                    </Badge>
                  ))}
                </div>
                {/* A profile has no text: the picture and the nickname are what was reported. */}
                {row.type === 'profile' ? null : (
                  <p className="line-clamp-3 text-sm break-words text-foreground/90">{row.preview || <em className="text-muted-foreground">No text</em>}</p>
                )}
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    First reported <time title={row.firstExact}>{row.firstAgo}</time>
                  </span>
                  {row.count > 1 ? (
                    <span>
                      Last <time title={row.lastExact}>{row.lastAgo}</time>
                    </span>
                  ) : null}
                  {row.images > 0 ? (
                    <span className="flex items-center gap-1">
                      <ImageIcon className="size-3.5" aria-hidden="true" />
                      {row.images}
                    </span>
                  ) : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <LoadMore hasMore={hasMore} pending={pending} onClick={loadMore} />
    </div>
  );
}
