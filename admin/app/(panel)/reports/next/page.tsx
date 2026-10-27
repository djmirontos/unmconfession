import { redirect } from 'next/navigation';

import { requireStaff } from '@/lib/auth';
import { fetchNextReport } from '@/lib/moderation/data';
import { keysetCursorSchema } from '@/lib/moderation/schemas';
import { filterSchema, targetSchema } from '@/lib/review/schemas';

/**
 * /reports/next?type=&id=&after=&filter= : after an item's reports are handled, go to the
 * next reported item (wrapping to the oldest), or back to the list with "No more reports".
 */
export default async function ReportsNextPage({ searchParams }: PageProps<'/reports/next'>) {
  await requireStaff();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filter = filterSchema.parse(one(params.filter));
  const target = targetSchema.safeParse({ type: one(params.type), id: one(params.id) });
  const cursor = keysetCursorSchema.safeParse({ ts: one(params.after), id: one(params.id) });

  const next = target.success ? await fetchNextReport(target.data, cursor.success ? cursor.data : undefined, filter) : null;
  if (next) redirect(`/reports/${next.target_type}/${next.target_id}${filter ? `?filter=${filter}` : ''}`);
  redirect(filter ? `/reports?filter=${filter}&cleared=1` : '/reports?cleared=1');
}
