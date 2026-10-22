import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { getAvatarPreset } from '@/lib/avatars';

type Props = { avatarKey: string | null | undefined; size?: number };

export function Avatar({ avatarKey, size = 40 }: Props) {
  const preset = getAvatarPreset(avatarKey);
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${preset.color}26` }}
      className="items-center justify-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={preset.icon} size={size * 0.5} color={preset.color} />
    </View>
  );
}
