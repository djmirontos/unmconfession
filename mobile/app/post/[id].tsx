import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentItem, CommentSkeleton } from '@/components/comments/CommentItem';
import { EmptyState, ErrorState, ListFooter, RefreshErrorBanner } from '@/components/feed/ListStates';
import { PostCard } from '@/components/feed/PostCard';
import { BackHeader } from '@/components/layout/BackHeader';
import { PostCardSkeleton } from '@/components/skeletons/PostCardSkeleton';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { Button } from '@/components/ui/Button';
import { useAppActive } from '@/hooks/useAppActive';
import { useComingSoonAction } from '@/hooks/useComingSoonAction';
import { type ThreadComment, useComments } from '@/hooks/useComments';
import { usePost } from '@/hooks/usePost';
import { usePostCountsRefresh } from '@/hooks/usePostCountsRefresh';
import { getErrorMessage } from '@/lib/errors';

const keyExtractor = (c: ThreadComment) => c.id;
const renderComment = ({ item }: ListRenderItemInfo<ThreadComment>) => <CommentItem comment={item} />;

export default function PostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const post = usePost(id);
  const { query: commentsQuery, comments } = useComments(id);
  const onAction = useComingSoonAction();
  const appActive = useAppActive();
  const isFocused = useIsFocused();
  // Counts poll while open; new comments also refresh them right away (useComments).
  usePostCountsRefresh(() => (id ? [id] : []), appActive && isFocused);

  const onEndReached = useCallback(() => {
    if (commentsQuery.hasNextPage && !commentsQuery.isFetchingNextPage) void commentsQuery.fetchNextPage();
  }, [commentsQuery]);

  let body;
  if (post.data === undefined) {
    body = (
      <View className="p-4">
        {post.isError ? (
          <ErrorState message={getErrorMessage(post.error)} onRetry={() => void post.refetch()} />
        ) : (
          <SkeletonList item={PostCardSkeleton} count={1} />
        )}
      </View>
    );
  } else if (post.data === null) {
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
    const data = post.data;
    body = (
      <FlashList
        data={commentsQuery.data ? comments : []}
        renderItem={renderComment}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          <View className="gap-4 pb-2">
            {post.isRefetchError ? <RefreshErrorBanner onRetry={() => void post.refetch()} /> : null}
            <PostCard post={data} onAction={onAction} full />
            <Text accessibilityRole="header" className="text-xs font-bold uppercase tracking-widest text-text-dim">
              Comments
            </Text>
          </View>
        }
        ListEmptyComponent={
          commentsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(commentsQuery.error)}
              onRetry={() => void commentsQuery.refetch()}
            />
          ) : commentsQuery.data ? (
            <EmptyState icon="chatbubble-outline" title="No comments yet" />
          ) : (
            <SkeletonList item={CommentSkeleton} count={3} />
          )
        }
        ListFooterComponent={
          comments.length > 0 ? (
            <ListFooter loadingMore={commentsQuery.isFetchingNextPage} reachedEnd={false} endLabel="" />
          ) : null
        }
      />
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Post" />
      {body}
    </View>
  );
}
