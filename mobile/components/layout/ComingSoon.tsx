import { Text, View } from 'react-native';

/** Marks a placeholder tab whose real content arrives in a later module. */
export function ComingSoon({ label }: { label: string }) {
  return (
    <View className="rounded-xl border border-dashed border-hairline px-4 py-3">
      <Text className="text-center text-sm text-text-dim">{label}</Text>
    </View>
  );
}
