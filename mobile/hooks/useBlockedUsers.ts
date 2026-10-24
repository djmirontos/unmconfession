import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { afterUnblock, atNickname, type BlockedUser, blockedUsersKey, fetchBlockedUsers, unblockUser } from '@/lib/blocks';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

/** My blocked members, newest first, with an optimistic unblock. */
export function useBlockedUsers() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const showToast = useToastStore((s) => s.show);
  const key = blockedUsersKey(userId ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: userId ? () => fetchBlockedUsers(userId) : skipToken,
  });

  const unblock = useCallback(
    async (user: BlockedUser) => {
      if (!userId) return;
      const listKey = blockedUsersKey(userId);
      // Removed at once; restored by a refetch if the delete fails.
      queryClient.setQueryData<BlockedUser[]>(listKey, (list) => list?.filter((u) => u.id !== user.id));
      try {
        await unblockUser(userId, user.id);
        showToast(`Unblocked ${atNickname(user.nickname)}`);
        afterUnblock(queryClient);
      } catch (error) {
        showToast(getErrorMessage(error));
      } finally {
        void queryClient.invalidateQueries({ queryKey: listKey });
      }
    },
    [queryClient, userId, showToast],
  );

  return { query, unblock, signedIn: userId !== null };
}
