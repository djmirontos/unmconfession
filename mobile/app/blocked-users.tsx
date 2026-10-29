import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuestPrompt } from '@/components/auth/GuestPrompt';
import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { Avatar } from '@/components/profile/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { useBlockedUsers } from '@/hooks/useBlockedUsers';
import { authorLabel, isDeletedAuthor } from '@/lib/authorLabel';
import { atNickname, type BlockedUser } from '@/lib/blocks';
import { getErrorMessage } from '@/lib/errors';

const keyExtractor = (u: BlockedUser) => u.id;
// Same frame as the post and My Posts cards.
const CARD = 'flex-row items-center gap-3 rounded-2xl border border-hairline bg-surface1 p-4';
const NOTE = "Blocked members can't tell you blocked them. You won't see their posts, comments or listings.";

function Note() {
  return (
    <View className="mb-3 rounded-xl bg-surface2 px-4 py-3">
      <Text className="text-sm leading-5 text-text-dim">{NOTE}</Text>
    </View>
  );
}

function Separator() {
  return <View className="h-3" />;
}

function RowSkeleton() {
  return (
    <View className={CARD}>
      <Skeleton width={44} height={44} className="rounded-full" />
      <View className="flex-1">
        <Skeleton width="45%" height={14} />
      </View>
      <Skeleton width={84} height={36} className="rounded-full" />
    </View>
  );
}

function BlockedRow({ user, onUnblock }: { user: BlockedUser; onUnblock: (user: BlockedUser) => void }) {
  const name = atNickname(user.nickname);
  return (
    <View className={CARD}>
      <Avatar avatarKey={user.avatarKey} userId={user.id} nickname={user.nickname} size={44} deleted={isDeletedAuthor(user.nickname)} />
      <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-bold text-text">
        {authorLabel(user.nickname)}
      </Text>
      <Pressable
        onPress={() => onUnblock(user)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Unblock ${name}`}
        accessibilityHint={`Shows ${name}'s posts, comments and listings again`}
        className="min-h-11 shrink-0 justify-center rounded-full border border-accent px-4 active:bg-accent-dim"
      >
        <Text className="text-sm font-bold text-accent">Unblock</Text>
      </Pressable>
    </View>
  );
}

/** Profile → Blocked users: everyone I blocked, each with Unblock. */
export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const { query, unblock, signedIn } = useBlockedUsers();

  const onUnblock = useCallback((user: BlockedUser) => void unblock(user), [unblock]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<BlockedUser>) => <BlockedRow user={item} onUnblock={onUnblock} />,
    [onUnblock],
  );

  const contentContainerStyle = useMemo(() => ({ padding: 16, paddingBottom: insets.bottom + 16 }), [insets.bottom]);

  let body;
  if (!signedIn) {
    body = (
      <View className="p-4">
        <GuestPrompt message="Sign in to manage the members you blocked." />
      </View>
    );
  } else if (query.data === undefined) {
    body = (
      <View className="p-4">
        {query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <View accessibilityLabel="Loading blocked users" accessibilityRole="progressbar">
            <Note />
            <SkeletonList item={RowSkeleton} count={4} />
          </View>
        )}
      </View>
    );
  } else {
    body = (
      <FlashList
        data={query.data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={contentContainerStyle}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={query.data.length > 0 ? <Note /> : null}
        ListEmptyComponent={<EmptyState icon="ban-outline" title="You haven't blocked anyone." />}
      />
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Blocked users" />
      {body}
    </View>
  );
}
