import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuestPrompt } from '@/components/auth/GuestPrompt';
import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { MoreButton } from '@/components/myposts/MoreButton';
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
  const { query, items, unreadInList, markRead, remove, removeAll, signedIn } = useNotifications();
  const unreadCount = useUnreadNotifications();
  const [pulling, setPulling] = useState(false);
  const [menuFor, setMenuFor] = useState<NotificationGroup | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

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
      const openListing = (id: string) => router.push({ pathname: '/listing/[id]', params: { id } });
      // A post or listing target, if it is still published.
      const openTarget = () => {
        if (g.target_status !== 'published') return showToast(UNAVAILABLE);
        return g.target_type === 'listing' ? openListing(g.target_id) : openPost(g.target_id);
      };
      // A comment target: the thread it belongs to.
      const openParent = () =>
        g.parent_post_id ? openPost(g.parent_post_id) : g.parent_listing_id ? openListing(g.parent_listing_id) : showToast(UNAVAILABLE);
      switch (g.type) {
        case 'comment':
        case 'reaction':
          return openTarget();
        case 'comment_reaction':
        case 'reply':
          return openParent();
        case 'content_approved':
          return g.target_type === 'comment' ? openParent() : openTarget();
        case 'content_rejected':
        case 'content_removed':
          // Posts and listings: their status screen. Comments: the row's second line already says why.
          if (g.target_type !== 'comment') {
            router.push({ pathname: '/post-status', params: { source: g.target_type, id: g.target_id } });
          }
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

  // Header "⋯": shown only once the list has loaded with something in it.
  const canMarkAll = unreadCount > 0 || unreadInList;
  const showHeaderMenu = signedIn && !!query.data && items.length > 0;
  const headerActions = useMemo<SheetAction[]>(
    () => [
      ...(canMarkAll ? [{ label: 'Mark all as read', icon: 'checkmark-done-outline' as const, onPress: () => markRead('all') }] : []),
      { label: 'Delete all', icon: 'trash-outline', destructive: true, onPress: removeAll },
    ],
    [canMarkAll, markRead, removeAll],
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
      <BackHeader
        title="Notifications"
        right={showHeaderMenu ? <MoreButton onPress={() => setHeaderMenuOpen(true)} accessibilityLabel="More options" /> : undefined}
      />
      {body}
      <ActionSheet visible={menuFor !== null} actions={menuActions} onClose={() => setMenuFor(null)} />
      <ActionSheet visible={headerMenuOpen && showHeaderMenu} actions={headerActions} onClose={() => setHeaderMenuOpen(false)} />
    </View>
  );
}
