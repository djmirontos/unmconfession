import { createChunks, stringToBase64URL } from '@supabase/ssr';

// Total Cookie request header the panel may produce. Browsers allow ~4 KB per cookie, and
// Node rejects request headers above 16 KB in total (HTTP 431); localhost cookies from other
// dev servers share that budget, so the panel keeps its own part small.
export const COOKIE_HEADER_BUDGET = 4096;
// Development log threshold (proxy.ts).
export const COOKIE_HEADER_WARN = 3072;

/** The cookies @supabase/ssr writes for one stored value: "base64-" + base64url, split into chunks. */
export function supabaseCookies(name: string, storedJson: string): { name: string; value: string }[] {
  return createChunks(name, `base64-${stringToBase64URL(storedJson)}`);
}

/** Size in bytes of the Cookie header a browser sends for these cookies ("a=1; b=2"). */
export function cookieHeaderBytes(cookies: readonly { name: string; value: string }[]): number {
  return Buffer.byteLength(cookies.map((c) => `${c.name}=${c.value}`).join('; '));
}
