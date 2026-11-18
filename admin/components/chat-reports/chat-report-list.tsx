'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';

import { loadMoreChatReports } from '@/app/(panel)/chat-reports/actions';
import { LoadMore } from '@/components/moderation/load-more';
import { useKeyset } from '@/components/moderation/use-keyset';
import { Badge } from '@/components/ui/badge';
import type { ChatReportRow } from '@/lib/moderation/chat-report-data';
import { type ChatReportStatus, isRestrictedFor } from '@/lib/moderation/chat-reports';
import type { Page } from '@/lib/moderation/keyset';

const nick = (n: string | null) => n ?? 'Deleted user';

function Badges({ row }: { row: ChatReportRow }) {
  return (
    <>
      {row.adminOnly ? <Badge variant="outline">Admin only</Badge> : null}
      {row.held ? <Badge variant="outline">Held</Badge> : null}
      {row.outcome ? <Badge variant="secondary">{row.outcome}</Badge> : null}
    </>
  );
}

/**
 * Chat reports of one status, oldest first, with "Load more". Links never prefetch: opening a
 * report is written to the audit log, so only a real click may load it. A moderator sees an
 * admin-only report as "Restricted - admins only", without a link.
 */
export function ChatReportList({ initial, status, isAdmin }: { initial: Page<ChatReportRow>; status: ChatReportStatus; isAdmin: boolean }) {
  const { rows, hasMore, pending, loadMore } = useKeyset(initial, (cursor) => loadMoreChatReports({ status, cursor }), (r) => r.id);

  return (
    <div className="space-y-4">
      <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Chat reports, oldest first">
        {rows.map((row) => {
          const restricted = isRestrictedFor({ isAdmin }, row);
          const body = (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{row.reason}</span>
                <Badges row={row} />
                <time className="ml-auto text-xs text-muted-foreground" title={row.exact}>
                  {row.ago}
                </time>
              </div>
              {restricted ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden="true" />
                  Restricted - admins only
                </p>
              ) : (
                <p className="text-sm break-words">
                  <span className="text-muted-foreground">Reported: </span>
                  <span className="font-medium">{nick(row.reportedNickname)}</span>
                  <span className="text-muted-foreground"> · by </span>
                  <span>{nick(row.reporterNickname)}</span>
                </p>
              )}
            </>
          );
          return (
            <li key={row.id}>
              {restricted ? (
                <div className="space-y-2 px-4 py-4 sm:px-5" aria-disabled="true">
                  {body}
                </div>
              ) : (
                <Link
                  href={`/chat-reports/${row.id}`}
                  prefetch={false}
                  className="block space-y-2 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <LoadMore hasMore={hasMore} pending={pending} onClick={loadMore} />
    </div>
  );
}
