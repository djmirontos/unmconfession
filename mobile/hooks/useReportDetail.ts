import { skipToken, useQuery } from '@tanstack/react-query';

import { fetchReportRows } from '@/hooks/useModerationReports';
import { useStaff } from '@/hooks/useStaff';
import { getErrorCode } from '@/lib/errors';
import { logError } from '@/lib/log';
import {
  firstOpenAt,
  type ModContent,
  type ModTarget,
  profileContent,
  type ReportEntry,
  toModContent,
  toReportEntries,
  toReportQueueItem,
} from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export const reportDetailKey = (userId: string, type: string, id: string) => ['mod-report', userId, type, id] as const;

// How far the profile lookup reads (the web panel's window).
const PROFILE_WINDOW = 100;

export type ReportDetail = {
  /** null: the item no longer exists. */
  content: ModContent | null;
  reports: ReportEntry[];
  openCount: number;
};

async function fetchEntries(target: ModTarget): Promise<ReportEntry[]> {
  const { data, error } = await supabase.rpc('mod_get_report_details', { p_type: target.type, p_id: target.id });
  if (error) {
    logError('rpc.mod_get_report_details', error, { type: target.type });
    throw error;
  }
  return toReportEntries(data);
}

async function fetchContent(target: ModTarget): Promise<ModContent | null> {
  const { data, error } = await supabase.rpc('mod_get_content', { p_type: target.type, p_id: target.id });
  if (error) {
    if (getErrorCode(error) === 'not_found') return null;
    logError('rpc.mod_get_content', error, { type: target.type });
    throw error;
  }
  return toModContent(target, data);
}

// mod_get_content has no profiles. As the web panel does, read mod_get_reports from just before the
// oldest open report and pick this profile's row (nickname, picture, the details it reported).
async function fetchProfile(target: ModTarget, entries: readonly ReportEntry[]): Promise<ModContent> {
  const since = firstOpenAt(entries);
  if (!since) return profileContent(target, null);
  const before = new Date(Date.parse(since) - 1).toISOString();
  const rows = await fetchReportRows(PROFILE_WINDOW, { ts: before, id: '00000000-0000-0000-0000-000000000000' });
  const row = rows.find((r) => r.target_type === 'profile' && r.target_id === target.id);
  return profileContent(target, row ? toReportQueueItem(row) : null);
}

async function fetchDetail(target: ModTarget): Promise<ReportDetail> {
  const [reports, content] = await Promise.all([fetchEntries(target), target.type === 'profile' ? null : fetchContent(target)]);
  const openCount = reports.filter((r) => r.status === 'open').length;
  return { content: target.type === 'profile' ? await fetchProfile(target, reports) : content, reports, openCount };
}

/** One reported item in full and every report on it (staff only). */
export function useReportDetail(target: ModTarget | null) {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useQuery({
    queryKey: reportDetailKey(userId ?? '', target?.type ?? '', target?.id ?? ''),
    queryFn: isStaff && target ? () => fetchDetail(target) : skipToken,
    staleTime: 30 * 1000,
  });
}
