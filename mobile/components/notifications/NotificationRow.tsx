import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/profile/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';
import { knownReason } from '@/lib/moderationReasons';
import { describeNotification, type NotificationGroup } from '@/lib/notifications';
import { REACTIONS } from '@/lib/reactions';
import { formatRelative } from '@/lib/time';

const AVATAR = 44;

function Leading({ group }: { group: NotificationGroup }) {
  const { colors } = useTheme();
  if (group.type === 'comment' || group.type === 'reaction') {
    const reaction = group.type === 'reaction' && group.reaction_type ? REACTIONS[group.reaction_type] : null;
    return (
      <View style={{ width: AVATAR, height: AVATAR }}>
        <Avatar avatarKey={group.actor_avatar_key} size={AVATAR} />
        {reaction ? (
          <View className="absolute -bottom-1 -right-1 rounded-full bg-surface1 p-0.5">
            <Image source={reaction.image} style={{ width: 20, height: 20 }} contentFit="contain" />
          </View>
        ) : group.type === 'comment' ? (
          <View className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-full bg-accent">
            <Ionicons name="chatbubble" size={12} color={colors.onAccent} />
          </View>
        ) : null}
      </View>
    );
  }
  // Moderation notices: the app's shield instead of a person.
  const approved = group.type === 'content_approved';
  return (
    <View
      style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
      className={`items-center justify-center ${approved ? 'bg-success/15' : 'bg-danger/10'}`}
    >
      <Ionicons
        name={approved ? 'shield-checkmark-outline' : 'shield-outline'}
        size={22}
        color={approved ? colors.success : colors.danger}
      />
    </View>
  );
}

type Props = {
  group: NotificationGroup;
  onPress: (group: NotificationGroup) => void;
  onLongPress: (group: NotificationGroup) => void;
};

function NotificationRowImpl({ group, onPress, onLongPress }: Props) {
  const unread = group.unread_count > 0;
  const sentence = describeNotification(group);
  const reason = group.type === 'content_rejected' || group.type === 'content_removed' ? knownReason(group.reason) : null;
  const time = formatRelative(group.latest_at);
  const reactionLabel = group.type === 'reaction' && group.reaction_type ? `, ${REACTIONS[group.reaction_type].label}` : '';

  return (
    <Pressable
      onPress={() => onPress(group)}
      onLongPress={() => onLongPress(group)}
      accessibilityRole="button"
      accessibilityLabel={[
        unread ? 'Unread.' : null,
        `${sentence}${reactionLabel}.`,
        reason,
        group.target_preview,
        time,
      ]
        .filter(Boolean)
        .join(' ')}
      accessibilityHint="Opens it. Long press for options."
      accessibilityActions={[{ name: 'longpress', label: 'Options' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') onLongPress(group);
      }}
      className={`min-h-11 flex-row gap-3 rounded-2xl border p-4 active:opacity-80 ${unread ? 'border-accent/40 bg-accent-dim' : 'border-hairline bg-surface1'}`}
    >
      <Leading group={group} />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={2} className={`text-sm leading-5 text-text ${unread ? 'font-bold' : ''}`}>
          {sentence}
        </Text>
        {reason ? (
          <Text numberOfLines={2} className="text-sm leading-5 text-text">
            {reason}
          </Text>
        ) : null}
        {group.target_preview ? (
          <Text numberOfLines={1} className="text-sm text-text-dim">
            {group.target_preview}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-2">
        <Text className="text-xs text-text-dim">{time}</Text>
        {unread ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
      </View>
    </Pressable>
  );
}

export const NotificationRow = memo(NotificationRowImpl);

export function NotificationRowSkeleton() {
  return (
    <View className="flex-row gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      <Skeleton width={AVATAR} height={AVATAR} className="rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton width="80%" height={12} />
        <Skeleton width="55%" height={12} />
      </View>
      <Skeleton width={24} height={10} />
    </View>
  );
}
