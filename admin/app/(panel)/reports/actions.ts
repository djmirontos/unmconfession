'use server';

import { requireStaff } from '@/lib/auth';
import { fetchReportsPage, type Page, type ReportRow } from '@/lib/moderation/data';
import { type FlowMessage, resolveAllOpen } from '@/lib/moderation/mutations';
import { keysetCursorSchema, resolveSchema } from '@/lib/moderation/schemas';
import { type ActionResult, fail, ok } from '@/lib/result';

// Remove and edit on the reports page use the content actions (same rules, same flow).

export async function loadMoreReports(cursor: unknown): Promise<ActionResult<Page<ReportRow>>> {
  await requireStaff();
  const parsed = keysetCursorSchema.safeParse(cursor);
  if (!parsed.success) return fail('invalid_input');
  try {
    return ok(await fetchReportsPage(parsed.data));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}

/** "Mark handled" (actioned) or "Dismiss reports" (dismissed) for every open report on the item. */
export async function resolveReports(input: unknown): Promise<ActionResult<FlowMessage>> {
  await requireStaff();
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const { type, id, status } = parsed.data;
  return resolveAllOpen({ type, id }, status);
}
