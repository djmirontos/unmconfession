import { createContext, type ReactNode, useContext } from 'react';

// Feed card style, in one place. Inside a feed list (FeedCards provider) post and Lost & Found cards
// are flush: full width, square corners, no border, side margin or shadow, separated only by a
// FEED_GAP strip of the feed background (FEED_BG, the feedBg token, clearly darker than the
// surface1 card in both themes). Everywhere else (detail screens) they keep the rounded card.

/** The strip of feed background between two feed cards, in dp. */
export const FEED_GAP = 3;

/** Background class of a flush feed list and its skeleton list (the strip colour). */
export const FEED_BG = 'bg-feed-bg';

// Flush padding is tight, like Facebook's feed: 12 above the header, 6 below the action row (the
// row is 36 tall and its buttons keep their hit slop, so touch areas stay at least 44); sides stay 16.
const FLUSH = 'bg-surface1 px-4 pt-3 pb-1.5';
const ROUNDED = 'rounded-2xl border border-hairline bg-surface1 p-4';

const FlushContext = createContext(false);

/** Wraps a feed list (and its skeleton): cards inside render flush. */
export function FeedCards({ children }: { children: ReactNode }) {
  return <FlushContext.Provider value>{children}</FlushContext.Provider>;
}

export const useFlushCards = () => useContext(FlushContext);

/** The container classes of a post or listing card (padding unchanged, so the content does not move). */
export const cardClass = (flush: boolean) => (flush ? FLUSH : ROUNDED);

/** Space between a card's content blocks (header, body, images): 8 in a flush feed, 12 elsewhere. */
export const cardGap = (flush: boolean) => (flush ? 'gap-2' : 'gap-3');

/** Space between the content, the poll and the action row: 4 in a flush feed, 12 elsewhere. */
export const cardOuterGap = (flush: boolean) => (flush ? 'gap-1' : 'gap-3');

/** List content padding for a flush feed: no side gutter, a gap-sized strip at the top, room at the bottom. */
export const FEED_CONTENT_STYLE = { paddingTop: FEED_GAP, paddingBottom: 16 } as const;

/** Wrapper style of each card in a flush feed list: the card, then the strip. */
export const FEED_ITEM_STYLE = { paddingBottom: FEED_GAP } as const;

/** A flush list under a padded header (profile tabs): the header brings its own top space. */
export const FEED_UNDER_HEADER_STYLE = { paddingBottom: 16 } as const;
