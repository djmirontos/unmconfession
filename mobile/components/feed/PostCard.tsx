import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { PollResults } from '@/components/feed/PollResults';
import { PostActions, PostCounts } from '@/components/feed/PostActions';
import { PostBody } from '@/components/feed/PostBody';
import { PostHeader } from '@/components/feed/PostHeader';
import { PostImages } from '@/components/feed/PostImages';
import { MoreButton } from '@/components/myposts/MoreButton';
import type { PostAction } from '@/hooks/useComingSoonAction';
import { usePollVote } from '@/hooks/usePollVote';
import type { FeedPost } from '@/lib/posts';

type Props = {
  post: FeedPost;
  /** Omitted on the detail screen, where the card is not a link. */
  onOpen?: (id: string) => void;
  /** Omit for a read-only card (My Posts): no action bar, no voting. */
  onAction?: (action: PostAction) => void;
  /** Full text, no "Read more" (detail screen). */
  full?: boolean;
  /** Read-only cards: show reaction and comment counts (published items only). */
  showCounts?: boolean;
  /** Next to the #number in the header (My Posts: status badge and "⋯"). */
  headerAccessory?: ReactNode;
  /** Below the card content (My Posts: review or rejection note). */
  footer?: ReactNode;
  /** Detail screen: true while only the cached feed copy is shown. */
  reactionsDisabled?: boolean;
  /** Comment button (Feed: open the post with the composer focused; detail: focus the composer). */
  onComment?: (id: string) => void;
  /** Feed: "⋯" in the header for someone else's post (Report / Block). Ignored when headerAccessory is set. */
  onMore?: (post: FeedPost) => void;
};

function PostCardImpl({ post, onOpen, onAction, full = false, showCounts = false, headerAccessory, footer, reactionsDisabled = false, onComment, onMore }: Props) {
  const vote = usePollVote(post.id, post.my_vote);
  const accessory =
    headerAccessory ?? (onMore ? <MoreButton onPress={() => onMore(post)} accessibilityLabel="More options for this post" /> : undefined);
  const content = (
    <View className="gap-3">
      <PostHeader
        kind={post.kind}
        number={post.number}
        nickname={post.nickname}
        avatar_key={post.avatar_key}
        published_at={post.published_at}
        edited_at={post.edited_at}
        accessory={accessory}
      />
      <PostBody postId={post.id} body={post.body} targetName={post.target_name} full={full} />
      <PostImages images={post.images} />
    </View>
  );

  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      {onOpen ? (
        <Pressable
          onPress={() => onOpen(post.id)}
          accessibilityRole="button"
          accessibilityHint="Opens the post and its comments"
          className="active:opacity-80"
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      {post.kind === 'poll' && post.poll_options ? (
        <PollResults
          options={post.poll_options}
          myVote={post.my_vote}
          endsAt={post.ends_at}
          onVote={onAction ? vote : undefined}
        />
      ) : null}
      {onAction ? (
        <PostActions
          reactionCount={post.reaction_count}
          commentCount={post.comment_count}
          postId={post.id}
          myReaction={post.my_reaction}
          reactionsDisabled={reactionsDisabled}
          onComment={onComment ? () => onComment(post.id) : undefined}
          onAction={onAction}
        />
      ) : showCounts ? (
        <PostCounts reactionCount={post.reaction_count} commentCount={post.comment_count} />
      ) : null}
      {footer}
    </View>
  );
}

/** Feed, detail and My Posts card. Memoized: the list re-renders a card only when its props change. */
export const PostCard = memo(PostCardImpl);
