import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

import { getErrorMessage } from '@/lib/errors';
import { getGoogleIdToken, signOutOfGoogle } from '@/lib/googleSignIn';
import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { logOutLocallyFirst } from '@/lib/sessionRules';
import { encryptedSessionStorage, SUPABASE_SESSION_KEY } from '@/lib/sessionStorage';
import { SESSION_STORAGE_KEY, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/** Logs the real Auth error (dev only, redacted) and returns it for rethrowing. */
function authFail(scope: string, error: unknown): unknown {
  logError(`auth.${scope}`, error);
  return error;
}

// Actions set the store directly (not only via onAuthStateChange) so route
// guards flip before the caller navigates.
function applySession(session: Session | null) {
  useAuthStore.getState().setSession(session);
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw authFail('signIn', error);
  applySession(data.session);
}

export async function signUpWithEmail(params: { email: string; password: string; nickname: string }) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      // handle_new_user() validates and stores the nickname.
      data: { nickname: params.nickname, terms_accepted_at: new Date().toISOString() },
    },
  });
  if (error) throw authFail('signUp', error);
  // With email confirmation on, an already-registered email returns a fake user with no identities.
  if (data.user && data.user.identities?.length === 0) throw new Error('user_already_exists');
  if (data.session) applySession(data.session);
  return { needsVerification: data.session === null };
}

export type OtpPurpose = 'signup' | 'recovery';

export async function verifyEmailOtp(email: string, token: string, type: OtpPurpose) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
  if (error) throw authFail('verifyOtp', error);
  applySession(data.session);
}

export async function resendOtp(email: string, type: OtpPurpose) {
  const { error } =
    type === 'signup'
      ? await supabase.auth.resend({ type: 'signup', email })
      : await supabase.auth.resetPasswordForEmail(email);
  if (error) throw authFail('resendOtp', error);
}

export async function sendPasswordResetOtp(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw authFail('sendPasswordReset', error);
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw authFail('updatePassword', error);
}

export type GoogleSignInOutcome =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

/**
 * Native Google account picker, then its ID token is exchanged for a Supabase session.
 * Never throws. A new account has no nickname yet, so the root layout shows choose-nickname.
 */
export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  try {
    const result = await getGoogleIdToken();
    if (result.type === 'cancelled') return { status: 'cancelled' };
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: result.idToken });
    if (error) throw authFail('googleIdToken', error);
    applySession(data.session);
    return { status: 'success' };
  } catch (error) {
    return { status: 'failed', message: getErrorMessage(error) };
  }
}

// Set while the app itself signs out, so the SIGNED_OUT it causes is not read as a forced one.
let intentionalSignOut = false;
export const isIntentionalSignOut = () => intentionalSignOut;

async function signOutLocally() {
  intentionalSignOut = true;
  try {
    // 'local' signs out this device only.
    return await supabase.auth.signOut({ scope: 'local' });
  } finally {
    intentionalSignOut = false;
  }
}

/** Caches that belong to the signed-in person; also cleared on every SIGNED_OUT. */
export function clearMemberCaches() {
  for (const key of ['profile', 'notifications', 'notifications-unread', 'trending', 'polls', 'listings', 'my-settings', 'profile-details', 'reactors']) {
    queryClient.removeQueries({ queryKey: [key] });
  }
}

const REVOKE_TIMEOUT_MS = 5000;

/**
 * Log out (Profile, choose-nickname). The person is a guest at once and the phone keeps no session,
 * even offline or when the server call fails or hangs. Never throws.
 */
export async function logOut(): Promise<void> {
  // Taken before the local clear: the revocation needs it and the clear removes it.
  const accessToken = useAuthStore.getState().session?.access_token ?? null;
  intentionalSignOut = true;
  try {
    await logOutLocallyFirst({
      // The request signOut({ scope: 'local' }) makes: ends this session and its refresh token on the server.
      revoke: async () => {
        if (!accessToken) return;
        const { error } = await supabase.auth.admin.signOut(accessToken, 'local');
        if (error) throw error;
      },
      becomeGuest: () => {
        applySession(null);
        clearMemberCaches();
      },
      clearLocal: async () => {
        await removeStoredSession().catch((error: unknown) => logError('auth.logOut.clear', error));
        // With nothing stored, signOut makes no request: it resets the client and emits SIGNED_OUT.
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) logError('auth.logOut.local', error);
      },
      onRevokeFailed: (error) => logError('auth.logOut.revoke', error),
      timeoutMs: REVOKE_TIMEOUT_MS,
    });
  } finally {
    intentionalSignOut = false;
  }
  void signOutOfGoogle();
}

const isStoredSession = (value: unknown): value is Session =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Partial<Session>).access_token === 'string' &&
  typeof (value as Partial<Session>).refresh_token === 'string' &&
  typeof (value as Partial<Session>).user?.id === 'string';

/** The stored session as it is, even with an expired access token (see restoreOutcome). */
export async function readStoredSession(): Promise<Session | null> {
  try {
    const raw = await encryptedSessionStorage.getItem(SESSION_STORAGE_KEY);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    return isStoredSession(value) ? value : null;
  } catch (error) {
    logError('auth.readStoredSession', error);
    return null;
  }
}

async function removeStoredSession(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await Promise.all(keys.filter((k) => SUPABASE_SESSION_KEY.test(k)).map(encryptedSessionStorage.removeItem));
}

/**
 * After delete_my_account (or when the server says the account is already gone).
 * The order matters: the app becomes a guest FIRST, so nothing sees a signed-in profile
 * with no nickname (which would route to choose-nickname). Then the local session goes,
 * and with it everything this account left on the phone.
 */
export async function forgetDeletedAccount(userId: string): Promise<void> {
  applySession(null);
  // The server user no longer exists. Supabase drops the local session on 401/403/404,
  // but keeps it when the request fails (offline), so then the key is removed directly.
  const { error } = await signOutLocally();
  if (error) {
    logError('auth.forgetDeletedAccount.signOut', error);
    await removeStoredSession();
  }
  void signOutOfGoogle();
  // Every cache keyed by this user (profile, settings, My Posts, blocks, their feed copy…).
  queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(userId) });
  // Drafts and the avatar tip are stored per user id.
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.includes(userId)));
}
