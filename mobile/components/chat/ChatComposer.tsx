import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { useBottomInset } from '@/hooks/useBottomInset';
import { useKeyboardWillShow } from '@/hooks/useKeyboardWillShow';
import { useTheme } from '@/hooks/useTheme';
import { checkBody, type ReplyPreview } from '@/lib/chat';
import { useChatStore } from '@/stores/chatStore';

const INPUT_PAD_Y = 10;
// Same technique as CommentComposer: Android ("pan") shows only the focused input's own bounds, so
// they reach below the visible box and the Send button stays above the keyboard.
const KEYBOARD_GAP = Platform.OS === 'android' ? 12 : 0;

type Props = {
  /** The chat whose in-memory draft this is (null: a new chat, nothing saved). */
  draftKey: string | null;
  /** Gets the trimmed text; true when it was taken (the box clears), false to keep it (an error). */
  onSend: (text: string) => boolean | Promise<boolean>;
  /** The message being answered (swipe or long press → Reply), or null. */
  replying?: ReplyPreview | null;
  onCancelReply?: () => void;
  max: number;
  /** The counter shows from this length (0: always). */
  counterFrom: number;
  placeholder?: string;
  /** Read-only (a request waiting for an answer): the box is replaced by this line. */
  disabledReason?: string | null;
  /** Under the box: the last send failure (the text stays), and an optional action. */
  error?: string | null;
  errorAction?: ReactNode;
  /** Bumped by the screen to focus the box (reply). */
  focusSignal?: number;
  /** Bumped by the screen to put text back into an empty box (a removed failed message). */
  restore?: { text: string; n: number } | null;
};

/**
 * Pinned at the bottom: the quoted reply (with ×), a multiline box (emoji from the system keyboard)
 * and Send. The text lives here only (and in the chat's in-memory draft), so typing never
 * re-renders the screen or the message list.
 */
function ChatComposerImpl({
  draftKey,
  onSend,
  replying = null,
  onCancelReply,
  max,
  counterFrom,
  placeholder = 'Message',
  disabledReason = null,
  error = null,
  errorAction,
  focusSignal = 0,
  restore = null,
}: Props) {
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const keyboardShown = useKeyboardWillShow();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(() => (draftKey ? (useChatStore.getState().drafts[draftKey]?.text ?? '') : ''));
  const [sending, setSending] = useState(false);

  const change = (t: string) => {
    setText(t);
    if (draftKey) useChatStore.getState().patchDraft(draftKey, { text: t });
  };

  useEffect(() => {
    if (focusSignal === 0) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [focusSignal]);

  // A removed failed message comes back only into an empty box (never over new typing).
  const [restoredN, setRestoredN] = useState(0);
  if (restore && restore.n !== restoredN) {
    setRestoredN(restore.n);
    if (text.trim() === '') {
      setText(restore.text);
      if (draftKey) useChatStore.getState().patchDraft(draftKey, { text: restore.text });
    }
  }

  const length = text.trim().length;
  const check = checkBody(text, max);
  const canSend = check === 'ok' && !sending && disabledReason === null;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const taken = await onSend(text.trim());
      if (taken) change('');
    } finally {
      setSending(false);
    }
  };

  const padding = { paddingBottom: (keyboardShown ? 0 : bottomInset) + 8 };

  if (disabledReason !== null) {
    return (
      <View className="border-t border-hairline bg-surface1 px-4 pt-3" style={padding} accessibilityLiveRegion="polite">
        <View className="min-h-11 flex-row items-center gap-2 rounded-2xl bg-surface2 px-4 py-2" accessibilityState={{ disabled: true }}>
          <Ionicons name="time-outline" size={18} color={colors.textDim} />
          <Text className="flex-1 text-sm text-text-dim">{disabledReason}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2 border-t border-hairline bg-surface1 px-3 pt-2" style={padding}>
      {replying ? (
        <View className="flex-row items-center gap-2 rounded-xl border-l-2 border-chat-accent bg-surface2 py-1 pl-3 pr-1">
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
            value={text}
            onChangeText={change}
            placeholder={placeholder}
            placeholderTextColor={colors.textDim}
            selectionColor={colors.chatAccent}
            multiline
            textAlignVertical="top"
            accessibilityLabel={replying ? 'Write a reply' : placeholder}
            style={{ maxHeight: 120 + KEYBOARD_GAP, paddingTop: INPUT_PAD_Y, paddingBottom: INPUT_PAD_Y + KEYBOARD_GAP, marginBottom: -KEYBOARD_GAP }}
            className="px-4 text-base text-text"
          />
        </View>
        <Pressable
          onPress={() => void send()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend, busy: sending }}
          className={`h-11 w-11 items-center justify-center rounded-full ${canSend ? 'bg-chat-own' : 'bg-surface2'}`}
        >
          <Ionicons name="send" size={18} color={canSend ? colors.onChatOwn : colors.textDim} />
        </Pressable>
      </View>
      {error ? (
        <View className="gap-2 px-1" accessibilityLiveRegion="polite">
          <Text className="text-sm text-danger">{error}</Text>
          {errorAction}
        </View>
      ) : null}
      {length >= counterFrom ? (
        <Text
          className={`px-1 text-right text-xs ${check === 'body_too_long' ? 'text-danger' : 'text-text-dim'}`}
          accessibilityLabel={`${length} of ${max} characters`}
        >
          {length}/{max}
        </Text>
      ) : null}
    </View>
  );
}

export const ChatComposer = memo(ChatComposerImpl);
