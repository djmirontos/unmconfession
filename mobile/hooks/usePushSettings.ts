import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Database } from '@/types/database';

export type PushSettings = { enabled: boolean; comments: boolean; replies: boolean; deals: boolean; moderation: boolean; reactions: boolean };
export type PushSettingKey = keyof PushSettings;

// Under 'push-settings': not persisted, cleared on sign-out (clearMemberCaches).
export const pushSettingsKey = (userId: string) => ['push-settings', userId] as const;

// The server's defaults (no row yet): everything on except reactions.
const DEFAULTS: PushSettings = { enabled: true, comments: true, replies: true, deals: true, moderation: true, reactions: false };

/** Which push notifications the member wants (get_push_settings). */
export function usePushSettings() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: pushSettingsKey(userId ?? ''),
    queryFn: userId
      ? async (): Promise<PushSettings> => {
          const { data, error } = await supabase.rpc('get_push_settings');
          if (error) {
            logError('rpc.get_push_settings', error);
            throw error;
          }
          return data[0] ?? DEFAULTS;
        }
      : skipToken,
    staleTime: 60 * 1000,
  });
}

type SetArgs = Database['public']['Functions']['set_push_settings']['Args'];
const ARG: Record<PushSettingKey, keyof SetArgs> = {
  enabled: 'p_enabled',
  comments: 'p_comments',
  replies: 'p_replies',
  deals: 'p_deals',
  moderation: 'p_moderation',
  reactions: 'p_reactions',
};

/** Flips one switch: optimistic, rolled back on failure; the server's row is kept on success. */
export function useSetPushSetting() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const key = pushSettingsKey(userId ?? '');

  return useMutation({
    mutationFn: async ({ setting, on }: { setting: PushSettingKey; on: boolean }): Promise<PushSettings | null> => {
      // Only the switch that changed is sent; the others keep their value on the server.
      const args: SetArgs = { [ARG[setting]]: on };
      const { data, error } = await supabase.rpc('set_push_settings', args);
      if (error) {
        logError('rpc.set_push_settings', error);
        throw error;
      }
      return data[0] ?? null;
    },
    onMutate: async ({ setting, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PushSettings>(key);
      if (previous) queryClient.setQueryData<PushSettings>(key, { ...previous, [setting]: on });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (row) => {
      if (row) queryClient.setQueryData(key, row);
    },
  });
}
