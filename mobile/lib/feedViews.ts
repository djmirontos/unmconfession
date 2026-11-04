// The Feed tab's three views (Latest | Popular | Polls). Pure, no imports (tests/feedViews.test.mjs).

export type FeedView = 'latest' | 'popular' | 'polls';

export const FEED_VIEWS: readonly { key: FeedView; label: string }[] = [
  { key: 'latest', label: 'Latest' },
  { key: 'popular', label: 'Popular' },
  { key: 'polls', label: 'Polls' },
];

// The last view, for this app session only (like the Market tab's lastSegment): every cold start
// opens on Latest. Not a store and not reset on logout.
let lastFeedView: FeedView = 'latest';

export const getLastFeedView = (): FeedView => lastFeedView;
export function setLastFeedView(view: FeedView): void {
  lastFeedView = view;
}

/**
 * Latest is always mounted; Popular and Polls only once they have been opened, then they stay
 * mounted (hidden), so app start fetches neither and each keeps its scroll and query afterwards.
 */
export function mountedViews(previous: ReadonlySet<FeedView>, selected: FeedView): ReadonlySet<FeedView> {
  if (previous.has('latest') && previous.has(selected)) return previous;
  return new Set<FeedView>([...previous, 'latest', selected]);
}

/** A list's refresh timer and focus refetches run only while it is shown, its tab focused and the app open. */
export const listIsLive = (appActive: boolean, tabFocused: boolean, selected: boolean): boolean =>
  appActive && tabFocused && selected;
