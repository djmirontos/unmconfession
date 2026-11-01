// "Get started" card on Home: react to 3 confessions. Pure rules and texts (tests/getStarted.test.mjs).
import type { MembershipStatus } from '@/hooks/useProfile';

export const GET_STARTED_GOAL = 3;

/** React Query key root of the member's own reaction count (cleared in clearMemberCaches, not persisted). */
export const GET_STARTED_COUNT_KEY = 'get-started-count';

export const GET_STARTED_COPY = {
  title: 'Get started',
  body: "Tap a reaction on 3 confessions. It's the quickest way to join in.",
  done: "Nice, you're in!",
  dismiss: 'Dismiss get started',
} as const;

/** What this phone remembers for the member; null while it is being read. */
export type GetStartedStored = 'none' | 'dismissed' | 'completed';

/**
 * Per user, so another account on the same phone starts fresh. The user id is part of the key on
 * purpose: forgetDeletedAccount (lib/auth.ts) removes every AsyncStorage key that contains it.
 */
export const getStartedStorageKey = (userId: string) => `unm-get-started:${userId}`;

/** A stored value back to a state; anything unknown (or nothing) counts as not dismissed. */
export function parseGetStartedStored(raw: string | null): GetStartedStored {
  return raw === 'dismissed' || raw === 'completed' ? raw : 'none';
}

export type GetStartedCount = { state: 'loading' } | { state: 'error' } | { state: 'ready'; count: number };

/**
 * Only for a full member whose own reaction count is known and below the goal, and who has not
 * dismissed or completed the card on this phone. Anything unknown or failed shows nothing.
 */
export function shouldShowGetStarted(input: {
  membership: MembershipStatus;
  stored: GetStartedStored | null;
  count: GetStartedCount;
}): boolean {
  if (input.membership !== 'member') return false;
  if (input.stored !== 'none') return false;
  return input.count.state === 'ready' && input.count.count < GET_STARTED_GOAL;
}

/** "2/3", clamped to 0–3. */
export function getStartedProgressLabel(count: number): string {
  return `${clampProgress(count)}/${GET_STARTED_GOAL}`;
}

/** Screen-reader text for the same progress: "2 of 3 reactions". */
export function getStartedProgressA11y(count: number): string {
  return `${clampProgress(count)} of ${GET_STARTED_GOAL} reactions`;
}

function clampProgress(count: number): number {
  return Math.min(GET_STARTED_GOAL, Math.max(0, Math.floor(count)));
}

/** Only a brand-new reaction moves the count: not a removal, not a change of type. */
export const isNewReaction = (previous: string | null, next: string | null): boolean => previous === null && next !== null;
