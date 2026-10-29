import '@/global.css';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SignInSheet } from '@/components/auth/SignInSheet';
import { ForceUpdateGate } from '@/components/layout/ForceUpdateGate';
import { ThemeRoot } from '@/components/layout/ThemeRoot';
import { ReactionPickerOverlay } from '@/components/reactions/ReactionPickerOverlay';
import { ShareCardHost } from '@/components/share/ShareCardHost';
import { Toast } from '@/components/ui/Toast';
import { ImageViewer } from '@/components/viewer/ImageViewer';
import { useAppRequirementsSync } from '@/hooks/useAppRequirements';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { useNotificationsRealtime } from '@/hooks/useNotificationsRealtime';
import { type MembershipStatus, useMembership } from '@/hooks/useProfile';
import { loadGoogleSignIn } from '@/lib/googleSignIn';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';

export default function RootLayout() {
  useAuthBootstrap();
  useAppRequirementsSync();
  useEffect(() => void loadGoogleSignIn(), []);

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
          {/* Last, so its Modal stacks above every sheet and modal. */}
          <ForceUpdateGate />
        </ThemeRoot>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

// The startup cover never stays longer than this (an offline token refresh can take ~30 s).
const STARTUP_COVER_MAX_MS = 2500;

/**
 * Cold start only: covers the app until the stored session is read and, if there is one,
 * the membership is known, so the tabs do not flash before choose-nickname. Guests clear it
 * as soon as storage is read (no session means no keychain read). Later sign-ins never show it.
 */
function useStartupCover(status: MembershipStatus): boolean {
  const restored = useAuthStore((s) => s.restored);
  const [done, setDone] = useState(false);
  const known = restored && status !== 'loading';
  // Latched during render (React's "adjust state while rendering" pattern): once known, never again.
  if (known && !done) setDone(true);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), STARTUP_COVER_MAX_MS);
    return () => clearTimeout(timer);
  }, []);

  return !done && !known;
}

function RootNavigator() {
  const { status } = useMembership();
  // Members only (the hook checks): live badge and list for the whole session.
  useNotificationsRealtime();
  const needsNickname = status === 'needs-nickname';
  const covered = useStartupCover(status);

  return (
    <>
      <AppStack needsNickname={needsNickname} />
      {covered ? <View className="absolute inset-0 bg-bg" accessibilityLabel="Loading" /> : null}
    </>
  );
}

function AppStack({ needsNickname }: { needsNickname: boolean }) {
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
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="my-posts" />
        <Stack.Screen name="blocked-users" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="change-nickname" />
        <Stack.Screen name="about-you" />
        <Stack.Screen name="notification-preferences" />
        <Stack.Screen name="delete-account" />
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
    </Stack>
  );
}
