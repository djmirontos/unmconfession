import { skipToken, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Tables } from '@/types/database';

export type Profile = Pick<Tables<'profiles'>, 'id' | 'nickname' | 'avatar_key'>;

export const profileQueryKey = (userId: string) => ['profile', userId] as const;

async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_key')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

/** The signed-in user's profile. Persisted, so returning members see it instantly. */
export function useProfile() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: profileQueryKey(userId ?? ''),
    queryFn: userId ? () => fetchProfile(userId) : skipToken,
  });
}

export type MembershipStatus = 'guest' | 'loading' | 'error' | 'needs-nickname' | 'member';

/**
 * guest: no session. needs-nickname: signed in (e.g. Google) but no nickname yet.
 * error: the profile could not be loaded and nothing is cached (retry with `retry`).
 */
export function useMembership() {
  const session = useAuthStore((s) => s.session);
  const profile = useProfile();
  const { refetch } = profile;

  let status: MembershipStatus;
  if (!session) status = 'guest';
  else if (!profile.data) status = profile.isError || profile.fetchStatus === 'paused' ? 'error' : 'loading';
  else if (profile.data.nickname === null) status = 'needs-nickname';
  else status = 'member';

  const retry = useCallback(() => void refetch(), [refetch]);
  return { status, session, profile: profile.data ?? null, retry };
}

/** Whether the signed-in user has accepted the Terms (email sign-ups did so on the form). */
export function useTermsAccepted() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: ['terms-accepted', userId ?? ''],
    queryFn: userId
      ? async () => {
          const { data, error } = await supabase
            .from('user_flags')
            .select('terms_accepted_at')
            .eq('user_id', userId)
            .single();
          if (error) throw error;
          return data.terms_accepted_at !== null;
        }
      : skipToken,
  });
}
