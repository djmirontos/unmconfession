import { useRouter } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { isDeletedAuthor } from '@/lib/authorLabel';
import { useAuthStore } from '@/stores/authStore';

const MIN_TARGET = 44;

/** The profile being shown, so its own posts do not link to the same page again. */
export const CurrentProfileContext = createContext<string | null>(null);

/** Opens a member's profile: guests get the sign-in sheet, your own id opens the Profile tab. */
export function useOpenProfile() {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const viewerId = useAuthStore((s) => s.session?.user.id ?? null);

  return useCallback(
    (userId: string) => {
      if (!requireAuth('profile')) return;
      if (userId === viewerId) router.navigate('/(tabs)/profile');
      else router.push({ pathname: '/user/[id]', params: { id: userId } });
    },
    [requireAuth, viewerId, router],
  );
}

type Props = {
  userId: string | null;
  nickname: string | null;
  /** Height of what it wraps; the touch area grows to 44 px without moving anything. */
  height: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** Makes an avatar and/or nickname open that member's profile. A deleted account is not a link (same box, not pressable). */
export function ProfileLink({ userId, nickname, height, className, style, children }: Props) {
  const openProfile = useOpenProfile();
  const current = useContext(CurrentProfileContext);
  if (!userId || isDeletedAuthor(nickname) || userId === current) {
    return (
      <View className={className} style={style}>
        {children}
      </View>
    );
  }
  const slop = Math.max(0, Math.ceil((MIN_TARGET - height) / 2));
  return (
    <Pressable
      onPress={() => openProfile(userId)}
      hitSlop={{ top: slop, bottom: slop, left: 4, right: 4 }}
      accessibilityRole="link"
      accessibilityLabel={`View ${nickname}'s profile`}
      className={`active:opacity-70 ${className ?? ''}`}
      style={style}
    >
      {children}
    </Pressable>
  );
}
