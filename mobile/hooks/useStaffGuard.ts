import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useStaff } from '@/hooks/useStaff';

/**
 * For every moderation screen: true only for confirmed staff. Anyone else (guest, member, demoted,
 * or the check failed) is sent to Home once the check is done, deep links included; render nothing meanwhile.
 */
export function useStaffGuard(): boolean {
  const router = useRouter();
  const { isStaff, isLoading } = useStaff();
  const leave = !isLoading && !isStaff;
  useEffect(() => {
    if (leave) router.replace('/');
  }, [leave, router]);
  return isStaff;
}
