import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { NicknameField } from '@/components/auth/NicknameField';
import { TermsCheckbox } from '@/components/auth/TermsCheckbox';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Screen } from '@/components/ui/Screen';
import { profileQueryKey, useTermsAccepted } from '@/hooks/useProfile';
import { signOut } from '@/lib/auth';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { nicknameFormSchema, nicknameSchema, validate } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';

/**
 * Required for accounts without a nickname (first Google sign-in). The root
 * layout keeps the user here until set_nickname succeeds and the profile refetches.
 * Google accounts also accept the Terms here (email sign-ups did so on the form).
 */
export default function ChooseNicknameScreen() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  // Unknown (loading or failed) counts as not accepted; the server ignores a repeat acceptance.
  const needsTerms = useTermsAccepted().data !== true;
  const [nickname, setNickname] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [termsError, setTermsError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = nicknameSchema.safeParse(nickname).success && (acceptedTerms || !needsTerms);

  const handleSubmit = async () => {
    setFormError(null);
    const { data, errors } = validate(nicknameFormSchema, { nickname });
    if (errors) return setFieldError(errors.nickname);
    if (!userId) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc('set_nickname', {
        p_nickname: data.nickname,
        p_accept_terms: needsTerms && acceptedTerms,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
    } catch (error) {
      const code = getErrorCode(error);
      if (code?.startsWith('nickname_') && code !== 'nickname_locked') setFieldError(getErrorMessage(error));
      else if (code === 'terms_required') setTermsError(getErrorMessage(error));
      else setFormError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="Choose your nickname"
        subtitle="It appears on everything you post. You can change it once every 30 days, and the new name shows on your old posts too."
        canGoBack={false}
      />
      <FormMessage tone="error" message={formError} />
      <NicknameField
        value={nickname}
        onChangeText={(text) => {
          setNickname(text);
          setFieldError(undefined);
        }}
        error={fieldError}
        editable={!loading}
      />
      {needsTerms ? (
        <TermsCheckbox
          checked={acceptedTerms}
          onChange={(checked) => {
            setAcceptedTerms(checked);
            setTermsError(undefined);
          }}
          error={termsError}
        />
      ) : null}
      <Button label="Save nickname" onPress={handleSubmit} loading={loading} disabled={!canSubmit} />
      <Pressable
        onPress={() => signOut().catch((e: unknown) => setFormError(getErrorMessage(e)))}
        accessibilityRole="button"
        className="items-center py-2"
      >
        <Text className="text-sm text-text-dim underline">Not now, sign me out</Text>
      </Pressable>
    </Screen>
  );
}
