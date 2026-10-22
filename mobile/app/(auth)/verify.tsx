import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useCooldown } from '@/hooks/useCooldown';
import { useExitAuthFlow } from '@/hooks/useExitAuthFlow';
import { type OtpPurpose, resendOtp, verifyEmailOtp } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { validate, verifyOtpSchema } from '@/lib/validation';

// Supabase allows one email per address per 60 seconds by default.
const RESEND_COOLDOWN_S = 60;

export default function VerifyScreen() {
  const router = useRouter();
  const exitAuthFlow = useExitAuthFlow();
  const params = useLocalSearchParams<{ email?: string; purpose?: string }>();
  const email = params.email ?? '';
  const purpose: OtpPurpose = params.purpose === 'recovery' ? 'recovery' : 'signup';

  const [token, setToken] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(RESEND_COOLDOWN_S, true);

  const handleVerify = async () => {
    setFormError(null);
    setNotice(null);
    const { data, errors } = validate(verifyOtpSchema, { token });
    if (errors) return setFieldError(errors.token);

    setVerifying(true);
    try {
      await verifyEmailOtp(email, data.token, purpose);
      if (purpose === 'recovery') router.replace('/reset-password');
      else exitAuthFlow();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setFormError(null);
    setNotice(null);
    setResending(true);
    try {
      await resendOtp(email, purpose);
      cooldown.start();
      setNotice('A new code is on its way. Check your inbox and spam folder.');
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <Screen>
        <AuthHeader title="Verify your email" />
        <FormMessage tone="error" message="We lost track of your email. Please start again." />
        <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader
        title={purpose === 'recovery' ? 'Reset your password' : 'Verify your email'}
        subtitle={`Enter the code we sent to ${email}.`}
      />
      <FormMessage tone="error" message={formError} />
      <FormMessage tone="success" message={notice} />
      <TextField
        label="Verification code"
        value={token}
        onChangeText={(text) => {
          setToken(text.replace(/[^0-9]/g, ''));
          setFieldError(undefined);
        }}
        error={fieldError}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        placeholder="123456"
        editable={!verifying}
        onSubmitEditing={handleVerify}
      />
      <Button label="Verify" onPress={handleVerify} loading={verifying} />
      <View className="items-center">
        {cooldown.remaining > 0 ? (
          <Text className="text-sm text-text-dim" accessibilityLiveRegion="polite">
            Resend code in {cooldown.remaining}s
          </Text>
        ) : (
          <Pressable onPress={handleResend} disabled={resending} accessibilityRole="button" hitSlop={8}>
            <Text className="text-sm font-bold text-text underline">{resending ? 'Sending…' : 'Resend code'}</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}
