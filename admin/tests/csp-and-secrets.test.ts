import { describe, expect, it } from 'vitest';

import { buildCsp, createNonce } from '@/lib/csp';
import { findServiceRoleMentions } from '../scripts/check-secrets.mjs';

describe('buildCsp', () => {
  const prod = buildCsp({ nonce: 'abc', supabaseUrl: 'https://xyz.supabase.co/rest/v1', isDev: false });

  it('locks the page down', () => {
    for (const directive of [
      "default-src 'self'",
      "script-src 'self' 'nonce-abc' 'strict-dynamic'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ]) {
      expect(prod).toContain(directive);
    }
    expect(prod).not.toContain('unsafe-eval');
  });

  it('allows images from the Supabase origin only (no path)', () => {
    expect(prod).toContain("img-src 'self' data: https://xyz.supabase.co;");
  });

  it('adds unsafe-eval only in development', () => {
    expect(buildCsp({ nonce: 'n', supabaseUrl: undefined, isDev: true })).toContain("'unsafe-eval'");
  });

  it('survives a missing or invalid Supabase URL', () => {
    expect(buildCsp({ nonce: 'n', supabaseUrl: 'not a url', isDev: false })).toContain("img-src 'self' data:;");
  });

  it('creates unique base64 nonces', () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(createNonce());
  });
});

describe('no service-role key in the admin app', () => {
  it('finds no references', () => {
    expect(findServiceRoleMentions()).toEqual([]);
  });
});
