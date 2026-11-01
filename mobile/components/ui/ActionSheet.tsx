import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTheme } from '@/hooks/useTheme';

export type SheetAction = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  destructive?: boolean;
  /** Starts a separated group under this small heading (e.g. "Moderation"). */
  section?: string;
  /** Read instead of the label (e.g. "Remove post as moderator"). */
  accessibilityLabel?: string;
};

type Props = { visible: boolean; title?: string; actions: readonly SheetAction[]; onClose: () => void };

/** Small bottom sheet of actions with a Cancel row. */
export function ActionSheet({ visible, title, actions, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {title ? <Text className="px-2 pb-1 text-xs font-bold uppercase tracking-widest text-text-dim">{title}</Text> : null}
      {actions.map((action, i) => (
        <View key={action.label}>
          {action.section && action.section !== actions[i - 1]?.section ? (
            <View className="mt-1 border-t border-hairline px-2 pb-1 pt-3">
              <Text accessibilityRole="header" className="text-xs font-bold uppercase tracking-widest text-text-dim">
                {action.section}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              onClose();
              action.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            className="min-h-12 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-surface2"
          >
            <Ionicons name={action.icon} size={20} color={action.destructive ? colors.danger : colors.text} />
            <Text className={`shrink text-base font-bold ${action.destructive ? 'text-danger' : 'text-text'}`}>{action.label}</Text>
          </Pressable>
        </View>
      ))}
      <Pressable onPress={onClose} accessibilityRole="button" className="min-h-12 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-surface2">
        <Ionicons name="close" size={20} color={colors.textDim} />
        <Text className="text-base text-text-dim">Cancel</Text>
      </Pressable>
    </BottomSheet>
  );
}
