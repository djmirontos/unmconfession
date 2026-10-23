import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** 56 px header for pushed screens: back button, title and an optional right-side action. Falls back to the Feed when there is no history. */
export function BackHeader({ title, right }: { title: string; right?: ReactNode }) {
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
      <Text accessibilityRole="header" className="flex-1 text-lg font-bold text-text">
        {title}
      </Text>
      {right}
    </View>
  );
}
