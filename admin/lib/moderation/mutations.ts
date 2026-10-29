import 'server-only';

import { revalidatePath } from 'next/cache';

import { codeFromError } from '@/lib/errors';
import { openReportIds } from '@/lib/moderation/data';
import {
  describeRemoveFlow,
  describeResolve,
  removeThenResolve,
  resolveEach,
} from '@/lib/moderation/resolve';
import { type ActionResult, fail, ok } from '@/lib/result';
import { fetchContent } from '@/lib/review/data';
import type { ReportTarget, Target } from '@/lib/review/schemas';
import { createClient } from '@/lib/supabase/server';

// Shared by the reports and content actions (each action checks access and validates first).

export type FlowMessage = { message: string; partial: boolean };

/** Counts, badges and lists everywhere in the panel. */
export function refreshPanel() {
  revalidatePath('/', 'layout');
}

async function review(target: Target, action: 'remove' | 'restore', reason?: string, note?: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_review', {
    p_type: target.type,
    p_id: target.id,
    p_action: action,
    ...(reason ? { p_reason: reason } : {}),
    ...(note ? { p_note: note } : {}),
  });
  return error ? codeFromError(error) : null;
}

async function resolveOne(reportId: string, status: 'actioned' | 'dismissed'): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_resolve_report', { p_report_id: reportId, p_status: status });
  return error ? codeFromError(error) : null;
}

/** Remove a published item, then mark the reports still open as actioned. */
export async function removeAndResolve(target: Target, reasonLabel: string, note?: string): Promise<ActionResult<FlowMessage>> {
  const result = await removeThenResolve({
    remove: () => review(target, 'remove', reasonLabel, note),
    isRemoved: async () => {
      const item = await fetchContent(target.type, target.id).catch(() => null);
      return item?.status === 'removed' || item?.status === 'rejected';
    },
    openReportIds: () => openReportIds(target.type, target.id),
    resolveOne: (id) => resolveOne(id, 'actioned'),
  });
  if (result.kind === 'failed') return fail(result.code);
  refreshPanel();
  return ok({ message: describeRemoveFlow(result), partial: result.kind === 'partial' });
}

/** Resolve every open report on the item ("Mark handled" or "Dismiss reports"). */
export async function resolveAllOpen(target: ReportTarget, status: 'actioned' | 'dismissed'): Promise<ActionResult<FlowMessage>> {
  const open = await openReportIds(target.type, target.id);
  if (open === null) return fail('unknown');
  const outcome = await resolveEach(open, (id) => resolveOne(id, status));
  refreshPanel();
  return ok({ message: describeResolve(outcome, status), partial: outcome.failed > 0 });
}

/** Restore a removed or rejected item; never one its author deleted. */
export async function restoreContent(target: Target): Promise<ActionResult> {
  const item = await fetchContent(target.type, target.id);
  if (!item) return fail('not_found');
  if (item.deleted_at) return fail('cannot_restore_deleted');
  const code = await review(target, 'restore');
  if (code) return fail(code);
  refreshPanel();
  return ok(undefined);
}

export async function editContent(target: Target, body: string, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_edit_content', {
    p_type: target.type,
    p_id: target.id,
    p_new_body: body,
    p_reason: reason,
  });
  if (error) return fail(codeFromError(error));
  refreshPanel();
  return ok(undefined);
}
