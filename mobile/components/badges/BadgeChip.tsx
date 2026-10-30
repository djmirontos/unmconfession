import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { BadgeSheet } from '@/components/badges/BadgeSheet';
import { useTheme } from '@/hooks/useTheme';
import { useTopBadge } from '@/hooks/useTopBadges';
import { useUserBadges } from '@/hooks/useUserBadges';
import { badgeStyle, type TopBadge } from '@/lib/badges';

const ICON = { default: 16, compact: 14 } as const;
// The slop brings the tap area to 44 pt around the bare icon without adding width. Most of the
// horizontal slop goes to the right, so it does not cover the end of the nickname (a profile link).
const LEFT_SLOP = 4;
const hitSlop = (size: number) => {
  const pad = Math.ceil((44 - size) / 2);
  return { top: pad, bottom: pad, left: LEFT_SLOP, right: 44 - size - LEFT_SLOP };
};

/** The full badge (description, earned date) is loaded only once the sheet opens. */
function TopBadgeSheet({ badge, onClose }: { badge: TopBadge; onClose: () => void }) {
  const { badges, loading } = useUserBadges(badge.userId);
  const full = badges.find((b) => b.code === badge.code);
  return (
    <BadgeSheet
      badge={full ?? { code: badge.code, name: badge.name, description: '', earnedAt: null }}
      loading={loading && !full}
      onClose={onClose}
    />
  );
}

type Props = {
  userId: string | null;
  /** null = a deleted account: no chip. */
  nickname: string | null;
  /** Comments: a slightly smaller icon. */
  compact?: boolean;
};

/**
 * One badge icon right after an author's nickname (icon only, no pill; the name is in the sheet).
 * Nothing for guests, deleted accounts or members without a badge. Tap for the badge sheet.
 */
export function BadgeChip({ userId, nickname, compact = false }: Props) {
  const { colors } = useTheme();
  const badge = useTopBadge(nickname === null ? null : userId);
  const [open, setOpen] = useState(false);
  if (!badge) return null;

  const style = badgeStyle(badge.code);
  const size = ICON[compact ? 'compact' : 'default'];
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={hitSlop(size)}
        accessibilityRole="button"
        accessibilityLabel={`${badge.name} badge`}
        className="ml-0.5 shrink-0 active:opacity-60"
      >
        <Ionicons name={style.icon} size={size} color={colors[style.tone]} />
      </Pressable>
      {open ? <TopBadgeSheet badge={badge} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
