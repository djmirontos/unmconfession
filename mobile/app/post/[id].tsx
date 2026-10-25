import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentThread } from '@/components/comments/CommentThread';
import { EmptyState, ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { PostCard } from '@/components/feed/PostCard';
import { BackHeader } from '@/components/layout/BackHeader';
import { ContentMenu, type ContentMenuTarget } from '@/components/moderation/ContentMenu';
import { MoreButton } from '@/components/myposts/MoreButton';
import { OwnItemMenu } from '@/components/myposts/OwnItemMenu';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { Button } from '@/components/ui/Button';
import { useAppActive } from '@/hooks/useAppActive';
import { useComingSoonAction } from '@/hooks/useComingSoonAction';
import { useMyItem } from '@/hooks/useMyItem';
import { usePost } from '@/hooks/usePost';
import { usePostCountsRefresh } from '@/hooks/usePostCountsRefresh';
import { useShareCard } from '@/hooks/useShareCard';
import { getErrorMessage } from '@/lib/errors';
import type { FeedPost } from '@/lib/posts';
import { useAuthStore } from '@/stores/authStore';
import { usePickerOpen } from '@/stores/reactionPickerStore';

export default function PostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // focus=comment: opened from a Feed card's comment button.
  const { id = '', focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const post = usePost(id);
  const onAction = useComingSoonAction();
  const share = useShareCard();
  const sharePost = useCallback((p: FeedPost) => void share({ type: 'post', post: p }), [share]);
  const pickerOpen = usePickerOpen();
  const appActive = useAppActive();
  const isFocused = useIsFocused();
  // Counts poll while open; comment changes also adjust them right away.
  usePostCountsRefresh(() => (id ? [id] : []), appActive && isFocused);

  // Own post: load status and created_at (not in feed rows) for the "⋯" menu.
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const isOwn = !!userId && post.data?.author_id === userId;
  const own = useMyItem(isOwn ? 'post' : null, id);
  const [menuOpen, setMenuOpen] = useState(false);
  // Someone else's post: Report / Block. Blocking its author (here or from a comment) leaves the screen.
  const [otherMenu, setOtherMenu] = useState<ContentMenuTarget | null>(null);
  const authorId = post.data?.author_id;
  const onAuthorBlocked = useCallback(
    (blockedId: string) => {
      if (blockedId === authorId) router.back();
    },
    [authorId, router],
  );
  // The card's comment button focuses the composer below.
  const [focusRequest, setFocusRequest] = useState(0);
  const focusComposer = useCallback(() => setFocusRequest((n) => n + 1), []);

  const data = post.data;
  const refetchError = post.isRefetchError;
  const placeholder = post.isPlaceholderData;
  const refetchPost = post.refetch;
  const header = useMemo(
    () =>
      data ? (
        <View className="gap-4">
          {refetchError ? <RefreshErrorBanner onRetry={() => void refetchPost()} /> : null}
          <PostCard
            post={data}
            onAction={onAction}
            onComment={focusComposer}
            onShare={sharePost}
            full
            reactionsDisabled={placeholder}
          />
        </View>
      ) : (
        <View />
      ),
    [data, refetchError, placeholder, refetchPost, onAction, focusComposer, sharePost],
  );

  let body;
  if (data === undefined) {
    body = (
      <View className="p-4">
        {post.isError ? (
          <ErrorState message={getErrorMessage(post.error)} onRetry={() => void post.refetch()} />
        ) : (
          <SkeletonList item={PostCardSkeleton} count={1} />
        )}
      </View>
    );
  } else if (data === null) {
    body = (
      <View className="gap-4 p-4">
        <EmptyState
          icon="eye-off-outline"
          title="This post isn't available"
          message="It may have been removed or is waiting for review."
        />
        <Button label="Back to the feed" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    );
  } else {
    body = (
      <CommentThread
        targetType="post"
        targetId={id}
        header={header}
        focusComposer={focus === 'comment'}
        focusRequest={focusRequest}
        scrollEnabled={!pickerOpen}
        expectedCount={data.comment_count}
        onAuthorBlocked={onAuthorBlocked}
      />
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader
        title="Post"
        right={
          isOwn ? (
            own.data ? <MoreButton onPress={() => setMenuOpen(true)} /> : undefined
          ) : data ? (
            <MoreButton
              onPress={() => setOtherMenu({ type: 'post', id: data.id, authorId: data.author_id, nickname: data.nickname })}
              accessibilityLabel="More options for this post"
            />
          ) : undefined
        }
      />
      {body}
      <OwnItemMenu item={menuOpen ? (own.data ?? null) : null} onClose={() => setMenuOpen(false)} onDeleted={() => router.back()} />
      <ContentMenu target={otherMenu} onClose={() => setOtherMenu(null)} onBlocked={onAuthorBlocked} />
    </View>
  );
}
