import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** 56 px header for pushed screens: back button and title. Falls back to the Feed when there is no history. */
export function BackHeader({ title }: { title: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  return (
    <View className="h-14 flex-row items-center gap-2 border-b border-hairline px-2">
      <Pressable
        onPress={goBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="h-10 w-10 items-center justify-center rounded-full active:bg-surface2"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" className="text-lg font-bold text-text">
        {title}
      </Text>
    </View>
  );
}
