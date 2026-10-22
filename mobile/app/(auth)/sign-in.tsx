import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { FormMessage } from '@/components/ui/FormMessage';
import { PasswordField } from '@/components/ui/PasswordField';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useExitAuthFlow } from '@/hooks/useExitAuthFlow';
import { resendOtp, signInWithPassword } from '@/lib/auth';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { type FieldErrors, signInSchema, validate } from '@/lib/validation';

type Values = { email: string; password: string };

export default function SignInScreen() {
  const router = useRouter();
  const exitAuthFlow = useExitAuthFlow();
  const [values, setValues] = useState<Values>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Values>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof Values) => (text: string) => {
    setValues((v) => ({ ...v, [key]: text }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = async () => {
    setFormError(null);
    const { data, errors } = validate(signInSchema, values);
    if (errors) return setFieldErrors(errors);

    setLoading(true);
    try {
      await signInWithPassword(data.email, data.password);
      exitAuthFlow();
    } catch (error) {
      if (getErrorCode(error) === 'email_not_confirmed') {
        // Unverified sign-up: send a fresh code and continue verification.
        await resendOtp(data.email, 'signup').catch(() => undefined);
        router.push({ pathname: '/verify', params: { email: data.email, purpose: 'signup' } });
      } else {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <AuthHeader title="Welcome back" subtitle="Sign in with your email and password." />
      <FormMessage tone="error" message={formError} />
      <View className="gap-4">
        <TextField
          label="Email"
          value={values.email}
          onChangeText={set('email')}
          error={fieldErrors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
          editable={!loading}
        />
        <PasswordField
          label="Password"
          value={values.password}
          onChangeText={set('password')}
          error={fieldErrors.password}
          autoComplete="current-password"
          textContentType="password"
          editable={!loading}
          onSubmitEditing={handleSubmit}
        />
        <Pressable
          onPress={() => router.push({ pathname: '/forgot-password', params: { email: values.email } })}
          accessibilityRole="link"
          className="self-end"
          hitSlop={8}
        >
          <Text className="text-sm font-bold text-text-dim underline">Forgot password?</Text>
        </Pressable>
      </View>
      <Button label="Sign in" onPress={handleSubmit} loading={loading} />
      <Divider />
      <GoogleButton onSuccess={exitAuthFlow} onError={setFormError} />
      <Pressable
        onPress={() => router.replace('/sign-up')}
        accessibilityRole="link"
        className="items-center py-2"
      >
        <Text className="text-sm text-text-dim">
          New here? <Text className="font-bold text-text underline">Create an account</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}
