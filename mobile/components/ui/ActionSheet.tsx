import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTheme } from '@/hooks/useTheme';

export type SheetAction = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  destructive?: boolean;
};

type Props = { visible: boolean; title?: string; actions: readonly SheetAction[]; onClose: () => void };

/** Small bottom sheet of actions with a Cancel row. */
export function ActionSheet({ visible, title, actions, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {title ? <Text className="px-2 pb-1 text-xs font-bold uppercase tracking-widest text-text-dim">{title}</Text> : null}
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={() => {
            onClose();
            action.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          className="h-12 flex-row items-center gap-3 rounded-xl px-2 active:bg-surface2"
        >
          <Ionicons name={action.icon} size={20} color={action.destructive ? colors.danger : colors.text} />
          <Text className={`text-base font-bold ${action.destructive ? 'text-danger' : 'text-text'}`}>{action.label}</Text>
        </Pressable>
      ))}
      <Pressable onPress={onClose} accessibilityRole="button" className="h-12 flex-row items-center gap-3 rounded-xl px-2 active:bg-surface2">
        <Ionicons name="close" size={20} color={colors.textDim} />
        <Text className="text-base text-text-dim">Cancel</Text>
      </Pressable>
    </BottomSheet>
  );
}
