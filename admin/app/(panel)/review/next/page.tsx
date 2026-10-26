import { redirect } from 'next/navigation';

import { requireStaff } from '@/lib/auth';
import { fetchNextAfterAction } from '@/lib/review/data';
import { keyOf, listHref, reviewHref } from '@/lib/review/queue';
import { cursorSchema, filterSchema, targetSchema } from '@/lib/review/schemas';

/**
 * /review/next?type=&id=&after=&filter= : after an action (or "someone else already handled
 * it"), go to the next pending item, wrapping to the oldest one; back to the list when the
 * queue is empty. Only redirects; renders nothing.
 */
export default async function ReviewNextPage({ searchParams }: PageProps<'/review/next'>) {
  await requireStaff();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filter = filterSchema.parse(one(params.filter));
  const target = targetSchema.safeParse({ type: one(params.type), id: one(params.id) });
  const after = cursorSchema.safeParse(one(params.after));

  const next = target.success
    ? await fetchNextAfterAction(keyOf({ target_type: target.data.type, target_id: target.data.id }), after.success ? after.data : undefined, filter)
    : null;
  redirect(next ? reviewHref(next.target_type, next.target_id, filter) : `${listHref(filter)}${filter ? '&' : '?'}cleared=1`);
}
