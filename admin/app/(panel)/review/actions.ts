'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth';
import { codeFromError } from '@/lib/errors';
import { type ActionResult, fail, ok } from '@/lib/result';
import { fetchQueuePage, type QueueRow } from '@/lib/review/data';
import { reasonLabel } from '@/lib/review/reasons';
import { cursorSchema, editSchema, rejectSchema, type Target, targetSchema } from '@/lib/review/schemas';
import { createClient } from '@/lib/supabase/server';

// Ids from the client are only passed to the RPCs, which check the role and the transition.

function refreshCounts() {
  revalidatePath('/');
  revalidatePath('/review');
}

async function review(target: Target, action: 'approve' | 'reject', reason?: string, note?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_review', {
    p_type: target.type,
    p_id: target.id,
    p_action: action,
    ...(reason ? { p_reason: reason } : {}),
    ...(note ? { p_note: note } : {}),
  });
  if (error) return fail(codeFromError(error));
  refreshCounts();
  return ok(undefined);
}

export async function loadMoreQueue(cursor: unknown): Promise<ActionResult<{ rows: QueueRow[]; nextCursor: string | null }>> {
  await requireStaff();
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success) return fail('invalid_input');
  try {
    return ok(await fetchQueuePage(parsed.data));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}

export async function approveItem(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  return review(parsed.data, 'approve');
}

export async function rejectItem(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === 'reason') ? 'reason_required' : 'invalid_input');
  const { type, id, reason, note } = parsed.data;
  return review({ type, id }, 'reject', reasonLabel(reason), note || undefined);
}

/**
 * Edit, then approve. Two RPCs (the database has no combined call). If the edit is saved but
 * the approval fails, the result says so with `approve_failed_after_edit` so the screen can
 * offer to retry the approval alone instead of re-sending the edit.
 */
export async function editAndApprove(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(field === 'body' ? 'invalid_body' : field === 'reason' ? 'reason_required' : 'invalid_input');
  }
  const { type, id, body, reason } = parsed.data;

  const supabase = await createClient();
  const edit = await supabase.rpc('mod_edit_content', { p_type: type, p_id: id, p_new_body: body, p_reason: reason });
  if (edit.error) return fail(codeFromError(edit.error));

  const approved = await review({ type, id }, 'approve');
  if (!approved.ok) {
    revalidatePath(`/review/${type}/${id}`);
    // Someone else handling it in between is reported as such; anything else keeps the retry path.
    return approved.code === 'invalid_transition' ? approved : fail('approve_failed_after_edit');
  }
  return approved;
}
