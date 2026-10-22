import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { PollResults } from '@/components/feed/PollResults';
import { PostActions } from '@/components/feed/PostActions';
import { PostBody } from '@/components/feed/PostBody';
import { PostHeader } from '@/components/feed/PostHeader';
import { PostImages } from '@/components/feed/PostImages';
import type { PostAction } from '@/hooks/useComingSoonAction';
import type { FeedPost } from '@/lib/posts';

type Props = {
  post: FeedPost;
  /** Omitted on the detail screen, where the card is not a link. */
  onOpen?: (id: string) => void;
  onAction: (action: PostAction) => void;
  /** Full text, no "Read more" (detail screen). */
  full?: boolean;
};

function PostCardImpl({ post, onOpen, onAction, full = false }: Props) {
  const content = (
    <View className="gap-3">
      <PostHeader
        kind={post.kind}
        number={post.number}
        nickname={post.nickname}
        avatar_key={post.avatar_key}
        published_at={post.published_at}
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
          onVote={() => onAction('vote')}
        />
      ) : null}
      <PostActions
        reactionCount={post.reaction_count}
        commentCount={post.comment_count}
        reacted={post.my_reaction !== null}
        onAction={onAction}
      />
    </View>
  );
}

/** Feed and detail card. Memoized: the list re-renders a card only when its post object changes. */
export const PostCard = memo(PostCardImpl);
