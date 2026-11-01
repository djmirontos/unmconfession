import { formatManilaDay } from '@/lib/manilaDate';
import { REPORT_REASONS } from '@/lib/reportReasons';
import { parseTimestamp } from '@/lib/time';

// Pure helpers for the staff Moderation hub (mod_app_stats, mod_recent_signups, the Home shield).
// No email or sign-in details ever reach the app: these RPCs return nicknames, dates and counts only.

export type BadgeCount = { code: string; name: string; count: number };

export type ModerationStats = {
  totalMembers: number;
  signups24h: number;
  signups7d: number;
  engagedMembers: number;
  active7d: number;
  badgeCounts: BadgeCount[];
};

export type RecentSignup = { userId: string; nickname: string; createdAt: string };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** badge_counts (jsonb) to rows in the server's order; anything that is not an array is empty, bad items are dropped. */
export function parseBadgeCounts(raw: unknown): BadgeCount[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { code, name, count } = item as Record<string, unknown>;
    return isText(code) && isText(name) && isCount(count) ? [{ code, name, count }] : [];
  });
}

type StatsRow = {
  total_members: number;
  signups_24h: number;
  signups_7d: number;
  engaged_members: number;
  active_7d: number;
  badge_counts: unknown;
};

/** The one mod_app_stats row, or null when it is missing or a total is not a count. */
export function toModerationStats(rows: readonly StatsRow[] | null | undefined): ModerationStats | null {
  const row = rows?.[0];
  if (!row) return null;
  const totals = [row.total_members, row.signups_24h, row.signups_7d, row.engaged_members, row.active_7d];
  if (!totals.every(isCount)) return null;
  return {
    totalMembers: row.total_members,
    signups24h: row.signups_24h,
    signups7d: row.signups_7d,
    engagedMembers: row.engaged_members,
    active7d: row.active_7d,
    badgeCounts: parseBadgeCounts(row.badge_counts),
  };
}

/** mod_recent_signups rows, dropping any without an id, nickname or date. */
export function toRecentSignups(
  rows: readonly { user_id: string | null; nickname: string | null; created_at: string | null }[] | null | undefined,
): RecentSignup[] {
  return (rows ?? []).flatMap((r) =>
    r.user_id && isText(r.nickname) && r.created_at ? [{ userId: r.user_id, nickname: r.nickname, createdAt: r.created_at }] : [],
  );
}

/** Accessibility label of the Home shield: "Moderation", "Moderation, 1 open report", "Moderation, 4 open reports". */
export function formatOpenReportsLabel(count: number): string {
  if (!isCount(count) || count === 0) return 'Moderation';
  return `Moderation, ${count} open ${count === 1 ? 'report' : 'reports'}`;
}

