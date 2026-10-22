import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/profile/Avatar';
import { AVATAR_PRESETS } from '@/lib/avatars';

type Props = { value: string; onChange: (key: string) => void; disabled?: boolean };

export function AvatarPicker({ value, onChange, disabled }: Props) {
  return (
    <View className="flex-row flex-wrap gap-3" accessibilityRole="radiogroup" accessibilityLabel="Choose an avatar">
      {AVATAR_PRESETS.map((preset, index) => {
        const selected = preset.key === value;
        return (
          <Pressable
            key={preset.key}
            onPress={() => onChange(preset.key)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={`Avatar ${index + 1}, ${preset.icon.replace('-', ' ')}`}
            accessibilityState={{ selected, disabled: !!disabled }}
            className={`rounded-full border-2 p-0.5 ${selected ? 'border-accent' : 'border-transparent'}`}
          >
            <Avatar avatarKey={preset.key} size={48} />
          </Pressable>
        );
      })}
    </View>
  );
}
