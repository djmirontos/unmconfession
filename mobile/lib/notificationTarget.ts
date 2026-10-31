// Where a notification leads when tapped. Shared by the Notifications list and push taps, so both
// open the same screen. No imports, so the push tests run it in Node.

export type NotificationTargetInput = {
  type: string;
  targetType: string | null;
  targetId: string;
  /** For a comment target: the post or listing it belongs to (the list knows it; a push does not). */
  parentPostId: string | null;
  parentListingId: string | null;
};

export type NotificationDestination =
  /** The post or listing; `needsPublished`: the list checks the target is still published first. */
  | { kind: 'post' | 'listing'; id: string; needsPublished: boolean }
  /** A rejected or removed post or listing: its status screen. */
  | { kind: 'post-status'; source: 'post' | 'listing'; id: string }
  /** The thread of a comment target is not known (or gone). */
  | { kind: 'unavailable' }
  /** Nothing to open (a rejected comment: the row itself already says why). */
  | { kind: 'none' };

function target(n: NotificationTargetInput): NotificationDestination {
  return { kind: n.targetType === 'listing' ? 'listing' : 'post', id: n.targetId, needsPublished: true };
}

// A comment target: the thread it belongs to.
function parent(n: NotificationTargetInput): NotificationDestination {
  if (n.parentPostId) return { kind: 'post', id: n.parentPostId, needsPublished: false };
  if (n.parentListingId) return { kind: 'listing', id: n.parentListingId, needsPublished: false };
  return { kind: 'unavailable' };
}

export function notificationDestination(n: NotificationTargetInput): NotificationDestination {
  switch (n.type) {
    case 'comment':
    case 'reaction':
    case 'return_request':
    case 'return_confirmed':
    case 'sale_request':
    case 'sale_confirmed':
      return target(n);
    case 'comment_reaction':
    case 'reply':
      return parent(n);
    case 'content_approved':
      return n.targetType === 'comment' ? parent(n) : target(n);
    case 'content_rejected':
    case 'content_removed':
      return n.targetType === 'post' || n.targetType === 'listing' ? { kind: 'post-status', source: n.targetType, id: n.targetId } : { kind: 'none' };
    default:
      return { kind: 'none' };
  }
}
