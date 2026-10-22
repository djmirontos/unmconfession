import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ComponentProps, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useTheme } from '@/hooks/useTheme';
import { type ParticipationAction, useSignInSheetStore } from '@/stores/signInSheetStore';

type IconName = ComponentProps<typeof Ionicons>['name'];

const COPY: Record<ParticipationAction, { icon: IconName; title: string }> = {
  post: { icon: 'create-outline', title: 'Sign in to post' },
  comment: { icon: 'chatbubble-outline', title: 'Sign in to comment' },
  react: { icon: 'heart-outline', title: 'Sign in to react' },
  vote: { icon: 'stats-chart-outline', title: 'Sign in to vote' },
  report: { icon: 'flag-outline', title: 'Sign in to report' },
  share: { icon: 'share-social-outline', title: 'Sign in to share' },
  default: { icon: 'sparkles-outline', title: 'Join the conversation' },
};

/** Mounted once at the root; opened by useRequireAuth() when a guest tries to participate. */
export function SignInSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isOpen, action, close } = useSignInSheetStore();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[action];

  const go = (href: '/sign-in' | '/sign-up') => {
    close();
    router.push(href);
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close sign-in prompt"
        />
        <View
          className="gap-5 rounded-t-3xl border-t border-hairline bg-surface1 px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 24 }}
          accessibilityViewIsModal
        >
          <View className="h-1 w-10 self-center rounded-full bg-hairline" />
          <View className="items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-dim">
              <Ionicons name={copy.icon} size={26} color={colors.accent} />
            </View>
            <Text accessibilityRole="header" className="text-center text-2xl font-bold text-text">
              {copy.title}
            </Text>
            <Text className="text-center text-sm text-text-dim">
              Reading is open to everyone. A free account lets you post, comment, react and vote under your
              nickname.
            </Text>
          </View>
          <FormMessage tone="error" message={error} />
          <View className="gap-3">
            <GoogleButton onSuccess={close} onError={setError} />
            <Button label="Create an account" onPress={() => go('/sign-up')} />
            <Button label="I already have an account" variant="ghost" onPress={() => go('/sign-in')} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
