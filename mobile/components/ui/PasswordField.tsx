import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useState } from 'react';
import { Pressable } from 'react-native';

import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/hooks/useTheme';

type Props = Omit<ComponentProps<typeof TextField>, 'secureTextEntry' | 'accessory'>;

export function PasswordField(props: Props) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      accessory={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textDim} />
        </Pressable>
      }
    />
  );
}
