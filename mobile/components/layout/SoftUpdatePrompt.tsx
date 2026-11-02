import { Ionicons } from '@expo/vector-icons';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useSoftUpdate } from '@/hooks/useSoftUpdate';
import { useTheme } from '@/hooks/useTheme';
import { useToastStore } from '@/stores/toastStore';
import { logError } from '@/lib/log';
import { SOFT_UPDATE_COPY as COPY } from '@/lib/softUpdate';

/**
 * "Update available" sheet with Update / Later, in the push explainer's style. Mounted once in the
 * root layout just before ForceUpdateGate, so the hard gate always stacks above it. Back and the
 * backdrop count as Later.
 */
export function SoftUpdatePrompt() {
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const { visible, message, link, later } = useSoftUpdate();

  const update = () => {
    if (!link) return;
    Linking.openURL(link).catch((error: unknown) => {
      logError('softUpdate.openURL', error);
      useToastStore.getState().show('Could not open the update page. Please try again.');
    });
  };

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={later} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={later} accessibilityRole="button" accessibilityLabel={COPY.later} />
        <View
          className="max-h-[85%] rounded-t-3xl border-t border-hairline bg-surface1 px-6 pt-3"
          style={{ paddingBottom: bottomInset + 24 }}
          accessibilityViewIsModal
        >
          <ScrollView contentContainerClassName="gap-5" bounces={false}>
            <View className="h-1 w-10 self-center rounded-full bg-hairline" />
            <View className="items-center gap-3">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-dim">
                <Ionicons name="download-outline" size={26} color={colors.accent} />
              </View>
              <Text accessibilityRole="header" className="text-center text-2xl font-bold text-text">
                {COPY.title}
              </Text>
              <Text className="text-center text-sm text-text-dim">{message}</Text>
            </View>
            <View className="gap-3">
              <Button label={COPY.update} icon="download-outline" onPress={update} accessibilityHint="Opens the download page" />
              <Button label={COPY.later} variant="ghost" onPress={later} accessibilityHint="Reminds you next time you open the app" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
