// When a session survives and when it ends. No imports, so tests/sessionRules.test.mjs runs it in Node.
// Supabase Auth already keeps the stored session on network errors and drops it only when the
// refresh token is rejected; these rules keep the app's own state in line with that.

/** Supabase's AuthRetryableFetchError: offline, timed out, aborted, or HTTP 502/503/504. */
export function isRetryableAuthError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AuthRetryableFetchError';
}

export type RestoreOutcome = 'session' | 'keep-stored' | 'guest';

/**
 * Launch. getSession() returns no session when the stored access token has expired and the refresh
 * fails, even for a network error. The stored session is still there and auto-refresh retries it,
 * so the person stays signed in meanwhile ('keep-stored'). Any other failure means a guest.
 */
export function restoreOutcome(hasSession: boolean, error: unknown): RestoreOutcome {
  if (hasSession) return 'session';
  return isRetryableAuthError(error) ? 'keep-stored' : 'guest';
}

/** A sign-out the person did not ask for: Supabase rejected the refresh token or the session was revoked. */
export function isForcedSignOut(event: string, hadSession: boolean, intentional: boolean): boolean {
  return event === 'SIGNED_OUT' && hadSession && !intentional;
}
