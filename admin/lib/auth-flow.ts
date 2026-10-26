// Where each sign-in state may go. Pure, so the redirect rules are unit-tested; lib/auth.ts,
// the sign-in pages and the Server Actions all use it.

export type AuthStateKind = 'signed-out' | 'needs-enrollment' | 'needs-code' | 'expired' | 'verified';

/** The page being rendered: the three sign-in steps, or any panel page. */
export type AuthPage = 'login' | 'verify' | 'enroll' | 'panel';

const STEP_FOR: Record<Exclude<AuthStateKind, 'verified' | 'signed-out' | 'expired'>, string> = {
  'needs-enrollment': '/security/enroll',
  'needs-code': '/login/verify',
};

const PAGE_FOR_STATE: Partial<Record<AuthStateKind, AuthPage>> = {
  'signed-out': 'login',
  'needs-enrollment': 'enroll',
  'needs-code': 'verify',
  verified: 'panel',
};

/** Redirect target for this state on this page, or null to render the page. */
export function redirectFor(state: AuthStateKind, page: AuthPage): string | null {
  if (PAGE_FOR_STATE[state] === page) return null;
  switch (state) {
    case 'signed-out':
      return '/login';
    // Signs out first (Server Components cannot clear cookies), then lands on /login.
    case 'expired':
      return '/auth/expired';
    case 'verified':
      return '/';
    default:
      return STEP_FOR[state];
  }
}

type Factor = { id: string; factor_type: string; status: string };

export type DerivedState =
  | { kind: 'expired' }
  | { kind: 'needs-enrollment' }
  | { kind: 'needs-code'; factorId: string }
  | { kind: 'verified'; factorId: string };

/** The id of the user's verified TOTP factor, from the validated user (never from a form or the session cookie). */
export function verifiedTotpFactorId(factors: readonly Factor[] | undefined): string | null {
  return factors?.find((f) => f.factor_type === 'totp' && f.status === 'verified')?.id ?? null;
}

/**
 * The sign-in state from validated inputs only: the user's factors (getUser()) and the
 * token's aal / amr claims (getClaims()). `tooOld` is the 12-hour check on amr.
 */
export function deriveAuthState(input: {
  factors: readonly Factor[] | undefined;
  aal: string | undefined;
  tooOld: boolean;
}): DerivedState {
  if (input.tooOld) return { kind: 'expired' };
  const factorId = verifiedTotpFactorId(input.factors);
  if (!factorId) return { kind: 'needs-enrollment' };
  if (input.aal !== 'aal2') return { kind: 'needs-code', factorId };
  return { kind: 'verified', factorId };
}

/** After a correct password: the code step if an authenticator is set up, otherwise set-up. */
export function afterPassword(hasVerifiedTotp: boolean): string {
  return hasVerifiedTotp ? '/login/verify' : '/security/enroll';
}
