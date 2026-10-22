import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { sendPasswordResetOtp } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { emailOnlySchema, validate } from '@/lib/validation';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setFormError(null);
    const { data, errors } = validate(emailOnlySchema, { email });
    if (errors) return setFieldError(errors.email);

    setLoading(true);
    try {
      await sendPasswordResetOtp(data.email);
      router.push({ pathname: '/verify', params: { email: data.email, purpose: 'recovery' } });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <AuthHeader title="Forgot password" subtitle="We will email you a code to set a new password." />
      <FormMessage tone="error" message={formError} />
      <TextField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setFieldError(undefined);
        }}
        error={fieldError}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
        editable={!loading}
        onSubmitEditing={handleSubmit}
      />
      <Button label="Send code" onPress={handleSubmit} loading={loading} />
    </Screen>
  );
}
