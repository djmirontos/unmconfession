import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { ContentMenu, type ContentMenuTarget } from '@/components/moderation/ContentMenu';
import { useComingSoonAction } from '@/hooks/useComingSoonAction';
import { useShareCard } from '@/hooks/useShareCard';
import type { FeedPost } from '@/lib/posts';
import { useAuthStore } from '@/stores/authStore';
import { useCommentsSheetStore } from '@/stores/commentsSheetStore';

/**
 * What a list of post cards needs (Feed, Trending, Polls): open the post, open its comments in the
 * comments sheet, share as an image card, the guest actions, and the "⋯" Report / Block menu for other
 * members' posts. Render `menu` once next to the list.
 */
export function usePostListActions() {
  const router = useRouter();
  const onAction = useComingSoonAction();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const openSheet = useCommentsSheetStore((s) => s.open);
  const [menuFor, setMenuFor] = useState<ContentMenuTarget | null>(null);

  const openPost = useCallback((id: string) => router.push({ pathname: '/post/[id]', params: { id } }), [router]);
  // Comment button: the comments sheet, for everyone (guests read; the composer asks them to sign in).
  // The keyboard does not open by itself. Tapping the rest of the card still opens the post screen.
  const openComments = useCallback(
    (id: string, post?: FeedPost) =>
      openSheet({ postId: id, answers: post?.postType === 'qa', expectedCount: post?.comment_count ?? 0 }),
    [openSheet],
  );
  const openMenu = useCallback(
    (post: FeedPost) => setMenuFor({ type: 'post', id: post.id, authorId: post.author_id, nickname: post.nickname }),
    [],
  );
  /** "⋯" handler for this post: none for my own (they keep their own menus elsewhere). */
  const moreFor = useCallback((post: FeedPost) => (post.author_id === userId ? undefined : openMenu), [userId, openMenu]);

  const menu = <ContentMenu target={menuFor} onClose={() => setMenuFor(null)} />;

  const share = useShareCard();
  const sharePost = useCallback((post: FeedPost) => void share({ type: 'post', post }), [share]);

  return { onAction, openPost, openComments, sharePost, moreFor, menu };
}
