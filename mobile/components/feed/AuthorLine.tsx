import { Text, View } from 'react-native';

import { BadgeChip } from '@/components/badges/BadgeChip';
import { Avatar } from '@/components/profile/Avatar';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { authorLabel, isDeletedAuthor } from '@/lib/authorLabel';
import { formatRelative } from '@/lib/time';

type Props = { authorId: string | null; nickname: string | null; avatarKey: string | null; time: string; editedAt?: string | null };

/**
 * Avatar, nickname (+ badge chip) and "2h · Edited". Shared by post and listing cards. The avatar
 * and the name each open the profile (two links, as in comments, so the chip between them stays
 * reachable); everything else in the header still opens the card.
 */
export function AuthorLine({ authorId, nickname, avatarKey, time, editedAt }: Props) {
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <ProfileLink userId={authorId} nickname={nickname} height={36}>
        <Avatar avatarKey={avatarKey} userId={authorId} nickname={nickname} size={36} deleted={isDeletedAuthor(nickname)} />
      </ProfileLink>
      <View className="shrink">
        {/* The nickname truncates before the chip; the chip never wraps to a second line. */}
        <View className="flex-row items-center gap-1.5">
          <ProfileLink userId={authorId} nickname={nickname} height={24} className="shrink">
            <Text numberOfLines={1} className="text-base font-bold text-text">
              {authorLabel(nickname)}
            </Text>
          </ProfileLink>
          <BadgeChip userId={authorId} nickname={nickname} />
        </View>
        <Text className="text-xs text-text-dim">
          {formatRelative(time)}
          {editedAt ? ' · Edited' : ''}
        </Text>
      </View>
    </View>
  );
}
