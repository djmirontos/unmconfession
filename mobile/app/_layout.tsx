import '@/global.css';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SignInSheet } from '@/components/auth/SignInSheet';
import { ThemeRoot } from '@/components/layout/ThemeRoot';
import { ReactionPickerOverlay } from '@/components/reactions/ReactionPickerOverlay';
import { ShareCardHost } from '@/components/share/ShareCardHost';
import { Toast } from '@/components/ui/Toast';
import { ImageViewer } from '@/components/viewer/ImageViewer';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { useNotificationsRealtime } from '@/hooks/useNotificationsRealtime';
import { useMembership } from '@/hooks/useProfile';
import { persistOptions, queryClient } from '@/lib/queryClient';

export default function RootLayout() {
  useAuthBootstrap();

  // The query client wraps the whole app, outside any auth gate, so cached
  // data survives sign-in/out and guests get the persisted cache too.
  // GestureHandlerRootView is outermost so every screen can use gesture-handler (reaction picker).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeRoot>
          <RootNavigator />
          <SignInSheet />
          <Toast />
          <ReactionPickerOverlay />
          <ImageViewer />
          <ShareCardHost />
        </ThemeRoot>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { status } = useMembership();
  // Members only (the hook checks): live badge and list for the whole session.
  useNotificationsRealtime();
  const needsNickname = status === 'needs-nickname';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Signed in without a nickname (e.g. first Google sign-in): only this screen is reachable. */}
      <Stack.Protected guard={needsNickname}>
        <Stack.Screen name="choose-nickname" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!needsNickname}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="listing/[id]" />
        <Stack.Screen name="my-posts" />
        <Stack.Screen name="blocked-users" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="post-status" />
        <Stack.Screen name="edit" />
        <Stack.Screen name="(auth)/sign-in" />
        <Stack.Screen name="(auth)/sign-up" />
        <Stack.Screen name="(auth)/verify" />
        <Stack.Screen name="(auth)/forgot-password" />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Screen name="legal/[doc]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="licenses" />
      <Stack.Screen name="oauth-callback" />
    </Stack>
  );
}
