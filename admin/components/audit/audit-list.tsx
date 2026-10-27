'use client';

import Link from 'next/link';

import { loadMoreAudit } from '@/app/(panel)/audit/actions';
import { LoadMore } from '@/components/moderation/load-more';
import { TAP_LINK_BELOW_MD } from '@/components/moderation/mobile-dialog';
import { useKeyset } from '@/components/moderation/use-keyset';
import type { AuditRow, Page } from '@/lib/moderation/data';

const LINK = `font-medium text-primary underline-offset-4 hover:underline ${TAP_LINK_BELOW_MD}`;

/** Admin actions and identity lookups, newest first, as cards. No email is ever shown (none is stored). */
export function AuditList({ initial }: { initial: Page<AuditRow> }) {
  const { rows, hasMore, pending, loadMore } = useKeyset(initial, (cursor) => loadMoreAudit({ cursor }), (r) => r.id);

  return (
    <div className="space-y-4">
      <ol className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Audit entries, newest first">
        {rows.map((row) => (
          <li key={row.id} className="space-y-2 px-4 py-4 text-sm sm:px-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <strong>{row.action}</strong>
              <span className="text-muted-foreground">by</span>
              {row.adminHref && row.admin ? (
                <Link href={row.adminHref} className={LINK}>
                  {row.admin}
                </Link>
              ) : (
                <span className="italic text-muted-foreground">{row.admin ?? 'a former admin'}</span>
              )}
              <time dateTime={row.createdAt} title={row.ago} className="ml-auto text-xs text-muted-foreground">
                {row.exact}
              </time>
            </div>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="text-muted-foreground">Account:</span>
              {row.subjectHref ? (
                <Link href={row.subjectHref} className={row.subject ? LINK : `${LINK} italic`}>
                  {row.subject ?? 'Deleted user'}
                </Link>
              ) : (
                <span className="italic text-muted-foreground">None</span>
              )}
              {row.targetLabel && row.targetHref ? (
                <>
                  <span className="text-muted-foreground">· {row.targetLabel}</span>
                  <Link href={row.targetHref} className={LINK}>
                    Open
                  </Link>
                </>
              ) : null}
            </p>
            {row.detail ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{row.detail}</p> : null}
          </li>
        ))}
      </ol>
      <LoadMore hasMore={hasMore} pending={pending} onClick={loadMore} />
    </div>
  );
}
