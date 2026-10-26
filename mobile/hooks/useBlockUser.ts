import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

import { isDeletedAuthor } from '@/lib/authorLabel';
import { afterBlock, atNickname as handle, blockUser } from '@/lib/blocks';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

export type BlockTarget = { id: string; nickname: string | null };

/** Confirm, block, drop their content from the caches, toast. `onBlocked` runs after success (e.g. leave their post). */
export function useBlockUser() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const showToast = useToastStore((s) => s.show);
  const inFlight = useRef(false);

  const run = useCallback(
    (target: BlockTarget, onBlocked?: (authorId: string) => void) => {
      if (!userId || inFlight.current) return;
      inFlight.current = true;
      const name = handle(target.nickname);
      blockUser(userId, target.id)
        .then(() => {
          afterBlock(queryClient, userId, target.id);
          showToast(`Blocked ${name}`);
          onBlocked?.(target.id);
        })
        .catch((error: unknown) =>
          Alert.alert(`Could not block ${name}`, getErrorMessage(error), [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Retry', onPress: () => run(target, onBlocked) },
          ]),
        )
        .finally(() => {
          inFlight.current = false;
        });
    },
    [queryClient, userId, showToast],
  );

  return useCallback(
    (target: BlockTarget, onBlocked?: (authorId: string) => void) => {
      // Deleted accounts cannot be blocked (the menus already hide it).
      if (isDeletedAuthor(target.nickname)) return;
      const name = handle(target.nickname);
      Alert.alert(
        `Block ${name}?`,
        "You won't see their posts, comments or listings, and they won't be told. You can unblock anytime in Settings → Blocked users.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: () => run(target, onBlocked) },
        ],
      );
    },
    [run],
  );
}
