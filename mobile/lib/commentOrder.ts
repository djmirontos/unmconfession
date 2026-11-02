// The order of comments in a thread: oldest first, ties by id. Answers on Q&A posts use the same
// order; upvotes never change it (tests/upvotes.test.mjs).
import { parseTimestamp } from '@/lib/time';

export const byTime = (a: { time: string; id: string }, b: { time: string; id: string }): number =>
  parseTimestamp(a.time) - parseTimestamp(b.time) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
