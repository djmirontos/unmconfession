import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useMembership } from '@/hooks/useProfile';
import { logError } from '@/lib/log';
import { openNotificationDestination } from '@/lib/notificationNav';
import { markNotificationsRead } from '@/lib/notifications';
import { askForPush } from '@/lib/pushAsk';
import { parsePushData, pushDestination, pushGroupKey } from '@/lib/pushNotifications';
import { useAuthStore } from '@/stores/authStore';

// Taps already handled (a cold-start tap is reported by both the last response and the listener).
const handled = new Set<string>();
// Members already checked this session (register, or the onboarding explainer).
const checked = new Set<string>();

/**
 * Push for the whole app, mounted once in the root layout:
 *  - once per session per member (signed in with a nickname): register this phone if allowed,
 *    or show the onboarding explainer (lib/pushPermission.ts decides);
 *  - taps (app running, in the background or closed): open the same screen as the Notifications
 *    list, mark that notification read and refresh the list and the badge. Invalid payloads and
 *    taps while signed out are ignored.
 */
export function usePushNotifications() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useMembership();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const restored = useAuthStore((s) => s.restored);
  const navReady = !!useRootNavigationState()?.key;
  // A tap that arrived before navigation or the session was ready.
  const pending = useRef<Notifications.NotificationResponse | null>(null);

  useEffect(() => {
    if (status !== 'member' || !userId || checked.has(userId)) return;
    checked.add(userId);
    void askForPush('onboarded');
  }, [status, userId]);

  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      if (handled.has(request.identifier)) return;
      handled.add(request.identifier);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      const data = parsePushData(request.content.data);
      if (!data || !useAuthStore.getState().session) return;
      markNotificationsRead([pushGroupKey(data)])
        .catch((error: unknown) => logError('push.markRead', error))
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
        });
      const dest = pushDestination(data);
      if (dest.kind === 'notifications') router.push('/notifications');
      else openNotificationDestination(router, dest);
    };

    const flush = () => {
      if (!navReady || !restored || !pending.current) return;
      const response = pending.current;
      pending.current = null;
      handle(response);
    };
    const receive = (response: Notifications.NotificationResponse) => {
      pending.current = response;
      flush();
    };

    // Cold start: the tap that opened the app.
    if (!pending.current) {
      void Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) receive(response);
        })
        .catch((error: unknown) => logError('push.lastResponse', error));
    }
    flush();
    const subscription = Notifications.addNotificationResponseReceivedListener(receive);
    return () => subscription.remove();
  }, [navReady, restored, router, queryClient]);
}
