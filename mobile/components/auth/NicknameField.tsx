import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';

import { TextField } from '@/components/ui/TextField';
import { type NicknameStatus, useNicknameAvailability } from '@/hooks/useNicknameAvailability';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  editable?: boolean;
};

const STATUS_TEXT: Record<NicknameStatus['state'], string> = {
  idle: '3–20 characters: letters, numbers, underscore or dot. Permanent once set.',
  invalid: '',
  checking: 'Checking…',
  available: 'Available',
  unavailable: 'Taken or not allowed. Try another one.',
  error: 'Could not check right now. We will check again when you continue.',
};

/** Nickname input with debounced live availability feedback. */
export function NicknameField({ value, onChangeText, error, editable }: Props) {
  const { colors } = useTheme();
  const status = useNicknameAvailability(value);
  const message = status.state === 'invalid' ? status.message : STATUS_TEXT[status.state];
  const tone =
    status.state === 'available'
      ? 'text-success'
      : status.state === 'invalid' || status.state === 'unavailable'
        ? 'text-danger'
        : 'text-text-dim';

  return (
    <TextField
      label="Nickname"
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="username-new"
      maxLength={20}
      placeholder="e.g. night_owl.21"
      error={error}
      accessory={
        status.state === 'checking' ? (
          <ActivityIndicator size="small" color={colors.textDim} />
        ) : status.state === 'available' ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.success} accessibilityLabel="Available" />
        ) : null
      }
      hint={
        <View accessibilityLiveRegion="polite">
          <Text className={`text-sm ${tone}`}>{message}</Text>
        </View>
      }
    />
  );
}
