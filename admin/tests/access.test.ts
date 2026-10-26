import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { accessFor, isActive, NAV_ITEMS, navFor } from '@/lib/access';

const pageFile = (href: string) =>
  fileURLToPath(new URL(`../app/(panel)${href === '/' ? '' : href}/page.tsx`, import.meta.url));

describe('accessFor', () => {
  it.each([
    ['/login', 'public'],
    ['/403', 'public'],
    ['/auth/expired', 'public'],
    ['/login/verify', 'signed-in'],
    ['/security/enroll', 'signed-in'],
    ['/', 'staff'],
    ['/review', 'staff'],
    ['/users/123', 'staff'],
    ['/audit', 'admin'],
    ['/audit/anything', 'admin'],
    ['/auditor', 'staff'],
    ['/unknown', 'staff'],
  ])('%s is %s', (path, access) => {
    expect(accessFor(path)).toBe(access);
  });
});

describe('navigation', () => {
  it('hides admin-only items from moderators', () => {
    expect(navFor(false).map((n) => n.href)).not.toContain('/audit');
    expect(navFor(true).map((n) => n.href)).toContain('/audit');
  });

  it('marks the active item without prefix false positives', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/review', '/')).toBe(false);
    expect(isActive('/users/1', '/users')).toBe(true);
    expect(isActive('/auditor', '/audit')).toBe(false);
  });
});

// The table is only for navigation; the real check is the server call in each page.
describe('every panel page checks access on the server', () => {
  it.each(NAV_ITEMS.map((n) => [n.href, n.access] as const))('%s calls the right guard', (href, access) => {
    const source = readFileSync(pageFile(href), 'utf8');
    if (access === 'admin') expect(source).toMatch(/await requireAdmin\(\)/);
    else expect(source).toMatch(/await requireStaff\(\)/);
  });
});
