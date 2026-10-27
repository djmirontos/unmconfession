'use client';

import { ImageIcon } from 'lucide-react';
import Link from 'next/link';

import { loadMoreContent } from '@/app/(panel)/content/actions';
import { LoadMore } from '@/components/moderation/load-more';
import { ContentStatusBadge } from '@/components/moderation/status-badges';
import { useKeyset } from '@/components/moderation/use-keyset';
import { authorLabel, kindLabel, TypeBadge } from '@/components/review/hold-badge';
import type { ContentFilters, ContentListRow, Page } from '@/lib/moderation/data';

export function ContentList({ initial, filters }: { initial: Page<ContentListRow>; filters: ContentFilters }) {
  const { rows, hasMore, pending, loadMore } = useKeyset(initial, (cursor) => loadMoreContent({ filters, cursor }), (r) => r.key);

  return (
    <div className="space-y-4">
      <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Content, newest first">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={`/content/${row.type}/${row.id}`}
              className="block space-y-2 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <TypeBadge type={row.type} />
                <ContentStatusBadge status={row.status} />
                {row.type !== 'comment' && kindLabel(row.kind) ? <span className="font-medium">{kindLabel(row.kind)}</span> : null}
                {row.postNumber ? <span className="text-muted-foreground">#{row.postNumber}</span> : null}
                {row.deletedByAuthor ? (
                  <span className="rounded border border-dashed px-1.5 text-xs text-muted-foreground">Deleted by the author</span>
                ) : null}
                <span className="ml-auto text-muted-foreground">
                  <span className={row.nickname ? 'font-medium text-foreground' : 'italic'}>{authorLabel(row.nickname)}</span>
                  {' · '}
                  <time dateTime={row.createdAt} title={row.exact}>
                    {row.ago}
                  </time>
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-foreground/90">{row.preview || <em className="text-muted-foreground">No text</em>}</p>
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
      <LoadMore hasMore={hasMore} pending={pending} onClick={loadMore} />
    </div>
  );
}
