import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NAV_ITEMS } from '@/lib/access';
import {
  type BackNavState,
  backFallback,
  hasPanelHistory,
  isMainDestination,
  observeLength,
  observePop,
  startTracking,
} from '@/lib/back-nav';

const ID = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const src = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

describe('main destinations (no back arrow)', () => {
  it('every sidebar entry is a main destination', () => {
    for (const item of NAV_ITEMS) expect(isMainDestination(item.href), item.href).toBe(true);
    expect(NAV_ITEMS.map((n) => n.href)).toEqual(['/', '/review', '/reports', '/content', '/users', '/keywords', '/log', '/audit']);
  });
  it('a trailing slash does not matter', () => {
    expect(isMainDestination('/users/')).toBe(true);
  });
  it('detail pages and unknown nested routes get the arrow', () => {
    for (const path of [`/review/post/${ID}`, `/reports/comment/${ID}`, `/content/listing/${ID}`, `/users/${ID}`, '/review/next', '/keywords/x', '/unknown']) {
      expect(isMainDestination(path), path).toBe(false);
    }
  });
});

describe('back fallback (opened directly)', () => {
  it('detail pages fall back to their list', () => {
    expect(backFallback(`/review/post/${ID}`)).toBe('/review');
    expect(backFallback(`/reports/comment/${ID}`)).toBe('/reports');
    expect(backFallback(`/content/listing/${ID}`)).toBe('/content');
    expect(backFallback(`/users/${ID}`)).toBe('/users');
    expect(backFallback(`/users/${ID}/`)).toBe('/users');
  });
  it('the "next item" redirect routes fall back to their list', () => {
    expect(backFallback('/review/next')).toBe('/review');
    expect(backFallback('/reports/next')).toBe('/reports');
  });
  it('anything else falls back to the dashboard', () => {
    for (const path of ['/', '/keywords/x', `/log/${ID}`, '/audit/x', '/unknown/a/b', '/reviewer/x', '']) {
      expect(backFallback(path), path).toBe('/');
    }
  });
});

describe('in-panel history tracker', () => {
  const run = (start: number, steps: Array<['len' | 'pop', number]>): BackNavState =>
    steps.reduce((s, [kind, len]) => (kind === 'pop' ? observePop(s, len) : observeLength(s, len)), startTracking(start));

  it('a page opened directly (bookmark, new tab, refresh) has no panel history', () => {
    expect(hasPanelHistory(startTracking(5), 5)).toBe(false);
  });
  it('an in-panel push (link, Server Action redirect) makes back safe', () => {
    expect(hasPanelHistory(startTracking(3), 4)).toBe(true);
  });
  it('a replace (the review/report "next item" flow) does not', () => {
    // The detail page changes, history.length does not: back would leave the panel.
    expect(hasPanelHistory(startTracking(3), 3)).toBe(false);
  });
  it('going back uses up the history; at the entry page the fallback is used', () => {
    const s = run(1, [['pop', 2]]); // pushed once, then went back
    expect(hasPanelHistory(s, 2)).toBe(false);
  });
  it('two pushes, one back: one step is still safe', () => {
    expect(hasPanelHistory(run(1, [['pop', 3]]), 3)).toBe(true);
  });
  it('a forward step counts as back (undercounts, never leaves the site)', () => {
    const s = run(1, [['pop', 2], ['pop', 2]]); // back, then forward
    expect(s.depth).toBe(0);
  });
  it('a push after going back that shrinks the history is not counted as negative', () => {
    // [A,B,C,D] back twice to B, push E: [A,B,E]
    const s = run(1, [['pop', 4], ['pop', 4], ['len', 3]]);
    expect(s).toEqual({ depth: 1, length: 3 });
    expect(hasPanelHistory(s, 3)).toBe(true);
  });
  it('the count never goes below zero', () => {
    expect(run(2, [['pop', 2], ['pop', 2]]).depth).toBe(0);
  });
});

describe('back arrow wiring', () => {
  it('the tracker is mounted in the panel layout and the arrow in the top bar, below lg only', () => {
    expect(src('app/(panel)/layout.tsx')).toContain('<BackNavProvider>');
    expect(src('components/panel/top-bar.tsx')).toContain('<BackButton />');
    const button = src('components/panel/back-nav.tsx');
    expect(button).toContain('aria-label="Back"');
    expect(button).toMatch(/className="size-11 lg:hidden"/);
    expect(button).toContain('router.back()');
    expect(button).toContain('router.push(backFallback(pathname))');
  });
  it('the detail pages keep their Back links from lg up and hide them below', () => {
    for (const f of ['app/(panel)/review/[type]/[id]/page.tsx', 'app/(panel)/content/[type]/[id]/page.tsx', 'app/(panel)/users/[id]/page.tsx']) {
      expect(src(f).match(/variant="ghost" size="sm" className="max-lg:hidden"/g), f).toHaveLength(1);
    }
    expect(src('app/(panel)/reports/[type]/[id]/page.tsx').match(/variant="ghost" size="sm" className="max-lg:hidden"/g)).toHaveLength(2);
  });
  it('the login and enrolment pages are outside the panel layout (no arrow there)', () => {
    const auth = src('app/(auth)/layout.tsx');
    expect(auth).not.toContain('TopBar');
    expect(auth).not.toContain('BackNavProvider');
  });
});
