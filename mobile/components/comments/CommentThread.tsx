import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { SkeletonList } from '@/components/skeletons/SkeletonList';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { useCommentThread } from '@/hooks/useCommentThread';
import { canEditComment, type CommentTarget, type ThreadComment } from '@/lib/comments';
import { getErrorMessage } from '@/lib/errors';

// Within this distance of the end, new comments from others are appended instead of raising the pill.
const NEAR_BOTTOM_PX = 160;
const keyExtractor = (c: ThreadComment) => c.id;

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
};

/**
 * A whole discussion screen body: one FlashList (the item as its header, then the
 * comments oldest first), "Load more comments", the "New comments" pill and the
 * pinned composer. One scroll view only, so nothing scrolls inside anything else.
 */
export function CommentThread({ targetType, targetId, header, focusComposer = false, scrollEnabled = true, focusRequest = 0, expectedCount = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<FlashListRef<ThreadComment>>(null);
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
  const [menuFor, setMenuFor] = useState<ThreadComment | null>(null);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM_PX;
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setText('');
    setComposerError(null);
  }, []);

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setComposerError(null);
    const result = editing ? await thread.edit(editing, body) : await thread.send(body);
    setBusy(false);
    if (!result.ok) {
      setComposerError(result.message); // text and edit mode stay so they can retry
      return;
    }
    if (editing) setEditing(null);
    else scrollToEnd();
    setText('');
  };

  const confirmDelete = useCallback(
    (comment: ThreadComment) => {
      Alert.alert('Delete this comment?', "It disappears right away and can't be undone.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void thread.remove(comment) },
      ]);
    },
    [thread],
  );

  const startEdit = useCallback((comment: ThreadComment) => {
    setEditing(comment);
    setText(comment.body);
    setComposerError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const menuActions = useMemo<SheetAction[]>(() => {
    if (!menuFor) return [];
    const comment = menuFor;
    const del: SheetAction = { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(comment) };
    if (!canEditComment(comment)) return [del];
    return [{ label: 'Edit', icon: 'create-outline', onPress: () => startEdit(comment) }, del];
  }, [menuFor, startEdit, confirmDelete]);

  const myId = thread.myId;
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ThreadComment>) => (
      <CommentItem comment={item} onMore={item.authorId === myId ? setMenuFor : undefined} />
    ),
    [myId],
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
          data={thread.items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          onScroll={onScroll}
          scrollEventThrottle={32}
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
        onCancelEdit={cancelEdit}
        autoFocus={focusComposer}
      />
      <ActionSheet visible={menuFor !== null} actions={menuActions} onClose={() => setMenuFor(null)} />
    </KeyboardAvoidingView>
  );
}
