import { useEffect } from 'react';

import { clearMemberCaches, isIntentionalSignOut, readStoredSession } from '@/lib/auth';
import { SESSION_ENDED } from '@/lib/errors';
import { logError } from '@/lib/log';
import { isForcedSignOut, restoreOutcome } from '@/lib/sessionRules';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

/**
 * Resolves the persisted session in the background and keeps the store in sync.
 * Call once, from the root layout. The UI renders as a guest until it resolves.
 * There is no inactivity limit: only Log out, account deletion or Supabase rejecting the
 * refresh token ends a session.
 */
export function useAuthBootstrap() {
  useEffect(() => {
    const { setSession, markRestored } = useAuthStore.getState();
    // Once Supabase reports a change, it is newer than whatever the launch read returns.
    let changed = false;

    const restore = async () => {
      const { data, error } = await supabase.auth.getSession();
      const outcome = restoreOutcome(data.session !== null, error);
      if (outcome === 'session') return data.session;
      // Offline with an expired access token: auto-refresh retries and sends TOKEN_REFRESHED.
      return outcome === 'keep-stored' ? readStoredSession() : null;
    };
    restore()
      .then((session) => {
        if (!changed) setSession(session);
      })
      .catch((error: unknown) => logError('auth.restore', error))
      .finally(markRestored);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // The launch state comes from restore(), which also covers the offline case.
      if (event === 'INITIAL_SESSION') return;
      // A refresh that finishes while Log out runs must not sign the person back in.
      if (isIntentionalSignOut() && event !== 'SIGNED_OUT') return;
      changed = true;
      const hadSession = useAuthStore.getState().session !== null;
      setSession(session);
      if (event === 'SIGNED_OUT') {
        if (isForcedSignOut(event, hadSession, isIntentionalSignOut())) useToastStore.getState().show(SESSION_ENDED);
        clearMemberCaches();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
