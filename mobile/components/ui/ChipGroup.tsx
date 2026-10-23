import { Pressable, ScrollView, Text, View } from 'react-native';

type Option<T> = { value: T; label: string };

type Props<T extends string | number> = {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Horizontal scroll instead of wrapping. */
  scroll?: boolean;
  disabled?: boolean;
};

/** Single-choice chips (radio group). */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
  scroll = false,
  disabled = false,
}: Props<T>) {
  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={String(option.value)}
        onPress={() => onChange(option.value)}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityLabel={option.label}
        accessibilityState={{ selected, disabled }}
        className={`h-9 justify-center rounded-full border px-4 ${selected ? 'border-accent bg-accent' : 'border-hairline bg-surface2'}`}
      >
        <Text className={`text-sm font-bold ${selected ? 'text-on-accent' : 'text-text'}`}>{option.label}</Text>
      </Pressable>
    );
  });

  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
      >
        {chips}
      </ScrollView>
    );
  }
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {chips}
    </View>
  );
}
