import { describe, expect, it } from 'vitest';

import { securityHeaders } from '@/lib/security-headers';

const header = (key: string) => securityHeaders.find((h) => h.key === key)?.value;

describe('security headers', () => {
  it('uses same-origin referrers so form POSTs keep their Origin (Server Actions CSRF check)', () => {
    expect(header('Referrer-Policy')).toBe('same-origin');
  });

  it('keeps the other protections', () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Permissions-Policy')).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(header('X-Robots-Tag')).toMatch(/noindex/);
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
});
