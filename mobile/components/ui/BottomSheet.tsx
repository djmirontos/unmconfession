import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useBottomInset } from '@/hooks/useBottomInset';

type Props = { visible: boolean; onClose: () => void; closeLabel?: string; children: ReactNode };

/** Modal sheet from the bottom: dimmed backdrop (tap to close), handle, safe-area padding. */
export function BottomSheet({ visible, onClose, closeLabel = 'Close menu', children }: Props) {
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <View
          className="gap-1 rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
          accessibilityViewIsModal
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-hairline" />
          {children}
        </View>
      </View>
    </Modal>
  );
}
