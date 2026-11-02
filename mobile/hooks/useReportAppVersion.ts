import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useMembership } from '@/hooks/useProfile';
import { buildReportArgs, shouldReport } from '@/lib/appVersions';
import { installedVersion } from '@/lib/config';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';

// Members already reported this launch (a token refresh keeps the same user, so it does not fire again).
const reported = new Set<string>();

/**
 * Mounted once in the root layout: tells the server which app version and platform this member
 * runs, once per launch. Fire-and-forget: no UI, no retry until the next launch, errors only logged.
 * The server ignores repeats within 12 hours.
 */
export function useReportAppVersion(): void {
  const { status, session } = useMembership();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (status !== 'member' || !userId) return;
    const args = buildReportArgs(installedVersion(), Platform.OS);
    if (!args || !shouldReport(reported, userId)) return;
    void supabase
      .rpc('report_app_version', args)
      .then(({ error }) => {
        if (error) logError('rpc.report_app_version', error);
      }, (error: unknown) => logError('rpc.report_app_version', error));
  }, [status, userId]);
}
