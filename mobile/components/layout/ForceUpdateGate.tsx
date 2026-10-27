import { useEffect } from 'react';
import { BackHandler, Linking, Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Seal } from '@/components/brand/Seal';
import { Button } from '@/components/ui/Button';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useForceUpdate } from '@/hooks/useAppRequirements';
import { logError } from '@/lib/log';
import { safeUpdateUrl } from '@/lib/versionGate';

const DEFAULT_MESSAGE = 'A new version of the app is required to continue.';

/**
 * Mounted once, last in the root layout: a full-screen Modal above the tabs and every sheet.
 * It cannot be dismissed; it goes away only when a later check lowers the minimum.
 */
export function ForceUpdateGate() {
  const { required, requirement, installed } = useForceUpdate();

  // The Modal's onRequestClose already swallows back; this also covers the moment around mount.
  useEffect(() => {
    if (!required) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [required]);

  if (!required || !requirement) return null;
  return (
    <Modal visible animationType="none" onRequestClose={() => {}} statusBarTranslucent navigationBarTranslucent>
      <UpdateRequired
        message={requirement.updateMessage?.trim() || DEFAULT_MESSAGE}
        url={safeUpdateUrl(requirement.updateUrl)}
        installed={installed ?? 'unknown'}
        minimum={requirement.minAppVersion}
      />
    </Modal>
  );
}

type Props = { message: string; url: string | null; installed: string; minimum: string };

function UpdateRequired({ message, url, installed, minimum }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = useBottomInset();
  const openStore = () => {
    if (url) Linking.openURL(url).catch((error: unknown) => logError('forceUpdate.openURL', error));
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: bottom }} accessibilityViewIsModal>
      <ScrollView contentContainerClassName="grow items-center gap-5 px-6 pb-8 pt-12">
        {/* The bundled seal, not the panel logo: this screen must show the brand offline. */}
        <Seal size={104} accessibilityLabel="UNM Freedom Confessions" />
        <Text accessibilityRole="header" className="text-center text-2xl font-bold text-text">
          Update required
        </Text>
        <Text className="text-center text-base text-text-dim">{message}</Text>
        <Text className="text-center text-xs text-text-dim">
          Installed version {installed} · Required {minimum} or later
        </Text>
      </ScrollView>
      <View className="px-6 pt-2">
        {url ? (
          <Button label="Update now" icon="download-outline" onPress={openStore} accessibilityHint="Opens the download page" />
        ) : (
          <Text className="text-center text-sm text-text-dim">Please update the app from where you installed it.</Text>
        )}
      </View>
    </View>
  );
}
