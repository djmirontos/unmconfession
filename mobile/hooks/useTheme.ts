import { useColorScheme } from 'react-native';

import { type ColorScheme, palettes } from '@/theme/colors';
import { useThemeStore } from '@/stores/themeStore';

/** The active scheme (preference, or the system's when "system") and its palette. */
export function useTheme() {
  const preference = useThemeStore((s) => s.preference);
  const system = useColorScheme();
  const scheme: ColorScheme =
    preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  return { scheme, colors: palettes[scheme], preference };
}
