import AsyncStorage from '@react-native-async-storage/async-storage';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const storageKey = (userId: string) => `unm-avatar-picker-seen:${userId}`;
const queryKey = (userId: string) => ['avatar-prompt', userId] as const;

/** Whether to show the "Pick your avatar" card: until this user opens the picker or dismisses the card. */
export function useAvatarPrompt(userId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKey(userId ?? ''),
    queryFn: userId ? async () => (await AsyncStorage.getItem(storageKey(userId))) === '1' : skipToken,
    staleTime: Infinity,
  });

  const markSeen = useCallback(() => {
    if (!userId || query.data === true) return;
    queryClient.setQueryData(queryKey(userId), true);
    void AsyncStorage.setItem(storageKey(userId), '1');
  }, [userId, query.data, queryClient]);

  // Hidden while unknown, so the card never flashes for users who already saw it.
  return { showPrompt: query.data === false, markSeen };
}
