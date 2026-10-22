import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { type ReactNode, useEffect, useMemo } from 'react';
import { Appearance, View } from 'react-native';

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
    void SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);

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
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>
    </View>
  );
}
