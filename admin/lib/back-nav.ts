import { NAV_ITEMS } from '@/lib/access';

// The phone back arrow in the top bar. Pure: the arrow, the tracker and the tests share it.

const normalize = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/** A main menu destination (a sidebar entry) gets no back arrow. */
export function isMainDestination(pathname: string): boolean {
  const path = normalize(pathname);
  return NAV_ITEMS.some((item) => item.href === path);
}

/** Lists whose detail pages fall back to the list itself. */
const LIST_PARENTS = ['review', 'reports', 'content', 'users'];

/** Where the arrow goes when there is no in-panel page to go back to (opened directly). */
export function backFallback(pathname: string): string {
  const [first, ...rest] = normalize(pathname).split('/').filter(Boolean);
  return first && rest.length > 0 && LIST_PARENTS.includes(first) ? `/${first}` : '/';
}

/**
 * Whether router.back() stays inside the panel. Counts the history entries known to sit
 * between the entry the panel was loaded on and the current one:
 * - The count starts at 0 on every full page load (bookmark, new tab, refresh), so a page
 *   opened directly always uses the fallback.
 * - Growth of history.length while the panel is loaded can only come from in-panel pushes
 *   (links, Server Action redirects, filter links); a replace (the review and report
 *   "next item" flow) does not grow it.
 * - Every popstate counts as one step back. A forward step is counted the same way, which
 *   only undercounts.
 * Every error therefore undercounts and leads to the fallback; it never sends router.back()
 * off the site.
 */
export type BackNavState = { depth: number; length: number };

export const startTracking = (length: number): BackNavState => ({ depth: 0, length });

/** Banks the entries pushed since the last look (a push after going back can shrink the length). */
export function observeLength(state: BackNavState, length: number): BackNavState {
  return { depth: state.depth + Math.max(0, length - state.length), length };
}

/** A popstate: the browser moved one entry (back, or forward, counted as back). */
export function observePop(state: BackNavState, length: number): BackNavState {
  const seen = observeLength(state, length);
  return { depth: Math.max(0, seen.depth - 1), length };
}

export const hasPanelHistory = (state: BackNavState, length: number) => observeLength(state, length).depth > 0;
