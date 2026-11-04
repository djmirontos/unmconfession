import { Pressable, Text, View } from 'react-native';

type Option<K extends string> = { key: K; label: string };

type Props<K extends string> = {
  options: readonly Option<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel: string;
};

/** A connected pill: one track, equal segments, the selected one filled. Read as a tab list. */
export function SegmentedControl<K extends string>({ options, value, onChange, accessibilityLabel }: Props<K>) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className="flex-row rounded-full border border-hairline bg-surface2 p-0.5"
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            className={`min-h-11 flex-1 items-center justify-center rounded-full px-2 ${selected ? 'bg-accent' : 'active:opacity-70'}`}
          >
            <Text numberOfLines={1} className={`text-sm font-bold ${selected ? 'text-on-accent' : 'text-text-dim'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
