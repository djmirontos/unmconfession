import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Checkbox } from '@/components/ui/Checkbox';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
};

const LABEL =
  'I am of legal age in my country, or I have the permission of a parent or legal guardian, and I agree to the Terms of Use and Privacy Policy.';

/** Terms and age confirmation: email sign-up and, for Google accounts, the nickname screen. */
export function TermsCheckbox({ checked, onChange, error }: Props) {
  const router = useRouter();
  return (
    <Checkbox checked={checked} onChange={onChange} accessibilityLabel={LABEL} error={error}>
      <Text className="text-sm leading-5 text-text-dim">
        I am of legal age in my country, or I have the permission of a parent or legal guardian, and I agree to
        the{' '}
        <Text accessibilityRole="link" onPress={() => router.push('/legal/terms')} className="font-bold text-text underline">
          Terms of Use
        </Text>{' '}
        and{' '}
        <Text
          accessibilityRole="link"
          onPress={() => router.push('/legal/privacy')}
          className="font-bold text-text underline"
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </Checkbox>
  );
}
