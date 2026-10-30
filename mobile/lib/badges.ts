// Profile badges (Module 13a). Only type imports, so tests/badges.test.mjs runs it in Node.
// The rows come from get_user_badges (hooks/useUserBadges.ts), already ordered by the server.
import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { ThemeColors } from '@/theme/colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type Badge = { code: string; name: string; description: string; earnedAt: string | null };

/** How a chip looks. `tone` is a theme colour token, so light and dark mode both work. */
export type BadgeStyle = { icon: IconName; tone: keyof ThemeColors; staff: boolean };

const STYLES: Record<string, BadgeStyle> = {
  campus_hero: { icon: 'trophy', tone: 'accent', staff: false },
  first_circle: { icon: 'star', tone: 'accent', staff: false },
  campus_voice: { icon: 'megaphone', tone: 'success', staff: false },
  campus_regular: { icon: 'calendar', tone: 'navy', staff: false },
  nocturnal: { icon: 'moon', tone: 'navy', staff: false },
  moderator: { icon: 'shield-outline', tone: 'accent', staff: true },
  admin: { icon: 'shield-checkmark', tone: 'accent', staff: true },
};

// A badge added on the server before the app knows it: still shown, neutral.
const FALLBACK: BadgeStyle = { icon: 'ribbon-outline', tone: 'textDim', staff: false };

export function badgeStyle(code: string): BadgeStyle {
  return Object.hasOwn(STYLES, code) ? STYLES[code] ?? FALLBACK : FALLBACK;
}

/** Role labels carry no date; earned badges do. */
export const isStaffBadge = (badge: Badge) => badgeStyle(badge.code).staff;

type BadgeRow = { code: string | null; name: string | null; description: string | null; earned_at: string | null };

/** get_user_badges rows to Badges, dropping any row without a code or name. */
export function toBadges(rows: readonly BadgeRow[] | null | undefined): Badge[] {
  return (rows ?? []).flatMap((r) =>
    r.code && r.name ? [{ code: r.code, name: r.name, description: r.description ?? '', earnedAt: r.earned_at ?? null }] : [],
  );
}

// ---------------------------------------------------------------- one chip per author (get_top_badges)

export type TopBadge = { userId: string; code: string; name: string };

/** get_top_badges takes at most this many ids per call. */
export const TOP_BADGES_CHUNK = 100;

/** get_top_badges rows to TopBadges, dropping any row without an id, code or name. */
export function toTopBadges(rows: readonly { user_id: string | null; code: string | null; name: string | null }[] | null | undefined): TopBadge[] {
  return (rows ?? []).flatMap((r) => (r.user_id && r.code && r.name ? [{ userId: r.user_id, code: r.code, name: r.name }] : []));
}

/** The distinct ids still to ask for, in first-seen order: empty ids and fresh cache entries (including "no badge") are skipped. */
export function idsToFetch(ids: readonly (string | null | undefined)[], isFresh: (id: string) => boolean): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!isFresh(id)) out.push(id);
  }
  return out;
}

export function chunkIds(ids: readonly string[], size = TOP_BADGES_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** One answer per asked id: its badge, or null for "no badge" (so it is cached and not asked again). */
export function resultsById(asked: readonly string[], badges: readonly TopBadge[]): Map<string, TopBadge | null> {
  const byId = new Map<string, TopBadge | null>(asked.map((id) => [id, null]));
  for (const badge of badges) if (byId.has(badge.userId)) byId.set(badge.userId, badge);
  return byId;
}
