import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AuthorLine } from '@/components/feed/AuthorLine';
import { CardTag } from '@/components/feed/CardTag';
import type { FeedPost } from '@/lib/posts';

type Props = Pick<FeedPost, 'kind' | 'number' | 'author_id' | 'nickname' | 'avatar_key' | 'published_at'> & {
  /** Shows "· Edited" after the time when set. */
  edited_at?: string | null;
  /** Extra controls after the tag (My Posts: status badge and "⋯"). */
  accessory?: ReactNode;
  /** Before the author (Trending: the rank). */
  leading?: ReactNode;
};

export function PostHeader({ kind, number, author_id, nickname, avatar_key, published_at, edited_at, accessory, leading }: Props) {
  const tag = kind === 'poll' ? 'Poll' : number !== null ? `#${number}` : null;
  return (
    <View className="flex-row items-center gap-2">
      {leading}
      <AuthorLine authorId={author_id} nickname={nickname} avatarKey={avatar_key} time={published_at} editedAt={edited_at} />
      {tag ? <CardTag label={tag} accessibilityLabel={kind === 'poll' ? 'Poll' : `Post number ${number}`} /> : null}
      {accessory}
    </View>
  );
}
