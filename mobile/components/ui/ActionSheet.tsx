import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
        <View
          className="gap-1 rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
          accessibilityViewIsModal
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-hairline" />
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
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="h-12 flex-row items-center gap-3 rounded-xl px-2 active:bg-surface2"
          >
            <Ionicons name="close" size={20} color={colors.textDim} />
            <Text className="text-base text-text-dim">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
