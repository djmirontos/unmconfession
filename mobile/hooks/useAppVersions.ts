import { skipToken, useQuery } from '@tanstack/react-query';

import { useStaff } from '@/hooks/useStaff';
import { logError } from '@/lib/log';
import { type AppVersionRow, toAppVersionRows } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'mod-app-versions': not persisted, cleared on sign-out (clearMemberCaches).
export const appVersionsKey = (userId: string) => ['mod-app-versions', userId] as const;

async function fetchAppVersions(): Promise<AppVersionRow[]> {
  const { data, error } = await supabase.rpc('mod_app_versions');
  if (error) {
    logError('rpc.mod_app_versions', error);
    throw error;
  }
  return toAppVersionRows(data);
}

/** Members per app version and platform for the Moderation hub (staff only). Counts only. */
export function useAppVersions() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const { isStaff } = useStaff();
  return useQuery({
    queryKey: appVersionsKey(userId ?? ''),
    queryFn: isStaff ? fetchAppVersions : skipToken,
    staleTime: 60 * 1000,
  });
}
