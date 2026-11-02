import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AuthorLine } from '@/components/feed/AuthorLine';
import { CardTag } from '@/components/feed/CardTag';
import type { FeedPost } from '@/lib/posts';

type Props = Pick<FeedPost, 'kind' | 'postType' | 'author_id' | 'nickname' | 'avatar_key' | 'published_at'> & {
  /** Shows "· Edited" after the time when set. */
  edited_at?: string | null;
  /** Extra controls after the tag (My Posts: status badge and "⋯"). */
  accessory?: ReactNode;
  /** Before the author (Trending: the rank). */
  leading?: ReactNode;
};

export function PostHeader({ kind, postType, author_id, nickname, avatar_key, published_at, edited_at, accessory, leading }: Props) {
  // Post numbers are not shown to members (v1.0.3); the slot tags polls and Q&A posts.
  const tag = kind === 'poll' ? 'Poll' : postType === 'qa' ? 'Q&A' : null;
  return (
    <View className="flex-row items-center gap-2">
      {leading}
      <AuthorLine authorId={author_id} nickname={nickname} avatarKey={avatar_key} time={published_at} editedAt={edited_at} />
      {tag ? <CardTag label={tag} accessibilityLabel={tag} /> : null}
      {accessory}
    </View>
  );
}
