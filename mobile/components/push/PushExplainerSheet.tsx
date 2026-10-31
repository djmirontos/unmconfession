import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useTheme } from '@/hooks/useTheme';
import { answerPushExplainer } from '@/lib/pushAsk';
import { usePushPromptStore } from '@/stores/pushPromptStore';

/**
 * "Stay in the loop": the in-app explainer shown before the system permission dialog (at most
 * twice, see lib/pushPermission.ts). The system dialog appears only after "Allow notifications".
 * Mounted once at the root.
 */
export function PushExplainerSheet() {
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const visible = usePushPromptStore((s) => s.visible);
  const hide = usePushPromptStore((s) => s.hide);

  const answer = (allow: boolean) => {
    hide();
    void answerPushExplainer(allow);
  };

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => answer(false)} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={() => answer(false)}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        />
        <View
          className="gap-5 rounded-t-3xl border-t border-hairline bg-surface1 px-6 pt-3"
          style={{ paddingBottom: bottomInset + 24 }}
          accessibilityViewIsModal
        >
          <View className="h-1 w-10 self-center rounded-full bg-hairline" />
          <View className="items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-dim">
              <Ionicons name="notifications-outline" size={26} color={colors.accent} />
            </View>
            <Text accessibilityRole="header" className="text-center text-2xl font-bold text-text">
              Stay in the loop
            </Text>
            <Text className="text-center text-sm text-text-dim">
              Get notified when someone replies to you or comments on your post. You can change this anytime in Settings.
            </Text>
          </View>
          <View className="gap-3">
            <Button label="Allow notifications" icon="notifications-outline" onPress={() => answer(true)} />
            <Button label="Not now" variant="ghost" onPress={() => answer(false)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
