import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, type TextInput, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { TextField } from '@/components/ui/TextField';
import { useBlockUser } from '@/hooks/useBlockUser';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useTheme } from '@/hooks/useTheme';
import { closeMyChat, reportChat } from '@/lib/chatApi';
import {
  CHAT_CLOSED,
  CHAT_REPORT_NOTE_MAX,
  CHAT_REPORT_REASONS,
  type ChatReportReason,
  type ChatReportTarget,
  CHILD_SAFETY_LINE,
  compactLayout,
  noteTooLong,
  REPORT_FOLLOW_UP_TITLE,
  reportFollowUps,
} from '@/lib/chatReports';
import { getChatError } from '@/lib/errors';
import { useToastStore } from '@/stores/toastStore';

// Android: how far below the note box the keyboard must clear (Send and an error line; see TextField).
const SEND_REACH = Platform.OS === 'android' ? 80 : 0;
// iOS sends "will" events (before the animation); Android only "did" events.
const KEYBOARD_SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

type Props = {
  target: ChatReportTarget;
  onClose: () => void;
  /** After the member also chose to block them (e.g. leave the chat). */
  onBlocked?: () => void;
  /** After "Close this chat only" succeeded (leave the chat). */
  onChatClosed?: () => void;
};

/**
 * Report a chat, a request or one message: reasons, an optional note, Send. Mounted only while
 * open. One report_chat call on Send (the server copies the evidence). Every error shows inside
 * the sheet, with the reason and note kept. While the note is typed the reasons fold into one
 * line, so the note and Send fit above the keyboard (nothing is measured). After sending, one
 * choice: Block this user, Close this chat only (accepted chats), or Cancel.
 */
