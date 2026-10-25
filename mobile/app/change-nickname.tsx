import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NicknameField } from '@/components/auth/NicknameField';
import { BackHeader } from '@/components/layout/BackHeader';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMySettings } from '@/hooks/useMySettings';
import { useNicknameAvailability } from '@/hooks/useNicknameAvailability';
import { type Profile, profileQueryKey, useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { invalidateAuthoredLists } from '@/lib/authoredLists';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { formatManilaDay } from '@/lib/manilaDate';
import { changeNickname, inNicknameCooldown, mySettingsKey } from '@/lib/settings';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const RULES = 'You can change your nickname once every 30 days. Your old posts and comments will show the new name.';

/** Profile → Nickname. Once every 30 days, same rules and live check as sign-up. */
export default function ChangeNicknameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const profile = useProfile();
  const settings = useMySettings();
  const current = profile.data?.nickname ?? null;

  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const status = useNicknameAvailability(value, current);

  const cooldown = inNicknameCooldown(settings.data);
  const nextChange = settings.data?.nicknameNextChangeAt ?? null;
  const next = value.trim();
  // A failed live check (offline) does not block: the server checks again on submit.
  const canSubmit = !saving && !cooldown && (status.state === 'available' || status.state === 'error');

  const submit = async () => {
    if (!userId) return;
    setSaving(true);
    setFormError(null);
    try {
      await changeNickname(next);
      queryClient.setQueryData<Profile>(profileQueryKey(userId), (p) => (p ? { ...p, nickname: next } : p));
      void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: mySettingsKey(userId) });
      // The name shows on every post, comment, listing and notice: refetch them all.
      invalidateAuthoredLists(queryClient);
      showToast('Nickname changed');
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'nickname_cooldown') void queryClient.invalidateQueries({ queryKey: mySettingsKey(userId) });
      if (code?.startsWith('nickname_') && code !== 'nickname_cooldown') setFieldError(getErrorMessage(error));
      else setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirm = () =>
    Alert.alert(`Change nickname to ${next}?`, 'You can change it again in 30 days.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change', onPress: () => void submit() },
    ]);

  let body;
  if (!profile.data || settings.isPending) {
    body = (
      <View className="gap-3">
        <Skeleton height={72} className="rounded-2xl" />
        <Skeleton height={48} className="rounded-xl" />
      </View>
    );
  } else {
    body = (
      <>
        <View className="gap-1 rounded-2xl border border-hairline bg-surface1 p-4">
          <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Current nickname</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" className="text-xl font-bold text-text">
            {current}
          </Text>
        </View>
        <Text className="text-sm text-text-dim">{RULES}</Text>
        {cooldown && nextChange ? (
          <View className="flex-row items-center gap-3 rounded-xl border border-hairline bg-surface2 p-3">
            <Ionicons name="time-outline" size={20} color={colors.textDim} />
            <Text className="flex-1 text-sm text-text">
              You can change your nickname again on {formatManilaDay(nextChange)}.
            </Text>
          </View>
        ) : null}
        <FormMessage tone="error" message={formError} />
        <NicknameField
          label="New nickname"
          value={value}
          onChangeText={(text) => {
            setValue(text);
            setFieldError(undefined);
          }}
          error={fieldError}
          editable={!saving && !cooldown}
          ownNickname={current}
        />
        {cooldown ? null : <Button label="Change nickname" onPress={confirm} loading={saving} disabled={!canSubmit} />}
      </>
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Nickname" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
