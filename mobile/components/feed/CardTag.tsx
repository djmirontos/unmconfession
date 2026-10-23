import { Text } from 'react-native';

/** Small grey pill on the right of a card header ("#123", "Poll", "SELL"). */
export function CardTag({ label, accessibilityLabel }: { label: string; accessibilityLabel?: string }) {
  return (
    <Text
      className="rounded-full bg-surface2 px-2.5 py-1 text-xs font-bold text-text-dim"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {label}
    </Text>
  );
}
