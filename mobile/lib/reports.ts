import { z } from 'zod';

import { logError, logInfo } from '@/lib/log';
import { REPORT_REASONS, type ReportReason } from '@/lib/reportReasons';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export { REPORT_REASONS, type ReportReason };

export type ReportTarget = Database['public']['Enums']['content_type'];

export const REPORT_NOTE_MAX = 500;

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]]),
  note: z.string().trim().max(REPORT_NOTE_MAX),
});

/** Reporting the same item twice is accepted silently by the server. */
export async function reportContent(type: ReportTarget, id: string, reason: ReportReason, note: string): Promise<void> {
  const input = reportSchema.parse({ reason, note });
  const { error } = await supabase.rpc('report_content', {
    p_type: type,
    p_id: id,
    p_reason: input.reason,
    p_note: input.note || undefined,
  });
  if (error) {
    logError('rpc.report_content', error, { type });
    throw error;
  }
  logInfo('rpc.report_content', 'ok', { type });
}
