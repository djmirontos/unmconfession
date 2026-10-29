import { Ionicons } from '@expo/vector-icons';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuestPrompt } from '@/components/auth/GuestPrompt';
import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { PostCard } from '@/components/feed/PostCard';
import { BackHeader } from '@/components/layout/BackHeader';
import { Avatar } from '@/components/profile/Avatar';
import { CurrentProfileContext } from '@/components/profile/ProfileLink';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBlockUser } from '@/hooks/useBlockUser';
import { usePostListActions } from '@/hooks/usePostListActions';
import { useMembership } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { blockedByMeKey, useBlockedByMe, useUserPosts, useUserProfile } from '@/hooks/useUserProfile';
import { authorLabel } from '@/lib/authorLabel';
import { afterUnblock, atNickname, blockedUsersKey, unblockUser } from '@/lib/blocks';
import { getErrorMessage } from '@/lib/errors';
import type { FeedPost } from '@/lib/posts';
import { getProfileViewState, isValidUserId } from '@/lib/profileView';
import { useAuthStore } from '@/stores/authStore';
import { usePickerOpen } from '@/stores/reactionPickerStore';
import { useToastStore } from '@/stores/toastStore';

const AVATAR_SIZE = 96;
const keyExtractor = (post: FeedPost) => post.id;
const getItemType = (post: FeedPost) => post.kind;

/** Big avatar and nickname: everything a profile shows besides the posts. */
function ProfileHead({ userId, nickname, avatarKey }: { userId: string; nickname: string | null; avatarKey: string | null }) {
  return (
    <View className="items-center gap-3 pb-4 pt-2">
      <Avatar avatarKey={avatarKey} userId={userId} nickname={nickname} size={AVATAR_SIZE} deleted={nickname === null} />
      <Text accessibilityRole="header" numberOfLines={1} className="text-2xl font-bold text-text">
        {authorLabel(nickname)}
      </Text>
    </View>
  );
}

function HeadSkeleton() {
  return (
    <View className="items-center gap-3 p-4" accessibilityLabel="Loading profile" accessibilityRole="progressbar">
      <Skeleton width={AVATAR_SIZE} height={AVATAR_SIZE} className="rounded-full" />
      <Skeleton width={140} height={20} />
      <View className="w-full pt-2">
        <SkeletonList item={PostCardSkeleton} count={2} />
      </View>
    </View>
  );
}

function Unavailable() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View className="gap-4 p-4">
      <EmptyState icon="person-outline" title="This profile isn't available" />
      <Button label="Back" variant="secondary" icon="chevron-back" onPress={goBack} />
    </View>
  );
}

function BlockButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Block user"
      className="h-11 flex-row items-center gap-1 rounded-full px-3 active:bg-surface2"
    >
      <Ionicons name="ban-outline" size={18} color={colors.danger} />
      <Text className="text-sm font-semibold text-danger">Block</Text>
    </Pressable>
  );
}

