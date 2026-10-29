import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type Profile, profileQueryKey } from '@/hooks/useProfile';
import { invalidateAuthoredLists } from '@/lib/authoredLists';
import { removeCustomAvatar } from '@/lib/avatarStorage';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/** profiles.avatar_key is the one profile column members may update. A custom key needs its file uploaded first. */
export async function saveAvatarKey(userId: string, avatarKey: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_key: avatarKey }).eq('id', userId);
  if (error) throw error;
}

/**
 * Optimistically sets a preset avatar. On success every list showing the member's avatar
 * refetches, and a custom picture it replaces is deleted (best effort).
 */
export function useUpdateAvatar() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  return useMutation({
    mutationFn: async (avatarKey: string) => {
      if (!userId) throw new Error('not_authenticated');
      await saveAvatarKey(userId, avatarKey);
    },
    onMutate: async (avatarKey) => {
      if (!userId) return { previous: undefined };
      const key = profileQueryKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Profile>(key);
      if (previous) queryClient.setQueryData<Profile>(key, { ...previous, avatar_key: avatarKey });
      return { previous };
    },
    onError: (_error, _key, context) => {
      if (userId && context?.previous) queryClient.setQueryData(profileQueryKey(userId), context.previous);
    },
    onSuccess: (_data, avatarKey, context) => {
      invalidateAuthoredLists(queryClient);
      const replaced = context?.previous?.avatar_key;
      if (userId && replaced !== avatarKey) void removeCustomAvatar(userId, replaced);
    },
    onSettled: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
    },
  });
}
