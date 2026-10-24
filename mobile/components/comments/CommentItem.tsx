import { memo } from 'react';
import { Text, View } from 'react-native';

import { PostBody } from '@/components/feed/PostBody';
import { MoreButton } from '@/components/myposts/MoreButton';
import { Avatar } from '@/components/profile/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ThreadComment } from '@/lib/comments';
import { formatRelative } from '@/lib/time';

type Props = {
  comment: ThreadComment;
  /** Opens the comment's menu: Edit / Delete for my own, Report / Block for others. */
  onMore?: (comment: ThreadComment) => void;
  /** My own comment (changes the menu button's label). */
  mine?: boolean;
};

function CommentItemImpl({ comment, onMore, mine = false }: Props) {
  const sending = comment.state === 'sending';
  return (
    <View className={`flex-row gap-3 py-3 ${sending ? 'opacity-60' : ''}`}>
      <Avatar avatarKey={comment.avatarKey} size={32} />
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink text-sm font-bold text-text">
            {comment.nickname ?? 'member'}
          </Text>
          <Text className="flex-1 text-xs text-text-dim">
            {sending ? 'Sending…' : formatRelative(comment.time)}
            {!sending && comment.editedAt ? ' · Edited' : ''}
          </Text>
          {onMore && !sending ? (
            <MoreButton
              onPress={() => onMore(comment)}
              accessibilityLabel={mine ? 'More options for your comment' : 'More options for this comment'}
            />
          ) : null}
        </View>
        {/* Same 6-line "Read more" as post cards, keyed by comment id. */}
        <PostBody postId={comment.id} body={comment.body} targetName={null} />
        {comment.state === 'pending' ? (
          <View className="gap-0.5 self-start rounded-xl border border-accent bg-accent-dim px-2.5 py-1.5">
            <Text className="text-xs font-bold text-text">Waiting for review</Text>
            <Text className="text-xs text-text-dim">Only you can see this until a moderator approves it.</Text>
          </View>
        ) : null}
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
