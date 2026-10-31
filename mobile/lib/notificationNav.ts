import type { ImperativeRouter } from 'expo-router';

import type { NotificationDestination } from '@/lib/notificationTarget';

/** Opens a post, listing or status destination (lib/notificationTarget.ts); false when there is nothing to open. */
export function openNotificationDestination(router: ImperativeRouter, dest: NotificationDestination): boolean {
  switch (dest.kind) {
    case 'post':
      router.push({ pathname: '/post/[id]', params: { id: dest.id } });
      return true;
    case 'listing':
      router.push({ pathname: '/listing/[id]', params: { id: dest.id } });
      return true;
    case 'post-status':
      router.push({ pathname: '/post-status', params: { source: dest.source, id: dest.id } });
      return true;
    default:
      return false;
  }
}
