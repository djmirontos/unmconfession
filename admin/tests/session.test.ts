import { describe, expect, it } from 'vitest';

import {
  ABSOLUTE_LIMIT_MS,
  checkActivity,
  IDLE_LIMIT_MS,
  parseActivity,
  serializeActivity,
  sessionTooOld,
  timeoutMessage,
} from '@/lib/session';

const NOW = 1_800_000_000_000;

describe('activity cookie', () => {
  it('round-trips', () => {
    const a = { start: NOW - 1000, last: NOW };
    expect(parseActivity(serializeActivity(a))).toEqual(a);
  });

  it.each([undefined, '', 'abc', '1.2', `${NOW}`, `${NOW}.${NOW - 1}`, `${NOW}.${NOW}.1`])('rejects %s', (value) => {
    expect(parseActivity(value)).toBeNull();
  });
});

describe('checkActivity', () => {
  it('starts a window when there is no cookie', () => {
    expect(checkActivity(null, NOW)).toEqual({ kind: 'ok', next: { start: NOW, last: NOW } });
  });

  it('keeps the start and moves last on activity', () => {
    const r = checkActivity({ start: NOW - 60_000, last: NOW - 1000 }, NOW);
    expect(r).toEqual({ kind: 'ok', next: { start: NOW - 60_000, last: NOW } });
  });

  it('allows exactly 30 minutes idle and expires after', () => {
    expect(checkActivity({ start: NOW - IDLE_LIMIT_MS, last: NOW - IDLE_LIMIT_MS }, NOW).kind).toBe('ok');
    expect(checkActivity({ start: NOW - IDLE_LIMIT_MS - 1, last: NOW - IDLE_LIMIT_MS - 1 }, NOW)).toEqual({
      kind: 'expired',
      reason: 'idle',
    });
  });

  it('expires after 12 hours even when active', () => {
    expect(checkActivity({ start: NOW - ABSOLUTE_LIMIT_MS - 1, last: NOW - 1000 }, NOW)).toEqual({
      kind: 'expired',
      reason: 'expired',
    });
  });

  it('treats timestamps in the future as tampering', () => {
    expect(checkActivity({ start: NOW, last: NOW + 60_000 }, NOW).kind).toBe('expired');
  });
});

describe('sessionTooOld (from the token amr claim)', () => {
  const seconds = (ms: number) => Math.floor(ms / 1000);

  it('accepts a recent password sign-in', () => {
    expect(sessionTooOld([{ method: 'password', timestamp: seconds(NOW - 3_600_000) }, { method: 'totp', timestamp: seconds(NOW) }], NOW)).toBe(false);
  });

  it('rejects a sign-in older than 12 hours', () => {
    expect(sessionTooOld([{ method: 'password', timestamp: seconds(NOW - ABSOLUTE_LIMIT_MS) - 1 }], NOW)).toBe(true);
  });

  it('rejects sessions without a password entry or with the string format', () => {
    expect(sessionTooOld([{ method: 'oauth', timestamp: seconds(NOW) }], NOW)).toBe(true);
    expect(sessionTooOld(['password'], NOW)).toBe(true);
  });
});

describe('timeoutMessage', () => {
  it('knows the three reasons and ignores anything else', () => {
    expect(timeoutMessage('idle')).toMatch(/30 minutes/);
    expect(timeoutMessage('expired')).toMatch(/12-hour/);
    expect(timeoutMessage('signed_out')).toMatch(/signed out/);
    expect(timeoutMessage('<script>')).toBeNull();
    expect(timeoutMessage(undefined)).toBeNull();
  });
});
