import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { Announcement } from '@/hooks/useAnnouncement';
import { useTheme } from '@/hooks/useTheme';

/** Pinned on top of the Feed while an announcement is active. */
export function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  const { colors } = useTheme();
  return (
    <View className="gap-2 rounded-2xl border border-accent bg-accent-dim p-4" accessibilityRole="summary">
      <View className="flex-row items-center gap-2">
        <Ionicons name="megaphone" size={16} color={colors.accent} />
        <Text className="text-xs font-bold uppercase tracking-widest text-accent">Announcement</Text>
      </View>
      <Text className="text-base font-bold text-text">{announcement.title}</Text>
      <Text className="text-sm leading-5 text-text">{announcement.body}</Text>
    </View>
  );
}
