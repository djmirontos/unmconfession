import { useEffect } from 'react';

import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/**
 * Resolves the persisted session in the background and keeps the store in sync.
 * Call once, from the root layout. The UI renders as a guest until it resolves.
 */
export function useAuthBootstrap() {
  useEffect(() => {
    const { setSession, markRestored } = useAuthStore.getState();

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((error: unknown) => logError('auth.restore', error))
      .finally(markRestored);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({ queryKey: ['profile'] });
        queryClient.removeQueries({ queryKey: ['notifications'] });
        queryClient.removeQueries({ queryKey: ['notifications-unread'] });
        queryClient.removeQueries({ queryKey: ['trending'] });
        queryClient.removeQueries({ queryKey: ['polls'] });
        queryClient.removeQueries({ queryKey: ['listings'] });
        queryClient.removeQueries({ queryKey: ['my-settings'] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
