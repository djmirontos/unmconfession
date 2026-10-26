// Idle and absolute session limits. Pure functions: the proxy and requireStaff() apply them.

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const ABSOLUTE_LIMIT_MS = 12 * 60 * 60 * 1000;
export const ACTIVITY_COOKIE = 'adm_activity';
export const ACTIVITY_COOKIE_MAX_AGE_S = ABSOLUTE_LIMIT_MS / 1000;

/** When the panel session started and when the last request came in (epoch ms). */
export type Activity = { start: number; last: number };

export type ActivityCheck =
  | { kind: 'ok'; next: Activity }
  | { kind: 'expired'; reason: 'idle' | 'expired' };

// Cookie value: "<start>.<last>".
export function parseActivity(value: string | undefined): Activity | null {
  if (!value) return null;
  const match = /^(\d{13})\.(\d{13})$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  const last = Number(match[2]);
  return last >= start ? { start, last } : null;
}

export function serializeActivity(activity: Activity): string {
  return `${activity.start}.${activity.last}`;
}

/**
 * A missing or unreadable cookie starts a new window (sign-in sets it; requireStaff() still
 * enforces the 12-hour limit from the token). Timestamps in the future count as tampering.
 */
export function checkActivity(previous: Activity | null, now: number): ActivityCheck {
  if (!previous) return { kind: 'ok', next: { start: now, last: now } };
  if (previous.start > now || previous.last > now) return { kind: 'expired', reason: 'expired' };
  if (now - previous.start > ABSOLUTE_LIMIT_MS) return { kind: 'expired', reason: 'expired' };
  if (now - previous.last > IDLE_LIMIT_MS) return { kind: 'expired', reason: 'idle' };
  return { kind: 'ok', next: { start: previous.start, last: now } };
}

type AmrEntry = { method: string; timestamp: number };

/**
 * Absolute limit from the validated access token: the "amr" claim records when the password
 * sign-in happened (seconds). Refreshing the token keeps that timestamp, so it marks the
 * session start. Unknown shapes count as expired.
 */
export function sessionTooOld(amr: readonly (AmrEntry | string)[], nowMs: number): boolean {
  const password = amr.find((entry): entry is AmrEntry => typeof entry === 'object' && entry.method === 'password');
  if (!password) return true;
  return nowMs - password.timestamp * 1000 > ABSOLUTE_LIMIT_MS;
}

export type TimeoutReason = 'idle' | 'expired' | 'signed_out';

export function timeoutMessage(reason: string | undefined): string | null {
  switch (reason) {
    case 'idle':
      return 'You were signed out after 30 minutes without activity.';
    case 'expired':
      return 'Your session reached its 12-hour limit. Sign in again.';
    case 'signed_out':
      return 'You have signed out.';
    default:
      return null;
  }
}
