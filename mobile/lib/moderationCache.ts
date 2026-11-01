import type { QueryClient } from '@tanstack/react-query';

import { updateListedListings } from '@/lib/listings';
import {
  type HeldTarget,
  MODERATION_CACHE_KEYS,
  type ModTarget,
  removalInvalidations,
  type ReviewAction,
  reviewInvalidations,
} from '@/lib/moderation';
import { updateListedPost } from '@/lib/postLists';

/** After a Remove or Dismiss (or a race): the queue, the item, the Home count and the hub totals. */
export function refreshModeration(queryClient: QueryClient): Promise<void> {
  return Promise.all(MODERATION_CACHE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);
}

/**
 * A moderator removed this item (or someone already had): drop a post or listing from every cached
 * list at once, as an author's own delete does, then refetch what showed it and the moderation caches.
 */
export function afterModeratorRemove(queryClient: QueryClient, target: ModTarget): void {
  if (target.type === 'profile') return;
  if (target.type === 'post') updateListedPost(queryClient, target.id, () => null);
  if (target.type === 'listing') updateListedListings(queryClient, (l) => (l.id === target.id ? null : l));
  for (const queryKey of removalInvalidations(target.type, target.id)) void queryClient.invalidateQueries({ queryKey });
}

/** After an Approve or Reject (or "already handled"): the held queue and counts, and the public lists an approved item joins. */
export function afterHeldReview(queryClient: QueryClient, target: HeldTarget, action: ReviewAction): void {
  for (const queryKey of reviewInvalidations(target.type, target.id, action)) void queryClient.invalidateQueries({ queryKey });
}
