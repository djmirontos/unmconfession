import { useEffect } from 'react';

import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/**
 * Resolves the persisted session in the background and keeps the store in sync.
 * Call once, from the root layout. The UI renders as a guest until it resolves.
 */
export function useAuthBootstrap() {
  useEffect(() => {
    const { setSession } = useAuthStore.getState();

    void supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({ queryKey: ['profile'] });
        queryClient.removeQueries({ queryKey: ['notifications'] });
        queryClient.removeQueries({ queryKey: ['notifications-unread'] });
        queryClient.removeQueries({ queryKey: ['trending'] });
        queryClient.removeQueries({ queryKey: ['polls'] });
        queryClient.removeQueries({ queryKey: ['listings'] });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
