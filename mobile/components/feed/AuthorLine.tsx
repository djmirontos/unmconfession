import { Text, View } from 'react-native';

import { Avatar } from '@/components/profile/Avatar';
import { formatRelative } from '@/lib/time';

type Props = { nickname: string | null; avatarKey: string | null; time: string; editedAt?: string | null };

/** Avatar, nickname and "2h · Edited". Shared by post and listing cards. */
export function AuthorLine({ nickname, avatarKey, time, editedAt }: Props) {
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <Avatar avatarKey={avatarKey} size={36} />
      <View className="flex-1">
        <Text numberOfLines={1} className="text-base font-bold text-text">
          {nickname ?? 'member'}
        </Text>
        <Text className="text-xs text-text-dim">
          {formatRelative(time)}
          {editedAt ? ' · Edited' : ''}
        </Text>
      </View>
    </View>
  );
}
