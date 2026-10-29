import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getRandomBytes } from 'expo-crypto';

import { saveAvatarKey } from '@/hooks/useUpdateAvatar';
import { type Profile, profileQueryKey } from '@/hooks/useProfile';
import { invalidateAuthoredLists } from '@/lib/authoredLists';
import { newAvatarKey } from '@/lib/avatar';
import { listOwnAvatarFiles, pruneOwnAvatarFiles, removeAvatarFiles, removeCustomAvatar, uploadAvatarFile } from '@/lib/avatarStorage';
import { logError } from '@/lib/log';
import { processAvatarPhoto } from '@/lib/photos/avatarPhoto';
import { useAuthStore } from '@/stores/authStore';

type Input = { sourceUri: string; currentKey: string | null };

/**
 * A picked (already square-cropped) photo becomes the member's profile picture:
 * process, check the connection and make room, upload under a new key, save the key,
 * then delete the picture it replaced. A failed save removes the new file again.
 */
export function useAvatarPhoto() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  return useMutation({
    mutationFn: async ({ sourceUri, currentKey }: Input) => {
      if (!userId) throw new Error('not_authenticated');
      const localUri = await processAvatarPhoto(sourceUri);

      // The first request: offline stops here, before anything has changed.
      let names: string[] = [];
      try {
        names = await listOwnAvatarFiles(userId);
      } catch (error) {
        if (error instanceof Error && error.message === 'network_error') throw error;
      }
      await pruneOwnAvatarFiles(userId, currentKey, names);

      const key = newAvatarKey(getRandomBytes);
      await uploadAvatarFile(localUri, userId, key);
      try {
        await saveAvatarKey(userId, key);
      } catch (error) {
        logError('avatar.save', error);
        await removeAvatarFiles(userId, [`${key}.jpg`]);
        throw error;
      }
      return key;
    },
    onSuccess: (key, { currentKey }) => {
      if (!userId) return;
      const profile = queryClient.getQueryData<Profile>(profileQueryKey(userId));
      if (profile) queryClient.setQueryData<Profile>(profileQueryKey(userId), { ...profile, avatar_key: key });
      invalidateAuthoredLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
      void removeCustomAvatar(userId, currentKey);
    },
  });
}
