import { Text, View } from 'react-native';

import { Avatar } from '@/components/profile/Avatar';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { authorLabel, isDeletedAuthor } from '@/lib/authorLabel';
import { formatRelative } from '@/lib/time';

type Props = { authorId: string | null; nickname: string | null; avatarKey: string | null; time: string; editedAt?: string | null };

/** Avatar, nickname and "2h · Edited". Shared by post and listing cards. Avatar and name open the profile. */
export function AuthorLine({ authorId, nickname, avatarKey, time, editedAt }: Props) {
  return (
    <View className="flex-1 flex-row items-center">
      {/* Only as wide as its content, so the rest of the header still opens the card. */}
      <ProfileLink userId={authorId} nickname={nickname} height={36} className="shrink flex-row items-center gap-3">
        <Avatar avatarKey={avatarKey} userId={authorId} nickname={nickname} size={36} deleted={isDeletedAuthor(nickname)} />
        <View className="shrink">
          <Text numberOfLines={1} className="text-base font-bold text-text">
            {authorLabel(nickname)}
          </Text>
          <Text className="text-xs text-text-dim">
            {formatRelative(time)}
            {editedAt ? ' · Edited' : ''}
          </Text>
        </View>
      </ProfileLink>
    </View>
  );
}
