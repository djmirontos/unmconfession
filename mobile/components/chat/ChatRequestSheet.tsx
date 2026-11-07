import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Avatar } from '@/components/profile/Avatar';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { TextField } from '@/components/ui/TextField';
import { useBottomInset } from '@/hooks/useBottomInset';
import { invalidateChatLists } from '@/hooks/useChats';
import type { ChatTarget } from '@/hooks/useStartChat';
import { afterRequestFailure, checkBody, REQUEST_MAX } from '@/lib/chat';
import { reopenMyChat, sendChatRequest } from '@/lib/chatApi';
import { getChatError } from '@/lib/errors';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';

// Android: the keyboard must clear the helper line, an error and Send under the box (see TextField).
const SEND_REACH = Platform.OS === 'android' ? 120 : 0;
const HELP = "They will see this message and can accept or decline. Links, emails and phone numbers aren't allowed.";

/** "Message" on a profile: one first message of up to 200 characters, sent as a chat request. */
export function ChatRequestSheet({ target, onClose }: { target: ChatTarget | null; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const showToast = useToastStore((s) => s.show);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRequests, setOpenRequests] = useState(false);

  // Every way out clears the sheet; the text is never kept anywhere.
  const finish = () => {
    setText('');
    setError(null);
    setOpenRequests(false);
    onClose();
  };
  const close = () => {
    if (!busy) finish();
  };

  const length = text.trim().length;
  const canSend = checkBody(text, REQUEST_MAX) === 'ok' && !busy;

  /**
   * reopen_my_chat, then the chat opens. What was typed is kept as that chat's draft (in memory),
   * so nothing is lost and nothing is sent until the member taps Send there. Called at most once
   * per Send; a failure shows the request flow's text for that code.
   */
  const reopenAndOpen = async (otherId: string) => {
    try {
      const conversationId = await reopenMyChat(otherId);
      const typed = text.trim();
      if (typed) useChatStore.getState().setDraft(conversationId, { text: typed, replyTo: null });
      invalidateChatLists(queryClient);
      finish();
      router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
    } catch (e) {
      const failure = getChatError(e, 'request');
      invalidateChatLists(queryClient);
      if (failure.action === 'disabled') {
        finish();
        showToast(failure.message);
        return;
      }
      setError(failure.message);
    }
  };

  const send = async () => {
    if (!target || !canSend) return;
    setBusy(true);
    setError(null);
    setOpenRequests(false);
    try {
      await sendChatRequest(target.id, text);
      invalidateChatLists(queryClient);
      finish();
      showToast('Request sent');
    } catch (e) {
      const failure = getChatError(e, 'request');
      if (failure.action === 'disabled') {
        finish();
        showToast(failure.message);
        return;
      }
      // A chat I deleted for myself: bring it back once and open it (no message, no notice to them).
      if (afterRequestFailure(failure.code, false) === 'reopen') {
        await reopenAndOpen(target.id);
        return;
      }
      setError(failure.message);
      setOpenRequests(failure.action === 'requests');
      if (failure.code === 'request_pending') invalidateChatLists(queryClient);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={target !== null} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable className="absolute inset-0 bg-black/50" onPress={close} accessibilityRole="button" accessibilityLabel="Close message request" />
        <View
          className="max-h-[90%] rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
          accessibilityViewIsModal
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-hairline" />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 pb-1">
            {target ? (
              <View className="flex-row items-center gap-3 px-1">
                <Avatar avatarKey={target.avatarKey} userId={target.id} nickname={target.nickname} size={44} />
                <View className="min-w-0 flex-1">
                  <Text accessibilityRole="header" numberOfLines={1} className="text-lg font-bold text-text">
                    Message {target.nickname}
                  </Text>
                  <Text className="text-sm text-text-dim">Chat request</Text>
                </View>
              </View>
            ) : null}
            <TextField
              label="First message"
              placeholder="Say hi and why you're reaching out"
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (error) setError(null);
              }}
              multiline
              maxLength={REQUEST_MAX + 50}
              counter={{ length, max: REQUEST_MAX }}
              keyboardGap={SEND_REACH}
              hint={HELP}
              accessibilityLabel="First message, up to 200 characters"
            />
            <FormMessage tone="error" message={error} />
            {openRequests ? (
              <Button
                label="Open Requests"
                variant="secondary"
                icon="mail-unread-outline"
                onPress={() => {
                  finish();
                  router.push('/chat/requests');
                }}
              />
            ) : null}
            <Button label="Send" icon="send" onPress={() => void send()} loading={busy} disabled={!canSend} />
            <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
