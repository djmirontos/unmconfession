import 'server-only';

import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { type AuthPage, type AuthStateKind, deriveAuthState, redirectFor } from '@/lib/auth-flow';
import { sessionTooOld } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type Role = Database['public']['Enums']['app_role'];

export type AuthState = (
  | { kind: 'signed-out' }
  /** Password accepted, no verified authenticator yet: must enrol. */
  | { kind: 'needs-enrollment'; user: User }
  /** Password accepted, authenticator enrolled: must enter the code. */
  | { kind: 'needs-code'; user: User; factorId: string }
  /** Past the 12-hour absolute limit. */
  | { kind: 'expired' }
  | { kind: 'verified'; user: User }
) & { kind: AuthStateKind };

export type StaffContext = {
  userId: string;
  nickname: string | null;
  role: Role;
  isAdmin: boolean;
};

/**
 * The signed-in user, validated by Supabase Auth (one call per request). User fields
 * (factors, email, metadata) are only ever read from this: the session cookie holds tokens
 * only, so the session's `user` is a placeholder that throws on access.
 */
export const getValidatedUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
});

/**
 * Where this browser's session stands: the validated user's factors plus the aal / amr
 * claims from getClaims() (signature checked, or confirmed with Supabase Auth).
 * Not mfa.getAuthenticatorAssuranceLevel(): without a token argument it reads session.user.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const user = await getValidatedUser();
  if (!user) return { kind: 'signed-out' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { kind: 'signed-out' };
  const { aal, amr = [] } = data.claims;
  // The claims and the user must describe the same account.
  if (data.claims.sub !== user.id) return { kind: 'signed-out' };

  const derived = deriveAuthState({ factors: user.factors, aal, tooOld: sessionTooOld(amr, Date.now()) });
  switch (derived.kind) {
    case 'expired':
      return { kind: 'expired' };
    case 'needs-enrollment':
      return { kind: 'needs-enrollment', user };
    case 'needs-code':
      return { kind: 'needs-code', user, factorId: derived.factorId };
    case 'verified':
      return { kind: 'verified', user };
  }
});

/** Sign-in pages: send the visitor to the right step unless this page is it. Returns the state. */
export async function routeAuthPage(page: Exclude<AuthPage, 'panel'>): Promise<AuthState> {
  const state = await getAuthState();
  const target = redirectFor(state.kind, page);
  if (target) redirect(target);
  return state;
}

/** Sends the visitor to the next sign-in step if they are not fully signed in. */
async function requireVerified(): Promise<User> {
  const state = await getAuthState();
  if (state.kind === 'verified') return state.user;
  return redirect(redirectFor(state.kind, 'panel') ?? '/login');
}

/**
 * Every panel page and Server Action calls this (cached per request). Signed in with the
 * authenticator code (aal2) and an active moderator or admin; anything else is redirected.
 */
export const requireStaff = cache(async (): Promise<StaffContext> => {
  const user = await requireVerified();
  const supabase = await createClient();
  const [staff, admin, profile, flags] = await Promise.all([
    supabase.rpc('is_staff'),
    supabase.rpc('is_admin'),
    supabase.from('profiles').select('nickname').eq('id', user.id).maybeSingle(),
    supabase.from('user_flags').select('role').eq('user_id', user.id).maybeSingle(),
  ]);
  if (staff.error || admin.error) throw new Error('Could not check panel access.');
  if (staff.data !== true || !flags.data) redirect('/403');

  return {
    userId: user.id,
    nickname: profile.data?.nickname ?? null,
    role: flags.data.role,
    isAdmin: admin.data === true,
  };
});

export async function requireAdmin(): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (!ctx.isAdmin) redirect('/403');
  return ctx;
}
