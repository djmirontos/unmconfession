import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BadgeSheet } from '@/components/badges/BadgeSheet';
import { useTheme } from '@/hooks/useTheme';
import { useTopBadges } from '@/hooks/useTopBadges';
import { useUserBadges } from '@/hooks/useUserBadges';
import { badgeStyle, type TopBadge } from '@/lib/badges';

const ICON = { default: 16, compact: 14 } as const;
const GAP = 6;
// Touch areas: 44 pt tall. Between icons each target reaches only half the gap, so neighbours never
// overlap (with 3 icons a full 44 pt width is not possible); the first keeps off the nickname (a
// profile link) and the last extends to the right, into the empty space after the row.
const EDGE_SLOP = 4;
const slopFor = (size: number, index: number, count: number) => {
  const vertical = Math.ceil((44 - size) / 2);
  const left = index === 0 ? EDGE_SLOP : GAP / 2;
  const right = index === count - 1 ? Math.max(GAP / 2, 44 - size - left) : GAP / 2;
  return { top: vertical, bottom: vertical, left, right };
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
  /** null = a deleted account: no icons. */
  nickname: string | null;
  /** Comments: slightly smaller icons. */
  compact?: boolean;
};

/**
 * Up to 3 badge icons right after an author's nickname, in priority order (staff label first).
 * Icons only, no pill; each opens the sheet for its own badge. Nothing for guests, deleted
 * accounts or members without a badge. The group never shrinks: the nickname truncates first.
 */
export function BadgeChip({ userId, nickname, compact = false }: Props) {
  const { colors } = useTheme();
  const badges = useTopBadges(nickname === null ? null : userId);
  const [open, setOpen] = useState<TopBadge | null>(null);
  if (badges.length === 0) return null;

  const size = ICON[compact ? 'compact' : 'default'];
  return (
    <>
      <View className="ml-0.5 shrink-0 flex-row items-center" style={{ gap: GAP }}>
        {badges.map((badge, i) => {
          const style = badgeStyle(badge.code);
          return (
            <Pressable
              key={badge.code}
              onPress={() => setOpen(badge)}
              hitSlop={slopFor(size, i, badges.length)}
              accessibilityRole="button"
              accessibilityLabel={`${badge.name} badge`}
              className="active:opacity-60"
            >
              <Ionicons name={style.icon} size={size} color={colors[style.tone]} />
            </Pressable>
          );
        })}
      </View>
      {open ? <TopBadgeSheet badge={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
