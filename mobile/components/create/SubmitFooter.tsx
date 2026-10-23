import { Text, View } from 'react-native';

import { MissingFieldsHint } from '@/components/create/MissingFieldsHint';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';

type Props = {
  label: string;
  onPress: () => void;
  submitting: boolean;
  /** Invalid form or photos still preparing. */
  disabled: boolean;
  error: string | null;
  /** Photo state (preparing, failed) when that is what keeps the button disabled. */
  hint?: string | null;
  /** Empty required fields, shown as "Still needed: …" below the button. */
  missing?: readonly string[];
};

export function SubmitFooter({ label, onPress, submitting, disabled, error, hint, missing = [] }: Props) {
  return (
    <View className="gap-3">
      <FormMessage tone="error" message={error} />
      <Button label={label} onPress={onPress} loading={submitting} disabled={disabled} />
      {submitting ? null : <MissingFieldsHint missing={missing} />}
      {hint && !submitting ? <Text className="text-center text-sm text-text-dim">{hint}</Text> : null}
    </View>
  );
}
