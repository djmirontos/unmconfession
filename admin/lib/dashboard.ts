import 'server-only';

import { cache } from 'react';

import { codeFromError, messageFor } from '@/lib/errors';
import { fetchOpenChatReportCount } from '@/lib/moderation/chat-report-data';
import { chatReportBadge } from '@/lib/moderation/chat-reports';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type DashboardCounts = Database['public']['Functions']['mod_dashboard']['Returns'][number];

/** mod_dashboard, once per request (the dashboard and the sidebar badges share it). */
export const getDashboard = cache(async (): Promise<DashboardCounts> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mod_dashboard');
  if (error) throw new Error(messageFor(codeFromError(error)));
  const row = data?.[0];
  if (!row) throw new Error(messageFor('unknown'));
  return row;
});

/** Sidebar badges; a failure hides them instead of breaking the layout. */
export async function navCounts(): Promise<Partial<Record<'review' | 'reports' | 'chatReports', number>>> {
  // Each badge on its own: a failed chat report count hides only that badge.
  const [dashboard, chatReports] = await Promise.all([getDashboard().catch(() => null), fetchOpenChatReportCount()]);
  return {
    ...(dashboard
      ? { review: dashboard.pending_posts + dashboard.pending_comments + dashboard.pending_listings, reports: dashboard.reported_items }
      : {}),
    chatReports: chatReportBadge(chatReports),
  };
}
