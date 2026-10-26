import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { ContentMenu, type ContentMenuTarget } from '@/components/moderation/ContentMenu';
import { useComingSoonAction } from '@/hooks/useComingSoonAction';
import { useMembership } from '@/hooks/useProfile';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useShareCard } from '@/hooks/useShareCard';
import type { FeedPost } from '@/lib/posts';
import { useAuthStore } from '@/stores/authStore';

/**
 * What a list of post cards needs (Feed, Trending, Polls): open the post, open it with the
 * composer focused, share as an image card, the guest actions, and the "⋯" Report / Block menu for other
 * members' posts. Render `menu` once next to the list.
 */
export function usePostListActions() {
  const router = useRouter();
  const onAction = useComingSoonAction();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const requireAuth = useRequireAuth();
  const { status } = useMembership();
  const isMember = status === 'member';
  const [menuFor, setMenuFor] = useState<ContentMenuTarget | null>(null);

  const openPost = useCallback((id: string) => router.push({ pathname: '/post/[id]', params: { id } }), [router]);
  // Comment button: open the post with the composer focused. A guest gets the sign-in sheet in place
  // (the rest of the card still opens the post to read). Other non-members open the post as before.
  const openComments = useCallback(
    (id: string) => {
      if (status === 'guest') {
        requireAuth('comment');
        return;
      }
      router.push({ pathname: '/post/[id]', params: isMember ? { id, focus: 'comment' } : { id } });
    },
    [router, status, isMember, requireAuth],
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
