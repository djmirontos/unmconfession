import { skipToken, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';

import { useMembership } from '@/hooks/useProfile';
import { getErrorMessage } from '@/lib/errors';
import {
  deleteAllNotifications,
  deleteNotifications,
  fetchNotificationPage,
  invalidateNotifications,
  markNotificationsRead,
  type NotificationCursor,
  type NotificationGroup,
  type NotificationsData,
  notificationsKey,
  patchDelete,
  patchDeleteAll,
  patchRead,
  unreadCountKey,
} from '@/lib/notifications';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

/** Grouped notifications, newest first, with optimistic mark-read and delete. */
export function useNotifications() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const member = useMembership().status === 'member';
  const showToast = useToastStore((s) => s.show);

  const query = useInfiniteQuery({
    queryKey: notificationsKey(userId ?? ''),
    queryFn: member && userId ? ({ pageParam }) => fetchNotificationPage(pageParam) : skipToken,
    initialPageParam: null as NotificationCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // De-duplicated: a group can move up between page fetches.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: NotificationGroup[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const g of page.items) {
        if (seen.has(g.group_key)) continue;
        seen.add(g.group_key);
        out.push(g);
      }
    }
    return out;
  }, [query.data]);

  const unreadInList = items.some((g) => g.unread_count > 0);

  const markRead = useCallback(
    (groups: readonly NotificationGroup[] | 'all') => {
      if (!userId) return;
      const keys = groups === 'all' ? null : groups.filter((g) => g.unread_count > 0).map((g) => g.group_key);
      if (keys && keys.length === 0) return;
      patchRead(queryClient, userId, keys, keys?.length ?? 0);
      markNotificationsRead(keys).catch((error: unknown) => {
        invalidateNotifications(queryClient);
        showToast(getErrorMessage(error));
      });
    },
    [queryClient, userId, showToast],
  );

  const remove = useCallback(
    (group: NotificationGroup) => {
      if (!userId) return;
      const key = notificationsKey(userId);
      const snapshot = queryClient.getQueryData<NotificationsData>(key);
      patchDelete(queryClient, userId, group.group_key, group.unread_count > 0);
      deleteNotifications([group.group_key])
        .then(() => showToast('Notification deleted'))
        .catch((error: unknown) => {
          queryClient.setQueryData(key, snapshot);
          invalidateNotifications(queryClient);
          showToast(getErrorMessage(error));
        });
    },
    [queryClient, userId, showToast],
  );

  /** Confirm, then delete everything optimistically; on failure the snapshot comes back and Retry is offered. */
  const removeAll = useCallback(() => {
    if (!userId) return;
    const run = () => {
      const listKey = notificationsKey(userId);
      const countKey = unreadCountKey(userId);
      const snapshot = { list: queryClient.getQueryData<NotificationsData>(listKey), count: queryClient.getQueryData<number>(countKey) };
      patchDeleteAll(queryClient, userId);
      deleteAllNotifications(userId)
        .then(() => {
          showToast('All notifications deleted');
          invalidateNotifications(queryClient);
        })
        .catch((error: unknown) => {
          queryClient.setQueryData(listKey, snapshot.list);
          queryClient.setQueryData(countKey, snapshot.count);
          invalidateNotifications(queryClient);
          Alert.alert('Could not delete notifications', getErrorMessage(error), [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Retry', onPress: run },
          ]);
        });
    };
    Alert.alert('Delete all notifications?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: run },
    ]);
  }, [queryClient, userId, showToast]);

  return { query, items, unreadInList, markRead, remove, removeAll, signedIn: member };
}
