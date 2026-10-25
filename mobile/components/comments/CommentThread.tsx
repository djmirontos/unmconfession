import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { CommentComposer } from '@/components/comments/CommentComposer';
import { CommentItem, CommentSkeleton } from '@/components/comments/CommentItem';
import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { ContentMenu, type ContentMenuTarget } from '@/components/moderation/ContentMenu';
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { BackToTopButton } from '@/components/ui/BackToTopButton';
import { Button } from '@/components/ui/Button';
import { useBackToTop } from '@/hooks/useBackToTop';
import { type ThreadRow, useCommentThread } from '@/hooks/useCommentThread';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme } from '@/hooks/useTheme';
import { canEditComment, type CommentTarget, type ThreadComment } from '@/lib/comments';
import { getErrorMessage } from '@/lib/errors';

// Within this distance of the end, new comments from others are appended instead of raising the pill.
const NEAR_BOTTOM_PX = 160;
// Replies and their links sit this far in from the comment they belong to.
const REPLY_INDENT = 36;
const keyExtractor = (row: ThreadRow) => row.key;
const getItemType = (row: ThreadRow) => row.kind;

type LinkProps = { label: string; onPress: () => void; busy?: boolean };

/** "View 3 replies" / "View more replies" / "Hide replies": a quiet, indented text button. */
function ReplyLink({ label, onPress, busy = false }: LinkProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      style={{ marginLeft: REPLY_INDENT }}
      className="min-h-11 flex-row items-center gap-2 self-start rounded-full px-2 active:bg-surface2"
    >
      <View className="h-px w-5 bg-hairline" />
      {busy ? <ActivityIndicator size="small" color={colors.textDim} /> : null}
      <Text className="text-xs font-bold text-text-dim">{label}</Text>
    </Pressable>
  );
}

type Props = {
  targetType: CommentTarget;
  targetId: string;
  /** The post (or listing) shown above the comments, inside the same list. */
  header: ReactElement;
  /** Open with the composer focused (Feed comment button). */
  focusComposer?: boolean;
  /** Off while the reaction picker owns the touch. */
  scrollEnabled?: boolean;
  /** Changes when the screen wants the composer focused (e.g. its comment button). */
  focusRequest?: number;
  /** The target's comment_count, so a stale empty thread is refetched. */
  expectedCount?: number;
  /** After blocking a commenter from their comment's menu. */
  onAuthorBlocked?: (authorId: string) => void;
};

/**
 * A whole discussion screen body: one FlashList (the item as its header, then the
 * top-level comments oldest first with their replies flattened in), "Load more
 * comments", the "New comments" pill and the pinned composer. One scroll view only,
 * so nothing scrolls inside anything else.
 */
