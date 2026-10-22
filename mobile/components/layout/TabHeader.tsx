import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/** The 56 px bar under the status bar on every tab: a title, or custom content. */
export function TabHeader({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <View className="h-14 flex-row items-center border-b border-hairline px-4">
      {children ?? (
        <Text accessibilityRole="header" className="text-xl font-bold tracking-wide text-text">
          {title}
        </Text>
      )}
    </View>
  );
}
