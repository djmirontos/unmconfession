import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateNotifications } from '@/lib/notifications';
import { fetchMySettings, mySettingsKey, type MySettings, type NotificationPref, setNotificationPref } from '@/lib/settings';
import { useAuthStore } from '@/stores/authStore';

/** The member's notification switches and nickname cooldown (get_my_settings). */
export function useMySettings() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: mySettingsKey(userId ?? ''),
    queryFn: userId ? fetchMySettings : skipToken,
    staleTime: 60 * 1000,
  });
}

/**
 * Flips one notification switch: optimistic, rolled back on failure. Afterwards the
 * notifications list and the unread badge refetch, since the switches filter both.
 */
export function useSetNotificationPref() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const key = mySettingsKey(userId ?? '');

  return useMutation({
    mutationFn: ({ pref, on }: { pref: NotificationPref; on: boolean }) => setNotificationPref(pref, on),
    onMutate: async ({ pref, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MySettings>(key);
      if (previous) queryClient.setQueryData<MySettings>(key, { ...previous, [pref]: on });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: () => invalidateNotifications(queryClient),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
