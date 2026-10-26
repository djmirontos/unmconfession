import { describe, expect, it } from 'vitest';

import { codeFromError, messageFor } from '@/lib/errors';
import { fail, ok } from '@/lib/result';

describe('codeFromError', () => {
  it('reads codes raised by the RPCs (Postgrest puts them in message)', () => {
    for (const code of ['forbidden', 'not_found', 'account_deleted', 'cannot_target_self', 'cannot_target_admin', 'account_not_restricted', 'reason_required']) {
      expect(codeFromError({ code: 'P0001', message: code })).toBe(code);
    }
  });

  it('maps permission errors by SQLSTATE', () => {
    expect(codeFromError({ code: '42501', message: 'permission denied for function x' })).toBe('forbidden');
  });

  it('keeps every sign-in failure generic', () => {
    for (const code of ['invalid_credentials', 'email_not_confirmed', 'user_not_found', 'user_banned']) {
      expect(codeFromError({ name: 'AuthApiError', code, message: 'x' })).toBe('invalid_login');
    }
  });

  it('maps MFA and rate-limit errors', () => {
    expect(codeFromError({ code: 'mfa_verification_failed', message: 'x' })).toBe('code_incorrect');
    expect(codeFromError({ code: 'over_request_rate_limit', message: 'x' })).toBe('rate_limited');
  });

  it('recognises network failures', () => {
    expect(codeFromError({ name: 'AuthRetryableFetchError', message: 'fetch failed' })).toBe('network');
    expect(codeFromError(new TypeError('fetch failed'))).toBe('network');
  });

  it('falls back to unknown', () => {
    expect(codeFromError(null)).toBe('unknown');
    expect(codeFromError('boom')).toBe('unknown');
    expect(codeFromError({ message: 'duplicate key value violates unique constraint' })).toBe('unknown');
  });
});

describe('messages', () => {
  it('never reveals whether an email exists', () => {
    expect(messageFor('invalid_login')).toBe('Email or password is incorrect.');
  });

  it('has a fallback for unknown codes', () => {
    expect(messageFor('no_such_code')).toBe(messageFor('unknown'));
  });

  it('builds typed results', () => {
    expect(ok({ n: 1 })).toEqual({ ok: true, data: { n: 1 } });
    expect(fail('forbidden')).toEqual({ ok: false, code: 'forbidden', message: messageFor('forbidden') });
  });
});
