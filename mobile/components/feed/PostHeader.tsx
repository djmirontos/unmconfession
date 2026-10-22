import { Text, View } from 'react-native';

import { Avatar } from '@/components/profile/Avatar';
import type { FeedPost } from '@/lib/posts';
import { formatRelative } from '@/lib/time';

type Props = Pick<FeedPost, 'kind' | 'number' | 'nickname' | 'avatar_key' | 'published_at'>;

export function PostHeader({ kind, number, nickname, avatar_key, published_at }: Props) {
  const tag = kind === 'poll' ? 'Poll' : number !== null ? `#${number}` : null;
  return (
    <View className="flex-row items-center gap-3">
      <Avatar avatarKey={avatar_key} size={36} />
      <View className="flex-1">
        <Text numberOfLines={1} className="text-base font-bold text-text">
          {nickname ?? 'member'}
        </Text>
        <Text className="text-xs text-text-dim">{formatRelative(published_at)}</Text>
      </View>
      {tag ? (
        <Text
          className="rounded-full bg-surface2 px-2.5 py-1 text-xs font-bold text-text-dim"
          accessibilityLabel={kind === 'poll' ? 'Poll' : `Post number ${number}`}
        >
          {tag}
        </Text>
      ) : null}
    </View>
  );
}
