import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { ContentMenu, type ContentMenuTarget } from '@/components/moderation/ContentMenu';
import { useComingSoonAction } from '@/hooks/useComingSoonAction';
import { useMembership } from '@/hooks/useProfile';
import type { FeedPost } from '@/lib/posts';
import { useAuthStore } from '@/stores/authStore';

/**
 * What a list of post cards needs (Feed, Trending, Polls): open the post, open it with the
 * composer focused, the share / guest actions, and the "⋯" Report / Block menu for other
 * members' posts. Render `menu` once next to the list.
 */
export function usePostListActions() {
  const router = useRouter();
  const onAction = useComingSoonAction();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const isMember = useMembership().status === 'member';
  const [menuFor, setMenuFor] = useState<ContentMenuTarget | null>(null);

  const openPost = useCallback((id: string) => router.push({ pathname: '/post/[id]', params: { id } }), [router]);
  // Comment button: open the post with the composer focused (guests just read; the composer shows sign-in).
  const openComments = useCallback(
    (id: string) => router.push({ pathname: '/post/[id]', params: isMember ? { id, focus: 'comment' } : { id } }),
    [router, isMember],
  );
  const openMenu = useCallback(
    (post: FeedPost) => setMenuFor({ type: 'post', id: post.id, authorId: post.author_id, nickname: post.nickname }),
    [],
  );
  /** "⋯" handler for this post: none for my own (they keep their own menus elsewhere). */
  const moreFor = useCallback((post: FeedPost) => (post.author_id === userId ? undefined : openMenu), [userId, openMenu]);

  const menu = <ContentMenu target={menuFor} onClose={() => setMenuFor(null)} />;

  return { onAction, openPost, openComments, moreFor, menu };
}
