'use client';

import { loadMoreHistory } from '@/app/(panel)/content/actions';
import { LoadMore } from '@/components/moderation/load-more';
import { useKeyset } from '@/components/moderation/use-keyset';
import type { HistoryQuery, HistoryRow, Page } from '@/lib/moderation/data';

/** Moderation log for one item or one user, newest first; edits keep the original text. */
export function HistoryList({ query, initial, showTarget = false }: { query: HistoryQuery; initial: Page<HistoryRow>; showTarget?: boolean }) {
  const { rows, hasMore, pending, loadMore } = useKeyset(initial, (cursor) => loadMoreHistory({ ...query, cursor }), (r) => r.id);

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No moderation actions yet.</p>;

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="space-y-1 border-l-2 border-border pl-3 text-sm">
            <p>
              <strong>{row.action}</strong>
              {showTarget && row.targetType !== 'user' ? <span className="text-muted-foreground"> ({row.targetType})</span> : null}
              <span className="text-muted-foreground"> by {row.actor ?? 'a former staff member'}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              <time title={row.exact}>{row.ago}</time>
            </p>
            {row.reason ? <p>Reason: {row.reason}</p> : null}
            {row.note ? <p className="whitespace-pre-wrap break-words text-muted-foreground">Note: {row.note}</p> : null}
            {row.originalBody ? <OriginalBody text={row.originalBody} /> : null}
          </li>
        ))}
      </ol>
      <LoadMore hasMore={hasMore} pending={pending} onClick={loadMore} />
    </div>
  );
}

/** The text an edit replaced, collapsed by default (moderation history and the moderation log). */
export function OriginalBody({ text }: { text: string }) {
  return (
    <details className="rounded-md bg-muted px-2 py-1.5">
      <summary className="cursor-pointer text-xs font-medium">Original text before the edit</summary>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs">{text}</p>
    </details>
  );
}
