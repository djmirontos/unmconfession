import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { emojiTint, getAvatar } from '@/lib/avatars';

type Props = {
  avatarKey: string | null | undefined;
  size?: number;
  /** A deleted account: a neutral grey silhouette instead of any preset. */
  deleted?: boolean;
};

/** A member's avatar from the one table in lib/avatars (unknown keys show the first preset). */
export function Avatar({ avatarKey, size = 40, deleted = false }: Props) {
  const { scheme, colors } = useTheme();
  const avatar = getAvatar(avatarKey);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (deleted) {
    return (
      <View
        style={circle}
        className="items-center justify-center bg-surface2"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name="person" size={size * 0.5} color={colors.textDim} />
      </View>
    );
  }

  if (avatar.kind === 'emoji') {
    return (
      <View
        style={[circle, { backgroundColor: emojiTint(avatar.hue, scheme) }]}
        className="items-center justify-center"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text allowFontScaling={false} style={{ fontSize: size * 0.56, lineHeight: size * 0.72 }}>
          {avatar.emoji}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[circle, { backgroundColor: `${avatar.color}26` }]}
      className="items-center justify-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={avatar.icon} size={size * 0.5} color={avatar.color} />
    </View>
  );
}
