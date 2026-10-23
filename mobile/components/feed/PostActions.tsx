import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { PostAction } from '@/hooks/useComingSoonAction';
import { useTheme } from '@/hooks/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type ButtonProps = {
  icon: IconName;
  label: string;
  count?: number;
  active?: boolean;
  onPress: () => void;
};

function ActionButton({ icon, label, count, active, onPress }: ButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      className="h-9 flex-row items-center gap-1.5 rounded-full px-3 active:bg-surface2"
    >
      <Ionicons name={icon} size={18} color={active ? colors.accent : colors.textDim} />
      {count !== undefined ? <Text className="text-sm font-bold text-text-dim">{count}</Text> : null}
    </Pressable>
  );
}

type Props = {
  reactionCount: number;
  commentCount: number;
  reacted: boolean;
  onAction: (action: PostAction) => void;
};

export function PostActions({ reactionCount, commentCount, reacted, onAction }: Props) {
  return (
    <View className="-mx-3 flex-row items-center">
      <ActionButton
        icon={reacted ? 'heart' : 'heart-outline'}
        label="Reactions"
        count={reactionCount}
        active={reacted}
        onPress={() => onAction('react')}
      />
      <ActionButton
        icon="chatbubble-outline"
        label="Comments"
        count={commentCount}
        onPress={() => onAction('comment')}
      />
      <View className="flex-1" />
      <ActionButton icon="share-social-outline" label="Share" onPress={() => onAction('share')} />
    </View>
  );
}

/** Read-only counts (My Posts): same icons as the action bar, nothing tappable. Omit a count to hide it. */
export function PostCounts({ reactionCount, commentCount }: { reactionCount?: number; commentCount: number }) {
  const { colors } = useTheme();
  const items: { icon: IconName; label: string; count: number }[] = [
    ...(reactionCount !== undefined ? [{ icon: 'heart-outline' as const, label: 'Reactions', count: reactionCount }] : []),
    { icon: 'chatbubble-outline', label: 'Comments', count: commentCount },
  ];
  return (
    <View className="flex-row items-center gap-4">
      {items.map((i) => (
        <View key={i.label} className="flex-row items-center gap-1.5" accessibilityLabel={`${i.label}, ${i.count}`}>
          <Ionicons name={i.icon} size={18} color={colors.textDim} />
          <Text className="text-sm font-bold text-text-dim">{i.count}</Text>
        </View>
      ))}
    </View>
  );
}
