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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export type LogOutSteps = {
  /** Server revocation of this session's refresh token. */
  revoke: () => Promise<void>;
  becomeGuest: () => void;
  /** Must not need the network. */
  clearLocal: () => Promise<void>;
  onRevokeFailed: (error: unknown) => void;
  timeoutMs: number;
};

/**
 * Log out clears the phone whatever the network does. The revocation starts first but runs in the
 * background with a time limit; a failure only reaches onRevokeFailed. Returns the background
 * revocation so tests can wait for it.
 */
export async function logOutLocallyFirst(steps: LogOutSteps): Promise<{ revoked: Promise<void> }> {
  let started: Promise<void>;
  try {
    started = steps.revoke();
  } catch (error) {
    started = Promise.reject(error);
  }
  const revoked = withTimeout(started, steps.timeoutMs).catch(steps.onRevokeFailed);
  steps.becomeGuest();
  await steps.clearLocal();
  return { revoked };
}
