import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/layout/BackHeader';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { TextField } from '@/components/ui/TextField';
import { useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { forgetDeletedAccount } from '@/lib/auth';
import { DELETED_USER_LABEL } from '@/lib/authorLabel';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { logError } from '@/lib/log';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const BLOCKS: readonly { title: string; lines: readonly string[] }[] = [
  {
    title: 'What will be erased',
    lines: ['Your sign-in and email', 'Your nickname and avatar', 'Your blocked users, notification settings and notifications'],
  },
  {
    title: 'What stays',
    lines: [
      `Your posts, comments, reactions, poll votes and listings stay on the app, no longer linked to you and shown as "${DELETED_USER_LABEL}"`,
      'Reports you filed stay with the moderators',
    ],
  },
  {
    title: 'Also',
    lines: [
      'Your open Buy & Sell and Lost & Found listings will be closed',
      'This cannot be undone',
      'The same email can sign up again later as a new account, without this nickname or history',
    ],
  },
];

/** Profile → Delete account: what happens, type the nickname, confirm, delete. */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const nickname = useProfile().data?.nickname ?? null;
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);

  const matches = !!nickname && confirm.trim().toLowerCase() === nickname.toLowerCase();

  // Leave as a guest on the Feed. The session is already gone, so no screen sees a
  // signed-in profile without a nickname.
  const finish = async (uid: string) => {
    await forgetDeletedAccount(uid);
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
    showToast('Your account was deleted.');
  };

  const remove = async () => {
    if (inFlight.current || !userId || !nickname) return;
    inFlight.current = true;
    setDeleting(true);
    setFormError(null);
    try {
      const { error } = await supabase.rpc('delete_my_account', { p_confirm: confirm.trim() });
      if (error) throw error;
      await finish(userId);
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'not_found' || code === 'account_deleted') {
        // Already deleted (e.g. a retry after the first call went through): same exit.
        await finish(userId).catch((e: unknown) => logError('deleteAccount.finish', e));
        return;
      }
      logError('rpc.delete_my_account', error);
      if (code === 'confirm_mismatch') setFieldError(getErrorMessage(error));
      else setFormError(getErrorMessage(error));
      inFlight.current = false;
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete your account?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Delete account" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 p-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View className="gap-4 rounded-2xl border border-danger/40 bg-danger/10 p-4">
            <View className="flex-row items-center gap-2">
              <Ionicons name="warning-outline" size={22} color={colors.danger} />
              <Text accessibilityRole="header" className="text-lg font-bold text-text">
                Deleting your account
              </Text>
            </View>
            {BLOCKS.map((block) => (
              <View key={block.title} className="gap-1">
                <Text className="text-sm font-bold uppercase tracking-widest text-text-dim">{block.title}</Text>
                {block.lines.map((line) => (
                  <Text key={line} className="text-base leading-6 text-text">
                    {`• ${line}`}
                  </Text>
                ))}
              </View>
            ))}
          </View>

          <FormMessage tone="error" message={formError} />
          <TextField
            label={`Type your nickname (${nickname ?? ''}) to confirm`}
            accessibilityLabel={`Type your nickname, ${nickname ?? ''}, to confirm`}
            value={confirm}
            onChangeText={(text) => {
              setConfirm(text);
              setFieldError(undefined);
            }}
            error={fieldError}
            editable={!deleting}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            maxLength={20}
            returnKeyType="done"
          />
          <Button
            label="Delete my account"
            variant="danger"
            icon="trash-outline"
            loading={deleting}
            disabled={!matches}
            onPress={confirmDelete}
            accessibilityHint="Asks once more, then deletes your account for good"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
