import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { logError } from '@/lib/log';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

WebBrowser.maybeCompleteAuthSession();

/**
 * unmconfessions://oauth-callback in a build, exp://<host>/--/oauth-callback in Expo Go.
 * Both must be in Supabase Auth > URL Configuration > Redirect URLs.
 */
export const OAUTH_REDIRECT_URL = Linking.createURL('oauth-callback');

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

/** Returns false if the user closed the browser; throws on real failures. */
export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) throw authFail('googleOAuth', error);

  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_URL);
  if (result.type !== 'success') return false;

  const { queryParams } = Linking.parse(result.url);
  const oauthError = queryParams?.error_description ?? queryParams?.error;
  if (typeof oauthError === 'string') throw new Error(oauthError);
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error('Google sign-in did not return a code.');

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw authFail('googleExchange', exchange.error);
  applySession(exchange.data.session);
  return true;
}

export async function signOut() {
  // 'local' signs out this device only.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw authFail('signOut', error);
  applySession(null);
}

// Supabase keeps the session under sb-<project>-auth-token (and a PKCE verifier next to it).
const SUPABASE_SESSION_KEY = /^sb-.+-auth-token/;

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
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    logError('auth.forgetDeletedAccount.signOut', error);
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => SUPABASE_SESSION_KEY.test(k)));
  }
  // Every cache keyed by this user (profile, settings, My Posts, blocks, their feed copy…).
  queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(userId) });
  // Drafts and the avatar tip are stored per user id.
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.includes(userId)));
}
