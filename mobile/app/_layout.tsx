import '@/global.css';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';

import { SignInSheet } from '@/components/auth/SignInSheet';
import { ThemeRoot } from '@/components/layout/ThemeRoot';
import { Toast } from '@/components/ui/Toast';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { useMembership } from '@/hooks/useProfile';
import { persistOptions, queryClient } from '@/lib/queryClient';

export default function RootLayout() {
  useAuthBootstrap();

  // The query client wraps the whole app, outside any auth gate, so cached
  // data survives sign-in/out and guests get the persisted cache too.
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemeRoot>
        <RootNavigator />
        <SignInSheet />
        <Toast />
      </ThemeRoot>
    </PersistQueryClientProvider>
  );
}

function RootNavigator() {
  const { status } = useMembership();
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
        <Stack.Screen name="(auth)/sign-in" />
        <Stack.Screen name="(auth)/sign-up" />
        <Stack.Screen name="(auth)/verify" />
        <Stack.Screen name="(auth)/forgot-password" />
        <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Screen name="legal/[doc]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="oauth-callback" />
    </Stack>
  );
}