/** 1234 -> "1,234"; anything that is not a count reads "0". */
export function formatCount(value: number): string {
  return (isCount(value) ? value : 0).toLocaleString('en-US');
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** A sign-up time in Manila: "Nov 1, 9:05 PM" (with the year when not this year). */
export function formatSignupTime(iso: string, now = Date.now()): string {
  const ts = parseTimestamp(iso);
  if (Number.isNaN(ts)) return '';
  const manila = new Date(ts + MANILA_OFFSET_MS);
  const hours = manila.getUTCHours();
  const minutes = String(manila.getUTCMinutes()).padStart(2, '0');
  const time = `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
  return `${formatManilaDay(new Date(ts).toISOString(), now)}, ${time}`;
}

// ---------------------------------------------------------------- staff check (useStaff)

type StaffInput = {
  /** The stored session has been read (a cold start from a push waits for it). */
  restored: boolean;
  membership: string;
  hasUser: boolean;
  isPending: boolean;
  isError: boolean;
  data: boolean | undefined;
};

/**
 * Fails closed: staff only when is_staff() said yes and nothing failed. Still loading while the
 * session is being restored, the profile is loading or the check is running, so a screen (or a
 * push tap on a cold start) never decides "not staff" too early.
 */
export function staffState(i: StaffInput): { isStaff: boolean; isLoading: boolean } {
  const enabled = i.restored && i.membership === 'member' && i.hasUser;
  return {
    isStaff: enabled && !i.isError && i.data === true,
    isLoading: !i.restored || i.membership === 'loading' || (enabled && i.isPending),
  };
}

// ---------------------------------------------------------------- reports queue and detail (step 2b)

export const MOD_TARGET_TYPES = ['post', 'comment', 'listing', 'profile'] as const;
export type ModTargetType = (typeof MOD_TARGET_TYPES)[number];
export type ModTarget = { type: ModTargetType; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isTargetType = (value: unknown): value is ModTargetType =>
  typeof value === 'string' && (MOD_TARGET_TYPES as readonly string[]).includes(value);

/** Route params of a report detail screen; anything else is null (the screen fails closed). */
export function parseModTarget(type: unknown, id: unknown): ModTarget | null {
  if (!isTargetType(type) || typeof id !== 'string' || !UUID.test(id)) return null;
  return { type, id: id.toLowerCase() };
}

const TYPE_LABELS: Record<ModTargetType, string> = { post: 'Post', comment: 'Comment', listing: 'Listing', profile: 'Profile' };

export const targetTypeLabel = (type: ModTargetType) => TYPE_LABELS[type];

/**
 * Removal reasons, the same list as the web panel (admin/lib/review/reasons.ts). As there, the LABEL
 * is what mod_review stores as p_reason: moderators see it in the log, the author in the notification.
 */
export const REMOVAL_REASONS = [
  { value: 'doxxing', label: 'Doxxing or personal info' },
  { value: 'bullying', label: 'Bullying or harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'prohibited_item', label: 'Prohibited item' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number]['value'];

/** Reject uses the very same list as Remove (the web panel's REJECT_REASONS), label sent as p_reason. */
export const REJECT_REASONS = REMOVAL_REASONS;

/** The p_reason text for a removal code, or null for an unknown code (never sent). */
export function removalReasonText(code: string | null): string | null {
  return REMOVAL_REASONS.find((r) => r.value === code)?.label ?? null;
}

const REPORT_LABELS = new Map<string, string>(REPORT_REASONS.map((r) => [r.value, r.label]));

/** A report reason code as the app labels it (lib/reportReasons.ts); unknown codes read "Other reason". */
export const reportReasonLabel = (code: string) => REPORT_LABELS.get(code) ?? 'Other reason';

/** reasons[] to distinct labels in the given order; non-strings and blanks are dropped. */
export function reasonLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const code of raw) {
    if (!isText(code)) continue;
    const label = reportReasonLabel(code);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

export type ModAction = 'remove' | 'dismiss';

/**
 * What the phone offers for a reported item: Remove only for published posts, comments and listings
 * (as the web panel; mod_review never takes a profile), Dismiss while reports are open.
 */
export function allowedActions(type: ModTargetType, status: string | null, openReports: number): ModAction[] {
  const actions: ModAction[] = [];
  if (type !== 'profile' && status === 'published') actions.push('remove');
  if (openReports > 0) actions.push('dismiss');
  return actions;
}

export type StaffMenuAction = 'remove' | 'open';

/**
 * Staff items in the "⋯" menu of someone else's post, comment or listing. Nothing for non-staff, for
 * own content (that has its own menu) or for profiles (profile actions stay in the web panel).
 */
export function getStaffMenuActions(type: string, isStaff: boolean, isOwn: boolean): StaffMenuAction[] {
  if (!isStaff || isOwn || (type !== 'post' && type !== 'comment' && type !== 'listing')) return [];
  return ['remove', 'open'];
}

/** The moderation caches (queue, one item, Home count, hub totals): refreshed after any Remove or Dismiss. */
export const MODERATION_CACHE_KEYS = [['mod-reports'], ['mod-report'], ['mod-open-reports'], ['mod-stats']] as const;

/**
 * What a moderator's Remove refreshes besides the moderation caches. The item itself is also dropped
 * from the cached lists at once (lib/moderationCache.ts); these refetch so the server result takes over.
 * A comment's thread and its parent's comment count refetch.
 */
export function removalInvalidations(type: 'post' | 'comment' | 'listing', id: string): (readonly string[])[] {
  const item =
    type === 'post'
      ? [['post', id], ['user-posts'], ['trending'], ['polls']]
      : type === 'listing'
        ? [['listing', id], ['listings']]
        : [['comments'], ['replies'], ['post'], ['listing']];
  return [...item, ...MODERATION_CACHE_KEYS];
}

/** Number of photos in an images jsonb value (only entries with a path count). */
export function imageCount(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return raw.filter((img: unknown) => typeof img === 'object' && img !== null && isText((img as Record<string, unknown>).path)).length;
}

const clean = (value: string | null | undefined): string | null => (isText(value) ? value.trim() : null);

export type ReportQueueItem = {
  key: string;
  type: ModTargetType;
  id: string;
  reportCount: number;
  reasons: string[];
  firstReportedAt: string;
  /** Listings only (for posts this column holds the post kind, which is not shown). */
  title: string | null;
  body: string | null;
  images: unknown;
  imageCount: number;
  authorId: string | null;
  nickname: string | null;
  avatarKey: string | null;
  status: string | null;
};

export type ReportQueueRow = {
  target_type: string | null;
  target_id: string | null;
  report_count: number | null;
  reasons: unknown;
  first_reported_at: string | null;
  content_status: string | null;
  title: string | null;
  body: string | null;
  images: unknown;
  author_id: string | null;
  nickname: string | null;
  avatar_key: string | null;
};

/** One mod_get_reports row, or null when its type, id or first report time is unusable. */
export function toReportQueueItem(r: ReportQueueRow): ReportQueueItem | null {
  const target = parseModTarget(r.target_type, r.target_id);
  if (!target || !r.first_reported_at) return null;
  return {
    key: `${target.type}:${target.id}`,
    ...target,
    reportCount: isCount(r.report_count) ? r.report_count : 0,
    reasons: reasonLabels(r.reasons),
    firstReportedAt: r.first_reported_at,
    title: target.type === 'listing' ? clean(r.title) : null,
    body: clean(r.body),
    images: r.images,
    imageCount: imageCount(r.images),
    authorId: r.author_id,
    nickname: r.nickname,
    avatarKey: r.avatar_key,
    status: r.content_status,
  };
}

export type KeysetCursor = { ts: string; id: string };

/** As the web panel: a full page means there may be more; the cursor is the last RAW row's (first report, target id). */
export function nextReportsCursor(rows: readonly ReportQueueRow[], limit: number): KeysetCursor | null {
  const last = rows[rows.length - 1];
  return rows.length === limit && last?.first_reported_at && last.target_id ? { ts: last.first_reported_at, id: last.target_id } : null;
}

/** "Post, 3 reports, spam and bullying or harassment" */
export function queueItemLabel(item: Pick<ReportQueueItem, 'type' | 'reportCount' | 'reasons'>): string {
  const count = `${item.reportCount} ${item.reportCount === 1 ? 'report' : 'reports'}`;
  const reasons = item.reasons.map((r) => r.toLowerCase());
  const said = reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}` : (reasons[0] ?? '');
  return [targetTypeLabel(item.type), count, said].filter(Boolean).join(', ');
}

export type ReportEntry = {
  id: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  reporter: string | null;
};

type ReportDetailRow = {
  report_id: string | null;
  reason: string | null;
  note: string | null;
  status: string | null;
  created_at: string | null;
  reporter_nickname: string | null;
};

/** mod_get_report_details rows; rows without an id or time are dropped. */
export function toReportEntries(rows: readonly ReportDetailRow[] | null | undefined): ReportEntry[] {
  return (rows ?? []).flatMap((r) =>
    r.report_id && r.created_at
      ? [
          {
            id: r.report_id,
            reason: reportReasonLabel(r.reason ?? ''),
            note: clean(r.note),
            status: r.status ?? 'open',
            createdAt: r.created_at,
            reporter: r.reporter_nickname,
          },
        ]
      : [],
  );
}

/** When the oldest still-open report came in (the profile lookup starts just before it, as on the web). */
export function firstOpenAt(entries: readonly ReportEntry[]): string | null {
  const open = entries.filter((e) => e.status === 'open').map((e) => e.createdAt);
  return open.length > 0 ? open.reduce((a, b) => (parseTimestamp(a) <= parseTimestamp(b) ? a : b)) : null;
}

export type ModContent = {
  type: ModTargetType;
  id: string;
  status: string | null;
  title: string | null;
  body: string | null;
  images: unknown;
  authorId: string | null;
  nickname: string | null;
  avatarKey: string | null;
  createdAt: string | null;
};

type ContentRow = {
  status: string | null;
  title: string | null;
  body: string | null;
  images: unknown;
  author_id: string | null;
  nickname: string | null;
  created_at: string | null;
};

/** mod_get_content's one row (posts, comments, listings), or null. */
export function toModContent(target: ModTarget, rows: readonly ContentRow[] | null | undefined): ModContent | null {
  const r = rows?.[0];
  if (!r) return null;
  return {
    ...target,
    status: r.status,
    title: target.type === 'listing' ? clean(r.title) : null,
    body: clean(r.body),
    images: r.images,
    authorId: r.author_id,
    nickname: r.nickname,
    avatarKey: null,
    createdAt: r.created_at,
  };
}

/** A reported profile from its mod_get_reports row (mod_get_content has no profiles); null when that row is gone. */
export function profileContent(target: ModTarget, item: ReportQueueItem | null): ModContent {
  return {
    ...target,
    status: item?.status ?? null,
    title: null,
    body: item?.body ?? null,
    images: [],
    authorId: target.id,
    nickname: item?.nickname ?? null,
    avatarKey: item?.avatarKey ?? null,
    createdAt: null,
  };
}

// ---------------------------------------------------------------- held for review (step 2c)

export type HeldType = 'post' | 'comment' | 'listing';
export type HeldTarget = { type: HeldType; id: string };

/** Route params of a held item: posts, comments and listings only (the queue never holds a profile). */
export function parseHeldTarget(type: unknown, id: unknown): HeldTarget | null {
  const target = parseModTarget(type, id);
  return target && target.type !== 'profile' ? { type: target.type, id: target.id } : null;
}

export type HoldReason = 'keyword' | 'pre_moderation';
export type Hold = { reason: HoldReason | null; term: string | null };

/** moderation_holds.reason / matched_term as returned; anything unknown is "no hold record" (null). */
export function toHold(reason: string | null | undefined, term: string | null | undefined): Hold {
  const known = reason === 'keyword' || reason === 'pre_moderation' ? reason : null;
  return { reason: known, term: known === 'keyword' ? clean(term) : null };
}

/** As the web panel's hold badge: "Keyword: beer" or "Pre-moderation"; null when there is no hold record (never invented). */
export function holdLabel(hold: Hold): string | null {
  if (hold.reason === 'keyword') return hold.term ? `Keyword: ${hold.term}` : 'Keyword match';
  if (hold.reason === 'pre_moderation') return 'Pre-moderation';
  return null;
}

export type HeldItem = {
  key: string;
  type: HeldType;
  id: string;
  createdAt: string;
  /** Listings only (for posts this column holds the post kind, which is not shown). */
  title: string | null;
  body: string | null;
  images: unknown;
  imageCount: number;
  authorId: string | null;
  nickname: string | null;
  hold: Hold;
};

export type HeldQueueRow = {
  target_type: string | null;
  target_id: string | null;
  created_at: string | null;
  title: string | null;
  body: string | null;
  images: unknown;
  author_id: string | null;
  nickname: string | null;
  hold_reason: string | null;
  matched_term: string | null;
};

/** One mod_get_queue row, or null when its type, id or time is unusable. */
export function toHeldItem(r: HeldQueueRow): HeldItem | null {
  const target = parseHeldTarget(r.target_type, r.target_id);
  if (!target || !r.created_at) return null;
  return {
    key: `${target.type}:${target.id}`,
    ...target,
    createdAt: r.created_at,
    title: target.type === 'listing' ? clean(r.title) : null,
    body: clean(r.body),
    images: r.images,
    imageCount: imageCount(r.images),
    authorId: r.author_id,
    nickname: r.nickname,
    hold: toHold(r.hold_reason, r.matched_term),
  };
}

/** As the web panel: a full page means there may be more; the cursor is the last RAW row's created_at, passed back unchanged. */
export function nextHeldCursor(rows: readonly HeldQueueRow[], limit: number): string | null {
  const last = rows[rows.length - 1];
  return rows.length === limit && last?.created_at ? last.created_at : null;
}

/** "Comment, held, keyword: beer" */
export function heldItemLabel(item: Pick<HeldItem, 'type' | 'hold'>): string {
  const hold = holdLabel(item.hold);
  return [targetTypeLabel(item.type), 'held for review', hold?.toLowerCase()].filter(Boolean).join(', ');
}

export type HeldCounts = { posts: number; comments: number; listings: number; total: number };

/** pending_* from mod_dashboard's one row; null when the row is missing or a count is not a count. */
export function toHeldCounts(
  rows: readonly { pending_posts: number | null; pending_comments: number | null; pending_listings: number | null }[] | null | undefined,
): HeldCounts | null {
  const row = rows?.[0];
  if (!row) return null;
  const { pending_posts: posts, pending_comments: comments, pending_listings: listings } = row;
  if (!isCount(posts) || !isCount(comments) || !isCount(listings)) return null;
  return { posts, comments, listings, total: posts + comments + listings };
}

const plural = (n: number, one: string) => `${formatCount(n)} ${n === 1 ? one : `${one}s`}`;

/** "2 posts · 1 comment" (zeros left out); "Nothing waiting" when all are zero. */
export function heldBreakdown(counts: HeldCounts): string {
  const parts = [
    counts.posts > 0 ? plural(counts.posts, 'post') : null,
    counts.comments > 0 ? plural(counts.comments, 'comment') : null,
    counts.listings > 0 ? plural(counts.listings, 'listing') : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing waiting';
}

/** mod_get_content's row for a held item: the content plus its hold record; null when it no longer exists. */
export function toHeldContent(
  target: HeldTarget,
  rows: readonly (ContentRow & { hold_reason: string | null; matched_term: string | null })[] | null | undefined,
): { content: ModContent; hold: Hold } | null {
  const content = toModContent(target, rows);
  const row = rows?.[0];
  return content && row ? { content, hold: toHold(row.hold_reason, row.matched_term) } : null;
}

export type ReviewAction = 'approve' | 'reject';

/** Approve and Reject only while the item is still pending (mod_review refuses anything else). */
export function allowedReviewActions(status: string | null): ReviewAction[] {
  return status === 'pending' ? ['approve', 'reject'] : [];
}

/** The held queue, one held item and the hub's held counts and totals: refreshed after any Approve or Reject. */
export const HELD_CACHE_KEYS = [['mod-held'], ['mod-held-item'], ['mod-dashboard'], ['mod-stats']] as const;

/**
 * What an Approve or Reject refreshes. Approve publishes the item, so the public lists it now appears
 * in refetch (a comment: the threads and its parent's count). Reject only leaves the queue.
 */
export function reviewInvalidations(type: HeldType, id: string, action: ReviewAction): (readonly string[])[] {
  if (action === 'reject') return [type === 'listing' ? ['listing', id] : type === 'post' ? ['post', id] : ['comments'], ...HELD_CACHE_KEYS];
  const item =
    type === 'post'
      ? [['feed'], ['post', id], ['user-posts'], ['trending'], ['polls']]
      : type === 'listing'
        ? [['listings'], ['listing', id]]
        : [['comments'], ['replies'], ['post'], ['listing']];
  return [...item, ...HELD_CACHE_KEYS];
}
