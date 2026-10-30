import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { FormMessage } from '@/components/ui/FormMessage';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  text: string;
  /** Confirmed: a quiet card with a check. Pending: the accent card with an hourglass. */
  confirmed: boolean;
  error: string | null;
  /** The buttons for this state (Cancel request, Yes / No). */
  children?: ReactNode;
};

/** The banner above the comments for a pending or confirmed return or sale. */
export function DealBanner({ text, confirmed, error, children }: Props) {
  const { colors } = useTheme();
  return (
    <View
      className={`gap-3 rounded-2xl border p-4 ${confirmed ? 'border-hairline bg-surface1' : 'border-accent bg-accent-dim'}`}
      accessibilityRole="summary"
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name={confirmed ? 'checkmark-circle' : 'hourglass-outline'} size={20} color={confirmed ? colors.success : colors.accent} />
        <Text className="flex-1 text-base text-text">{text}</Text>
      </View>
      {children}
      <FormMessage tone="error" message={error} />
    </View>
  );
}
