import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { PasswordField } from '@/components/ui/PasswordField';
import { Screen } from '@/components/ui/Screen';
import { useExitAuthFlow } from '@/hooks/useExitAuthFlow';
import { updatePassword } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { type FieldErrors, resetPasswordSchema, validate } from '@/lib/validation';
import { useAuthStore } from '@/stores/authStore';

type Values = { password: string; confirm: string };

/** Reached after a recovery code is verified, which signs the user in. */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const exitAuthFlow = useExitAuthFlow();
  const hasSession = useAuthStore((s) => s.session !== null);
  const [values, setValues] = useState<Values>({ password: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Values>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof Values) => (text: string) => {
    setValues((v) => ({ ...v, [key]: text }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = async () => {
    setFormError(null);
    const { data, errors } = validate(resetPasswordSchema, values);
    if (errors) return setFieldErrors(errors);

    setLoading(true);
    try {
      await updatePassword(data.password);
      setDone(true);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (!hasSession) {
    return (
      <Screen>
        <AuthHeader title="Reset password" canGoBack={false} />
        <FormMessage tone="error" message="Your reset code expired. Request a new one." />
        <Button label="Request a new code" onPress={() => router.replace('/forgot-password')} />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <AuthHeader title="Password updated" canGoBack={false} />
        <FormMessage tone="success" message="Your new password is set and you are signed in." />
        <Button label="Continue" onPress={exitAuthFlow} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader title="Set a new password" canGoBack={false} />
      <FormMessage tone="error" message={formError} />
      <PasswordField
        label="New password"
        value={values.password}
        onChangeText={set('password')}
        error={fieldErrors.password}
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 8 characters, with a letter and a number."
        editable={!loading}
      />
      <PasswordField
        label="Confirm new password"
        value={values.confirm}
        onChangeText={set('confirm')}
        error={fieldErrors.confirm}
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        onSubmitEditing={handleSubmit}
      />
      <Button label="Save password" onPress={handleSubmit} loading={loading} />
    </Screen>
  );
}
