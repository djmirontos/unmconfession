import { skipToken, useQuery } from '@tanstack/react-query';

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

export type MembershipStatus = 'guest' | 'loading' | 'needs-nickname' | 'member';

/** guest: no session. needs-nickname: signed in (e.g. Google) but no nickname yet. */
export function useMembership() {
  const session = useAuthStore((s) => s.session);
  const profile = useProfile();

  let status: MembershipStatus;
  if (!session) status = 'guest';
  else if (!profile.data) status = 'loading';
  else if (profile.data.nickname === null) status = 'needs-nickname';
  else status = 'member';

  return { status, session, profile: profile.data ?? null };
}
