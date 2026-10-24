import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuestPrompt } from '@/components/auth/GuestPrompt';
import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { NotificationRow, NotificationRowSkeleton } from '@/components/notifications/NotificationRow';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { getErrorMessage } from '@/lib/errors';
import type { NotificationGroup } from '@/lib/notifications';
import { useToastStore } from '@/stores/toastStore';

const keyExtractor = (g: NotificationGroup) => g.group_key;
const UNAVAILABLE = 'This content is no longer available.';
const LISTINGS_SOON = 'Listings open in Buy & Sell soon.';

function Separator() {
  return <View className="h-3" />;
}

/** Profile / Feed bell → Notifications: grouped, newest first. */
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const { query, items, unreadInList, markRead, remove, signedIn } = useNotifications();
  const unreadCount = useUnreadNotifications();
  const [pulling, setPulling] = useState(false);
  const [menuFor, setMenuFor] = useState<NotificationGroup | null>(null);

  // Leaving the screen: the badge refetches (reads made here may be pending on the server).
  useFocusEffect(
    useCallback(
      () => () => void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] }),
      [queryClient],
    ),
  );

  /** Marks the group read first (optimistic), then opens what it points at. */
  const open = useCallback(
    (g: NotificationGroup) => {
      markRead([g]);
      if (!g.target_exists) return showToast(UNAVAILABLE);
      const openPost = (id: string) => router.push({ pathname: '/post/[id]', params: { id } });
      switch (g.type) {
        case 'comment':
        case 'reaction':
          if (g.target_type === 'listing') return showToast(LISTINGS_SOON);
          return g.target_status === 'published' ? openPost(g.target_id) : showToast(UNAVAILABLE);
        case 'content_approved':
          if (g.target_type === 'post') return g.target_status === 'published' ? openPost(g.target_id) : showToast(UNAVAILABLE);
          if (g.target_type === 'comment' && g.parent_post_id) return openPost(g.parent_post_id);
          return showToast(LISTINGS_SOON);
        case 'content_rejected':
        case 'content_removed':
          // The row's second line already says why for comments and listings.
          if (g.target_type === 'post') router.push({ pathname: '/post-status', params: { source: 'post', id: g.target_id } });
          return;
      }
    },
    [markRead, router, showToast],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NotificationGroup>) => <NotificationRow group={item} onPress={open} onLongPress={setMenuFor} />,
    [open],
  );

  const menuActions = useMemo<SheetAction[]>(() => {
    if (!menuFor) return [];
    const g = menuFor;
    const actions: SheetAction[] = [];
    if (g.unread_count > 0) actions.push({ label: 'Mark as read', icon: 'checkmark-done-outline', onPress: () => markRead([g]) });
    actions.push({ label: 'Delete notification', icon: 'trash-outline', destructive: true, onPress: () => remove(g) });
    return actions;
  }, [menuFor, markRead, remove]);

  const onRefresh = useCallback(async () => {
    setPulling(true);
    await Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })]);
    setPulling(false);
  }, [query, queryClient]);

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
  }, [query]);

  const contentContainerStyle = useMemo(() => ({ padding: 16, paddingBottom: insets.bottom + 16 }), [insets.bottom]);

  const canMarkAll = signedIn && (unreadCount > 0 || unreadInList);
  const markAll = (
    <Pressable
      onPress={() => markRead('all')}
      disabled={!canMarkAll}
      accessibilityRole="button"
      accessibilityLabel="Mark all as read"
      accessibilityState={{ disabled: !canMarkAll }}
      className={`min-h-11 justify-center rounded-full px-3 active:bg-surface2 ${canMarkAll ? '' : 'opacity-40'}`}
    >
      <Text className="text-sm font-bold text-accent">Mark all as read</Text>
    </Pressable>
  );

  let body;
  if (!signedIn) {
    body = (
      <View className="p-4">
        <GuestPrompt message="Sign in to see replies, reactions and moderation updates about your posts." />
      </View>
    );
  } else if (!query.data) {
    body = (
      <View className="p-4">
        {query.isError ? (
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <SkeletonList item={NotificationRowSkeleton} count={6} />
        )}
      </View>
    );
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={
          query.isRefetchError ? (
            <View className="pb-3">
              <RefreshErrorBanner onRetry={() => void query.refetch()} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState icon="notifications-outline" title="You're all caught up" message="Replies, reactions and moderation updates show up here." />
        }
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <View className="py-3">
              <RefreshErrorBanner onRetry={() => void query.fetchNextPage()} />
            </View>
          ) : (
            <ListFooter loadingMore={query.isFetchingNextPage} reachedEnd={false} endLabel="" />
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
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
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Notifications" right={signedIn ? markAll : undefined} />
      {body}
      <ActionSheet visible={menuFor !== null} actions={menuActions} onClose={() => setMenuFor(null)} />
    </View>
  );
}
