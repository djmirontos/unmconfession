import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { Announcement } from '@/hooks/useAnnouncement';
import { useTheme } from '@/hooks/useTheme';

/** Pinned on top of the Feed while an announcement is active. Shows only the body (the title is a staff label). */
export function AnnouncementCard({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="gap-2 rounded-2xl border border-accent bg-accent-dim p-4" accessibilityRole="summary">
      <View className="flex-row items-center gap-2 pr-8">
        <Ionicons name="megaphone" size={16} color={colors.accent} />
        <Text className="text-xs font-bold uppercase tracking-widest text-accent">Announcement</Text>
      </View>
      {/* Plain text: line breaks kept, nothing parsed, links not clickable. */}
      <Text className="text-sm leading-5 text-text">{announcement.body}</Text>
      {/* 44 x 44 tap area in the corner, so the card keeps its height. */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close announcement"
        className="absolute right-0.5 top-0.5 h-11 w-11 items-center justify-center rounded-full active:opacity-60"
      >
        <Ionicons name="close" size={18} color={colors.textDim} />
      </Pressable>
    </View>
  );
}
