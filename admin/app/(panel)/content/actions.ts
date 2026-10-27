'use server';

import { z } from 'zod';

import { requireStaff } from '@/lib/auth';
import {
  type ContentListRow,
  fetchContentPage,
  fetchHistory,
  type HistoryRow,
  type Page,
} from '@/lib/moderation/data';
import { editContent, type FlowMessage, removeAndResolve, restoreContent } from '@/lib/moderation/mutations';
import { contentFiltersSchema, historyQuerySchema, keysetCursorSchema, removeSchema } from '@/lib/moderation/schemas';
import { type ActionResult, fail, ok } from '@/lib/result';
import { reasonLabel } from '@/lib/review/reasons';
import { editSchema, targetSchema } from '@/lib/review/schemas';

// Ids from the client are only passed to the RPCs, which check the role and the transition.

const loadSchema = z.object({ filters: contentFiltersSchema, cursor: keysetCursorSchema });

export async function loadMoreContent(input: unknown): Promise<ActionResult<Page<ContentListRow>>> {
  await requireStaff();
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  try {
    return ok(await fetchContentPage(parsed.data.filters, parsed.data.cursor));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}

export async function loadMoreHistory(input: unknown): Promise<ActionResult<Page<HistoryRow>>> {
  await requireStaff();
  const parsed = historyQuerySchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const { cursor, ...query } = parsed.data;
  try {
    return ok(await fetchHistory(query, cursor));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}

export async function removePublished(input: unknown): Promise<ActionResult<FlowMessage>> {
  await requireStaff();
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === 'reason') ? 'reason_required' : 'invalid_input');
  const { type, id, reason, note } = parsed.data;
  return removeAndResolve({ type, id }, reasonLabel(reason), note || undefined);
}

export async function restoreRemoved(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  return restoreContent(parsed.data);
}

export async function editPublished(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(field === 'body' ? 'invalid_body' : field === 'reason' ? 'reason_required' : 'invalid_input');
  }
  const { type, id, body, reason } = parsed.data;
  return editContent({ type, id }, body, reason);
}
