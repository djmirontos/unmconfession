import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Seal } from '@/components/brand/Seal';
import { useAppSettings } from '@/hooks/useAppSettings';

type Props = { size?: number; showName?: boolean };

/**
 * The logo uploaded in the panel ("branding" bucket) when there is one, otherwise the bundled
 * seal. The seal also shows while an uploaded logo loads and if it fails, so there is never a gap.
 */
export function AppLogo({ size = 32, showName = false }: Props) {
  const { appName, logoUrl } = useAppSettings();
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const tryUploaded = logoUrl !== null && logoUrl !== failedUrl;
  const uploadedShown = tryUploaded && loadedUrl === logoUrl;

  return (
    <View className="flex-row items-center gap-2.5" accessibilityRole="header" accessibilityLabel={appName}>
      {/* Fixed box: the seal underneath until the uploaded image has loaded. */}
      <View style={{ width: size, height: size }}>
        {uploadedShown ? null : <Seal size={size} />}
        {tryUploaded ? (
          <Image
            source={{ uri: logoUrl }}
            style={{ position: 'absolute', width: size, height: size, borderRadius: size * 0.25 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            onLoad={() => setLoadedUrl(logoUrl)}
            onError={() => setFailedUrl(logoUrl)}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      {showName ? (
        <Text numberOfLines={1} className="shrink text-lg font-bold tracking-wide text-text">
          {appName}
        </Text>
      ) : null}
    </View>
  );
}
