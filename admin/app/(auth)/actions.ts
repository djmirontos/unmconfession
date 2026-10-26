'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getAuthState } from '@/lib/auth';
import { afterPassword, redirectFor, verifiedTotpFactorId } from '@/lib/auth-flow';
import { codeFromError } from '@/lib/errors';
import { type ActionResult, fail, ok } from '@/lib/result';
import { ACTIVITY_COOKIE, ACTIVITY_COOKIE_MAX_AGE_S, serializeActivity } from '@/lib/session';
import { hardenCookie } from '@/lib/supabase/cookies';
import { createClient } from '@/lib/supabase/server';

type FormState = ActionResult | null;

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});

const codeSchema = z.string().trim().regex(/^\d{6}$/);

async function startActivityWindow() {
  const now = Date.now();
  (await cookies()).set(
    ACTIVITY_COOKIE,
    serializeActivity({ start: now, last: now }),
    hardenCookie({ maxAge: ACTIVITY_COOKIE_MAX_AGE_S }),
  );
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  // Same message for a malformed email as for a wrong password: no hints either way.
  if (!parsed.success) return fail('invalid_login');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const code = codeFromError(error);
    return fail(code === 'rate_limited' || code === 'network' ? code : 'invalid_login');
  }
  // Factors come from a validated getUser() on the new session, not from the sign-in
  // response. Not the cached getValidatedUser(): the session changed during this request.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return fail('unknown');

  // Only active moderators and admins may continue to the authenticator step.
  const staff = await supabase.rpc('is_staff');
  if (staff.error || staff.data !== true) {
    await supabase.auth.signOut({ scope: 'local' });
    return fail(staff.error ? 'unknown' : 'no_panel_access');
  }

  await startActivityWindow();
  redirect(afterPassword(verifiedTotpFactorId(userData.user.factors) !== null));
}

export async function verifyCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = codeSchema.safeParse(formData.get('code'));
  if (!code.success) return fail('invalid_code');

  const state = await getAuthState();
  if (state.kind !== 'needs-code') redirect(redirectFor(state.kind, 'verify') ?? '/login');

  // The factor comes from the validated user, never from the form.
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: code.data });
  if (error) return fail(codeFromError(error) === 'rate_limited' ? 'rate_limited' : 'code_incorrect');

  redirect('/');
}

export type EnrollmentData = { factorId: string; qrCode: string; secret: string };

export async function startEnrollment(): Promise<ActionResult<EnrollmentData> | null> {
  const state = await getAuthState();
  if (state.kind !== 'needs-enrollment') redirect(redirectFor(state.kind, 'enroll') ?? '/login');

  const supabase = await createClient();
  const staff = await supabase.rpc('is_staff');
  if (staff.data !== true) redirect('/403');

  // An earlier, abandoned setup leaves an unverified factor behind: remove it first.
  for (const factor of state.user.factors ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Moderation panel',
    issuer: 'UNM Freedom Confessions',
  });
  if (error || !data) return fail('enroll_failed');
  return ok({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
}

const confirmSchema = z.object({ factorId: z.uuid(), code: codeSchema });

export async function confirmEnrollment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = confirmSchema.safeParse({ factorId: formData.get('factorId'), code: formData.get('code') });
  if (!parsed.success) return fail('invalid_code');

  const state = await getAuthState();
  if (state.kind !== 'needs-enrollment') redirect(redirectFor(state.kind, 'enroll') ?? '/login');
  // Only a pending factor of this same user can be confirmed.
  const owned = state.user.factors?.some(
    (f) => f.id === parsed.data.factorId && f.factor_type === 'totp' && f.status === 'unverified',
  );
  if (!owned) return fail('enroll_failed');

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) return fail(codeFromError(error) === 'rate_limited' ? 'rate_limited' : 'code_incorrect');

  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(ACTIVITY_COOKIE);
  redirect('/login?reason=signed_out');
}
