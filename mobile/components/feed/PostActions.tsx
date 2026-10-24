import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ReactionButton } from '@/components/reactions/ReactionButton';
import { TopReactions, topReactionsWidth } from '@/components/reactions/TopReactions';
import type { PostAction } from '@/hooks/useComingSoonAction';
import { useTheme } from '@/hooks/useTheme';
import type { ReactionType } from '@/lib/reactions';
import { setReaction } from '@/lib/reactionSync';

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
  postId: string;
  myReaction: ReactionType | null;
  reactionCount: number;
  /** Most used reaction types, first = most used (up to 3). */
  topReactions: readonly ReactionType[];
  commentCount: number;
  /** Reacting is disabled until the post is fully loaded. */
  reactionsDisabled?: boolean;
  onAction: (action: PostAction) => void;
  /** Comment button: open the thread / focus the composer. Falls back to onAction('comment'). */
  onComment?: () => void;
};

export function PostActions({
  postId,
  myReaction,
  reactionCount,
  topReactions,
  commentCount,
  reactionsDisabled,
  onAction,
  onComment,
}: Props) {
  // Space between Comments and Share; the stack is left out when it would not fit (no wrapping).
  const [room, setRoom] = useState(0);
  const needed = topReactionsWidth(topReactions.length, reactionCount);
  return (
    <View className="-mx-3 h-9 flex-row items-center">
      <ReactionButton
        myReaction={myReaction}
        count={reactionCount}
        onChange={(next) => setReaction(postId, myReaction, next)}
        disabled={reactionsDisabled}
      />
      <ActionButton
        icon="chatbubble-outline"
        label="Comments"
        count={commentCount}
        onPress={onComment ?? (() => onAction('comment'))}
      />
      <View className="min-w-0 flex-1 flex-row justify-end" onLayout={(e) => setRoom(e.nativeEvent.layout.width)}>
        {needed > 0 && room >= needed ? <TopReactions types={topReactions} total={reactionCount} /> : null}
      </View>
      <ActionButton icon="share-social-outline" label="Share" onPress={() => onAction('share')} />
    </View>
  );
}

/** Read-only counts (My Posts): same icons as the action bar, nothing tappable. Omit a count to hide it. */
export function PostCounts({
  reactionCount,
  topReactions = [],
  commentCount,
}: {
  reactionCount?: number;
  /** With reactions: the same top-3 stack as the action bar instead of the heart. */
  topReactions?: readonly ReactionType[];
  commentCount: number;
}) {
  const { colors } = useTheme();
  const stack = reactionCount !== undefined && reactionCount > 0 && topReactions.length > 0;
  const items: { icon: IconName; label: string; count: number }[] = [
    ...(reactionCount !== undefined && !stack ? [{ icon: 'heart-outline' as const, label: 'Reactions', count: reactionCount }] : []),
    { icon: 'chatbubble-outline', label: 'Comments', count: commentCount },
  ];
  return (
    <View className="flex-row items-center gap-4">
      {stack ? <TopReactions types={topReactions} total={reactionCount} /> : null}
      {items.map((i) => (
        <View key={i.label} className="flex-row items-center gap-1.5" accessibilityLabel={`${i.label}, ${i.count}`}>
          <Ionicons name={i.icon} size={18} color={colors.textDim} />
          <Text className="text-sm font-bold text-text-dim">{i.count}</Text>
        </View>
      ))}
    </View>
  );
}