export function CommentThread({
  targetType,
  targetId,
  header,
  focusComposer = false,
  scrollEnabled = true,
  focusRequest = 0,
  expectedCount = 0,
  onAuthorBlocked,
}: Props) {
  const reduceMotion = useReducedMotion();
  const requireAuth = useRequireAuth();
  const listRef = useRef<FlashListRef<ThreadRow>>(null);
  const inputRef = useRef<TextInput>(null);
  const nearBottom = useRef(false);

  const scrollToEnd = useCallback(() => {
    // After the new rows have rendered.
    setTimeout(() => listRef.current?.scrollToEnd({ animated: !reduceMotion }), 60);
  }, [reduceMotion]);
  const isNearBottom = useCallback(() => nearBottom.current, []);

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  const thread = useCommentThread(targetType, targetId, { isNearBottom, onAppended: scrollToEnd, expectedCount });

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ThreadComment | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadComment | null>(null);
  const [menuFor, setMenuFor] = useState<ThreadComment | null>(null);
  // A reply just sent: scrolled into view once its row exists.
  const [revealId, setRevealId] = useState<string | null>(null);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM_PX;
  }, []);
  const backToTop = useBackToTop(listRef, onScroll);

  const resetComposer = useCallback(() => {
    setEditing(null);
    setReplyTo(null);
    setText('');
    setComposerError(null);
  }, []);

  const rows = thread.rows;
  useEffect(() => {
    if (!revealId) return;
    const index = rows.findIndex((r) => r.key === revealId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: !reduceMotion, viewPosition: 0.5 });
      setRevealId(null);
    }, 60);
    return () => clearTimeout(timer);
  }, [rows, revealId, reduceMotion]);

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setComposerError(null);
    const result = editing ? await thread.edit(editing, body) : replyTo ? await thread.reply(replyTo, body) : await thread.send(body);
    setBusy(false);
    if (!result.ok) {
      // Text and edit / reply mode stay so they can retry; reply failures already showed a toast.
      if (editing || !replyTo) setComposerError(result.message);
      return;
    }
    if (replyTo && !editing) setRevealId(result.id);
    else if (!editing) scrollToEnd();
    resetComposer();
  };

  const confirmDelete = useCallback(
    (comment: ThreadComment) => {
      const withReplies = comment.parentId === null && comment.replyCount > 0;
      Alert.alert(
        comment.parentId ? 'Delete this reply?' : 'Delete this comment?',
        withReplies ? "It and its replies disappear right away. This can't be undone." : "It disappears right away and can't be undone.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void thread.remove(comment) },
        ],
      );
    },
    [thread],
  );

  const startEdit = useCallback((comment: ThreadComment) => {
    setReplyTo(null);
    setEditing(comment);
    setText(comment.body);
    setComposerError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  /** Reply mode: answering a reply prefills "@name " (plain text); a top-level comment does not. */
  const startReply = useCallback(
    (comment: ThreadComment) => {
      if (!requireAuth('reply')) return;
      setEditing(null);
      setReplyTo(comment);
      setText(comment.parentId && comment.nickname ? `@${comment.nickname} ` : '');
      setComposerError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [requireAuth],
  );

  const menuActions = useMemo<SheetAction[]>(() => {
    if (!menuFor) return [];
    const comment = menuFor;
    const del: SheetAction = { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(comment) };
    if (!canEditComment(comment)) return [del];
    return [{ label: 'Edit', icon: 'create-outline', onPress: () => startEdit(comment) }, del];
  }, [menuFor, startEdit, confirmDelete]);

  const myId = thread.myId;
  // Others' comments: Report / Block (guests get the sign-in sheet from the menu).
  const [otherMenu, setOtherMenu] = useState<ContentMenuTarget | null>(null);
  const openOtherMenu = useCallback(
    (c: ThreadComment) => setOtherMenu({ type: 'comment', id: c.id, authorId: c.authorId, nickname: c.nickname }),
    [],
  );
  const { setReplies, loadMoreReplies, retryReplies } = thread;
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ThreadRow>) => {
      switch (item.kind) {
        case 'comment':
        case 'reply': {
          const mine = item.comment.authorId === myId;
          const comment = (
            <CommentItem
              comment={item.comment}
              mine={mine}
              onMore={mine ? setMenuFor : openOtherMenu}
              onReply={startReply}
              isReply={item.kind === 'reply'}
            />
          );
          return item.kind === 'reply' ? <View style={{ paddingLeft: REPLY_INDENT }}>{comment}</View> : comment;
        }
        case 'viewReplies': {
          if (item.state === 'error') {
            return <ReplyLink label="Couldn't load replies. Tap to retry" onPress={() => retryReplies(item.parentId)} />;
          }
          const label = item.count === 1 ? 'View 1 reply' : `View ${item.count} replies`;
          return (
            <ReplyLink
              label={item.state === 'loading' ? 'Loading replies…' : label}
              busy={item.state === 'loading'}
              onPress={() => setReplies(item.parentId, true)}
            />
          );
        }
        case 'viewMoreReplies':
          return <ReplyLink label="View more replies" busy={item.loading} onPress={() => void loadMoreReplies(item.parentId)} />;
        case 'hideReplies':
          return <ReplyLink label="Hide replies" onPress={() => setReplies(item.parentId, false)} />;
      }
    },
    [myId, openOtherMenu, startReply, setReplies, loadMoreReplies, retryReplies],
  );

  const listHeader = useMemo(
    () => (
      <View className="gap-4 pb-2">
        {header}
        <Text accessibilityRole="header" className="text-xs font-bold uppercase tracking-widest text-text-dim">
          Comments
        </Text>
      </View>
    ),
    [header],
  );

  const empty = thread.error ? (
    <ErrorState message={getErrorMessage(thread.error)} onRetry={thread.retry} />
  ) : thread.loading ? (
    <View accessibilityLabel="Loading comments" accessibilityRole="progressbar">
      <SkeletonList item={CommentSkeleton} count={3} />
    </View>
  ) : (
    <EmptyState icon="chatbubble-outline" title="No comments yet. Be the first to comment." />
  );

  const footer = thread.hasMore ? (
    <View className="py-3">
      <Button label="Load more comments" variant="secondary" loading={thread.loadingMore} onPress={thread.loadMore} />
    </View>
  ) : (
    <View className="h-4" />
  );

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View className="flex-1">
        <FlashList
          ref={listRef}
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          onScroll={backToTop.onScroll}
          scrollEventThrottle={backToTop.scrollEventThrottle}
          scrollEnabled={scrollEnabled}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16 }}
        />
        {thread.newCount > 0 ? (
          <View className="absolute bottom-3 left-0 right-0 items-center" pointerEvents="box-none">
            <Pressable
              onPress={() => void thread.showNew()}
              accessibilityRole="button"
              accessibilityLabel={`${thread.newCount} new ${thread.newCount === 1 ? 'comment' : 'comments'}. Show them`}
              className="rounded-full bg-accent px-4 py-2 shadow-md active:opacity-80"
            >
              <Text className="text-sm font-bold text-on-accent">New comments ↓</Text>
            </Pressable>
          </View>
        ) : null}
        {/* Inside the list's box, so it always sits above the composer, keyboard open or not. */}
        <BackToTopButton visible={backToTop.visible} onPress={backToTop.scrollToTop} bottom={12} />
      </View>
      <CommentComposer
        inputRef={inputRef}
        value={text}
        onChangeText={(t) => {
          setText(t);
          if (composerError) setComposerError(null);
        }}
        onSubmit={() => void submit()}
        busy={busy}
        error={composerError}
        editing={editing !== null}
        onCancelEdit={resetComposer}
        replyingTo={replyTo ? (replyTo.nickname ?? 'member') : null}
        onCancelReply={resetComposer}
        autoFocus={focusComposer}
      />
      <ActionSheet visible={menuFor !== null} actions={menuActions} onClose={() => setMenuFor(null)} />
      <ContentMenu target={otherMenu} onClose={() => setOtherMenu(null)} onBlocked={onAuthorBlocked} />
    </KeyboardAvoidingView>
  );
}
