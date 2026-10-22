import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabHeader } from '@/components/layout/TabHeader';

type Props = { title?: string; header?: ReactNode; children: ReactNode };

/** Top-level tab layout: safe-area header and scrolling content. */
export function TabScreen({ title, header, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader title={title}>{header}</TabHeader>
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">{children}</ScrollView>
    </View>
  );
}
