import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { avatarUrl } from '@/lib/avatar';
import { emojiTint, getAvatar } from '@/lib/avatars';

type Props = {
  avatarKey: string | null | undefined;
  /** The member's id: needed to show a custom picture (without it the first preset shows). */
  userId?: string | null;
  /** For the custom picture's accessibility label. */
  nickname?: string | null;
  size?: number;
  /** A deleted account: a neutral grey silhouette instead of any preset. */
  deleted?: boolean;
};

/**
 * A member's avatar: a custom picture (avatars bucket) or a preset from lib/avatars
 * (unknown keys show the first preset, which also sits under a custom picture while it
 * loads and stays if it fails).
 */
export function Avatar({ avatarKey, userId, nickname, size = 40, deleted = false }: Props) {
  const url = deleted ? null : avatarUrl(userId, avatarKey);
  // Keyed by URL, so a new picture gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) return <PresetAvatar avatarKey={avatarKey} size={size} deleted={deleted} />;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={nickname ? `${nickname}'s profile picture` : 'Profile picture'}
    >
      <PresetAvatar avatarKey="avatar_01" size={size} deleted={false} />
      <Image
        source={{ uri: url }}
        style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2 }}
        cachePolicy="disk"
        transition={120}
        recyclingKey={url}
        onError={() => setFailedUrl(url)}
      />
    </View>
  );
}

function PresetAvatar({ avatarKey, size, deleted }: { avatarKey: string | null | undefined; size: number; deleted: boolean }) {
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
