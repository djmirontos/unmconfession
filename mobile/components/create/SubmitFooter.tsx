import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';

type Props = {
  label: string;
  onPress: () => void;
  submitting: boolean;
  /** Invalid form or photos still preparing. */
  disabled: boolean;
  error: string | null;
  /** Why the button is disabled, if not obvious from inline errors. */
  hint?: string | null;
};

export function SubmitFooter({ label, onPress, submitting, disabled, error, hint }: Props) {
  return (
    <View className="gap-3">
      <FormMessage tone="error" message={error} />
      <Button label={label} onPress={onPress} loading={submitting} disabled={disabled} />
      {hint && !submitting ? <Text className="text-center text-sm text-text-dim">{hint}</Text> : null}
    </View>
  );
}
