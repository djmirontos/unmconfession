import { skipToken, useQuery } from '@tanstack/react-query';

import { useMembership } from '@/hooks/useProfile';
import { fetchUnreadCount, unreadCountKey } from '@/lib/notifications';
import { useAuthStore } from '@/stores/authStore';

/**
 * Unread notification GROUPS for the badge (0 for guests, who never call the RPC).
 * Kept fresh by useNotificationsRealtime (events, foreground) and the notifications screen.
 */
export function useUnreadNotifications(): number {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const member = useMembership().status === 'member';
  const query = useQuery({
    queryKey: unreadCountKey(userId ?? ''),
    queryFn: member && userId ? fetchUnreadCount : skipToken,
    staleTime: 30 * 1000,
  });
  return member ? (query.data ?? 0) : 0;
}

/** "1".."99", then "99+". */
export const formatBadge = (count: number) => (count > 99 ? '99+' : String(count));
