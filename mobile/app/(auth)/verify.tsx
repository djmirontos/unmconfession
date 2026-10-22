import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { Button } from '@/components/ui/Button';
import { CODE_LENGTH, CodeInput, type CodeInputHandle } from '@/components/ui/CodeInput';
import { FormMessage } from '@/components/ui/FormMessage';
import { Screen } from '@/components/ui/Screen';
import { useCooldown } from '@/hooks/useCooldown';
import { useExitAuthFlow } from '@/hooks/useExitAuthFlow';
import { type OtpPurpose, resendOtp, verifyEmailOtp } from '@/lib/auth';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { validate, verifyOtpSchema } from '@/lib/validation';

// Supabase allows one email per address per 60 seconds by default.
const RESEND_COOLDOWN_S = 60;

/** Shared by sign-up verification and the password-reset code step (purpose=recovery). */
export default function VerifyScreen() {
  const router = useRouter();
  // A new member lands on the Feed, not back on the tab they started from.
  const exitToFeed = useExitAuthFlow('/');
  const params = useLocalSearchParams<{ email?: string; purpose?: string }>();
  const email = params.email ?? '';
  const purpose: OtpPurpose = params.purpose === 'recovery' ? 'recovery' : 'signup';

  const codeRef = useRef<CodeInputHandle>(null);
  const [token, setToken] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(RESEND_COOLDOWN_S, true);

  const handleChange = (code: string) => {
    setToken(code);
    setInvalid(false);
    setFormError(null);
  };

  const handleVerify = async () => {
    setFormError(null);
    setNotice(null);
    const { data, errors } = validate(verifyOtpSchema, { token });
    if (errors) return setFormError(errors.token ?? null);

    setVerifying(true);
    try {
      await verifyEmailOtp(email, data.token, purpose);
      if (purpose === 'recovery') router.replace('/reset-password');
      else exitToFeed();
    } catch (error) {
      // Supabase reports both a wrong and an expired code as otp_expired.
      if (getErrorCode(error) === 'otp_expired') {
        setInvalid(true);
        codeRef.current?.focus();
      }
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
        subtitle={`Enter the ${CODE_LENGTH}-digit code we sent to ${email}.`}
      />
      <CodeInput ref={codeRef} value={token} onChange={handleChange} invalid={invalid} editable={!verifying} />
      <FormMessage tone="error" message={formError} />
      <FormMessage tone="success" message={notice} />
      <Button
        label={purpose === 'recovery' ? 'Verify code' : 'Verify email'}
        onPress={handleVerify}
        loading={verifying}
        disabled={token.length !== CODE_LENGTH}
      />
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
