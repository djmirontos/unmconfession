'use client';

import { ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { loadMoreQueue } from '@/app/(panel)/review/actions';
import { authorLabel, HoldBadge, kindLabel, TypeBadge } from '@/components/review/hold-badge';
import { Button } from '@/components/ui/button';
import type { QueueRow } from '@/lib/review/data';
import { reviewHref } from '@/lib/review/queue';
import type { ContentType } from '@/lib/review/schemas';

type Props = { initialRows: QueueRow[]; initialCursor: string | null; filter?: ContentType };

/** The pending list. "Load more" fetches the next page; the type filter applies to what is loaded. */
export function QueueList({ initialRows, initialCursor, filter }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();
  const shown = filter ? rows.filter((r) => r.type === filter) : rows;

  const loadMore = () =>
    startTransition(async () => {
      if (!cursor) return;
      const result = await loadMoreQueue(cursor);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.key));
        return [...prev, ...result.data.rows.filter((r) => !seen.has(r.key))];
      });
      setCursor(result.data.nextCursor);
    });

  return (
    <div className="space-y-4">
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No {filter ? `${filter}s` : 'items'} in the loaded part of the queue.
          {cursor ? ' Load more to check older items.' : ''}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Pending items, oldest first">
          {shown.map((row) => (
            <li key={row.key}>
              <Link
                href={reviewHref(row.type, row.id, filter)}
                className="block space-y-2 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <TypeBadge type={row.type} />
                  {kindLabel(row.kind) && row.type !== 'comment' ? (
                    <span className="font-medium">{kindLabel(row.kind)}</span>
                  ) : null}
                  <span className="text-muted-foreground">by</span>
                  <span className={row.nickname ? 'font-medium' : 'italic text-muted-foreground'}>{authorLabel(row.nickname)}</span>
                  <time dateTime={row.createdAt} title={row.exact} className="text-muted-foreground">
                    · {row.ago}
                  </time>
                  <span className="ml-auto">
                    <HoldBadge reason={row.holdReason} term={row.matchedTerm} />
                  </span>
                </div>
                <p className="line-clamp-3 text-sm text-foreground/90">{row.preview || <em className="text-muted-foreground">No text</em>}</p>
                {row.images > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ImageIcon className="size-3.5" aria-hidden="true" />
                    {row.images} {row.images === 1 ? 'image' : 'images'}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={pending} aria-busy={pending}>
            {pending ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
