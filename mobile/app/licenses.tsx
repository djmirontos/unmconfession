import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/layout/BackHeader';
import { NOTICES } from '@/lib/licenses';

/** Read-only third-party license notices, reached from Profile. */
export default function LicensesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Open source notices" />
      <ScrollView contentContainerClassName="gap-4 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {NOTICES.map((notice) => (
          <View key={notice.name} className="gap-2 rounded-2xl border border-hairline bg-surface1 p-4">
            <Text accessibilityRole="header" className="text-base font-bold text-text">
              {notice.name}
            </Text>
            <Text className="text-sm text-text-dim">{notice.usage}</Text>
            <Text className="text-xs text-text-dim" selectable>
              {notice.source}
            </Text>
            <Text className="text-sm leading-5 text-text" selectable>
              {notice.license}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
