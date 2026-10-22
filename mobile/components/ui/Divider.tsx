import { Text, View } from 'react-native';

export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className="h-px flex-1 bg-hairline" />
      <Text className="text-xs uppercase tracking-widest text-text-dim">{label}</Text>
      <View className="h-px flex-1 bg-hairline" />
    </View>
  );
}
