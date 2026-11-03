import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  BackHandler,
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { CommentThread } from '@/components/comments/CommentThread';
import { useMembership } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { keyboardLift, type Snap, settleSheet, snapHeights } from '@/lib/commentsSheet';
import { commentDraftKey } from '@/stores/commentDraftStore';
import { type CommentsSheetTarget, useCommentsSheetStore } from '@/stores/commentsSheetStore';
import { usePickerOpen } from '@/stores/reactionPickerStore';

const DURATION_MS = 220;

/** Keyboard height and whether it is up. iOS: the "will" events; Android: the "did" events (the only ones it sends). */
function useKeyboard(): { open: boolean; height: number } {
  const [state, setState] = useState({ open: false, height: 0 });
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e: KeyboardEvent) =>
      setState({ open: true, height: e.endCoordinates.height }),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setState({ open: false, height: 0 }));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return state;
}

/**
 * The Feed comment button's sheet: the post's comments (the same CommentThread, hooks and caches as
 * the post screen) without leaving the list. A plain overlay at the root, not a Modal, so the toast
 * and the reaction picker (mounted after it) draw above it; the Modal sheets (reactors, sign-in,
 * menus, push explainer) stack above it on their own. Drag the top bar between about 60% and 92%
 * of the screen; drag down, tap outside, the close button or Back closes it. The unsent comment is
 * kept (commentDraftStore), so an accidental close loses nothing.
 */
