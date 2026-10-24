import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PostBody } from '@/components/feed/PostBody';
import { MoreButton } from '@/components/myposts/MoreButton';
import { Avatar } from '@/components/profile/Avatar';
import { ReactionButton } from '@/components/reactions/ReactionButton';
import { TopReactions } from '@/components/reactions/TopReactions';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ThreadComment } from '@/lib/comments';
import { setCommentReaction } from '@/lib/commentReactionSync';
import { formatRelative } from '@/lib/time';

type Props = {
  comment: ThreadComment;
  /** Opens the comment's menu: Edit / Delete for my own, Report / Block for others. */
  onMore?: (comment: ThreadComment) => void;
  /** My own comment (changes the menu button's label). */
  mine?: boolean;
  /** "Reply" action (guests get the sign-in sheet from the caller). */
  onReply?: (comment: ThreadComment) => void;
  /** A reply: smaller avatar (the row is indented by the list). */
  isReply?: boolean;
};

function CommentItemImpl({ comment, onMore, mine = false, onReply, isReply = false }: Props) {
  const sending = comment.state === 'sending';
  const name = comment.nickname ?? 'member';
  return (
    <View className={`flex-row gap-3 ${isReply ? 'py-2' : 'py-3'} ${sending ? 'opacity-60' : ''}`}>
      <Avatar avatarKey={comment.avatarKey} size={isReply ? 24 : 32} />
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink text-sm font-bold text-text">
            {name}
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
        {/* Only published comments can be reacted to (the server re-checks). */}
        {comment.state === 'published' ? (
          <View className="-my-1 -ml-2 flex-row items-center gap-1">
            <ReactionButton
              compact
              myReaction={comment.myReaction}
              count={comment.reactionCount}
              onChange={(next) => setCommentReaction(comment.id, comment.myReaction, next)}
            />
            <TopReactions compact ring="bg" types={comment.topReactions} total={comment.reactionCount} />
            {onReply ? (
              <Pressable
                onPress={() => onReply(comment)}
                accessibilityRole="button"
                accessibilityLabel={`Reply to ${name}`}
                className="min-h-11 justify-center rounded-full px-2 active:bg-surface2"
              >
                <Text className="text-xs font-bold text-text-dim">Reply</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
