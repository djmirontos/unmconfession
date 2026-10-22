import { memo } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/profile/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ThreadComment } from '@/hooks/useComments';
import { formatRelative } from '@/lib/time';

function CommentItemImpl({ comment }: { comment: ThreadComment }) {
  return (
    <View className="flex-row gap-3 py-3">
      <Avatar avatarKey={comment.avatar_key} size={32} />
      <View className="flex-1 gap-1">
        <View className="flex-row items-baseline gap-2">
          <Text numberOfLines={1} className="shrink text-sm font-bold text-text">
            {comment.nickname ?? 'member'}
          </Text>
          <Text className="text-xs text-text-dim">{formatRelative(comment.published_at)}</Text>
        </View>
        <Text className="text-base leading-6 text-text" selectable>
          {comment.body}
        </Text>
      </View>
    </View>
  );
}

export const CommentItem = memo(CommentItemImpl);

export function CommentSkeleton() {
  return (
    <View className="flex-row gap-3 py-3">
      <Skeleton width={32} height={32} className="rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton width="35%" height={10} />
        <Skeleton height={12} />
        <Skeleton width="60%" height={12} />
      </View>
    </View>
  );
}