export function CommentsSheet() {
  const target = useCommentsSheetStore((s) => s.target);
  const close = useCommentsSheetStore((s) => s.close);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const keyboard = useKeyboard();
  const pickerOpen = usePickerOpen();
  const { status } = useMembership();
  const pathname = usePathname();

  // Kept while the closing animation runs; replaced at once when another post's comments open.
  const [shown, setShown] = useState<CommentsSheetTarget | null>(target);
  if (target && target !== shown) setShown(target);
  const [snap, setSnap] = useState<Snap>('half');

  const lift = keyboardLift(Platform.OS, keyboard.height);
  const heights = snapHeights(windowHeight, insets.top, lift);
  const duration = reduceMotion ? 0 : DURATION_MS;

  const sheetHeight = useSharedValue(heights.half);
  // How far the sheet is pushed below its height (opening, closing, dragging under the half height).
  const offset = useSharedValue(windowHeight);
  const halfHeight = useSharedValue(heights.half);
  const fullHeight = useSharedValue(heights.full);
  const canClose = useSharedValue(!keyboard.open);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    halfHeight.set(heights.half);
    fullHeight.set(heights.full);
    canClose.set(!keyboard.open);
  }, [heights.half, heights.full, keyboard.open, halfHeight, fullHeight, canClose]);

  // Open (or switch posts): from below the screen to the half height.
  const openedFor = useRef<CommentsSheetTarget | null>(null);
  useEffect(() => {
    if (!target || openedFor.current === target) return;
    const switching = openedFor.current !== null;
    openedFor.current = target;
    if (switching) return; // already on screen: keep its size, show the new thread
    setSnap('half');
    sheetHeight.set(heights.half);
    offset.set(heights.half);
    offset.set(withTiming(0, { duration }));
  }, [target, heights.half, duration, sheetHeight, offset]);

  // Close: slide out, then unmount the thread.
  useEffect(() => {
    if (target || !shown) return;
    openedFor.current = null;
    Keyboard.dismiss();
    const done = () => setShown(null);
    offset.set(
      withTiming(sheetHeight.get() + insets.bottom, { duration }, (finished) => {
        if (finished) scheduleOnRN(done);
      }),
    );
  }, [target, shown, duration, insets.bottom, offset, sheetHeight]);

  // A new snap or a new keyboard height: settle there (the keyboard shrinks the full height).
  const snapHeight = heights[snap];
  useEffect(() => {
    if (!target) return;
    sheetHeight.set(withTiming(snapHeight, { duration }));
  }, [target, snapHeight, duration, sheetHeight]);

  // Android Back closes it (Modal sheets above it handle Back themselves first).
  useEffect(() => {
    if (!target) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [target, close]);

  // Leaving the list (a profile, moderation, the nickname step) or losing the account: close.
  const openedAt = useRef(pathname);
  useEffect(() => {
    if (target) openedAt.current = pathname;
    // Only the moment it opens; later path changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  useEffect(() => {
    if (target && pathname !== openedAt.current) close();
  }, [pathname, target, close]);
  useEffect(() => {
    if (target && status === 'needs-nickname') close();
  }, [status, target, close]);

  const settle = useCallback(
    (visible: number, velocityY: number) => {
      const next = settleSheet({ visible, velocityY, half: heights.half, full: heights.full, canClose: !keyboard.open });
      if (next === 'closed') {
        close();
        return;
      }
      setSnap(next);
      sheetHeight.set(withTiming(heights[next], { duration }));
      offset.set(withTiming(0, { duration }));
    },
    [heights, keyboard.open, close, duration, sheetHeight, offset],
  );

  // The top bar drags the sheet; the list below scrolls as usual.
  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onStart(() => {
      dragStart.set(sheetHeight.get() - offset.get());
    })
    .onUpdate((e) => {
      const proposed = dragStart.get() - e.translationY;
      if (proposed >= halfHeight.get()) {
        sheetHeight.set(Math.min(proposed, fullHeight.get()));
        offset.set(0);
      } else {
        sheetHeight.set(halfHeight.get());
        offset.set(canClose.get() ? halfHeight.get() - proposed : 0);
      }
    })
    .onEnd((e) => {
      scheduleOnRN(settle, sheetHeight.get() - offset.get(), e.velocityY);
    });

  const sheetStyle = useAnimatedStyle(() => ({ height: sheetHeight.get(), transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [0, halfHeight.get()], [1, 0], Extrapolation.CLAMP),
  }));

  const onHandleAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') settle(heights.full, 0);
    else if (snap === 'full') settle(heights.half, 0);
    else close();
  };

  if (!shown) return null;
  const title = shown.answers ? 'Answers' : 'Comments';
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} className="bg-black/50">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title.toLowerCase()}`}
        />
      </Animated.View>
      <Animated.View
        style={[{ position: 'absolute', left: 0, right: 0, bottom: lift }, sheetStyle]}
        className="overflow-hidden rounded-t-3xl border-t border-hairline bg-bg"
        accessibilityLabel={title}
      >
        <GestureDetector gesture={pan}>
          <View className="bg-surface1 px-4 pb-2 pt-2">
            <Pressable
              onPress={() => (snap === 'full' ? settle(heights.half, 0) : settle(heights.full, 0))}
              accessibilityRole="adjustable"
              accessibilityLabel={`${title} sheet`}
              accessibilityHint="Drag or swipe up to expand, down to close"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={onHandleAction}
              className="min-h-6 items-center justify-center"
            >
              <View className="h-1 w-10 rounded-full bg-hairline" />
            </Pressable>
            <View className="min-h-11 flex-row items-center">
              <Text accessibilityRole="header" className="flex-1 text-base font-bold text-text">
                {title}
              </Text>
              <Pressable
                onPress={close}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Close ${title.toLowerCase()}`}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-surface2"
              >
                <Ionicons name="close" size={22} color={colors.textDim} />
              </Pressable>
            </View>
          </View>
        </GestureDetector>
        <CommentThread
          key={shown.postId}
          targetType="post"
          targetId={shown.postId}
          expectedCount={shown.expectedCount}
          answers={shown.answers}
          draftKey={commentDraftKey(shown.postId)}
          inSheet
          scrollEnabled={!pickerOpen}
        />
      </Animated.View>
    </GestureHandlerRootView>
  );
}
