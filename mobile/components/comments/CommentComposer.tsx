import { Ionicons } from '@expo/vector-icons';
import type { Ref } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useKeyboardWillShow } from '@/hooks/useKeyboardWillShow';
import { useMembership } from '@/hooks/useProfile';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme } from '@/hooks/useTheme';
import { COMMENT_MAX } from '@/lib/comments';

// The counter appears only near the limit.
const COUNTER_FROM = 900;
const INPUT_PAD_Y = 10;
// Android pans the window only far enough to show the focused input's own bounds, so
// the input's bounds reach this far below its visible box: the box, the Send button and
// a gap stay above the keyboard. Visual size is unchanged (padding + negative margin).
const KEYBOARD_GAP = Platform.OS === 'android' ? 12 : 0;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Last send/save error, shown above the input; the text stays so they can retry. */
  error: string | null;
  editing: boolean;
  onCancelEdit: () => void;
  /** Reply mode: the nickname being answered (null = a normal comment). */
  replyingTo?: string | null;
  onCancelReply?: () => void;
  autoFocus?: boolean;
  inputRef?: Ref<TextInput>;
};

/** Bottom composer for a thread. Guests get a sign-in button instead. */
export function CommentComposer({
  value,
  onChangeText,
  onSubmit,
  busy,
  error,
  editing,
  onCancelEdit,
  replyingTo = null,
  onCancelReply,
  autoFocus,
  inputRef,
}: Props) {
  const replying = replyingTo !== null && !editing;
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const keyboardShown = useKeyboardWillShow();
  const requireAuth = useRequireAuth();
  const { status } = useMembership();
  const trimmed = value.trim();
  const tooLong = trimmed.length > COMMENT_MAX;
  const canSend = trimmed.length > 0 && !tooLong && !busy;

  const container = 'gap-2 border-t border-hairline bg-surface1 px-3 pt-2';
  // With the keyboard up the composer sits right on it, so the safe-area space is dropped.
  const padding = { paddingBottom: (keyboardShown ? 0 : bottomInset) + 8 };

  if (status === 'guest') {
    return (
      <View className={container} style={padding}>
        <Button label="Sign in to comment" icon="chatbubble-outline" onPress={() => requireAuth('comment')} />
      </View>
    );
  }

  return (
    <View className={container} style={padding}>
      {editing ? (
        <View className="flex-row items-center gap-2 px-1">
          <Ionicons name="create-outline" size={16} color={colors.textDim} />
          <Text className="flex-1 text-xs font-bold uppercase tracking-widest text-text-dim">Editing comment</Text>
          <Pressable onPress={onCancelEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel editing">
            <Ionicons name="close" size={20} color={colors.textDim} />
          </Pressable>
        </View>
      ) : replying ? (
        <View className="flex-row items-center gap-2 px-1">
          <Ionicons name="arrow-undo-outline" size={16} color={colors.textDim} />
          <Text numberOfLines={1} className="flex-1 text-xs font-bold text-text-dim">
            Replying to {replyingTo}
          </Text>
          <Pressable
            onPress={onCancelReply}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Replying to ${replyingTo}, cancel`}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-surface2"
          >
            <Ionicons name="close" size={20} color={colors.textDim} />
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" className="px-1 text-sm text-danger">
          {error}
        </Text>
      ) : null}
      <View className="flex-row items-end gap-2">
        <View className="min-h-11 flex-1 rounded-2xl border border-hairline bg-surface2">
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={replying ? 'Write a reply…' : 'Write a comment…'}
            placeholderTextColor={colors.textDim}
            selectionColor={colors.accent}
            multiline
            autoFocus={autoFocus}
            editable={!busy}
            textAlignVertical="top"
            accessibilityLabel={editing ? 'Edit your comment' : replying ? `Write a reply to ${replyingTo}` : 'Write a comment'}
            style={{
              maxHeight: 120 + KEYBOARD_GAP,
              paddingTop: INPUT_PAD_Y,
              paddingBottom: INPUT_PAD_Y + KEYBOARD_GAP,
              marginBottom: -KEYBOARD_GAP,
            }}
            className="px-4 text-base text-text"
          />
        </View>
        <Pressable
          onPress={onSubmit}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save comment' : replying ? 'Send reply' : 'Send comment'}
          accessibilityState={{ disabled: !canSend, busy }}
          className={`h-11 min-w-11 items-center justify-center rounded-full px-3 ${canSend ? 'bg-accent' : 'bg-surface2'}`}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : editing ? (
            <Text className={`text-sm font-bold ${canSend ? 'text-on-accent' : 'text-text-dim'}`}>Save</Text>
          ) : (
            <Ionicons name="send" size={18} color={canSend ? colors.onAccent : colors.textDim} />
          )}
        </Pressable>
      </View>
      {trimmed.length > COUNTER_FROM ? (
        <Text
          className={`px-1 text-right text-xs ${tooLong ? 'text-danger' : 'text-text-dim'}`}
          accessibilityLabel={`${trimmed.length} of ${COMMENT_MAX} characters`}
        >
          {trimmed.length}/{COMMENT_MAX}
        </Text>
      ) : null}
    </View>
  );
}
