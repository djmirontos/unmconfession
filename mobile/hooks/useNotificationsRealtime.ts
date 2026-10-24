import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useMembership } from '@/hooks/useProfile';
import { usePostgresChanges } from '@/hooks/usePostgresChanges';
import { invalidateNotifications } from '@/lib/notifications';
import { useAuthStore } from '@/stores/authStore';

const DEBOUNCE_MS = 500;

/**
 * Mounted once (root layout). For members: my notifications rows (INSERT = new
 * activity, UPDATE = read / reaction change) refresh the list and the badge, a
 * burst of events counting once. Payloads are only a signal (they have no
 * nickname). Also refreshes on return to the foreground and after a resubscribe.
 * DELETE is not subscribed: Realtime cannot filter deletes, and only this user
 * (or the server purge) deletes them.
 */
export function useNotificationsRealtime(): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const member = useMembership().status === 'member';
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => invalidateNotifications(queryClient), DEBOUNCE_MS);
  }, [queryClient]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!member) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [member, refresh]);

  usePostgresChanges({
    table: 'notifications',
    events: ['INSERT', 'UPDATE'],
    filter: userId ? `user_id=eq.${userId}` : undefined,
    topic: 'notifications',
    enabled: member && userId !== null,
    onChange: refresh,
    onResubscribed: refresh,
  });
}
