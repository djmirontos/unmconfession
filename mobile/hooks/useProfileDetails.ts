import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { logError, logInfo } from '@/lib/log';
import { EMPTY_DETAILS, type MyProfileDetails, normalizeDetails, type ProfileDetails } from '@/lib/profileDetails';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// Under 'profile-details': not persisted, cleared on sign-out (clearMemberCaches).
export const myProfileDetailsKey = (userId: string) => ['profile-details', 'me', userId] as const;
export const profileDetailsKey = (viewerId: string, userId: string) => ['profile-details', viewerId, userId] as const;

/** My own details, shown or not; the defaults (switch off, all empty) when I never saved any. */
export function useMyProfileDetails() {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: myProfileDetailsKey(userId ?? ''),
    queryFn: userId
      ? async (): Promise<MyProfileDetails> => {
          const { data, error } = await supabase.rpc('get_my_profile_details');
          if (error) {
            logError('rpc.get_my_profile_details', error);
            throw error;
          }
          const row = data[0];
          if (!row) return EMPTY_DETAILS;
          return {
            show: row.show_details,
            college: row.college,
            course: row.course,
            yearLevel: row.year_level,
            hobbies: row.hobbies,
            about: row.about,
          };
        }
      : skipToken,
  });
}

/** Saves the whole form; afterwards the own copy and my public view of myself are fresh. */
export function useSaveProfileDetails() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  return useMutation({
    mutationFn: async (draft: MyProfileDetails): Promise<MyProfileDetails> => {
      const d = normalizeDetails(draft);
      // The database turns '' into null (the generated types do not allow null arguments).
      const { error } = await supabase.rpc('set_my_profile_details', {
        p_show: d.show,
        p_college: d.college ?? '',
        p_course: d.course ?? '',
        p_year_level: d.yearLevel ?? '',
        p_hobbies: d.hobbies ?? '',
        p_about: d.about ?? '',
      });
      if (error) {
        logError('rpc.set_my_profile_details', error);
        throw error;
      }
      logInfo('rpc.set_my_profile_details', 'ok');
      return d;
    },
    onSuccess: (saved) => {
      if (!userId) return;
      queryClient.setQueryData(myProfileDetailsKey(userId), saved);
      void queryClient.invalidateQueries({ queryKey: profileDetailsKey(userId, userId) });
    },
  });
}

/** Another member's shown details (get_profile_details), or null. `userId` null skips the query. */
export function useProfileDetails(userId: string | null) {
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  return useQuery({
    queryKey: profileDetailsKey(viewerId ?? '', userId ?? ''),
    queryFn:
      viewerId && userId
        ? async (): Promise<ProfileDetails | null> => {
            const { data, error } = await supabase.rpc('get_profile_details', { p_user: userId });
            if (error) {
              logError('rpc.get_profile_details', error);
              throw error;
            }
            const row = data[0];
            return row
              ? { college: row.college, course: row.course, yearLevel: row.year_level, hobbies: row.hobbies, about: row.about }
              : null;
          }
        : skipToken,
  });
}
