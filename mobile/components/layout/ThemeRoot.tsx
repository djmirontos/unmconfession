import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { type ReactNode, useEffect, useMemo } from 'react';
import { Appearance, StatusBar as NativeStatusBar, Platform, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { themeVars } from '@/theme/colors';

/** Applies the theme preference to Tailwind variables, navigation, status bar and native UI. */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const { scheme, colors, preference } = useTheme();

  // Native pieces (keyboard, alerts, date pickers) follow the in-app preference too.
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  useEffect(() => {
    // Window background (behind every view, e.g. during transitions and keyboard resize).
    void SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);

  // Edge-to-edge builds (every SDK 57 release build) draw our root view behind a
  // transparent status bar. Expo Go is not edge-to-edge on some devices, and there
  // the strip is painted by window.statusBarColor, black by default. Setting it to
  // the theme background fixes that; Android ignores it in edge-to-edge windows.
  useEffect(() => {
    if (Platform.OS === 'android') NativeStatusBar.setBackgroundColor(colors.bg);
  }, [colors.bg]);

  const barStyle = scheme === 'dark' ? 'light' : 'dark';

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.surface1,
        text: colors.text,
        border: colors.hairline,
        notification: colors.danger,
      },
    };
  }, [scheme, colors]);

  return (
    <View style={themeVars[scheme]} className="flex-1 bg-bg">
      <StatusBar style={barStyle} animated />
      <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>
    </View>
  );
}
