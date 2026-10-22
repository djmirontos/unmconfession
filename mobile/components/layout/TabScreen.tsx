import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { title?: string; header?: ReactNode; children: ReactNode };

/** Top-level tab layout: safe-area header and scrolling content. */
export function TabScreen({ title, header, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="h-14 flex-row items-center border-b border-hairline px-4">
        {header ?? (
          <Text accessibilityRole="header" className="text-xl font-bold tracking-wide text-text">
            {title}
          </Text>
        )}
      </View>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">{children}</ScrollView>
    </View>
  );
}
