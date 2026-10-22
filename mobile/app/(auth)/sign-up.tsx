import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthHeader } from '@/components/auth/AuthHeader';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { NicknameField } from '@/components/auth/NicknameField';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Divider } from '@/components/ui/Divider';
import { FormMessage } from '@/components/ui/FormMessage';
import { PasswordField } from '@/components/ui/PasswordField';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useExitAuthFlow } from '@/hooks/useExitAuthFlow';
import { checkNicknameAvailable } from '@/hooks/useNicknameAvailability';
import { signUpWithEmail } from '@/lib/auth';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { type FieldErrors, signUpSchema, validate } from '@/lib/validation';

type Values = { email: string; nickname: string; password: string; acceptedTerms: boolean };

export default function SignUpScreen() {
  const router = useRouter();
  const exitAuthFlow = useExitAuthFlow();
  const [values, setValues] = useState<Values>({ email: '', nickname: '', password: '', acceptedTerms: false });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Values>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof Values>(key: K) => (value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = async () => {
    setFormError(null);
    const { data, errors } = validate(signUpSchema, values);
    if (errors) return setFieldErrors(errors);

    setLoading(true);
    try {
      // Auth hides the trigger's nickname error, so confirm availability first.
      if (!(await checkNicknameAvailable(data.nickname))) {
        setFieldErrors({ nickname: 'That nickname is taken or not allowed. Try another one.' });
        return;
      }
      const { needsVerification } = await signUpWithEmail(data);
      if (needsVerification) {
        router.push({ pathname: '/verify', params: { email: data.email, purpose: 'signup' } });
      } else {
        exitAuthFlow();
      }
    } catch (error) {
      if (getErrorCode(error) === 'unexpected_failure') {
        setFieldErrors({ nickname: getErrorMessage(error) });
      } else {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="Create your account"
        subtitle="No real name needed. Others see only your nickname."
      />
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
          hint="Kept private. We send a code to verify it."
          editable={!loading}
        />
        <NicknameField
          value={values.nickname}
          onChangeText={set('nickname')}
          error={fieldErrors.nickname}
          editable={!loading}
        />
        <PasswordField
          label="Password"
          value={values.password}
          onChangeText={set('password')}
          error={fieldErrors.password}
          autoComplete="new-password"
          textContentType="newPassword"
          hint="At least 8 characters, with a letter and a number."
          editable={!loading}
        />
        <Checkbox
          checked={values.acceptedTerms}
          onChange={set('acceptedTerms')}
          accessibilityLabel="I accept the Terms and Privacy Policy"
          error={fieldErrors.acceptedTerms}
        >
          <Text className="text-sm leading-5 text-text-dim">
            I accept the{' '}
            <Text
              accessibilityRole="link"
              onPress={() => router.push('/legal/terms')}
              className="font-bold text-text underline"
            >
              Terms
            </Text>{' '}
            and{' '}
            <Text
              accessibilityRole="link"
              onPress={() => router.push('/legal/privacy')}
              className="font-bold text-text underline"
            >
              Privacy Policy
            </Text>
            , including that admins can see the email behind a nickname and every such lookup is logged.
          </Text>
        </Checkbox>
      </View>
      <Button label="Create account" onPress={handleSubmit} loading={loading} />
      <Divider />
      <GoogleButton onSuccess={exitAuthFlow} onError={setFormError} />
      <Pressable onPress={() => router.replace('/sign-in')} accessibilityRole="link" className="items-center py-2">
        <Text className="text-sm text-text-dim">
          Already have an account? <Text className="font-bold text-text underline">Sign in</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}
