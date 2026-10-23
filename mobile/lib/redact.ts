// Pure helpers (no imports) so they can be tested with plain Node: `npm run test:redact`.

const SECRET_KEY = /pass(word)?|token|secret|api[-_]?key|apikey|authorization|cookie|session|otp|refresh|access[-_]?code|code_verifier/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const SUPABASE_KEY = /\bsb_(publishable|secret)_[A-Za-z0-9_-]+/g;
const MAX_DEPTH = 4;

/** a.user@school.edu -> a***@school.edu; also hides JWTs, bearer headers and Supabase keys. */
export function redactString(value: string): string {
  return value
    .replace(JWT, '[jwt]')
    .replace(BEARER, '$1 [redacted]')
    .replace(SUPABASE_KEY, 'sb_$1_[redacted]')
    .replace(EMAIL, '$1***@$2');
}

/** Deep copy with secret-looking keys replaced and strings scrubbed. Never mutates the input. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/** "file:///data/.../x.jpg" -> "file:"; only the scheme is safe and useful to log. */
export function uriScheme(uri: string): string {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(uri);
  return match ? `${match[1]}:` : '(none)';
}
