'use client';

import Link from 'next/link';

import { loadMoreLog } from '@/app/(panel)/log/actions';
import { OriginalBody } from '@/components/moderation/history-list';
import { LoadMore } from '@/components/moderation/load-more';
import { TAP_LINK_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { useKeyset } from '@/components/moderation/use-keyset';
import type { LogRow, Page } from '@/lib/moderation/data';
import type { LogFilters } from '@/lib/moderation/log';

const LINK = `font-medium text-primary underline-offset-4 hover:underline ${TAP_LINK_BELOW_MD}`;

/** Moderation actions, newest first, as cards (all widths). */
export function LogList({ initial, filters }: { initial: Page<LogRow>; filters: LogFilters }) {
  const { rows, hasMore, pending, loadMore } = useKeyset(initial, (cursor) => loadMoreLog({ filters, cursor }), (r) => r.id);

  return (
    <div className="space-y-4">
      <ol className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Moderation actions, newest first">
        {rows.map((row) => (
          <li key={row.id} className="space-y-2 px-4 py-4 text-sm sm:px-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <strong>{row.action}</strong>
              <span className="text-muted-foreground">by</span>
              {row.actorHref && row.actor ? (
                <Link href={row.actorHref} className={LINK}>
                  {row.actor}
                </Link>
              ) : (
                <span className="italic text-muted-foreground">{row.actor ?? 'a former staff member'}</span>
              )}
              <time dateTime={row.createdAt} title={row.ago} className="ml-auto text-xs text-muted-foreground">
                {row.exact}
              </time>
            </div>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="text-muted-foreground">{row.targetLabel}</span>
              {row.targetHref ? (
                <Link href={row.targetHref} className={LINK}>
                  Open
                </Link>
              ) : null}
            </p>
            {row.reason ? <p className="break-words">Reason: {row.reason}</p> : null}
            {row.note ? <p className="whitespace-pre-wrap break-words text-muted-foreground">Note: {row.note}</p> : null}
            {row.originalBody ? <OriginalBody text={row.originalBody} /> : null}
          </li>
        ))}
      </ol>
      <LoadMore hasMore={hasMore} pending={pending} onClick={loadMore} />
    </div>
  );
}
