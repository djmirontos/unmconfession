import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AuthorLine } from '@/components/feed/AuthorLine';
import { CardTag } from '@/components/feed/CardTag';
import type { FeedPost } from '@/lib/posts';

type Props = Pick<FeedPost, 'kind' | 'number' | 'nickname' | 'avatar_key' | 'published_at'> & {
  /** Shows "· Edited" after the time when set. */
  edited_at?: string | null;
  /** Extra controls after the tag (My Posts: status badge and "⋯"). */
  accessory?: ReactNode;
};

export function PostHeader({ kind, number, nickname, avatar_key, published_at, edited_at, accessory }: Props) {
  const tag = kind === 'poll' ? 'Poll' : number !== null ? `#${number}` : null;
  return (
    <View className="flex-row items-center gap-2">
      <AuthorLine nickname={nickname} avatarKey={avatar_key} time={published_at} editedAt={edited_at} />
      {tag ? <CardTag label={tag} accessibilityLabel={kind === 'poll' ? 'Poll' : `Post number ${number}`} /> : null}
      {accessory}
    </View>
  );
}
