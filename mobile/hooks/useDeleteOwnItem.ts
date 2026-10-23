import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

import { getErrorMessage } from '@/lib/errors';
import type { MyItem } from '@/lib/myPosts';
import { afterDelete, deleteOwnItem } from '@/lib/ownItems';
import { useToastStore } from '@/stores/toastStore';

/** Confirm, delete through the RPC, update caches, toast. `onDeleted` runs after success (e.g. go back). */
export function useDeleteOwnItem() {
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const inFlight = useRef(false);

  return useCallback(
    (item: Pick<MyItem, 'source' | 'id'>, onDeleted?: () => void) => {
      const noun = item.source === 'post' ? 'post' : 'listing';
      Alert.alert(`Delete this ${noun}?`, "It disappears right away and can't be undone.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (inFlight.current) return;
            inFlight.current = true;
            deleteOwnItem(item.source, item.id)
              .then(() => {
                afterDelete(queryClient, item.source, item.id);
                showToast('Deleted');
                onDeleted?.();
              })
              .catch((error: unknown) => Alert.alert(`Could not delete this ${noun}`, getErrorMessage(error)))
              .finally(() => {
                inFlight.current = false;
              });
          },
        },
      ]);
    },
    [queryClient, showToast],
  );
}
