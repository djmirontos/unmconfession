import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The session cookie holds tokens only (encode: 'tokens-only'), so the session's `user` is a
// placeholder that throws on access. User fields must come from getUser(). This scan keeps
// session-based user reads out of the panel code.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN = ['app', 'lib', 'components', 'proxy.ts'];

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bgetSession\s*\(/, why: 'getSession() is not used in the panel; use getUser() / getClaims()' },
  { pattern: /\bsession\??\.user\b/, why: "the session's user is unavailable with tokens-only cookies" },
  { pattern: /\bdata\??\.session\??\.user\b/, why: 'user from a returned session' },
  { pattern: /getAuthenticatorAssuranceLevel\s*\(\s*\)/, why: 'without a token it reads session.user.factors; use getClaims()' },
];

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no user fields read from the session', () => {
  const sources = SCAN.flatMap(files)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ file: relative(ROOT, f), code: stripComments(readFileSync(f, 'utf8')) }));

  it('scans the panel source', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)('$why', ({ pattern }) => {
    expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.file)).toEqual([]);
  });
});