/** The member's posts, with the Feed's card behaviour (open, react, vote, share, "⋯"). */
function UserPosts({ userId, head }: { userId: string; head: ReactElement }) {
  const { colors } = useTheme();
  const pickerOpen = usePickerOpen();
  const [pulling, setPulling] = useState(false);
  const { query, posts } = useUserPosts(userId);
  const { onAction, openPost, openComments, sharePost, moreFor, menu } = usePostListActions();

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedPost>) => (
      <View className="pb-3">
        <PostCard
          post={item}
          onOpen={openPost}
          onAction={onAction}
          onComment={openComments}
          onShare={sharePost}
          onMore={moreFor(item)}
        />
      </View>
    ),
    [openPost, onAction, openComments, sharePost, moreFor],
  );

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);

  const onRefresh = useCallback(async () => {
    setPulling(true);
    await query.refetch();
    setPulling(false);
  }, [query]);

  if (!query.data) {
    return (
      <View className="flex-1 p-4">
        {head}
        {query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <SkeletonList item={PostCardSkeleton} count={2} />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlashList
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ListHeaderComponent={
          <View>
            {head}
            {query.isRefetchError ? (
              <View className="pb-3">
                <RefreshErrorBanner onRetry={() => void query.refetch()} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="document-text-outline" title="No posts yet" />}
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <View className="py-3">
              <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
            </View>
          ) : (
            <ListFooter loadingMore={query.isFetchingNextPage} reachedEnd={!query.hasNextPage && posts.length > 0} endLabel="That's everything." />
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        scrollEnabled={!pickerOpen}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface1}
          />
        }
      />
      {menu}
    </View>
  );
}

/** A member's public profile: avatar, nickname and their posts. Signed-in members only. */
export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const block = useBlockUser();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = isValidUserId(rawId) ? rawId.toLowerCase() : null;
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);
  const { status } = useMembership();
  const isGuest = status === 'guest';
  const isSelf = id !== null && id === viewerId;
  const lookUp = isGuest || isSelf ? null : id;
  const profile = useUserProfile(lookUp);
  const blocked = useBlockedByMe(lookUp);
  const [unblocking, setUnblocking] = useState(false);

  const loading = lookUp !== null && (profile.data === undefined || blocked.data === undefined);
  const failed = lookUp !== null && (profile.isError || blocked.isError) && loading;
  const state = getProfileViewState({
    isGuest,
    isSelf,
    profile: lookUp === null ? null : (profile.data ?? null),
    blockedByMe: blocked.data ?? false,
  });

  // Your own avatar opens the Profile tab; a link here (old notice, deep link) does the same.
  useEffect(() => {
    if (state === 'self') router.replace('/(tabs)/profile');
  }, [state, router]);

  const user = profile.data;
  const onBlock = useCallback(() => {
    if (!user || !viewerId) return;
    block({ id: user.id, nickname: user.nickname }, () => queryClient.setQueryData(blockedByMeKey(viewerId, user.id), true));
  }, [block, user, viewerId, queryClient]);

  const onUnblock = useCallback(async () => {
    if (!user || !viewerId) return;
    setUnblocking(true);
    try {
      await unblockUser(viewerId, user.id);
      queryClient.setQueryData(blockedByMeKey(viewerId, user.id), false);
      showToast(`Unblocked ${atNickname(user.nickname)}`);
      afterUnblock(queryClient);
      void queryClient.invalidateQueries({ queryKey: blockedUsersKey(viewerId) });
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setUnblocking(false);
    }
  }, [user, viewerId, queryClient, showToast]);

  let body;
  if (state === 'guest') {
    body = (
      <View className="p-4">
        <GuestPrompt message="Sign in to see member profiles." />
      </View>
    );
  } else if (state === 'self') {
    body = null;
  } else if (failed) {
    body = (
      <View className="p-4">
        <ErrorState
          message={getErrorMessage(profile.error ?? blocked.error)}
          onRetry={() => {
            void profile.refetch();
            void blocked.refetch();
          }}
        />
      </View>
    );
  } else if (loading) {
    body = <HeadSkeleton />;
  } else if (state === 'missing' || !user) {
    body = <Unavailable />;
  } else if (state === 'deleted') {
    body = (
      <View className="p-4">
        <ProfileHead userId={user.id} nickname={null} avatarKey={null} />
      </View>
    );
  } else if (state === 'blocked') {
    body = (
      <View className="gap-4 p-4">
        <ProfileHead userId={user.id} nickname={user.nickname} avatarKey={user.avatar_key} />
        <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
          <Text className="text-base text-text">You blocked this user</Text>
          <Button label="Unblock" variant="secondary" loading={unblocking} onPress={() => void onUnblock()} />
        </View>
      </View>
    );
  } else {
    body = (
      <CurrentProfileContext.Provider value={user.id}>
        <UserPosts userId={user.id} head={<ProfileHead userId={user.id} nickname={user.nickname} avatarKey={user.avatar_key} />} />
      </CurrentProfileContext.Provider>
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title={state === 'ok' && user ? authorLabel(user.nickname) : 'Profile'} right={state === 'ok' ? <BlockButton onPress={onBlock} /> : undefined} />
      {body}
    </View>
  );
}