export function ChatReportSheet({ target, onClose, onBlocked, onChatClosed }: Props) {
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const showToast = useToastStore((s) => s.show);
  const block = useBlockUser();
  const [phase, setPhase] = useState<'form' | 'choices'>('form');
  const [reason, setReason] = useState<ChatReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteFocused, setNoteFocused] = useState(false);
  const [keyboardShown, setKeyboardShown] = useState(false);
  const sending = useRef(false);
  const noteRef = useRef<TextInput>(null);

  useEffect(() => {
    const show = Keyboard.addListener(KEYBOARD_SHOW, () => setKeyboardShown(true));
    const hide = Keyboard.addListener(KEYBOARD_HIDE, () => setKeyboardShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const close = () => {
    if (!sending.current) onClose();
  };

  const tooLong = noteTooLong(note);
  const compact = phase === 'form' && compactLayout({ noteFocused, keyboardShown });
  const reasonLabel = CHAT_REPORT_REASONS.find((r) => r.value === reason)?.label ?? 'Choose a reason';

  // "Change" on the folded reason: the keyboard goes, the full list comes back.
  const expandReasons = () => {
    noteRef.current?.blur();
    Keyboard.dismiss();
    setNoteFocused(false);
    setKeyboardShown(false);
  };

  const send = async () => {
    if (!reason || sending.current || tooLong) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await reportChat(target.conversationId, target.messageId, reason, note);
      Keyboard.dismiss();
      setPhase('choices');
    } catch (e) {
      // Inside the sheet (a toast would sit behind it); the reason and note stay.
      setError(getChatError(e, 'report').message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const closeChat = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await closeMyChat(target.conversationId);
      sending.current = false;
      onClose();
      showToast(CHAT_CLOSED);
      onChatClosed?.();
    } catch (e) {
      setError(getChatError(e, 'close').message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const choose = (key: 'block' | 'close' | 'cancel') => {
    if (key === 'close') {
      void closeChat();
      return;
    }
    onClose();
    // The existing block flow, with its own confirmation.
    if (key === 'block') block({ id: target.other.id, nickname: target.other.nickname }, onBlocked ? () => onBlocked() : undefined);
  };

  let content;
  if (phase === 'choices') {
    content = (
      <>
        <Text accessibilityRole="header" className="px-2 text-lg font-bold text-text">
          {REPORT_FOLLOW_UP_TITLE}
        </Text>
        <View className="gap-2">
          {reportFollowUps(target.source).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => choose(f.key)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={f.help ? `${f.label}. ${f.help}` : f.label}
              accessibilityState={{ disabled: busy }}
              className={`min-h-12 justify-center gap-0.5 rounded-xl border px-4 py-3 active:bg-surface2 ${f.key === 'cancel' ? 'border-transparent' : 'border-hairline'}`}
            >
              <Text className={`text-base font-bold ${f.key === 'cancel' ? 'text-text-dim' : 'text-text'}`}>{f.label}</Text>
              {f.help ? <Text className="text-sm text-text-dim">{f.help}</Text> : null}
            </Pressable>
          ))}
        </View>
        <FormMessage tone="error" message={error} />
      </>
    );
  } else {
    content = (
      <>
        <Text accessibilityRole="header" className="px-2 text-lg font-bold text-text">
          {target.messageId ? 'Report message' : 'Report'}
        </Text>
        {compact ? (
          <Pressable
            onPress={expandReasons}
            accessibilityRole="button"
            accessibilityLabel={`Reason: ${reasonLabel}. Change`}
            className="min-h-12 flex-row items-center gap-3 rounded-xl border border-hairline px-3 py-2 active:bg-surface2"
          >
            <Ionicons name="radio-button-on" size={20} color={reason ? colors.chatAccent : colors.textDim} />
            <Text numberOfLines={1} className="flex-1 text-base font-bold text-text">
              {reasonLabel}
            </Text>
            <Text className="text-sm font-bold text-chat-accent-text">Change</Text>
          </Pressable>
        ) : (
          <View accessibilityRole="radiogroup" className="gap-1">
            {CHAT_REPORT_REASONS.map((r) => {
              const selected = r.value === reason;
              return (
                <View key={r.value}>
                  <Pressable
                    onPress={() => setReason(r.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={r.label}
                    className={`min-h-12 flex-row items-center gap-3 rounded-xl border px-3 py-2 active:bg-surface2 ${selected ? 'border-chat-accent bg-chat-accent-dim' : 'border-transparent'}`}
                  >
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.chatAccent : colors.textDim} />
                    <Text className={`shrink text-base text-text ${selected ? 'font-bold' : ''}`}>{r.label}</Text>
                  </Pressable>
                  {r.value === 'child_safety' && selected ? <Text className="px-3 pb-1 text-sm text-text-dim">{CHILD_SAFETY_LINE}</Text> : null}
                </View>
              );
            })}
          </View>
        )}
        <TextField
          ref={noteRef}
          label="Note (optional)"
          placeholder="Anything the moderators should know"
          value={note}
          onChangeText={(t) => {
            setNote(t);
            if (error) setError(null);
          }}
          multiline
          maxLength={CHAT_REPORT_NOTE_MAX + 50}
          counter={{ length: note.trim().length, max: CHAT_REPORT_NOTE_MAX }}
          keyboardGap={SEND_REACH}
          onFocus={() => setNoteFocused(true)}
          onBlur={() => setNoteFocused(false)}
        />
        <FormMessage tone="error" message={error} />
        <Button
          label="Send"
          icon="flag-outline"
          onPress={() => void send()}
          loading={busy}
          disabled={!reason || tooLong}
          accessibilityHint={reason ? undefined : 'Choose a reason first'}
        />
        {compact ? null : <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} />}
      </>
    );
  }

  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable className="absolute inset-0 bg-black/50" onPress={close} accessibilityRole="button" accessibilityLabel="Close report" />
        <View
          className="max-h-[90%] rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
          accessibilityViewIsModal
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-hairline" />
          {/* Scrollable as a safety net; the compact layout is what keeps Send above the keyboard. */}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 pb-1">
            {content}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
