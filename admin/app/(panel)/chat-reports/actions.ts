'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAdmin, requireStaff } from '@/lib/auth';
import { codeFromError } from '@/lib/errors';
import { type ChatReportRow, fetchChatReportsPage } from '@/lib/moderation/chat-report-data';
import {
  type ChatReportStatus,
  chatReportIdSchema,
  chatReportStatusSchema,
  resolveChatReportSchema,
  resolveInputError,
} from '@/lib/moderation/chat-reports';
import { muteMember, warnMember } from '@/lib/moderation/discipline';
import type { Page } from '@/lib/moderation/keyset';
import { keysetCursorSchema } from '@/lib/moderation/schemas';
import { type ActionResult, fail, ok } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

// Every mod_get_chat_report call is written to the audit log, so nothing here re-renders a report
// page: not the panel-wide refresh (it revalidates the whole layout, the open report included) and no
// detail path. Only the list (a literal path, so the report page is not "the affected path") and,
// after a warning or a mute, that member's page. The report page updates its own state from the
// result. Nothing here logs report content, notes or nicknames.

function revalidateList() {
  revalidatePath('/chat-reports');
}

const loadSchema = z.object({ status: chatReportStatusSchema, cursor: keysetCursorSchema });

export async function loadMoreChatReports(input: unknown): Promise<ActionResult<Page<ChatReportRow>>> {
  await requireStaff();
  const parsed = loadSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  try {
    return ok(await fetchChatReportsPage(parsed.data.status, parsed.data.cursor));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'unknown');
  }
}

/** Admin-only and held from now on; admins are alerted by the database. */
export async function escalateChatReport(input: unknown): Promise<ActionResult<{ adminOnly: true; held: true }>> {
  await requireStaff();
  const parsed = chatReportIdSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const supabase = await createClient();
  const { error } = await supabase.rpc('mod_escalate_chat_report', { p_report: parsed.data });
  if (error) return fail(codeFromError(error));
  revalidateList();
  return ok({ adminOnly: true, held: true });
}

/** Resolve with an outcome (dismissed -> 'dismissed', anything else -> 'actioned') and an optional note. */
export async function resolveChatReport(input: unknown): Promise<ActionResult<{ status: ChatReportStatus; outcome: string; note: string | null }>> {
  await requireStaff();
  const parsed = resolveChatReportSchema.safeParse(input);
  if (!parsed.success) return fail(resolveInputError(parsed.error.issues));
  const supabase = await createClient();
  const note = parsed.data.note || null;
  const { error } = await supabase.rpc('mod_resolve_chat_report', {
    p_report: parsed.data.report,
    p_outcome: parsed.data.outcome,
    ...(note ? { p_note: note } : {}),
  });
  if (error) return fail(codeFromError(error));
  revalidateList();
  return ok({ status: parsed.data.outcome === 'dismissed' ? 'dismissed' : 'actioned', outcome: parsed.data.outcome, note });
}

/** Admins only: the evidence is then cleared by the normal cleanup (90 days after resolving). */
export async function releaseChatReportHold(input: unknown): Promise<ActionResult<{ held: false }>> {
  await requireAdmin();
  const parsed = chatReportIdSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_release_chat_report_hold', { p_report: parsed.data });
  if (error) return fail(codeFromError(error));
  revalidateList();
  return ok({ held: false });
}

const memberSchema = z.object({ user: z.uuid() }).loose();

/** The member page's warning (same rules and RPC, lib/moderation/discipline.ts), without re-rendering the report. */
export async function warnReportedMember(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const result = await warnMember(input);
  const member = memberSchema.safeParse(input);
  if (result.ok && member.success) revalidatePath(`/users/${member.data.user}`);
  return result;
}

/** The member page's mute (same rules and RPC), without re-rendering the report. */
export async function muteReportedMember(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const result = await muteMember(input);
  const member = memberSchema.safeParse(input);
  if (result.ok && member.success) revalidatePath(`/users/${member.data.user}`);
  return result;
}
