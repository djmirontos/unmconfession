import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type Props = { title: string; subtitle?: string; canGoBack?: boolean };

export function AuthHeader({ title, subtitle, canGoBack = true }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View className="gap-4">
      {canGoBack && router.canGoBack() ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-10 w-10 items-center justify-center rounded-full bg-surface2"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-3xl font-bold text-text">
          {title}
        </Text>
        {subtitle ? <Text className="text-base text-text-dim">{subtitle}</Text> : null}
      </View>
    </View>
  );
}
