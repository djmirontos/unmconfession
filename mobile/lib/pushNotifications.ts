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
  // Staff alerts: push only (never in the Notifications list or the bell count).
  'staff_report',
  'staff_held',
] as const;
export type PushType = (typeof PUSH_TYPES)[number];

/** Alerts for moderators and admins; they open a moderation queue, never a content screen. */
export const STAFF_PUSH_TYPES = ['staff_report', 'staff_held'] as const;
export type StaffPushType = (typeof STAFF_PUSH_TYPES)[number];
export const isStaffPushType = (type: string): type is StaffPushType => (STAFF_PUSH_TYPES as readonly string[]).includes(type);

const TARGET_TYPES = ['post', 'comment', 'listing'] as const;
// A report can also be about a profile; only staff_report may carry one.
type PushTargetType = (typeof TARGET_TYPES)[number] | 'profile';

/** A validated push payload (data = { nid, type, targetType, targetId }). */
export type PushData = { nid: string; type: PushType; targetType: PushTargetType | null; targetId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isPushType = (v: unknown): v is PushType => typeof v === 'string' && (PUSH_TYPES as readonly string[]).includes(v);

function isTargetTypeFor(type: PushType, v: unknown): v is PushTargetType {
  if (typeof v !== 'string') return false;
  return (TARGET_TYPES as readonly string[]).includes(v) || (type === 'staff_report' && v === 'profile');
}

/**
 * The data of a tapped notification, or null when anything is off (never trust a payload).
 * A target type needs a target id; extra fields are ignored. Ids are lowercased.
 * Staff alerts always name the item they are about, so they need both.
 */
export function parsePushData(raw: unknown): PushData | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (!isUuid(data.nid) || !isPushType(data.type)) return null;
  const targetType = data.targetType ?? null;
  const targetId = data.targetId ?? null;
  if (targetType !== null && !isTargetTypeFor(data.type, targetType)) return null;
  if (targetId !== null && !isUuid(targetId)) return null;
  if (targetType !== null && targetId === null) return null;
  if (isStaffPushType(data.type) && targetType === null) return null;
  return { nid: data.nid.toLowerCase(), type: data.type, targetType, targetId: targetId?.toLowerCase() ?? null };
}

// get_notifications groups these per target (type:target_id); every other row is its own group (its id).
const GROUPED: readonly PushType[] = ['comment', 'reaction', 'comment_reaction', 'reply'];

/** The Notifications group key of this push, for mark_notifications_read. */
export function pushGroupKey(data: PushData): string {
  return GROUPED.includes(data.type) && data.targetId ? `${data.type}:${data.targetId}` : data.nid;
}

// ---------------------------------------------------------------- settings (get/set_push_settings)

export type PushSettings = {
  enabled: boolean;
  comments: boolean;
  replies: boolean;
  deals: boolean;
  moderation: boolean;
  reactions: boolean;
  /** Staff only in the app; the server keeps it for everyone. */
  staff_alerts: boolean;
};

/** The server's defaults (no row yet): everything on except reactions. */
export const PUSH_DEFAULTS: PushSettings = {
  enabled: true,
  comments: true,
  replies: true,
  deals: true,
  moderation: true,
  reactions: false,
  staff_alerts: true,
};

/** One get/set_push_settings row; a missing or non-boolean field takes the server default (e.g. an older server without staff_alerts). */
export function toPushSettings(row: unknown): PushSettings {
  const r = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {};
  const pick = (key: keyof PushSettings) => (typeof r[key] === 'boolean' ? r[key] : PUSH_DEFAULTS[key]);
  return {
    enabled: pick('enabled'),
    comments: pick('comments'),
    replies: pick('replies'),
    deals: pick('deals'),
    moderation: pick('moderation'),
    reactions: pick('reactions'),
    staff_alerts: pick('staff_alerts'),
  };
}

/** A staff alert opens its moderation queue (the screen's staff guard sends anyone else Home). */
export type ModerationQueueDestination = { kind: 'moderation-queue'; queue: 'reports' | 'held' };

export type PushDestination = NotificationDestination | { kind: 'notifications' } | ModerationQueueDestination;

/** The route of a moderation queue. */
export const moderationQueuePath = (queue: ModerationQueueDestination['queue']) =>
  queue === 'reports' ? ('/moderation/reports' as const) : ('/moderation/held' as const);

/**
 * Where the tap leads: the same rules as a row in the Notifications list. A push does not know
 * the thread of a comment target, so those open the Notifications list instead. Staff alerts open
 * the queue (not the single item: it may already be handled by the time the alert is tapped).
 */
export function pushDestination(data: PushData): PushDestination {
  if (data.type === 'staff_report') return { kind: 'moderation-queue', queue: 'reports' };
  if (data.type === 'staff_held') return { kind: 'moderation-queue', queue: 'held' };
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
