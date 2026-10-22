import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type Profile, profileQueryKey } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/** Optimistically sets profiles.avatar_key (the one profile column members may update). */
export function useUpdateAvatar() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  return useMutation({
    mutationFn: async (avatarKey: string) => {
      if (!userId) throw new Error('not_authenticated');
      const { error } = await supabase.from('profiles').update({ avatar_key: avatarKey }).eq('id', userId);
      if (error) throw error;
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
    onSettled: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
    },
  });
}
