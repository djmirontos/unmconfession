import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BadgeSheet } from '@/components/badges/BadgeSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';
import { useUserBadges } from '@/hooks/useUserBadges';
import { type Badge, badgeStyle } from '@/lib/badges';

/** 32 px chips; hit slop brings the touch area to 44 px without changing the layout. */
const CHIP_SLOP = 6;

function Chip({ badge, onPress }: { badge: Badge; onPress: () => void }) {
  const { colors } = useTheme();
  const style = badgeStyle(badge.code);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={CHIP_SLOP}
      accessibilityRole="button"
      accessibilityLabel={`${badge.name} badge`}
      // Staff labels: filled with the accent tint and an accent border; earned badges: neutral surface.
      className={`h-8 flex-row items-center gap-1.5 rounded-full border px-3 active:opacity-70 ${style.staff ? 'border-accent bg-accent-dim' : 'border-hairline bg-surface2'}`}
    >
      <Ionicons name={style.icon} size={14} color={colors[style.tone]} />
      <Text className="text-xs font-bold text-text">{badge.name}</Text>
    </Pressable>
  );
}

/**
 * A member's badges under their name. Two skeleton chips while loading; nothing at all when
 * there are none or loading failed (the profile never depends on it). Tap a chip for details.
 */
export function BadgeRow({ userId, align = 'center' }: { userId: string; align?: 'center' | 'start' }) {
  const { badges, loading } = useUserBadges(userId);
  const [open, setOpen] = useState<Badge | null>(null);
  // Centered under a public profile's name; left-aligned (no bottom gap) in the own Profile card.
  const layout = align === 'center' ? 'justify-center pb-3' : 'justify-start pt-1';

  if (loading) {
    return (
      <View className={`flex-row gap-2 ${layout}`} accessibilityLabel="Loading badges" accessibilityRole="progressbar">
        <Skeleton width={96} height={32} className="rounded-full" />
        <Skeleton width={80} height={32} className="rounded-full" />
      </View>
    );
  }
  if (badges.length === 0) return null;

  return (
    <>
      <View className={`flex-row flex-wrap gap-2 ${layout}`} accessibilityLabel="Badges">
        {badges.map((badge) => (
          <Chip key={badge.code} badge={badge} onPress={() => setOpen(badge)} />
        ))}
      </View>
      <BadgeSheet badge={open} onClose={() => setOpen(null)} />
    </>
  );
}
