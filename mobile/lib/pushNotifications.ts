// Push notifications: the pure parts (payload validation, mark-read key, destination). The side
// effects (permissions, token, channel, listeners) live in lib/pushRegistration.ts and
// hooks/usePushNotifications.ts. Imports only lib/notificationTarget.ts, so tests run it in Node.
import { type NotificationDestination, notificationDestination } from '@/lib/notificationTarget';

/** The notification types the database sends as pushes (push_on_notification). */
export const PUSH_TYPES = [
  'comment',
  'reply',
  'reaction',
  'comment_reaction',
  'return_request',
  'return_confirmed',
  'sale_request',
  'sale_confirmed',
  'content_approved',
  'content_rejected',
  'content_removed',
] as const;
export type PushType = (typeof PUSH_TYPES)[number];

const TARGET_TYPES = ['post', 'comment', 'listing'] as const;
type PushTargetType = (typeof TARGET_TYPES)[number];

/** A validated push payload (data = { nid, type, targetType, targetId }). */
export type PushData = { nid: string; type: PushType; targetType: PushTargetType | null; targetId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isPushType = (v: unknown): v is PushType => typeof v === 'string' && (PUSH_TYPES as readonly string[]).includes(v);
const isTargetType = (v: unknown): v is PushTargetType => typeof v === 'string' && (TARGET_TYPES as readonly string[]).includes(v);

/**
 * The data of a tapped notification, or null when anything is off (never trust a payload).
 * A target type needs a target id; extra fields are ignored. Ids are lowercased.
 */
export function parsePushData(raw: unknown): PushData | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (!isUuid(data.nid) || !isPushType(data.type)) return null;
  const targetType = data.targetType ?? null;
  const targetId = data.targetId ?? null;
  if (targetType !== null && !isTargetType(targetType)) return null;
  if (targetId !== null && !isUuid(targetId)) return null;
  if (targetType !== null && targetId === null) return null;
  return { nid: data.nid.toLowerCase(), type: data.type, targetType, targetId: targetId?.toLowerCase() ?? null };
}

// get_notifications groups these per target (type:target_id); every other row is its own group (its id).
const GROUPED: readonly PushType[] = ['comment', 'reaction', 'comment_reaction', 'reply'];

/** The Notifications group key of this push, for mark_notifications_read. */
export function pushGroupKey(data: PushData): string {
  return GROUPED.includes(data.type) && data.targetId ? `${data.type}:${data.targetId}` : data.nid;
}

/**
 * Where the tap leads: the same rules as a row in the Notifications list. A push does not know
 * the thread of a comment target, so those open the Notifications list instead.
 */
export function pushDestination(data: PushData): NotificationDestination | { kind: 'notifications' } {
  if (!data.targetId) return { kind: 'notifications' };
  const dest = notificationDestination({
    type: data.type,
    targetType: data.targetType,
    targetId: data.targetId,
    parentPostId: null,
    parentListingId: null,
  });
  return dest.kind === 'unavailable' || dest.kind === 'none' ? { kind: 'notifications' } : dest;
}
