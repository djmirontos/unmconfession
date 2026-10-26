// Content-Security-Policy for every page response (set by the proxy with a fresh nonce).

type CspInput = { nonce: string; supabaseUrl: string | undefined; isDev: boolean };

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Scripts: nonce + 'strict-dynamic' (Next.js adds the nonce to its own scripts).
 * Styles: 'unsafe-inline' is a documented limitation. Radix UI and the toast library set
 * inline styles, and style attributes cannot carry a nonce. Styles cannot run script.
 */
export function buildCsp({ nonce, supabaseUrl, isDev }: CspInput): string {
  const supabase = originOf(supabaseUrl);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${supabase ? ` ${supabase}` : ''}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
