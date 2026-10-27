'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { KeysetCursor } from '@/lib/moderation/schemas';
import type { ActionResult } from '@/lib/result';

type Page<Row> = { rows: Row[]; nextCursor: KeysetCursor | null };

/** Rows plus "Load more" over a (timestamp, id) keyset Server Action; duplicates are dropped. */
export function useKeyset<Row>(
  initial: Page<Row>,
  load: (cursor: KeysetCursor) => Promise<ActionResult<Page<Row>>>,
  keyOf: (row: Row) => string,
) {
  const [rows, setRows] = useState(initial.rows);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, startTransition] = useTransition();

  const loadMore = () =>
    startTransition(async () => {
      if (!cursor) return;
      const result = await load(cursor);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setRows((prev) => {
        const seen = new Set(prev.map(keyOf));
        return [...prev, ...result.data.rows.filter((r) => !seen.has(keyOf(r)))];
      });
      setCursor(result.data.nextCursor);
    });

  return { rows, hasMore: cursor !== null, pending, loadMore };
}
