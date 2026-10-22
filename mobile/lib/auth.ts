import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

WebBrowser.maybeCompleteAuthSession();

/**
 * unmconfessions://oauth-callback in a build, exp://<host>/--/oauth-callback in Expo Go.
 * Both must be in Supabase Auth > URL Configuration > Redirect URLs.
 */
export const OAUTH_REDIRECT_URL = Linking.createURL('oauth-callback');

// Actions set the store directly (not only via onAuthStateChange) so route
// guards flip before the caller navigates.
function applySession(session: Session | null) {
  useAuthStore.getState().setSession(session);
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
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
  if (error) throw error;
  // With email confirmation on, an already-registered email returns a fake user with no identities.
  if (data.user && data.user.identities?.length === 0) throw new Error('user_already_exists');
  if (data.session) applySession(data.session);
  return { needsVerification: data.session === null };
}

export type OtpPurpose = 'signup' | 'recovery';

export async function verifyEmailOtp(email: string, token: string, type: OtpPurpose) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
  if (error) throw error;
  applySession(data.session);
}

export async function resendOtp(email: string, type: OtpPurpose) {
  const { error } =
    type === 'signup'
      ? await supabase.auth.resend({ type: 'signup', email })
      : await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function sendPasswordResetOtp(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Returns false if the user closed the browser; throws on real failures. */
export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_URL);
  if (result.type !== 'success') return false;

  const { queryParams } = Linking.parse(result.url);
  const oauthError = queryParams?.error_description ?? queryParams?.error;
  if (typeof oauthError === 'string') throw new Error(oauthError);
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error('Google sign-in did not return a code.');

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw exchange.error;
  applySession(exchange.data.session);
  return true;
}

export async function signOut() {
  // 'local' signs out this device only.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  applySession(null);
}
