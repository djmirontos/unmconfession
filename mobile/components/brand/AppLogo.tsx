import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useAppSettings } from '@/hooks/useAppSettings';
import { useTheme } from '@/hooks/useTheme';

type Props = { size?: number; showName?: boolean };

/** Logo from the "branding" bucket, or a placeholder mark until one is uploaded. */
export function AppLogo({ size = 32, showName = false }: Props) {
  const { appName, logoUrl } = useAppSettings();
  const { colors } = useTheme();

  return (
    <View className="flex-row items-center gap-2.5" accessibilityRole="header" accessibilityLabel={appName}>
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size, height: size, borderRadius: size * 0.25 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{ width: size, height: size, borderRadius: size * 0.25 }}
          className="items-center justify-center bg-accent"
        >
          <Ionicons name="chatbubble-ellipses" size={size * 0.55} color={colors.onAccent} />
        </View>
      )}
      {showName ? (
        <Text numberOfLines={1} className="shrink text-lg font-bold tracking-wide text-text">
          {appName}
        </Text>
      ) : null}
    </View>
  );
}
