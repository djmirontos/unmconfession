import { Ionicons } from '@expo/vector-icons';
import type { Ref } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { useBottomInset } from '@/hooks/useBottomInset';
import { useKeyboardWillShow } from '@/hooks/useKeyboardWillShow';
import { useTheme } from '@/hooks/useTheme';
import { checkBody, MESSAGE_COUNTER_FROM, MESSAGE_MAX, type ReplyPreview } from '@/lib/chat';

const INPUT_PAD_Y = 10;
// Same technique as CommentComposer: Android ("pan") shows only the focused input's own bounds, so
// they reach below the visible box and the Send button stays above the keyboard.
const KEYBOARD_GAP = Platform.OS === 'android' ? 12 : 0;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** The message being answered (swipe or long press → Reply), or null. */
  replying: ReplyPreview | null;
  onCancelReply: () => void;
  inputRef?: Ref<TextInput>;
};

/** Pinned at the bottom: the quoted reply (with ×), a multiline box (emoji from the system keyboard) and Send. */
export function ChatComposer({ value, onChangeText, onSend, replying, onCancelReply, inputRef }: Props) {
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const keyboardShown = useKeyboardWillShow();
  const length = value.trim().length;
  const check = checkBody(value, MESSAGE_MAX);
  const canSend = check === 'ok';

  return (
    <View className="gap-2 border-t border-hairline bg-surface1 px-3 pt-2" style={{ paddingBottom: (keyboardShown ? 0 : bottomInset) + 8 }}>
      {replying ? (
        <View className="flex-row items-center gap-2 rounded-xl border-l-2 border-accent bg-surface2 py-1 pl-3 pr-1">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold text-text-dim">{replying.label ? `Replying to ${replying.label}` : 'Replying'}</Text>
            <Text numberOfLines={1} className={`text-sm text-text ${replying.deleted ? 'italic' : ''}`}>
              {replying.text}
            </Text>
          </View>
          <Pressable
            onPress={onCancelReply}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            className="h-11 w-11 items-center justify-center rounded-full active:bg-surface1"
          >
            <Ionicons name="close" size={20} color={colors.textDim} />
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row items-end gap-2">
        <View className="min-h-11 flex-1 rounded-2xl border border-hairline bg-surface2">
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder="Message"
            placeholderTextColor={colors.textDim}
            selectionColor={colors.accent}
            multiline
            textAlignVertical="top"
            accessibilityLabel={replying ? 'Write a reply' : 'Write a message'}
            style={{ maxHeight: 120 + KEYBOARD_GAP, paddingTop: INPUT_PAD_Y, paddingBottom: INPUT_PAD_Y + KEYBOARD_GAP, marginBottom: -KEYBOARD_GAP }}
            className="px-4 text-base text-text"
          />
        </View>
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          className={`h-11 w-11 items-center justify-center rounded-full ${canSend ? 'bg-accent' : 'bg-surface2'}`}
        >
          <Ionicons name="send" size={18} color={canSend ? colors.onAccent : colors.textDim} />
        </Pressable>
      </View>
      {length > MESSAGE_COUNTER_FROM ? (
        <Text
          className={`px-1 text-right text-xs ${check === 'body_too_long' ? 'text-danger' : 'text-text-dim'}`}
          accessibilityLabel={`${length} of ${MESSAGE_MAX} characters`}
        >
          {length}/{MESSAGE_MAX}
        </Text>
      ) : null}
    </View>
  );
}
