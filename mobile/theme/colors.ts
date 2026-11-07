import { vars } from 'nativewind';

import { type ColorScheme, palettes, type ThemeColors } from '@/theme/palettes';

// The hex palettes live in theme/palettes.ts (pure, tested); this file makes the CSS variables.
export { palettes };
export type { ColorScheme, ThemeColors };

function hexToRgbChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function toCssVars(c: ThemeColors) {
  return vars({
    '--color-bg': hexToRgbChannels(c.bg),
    '--color-feed-bg': hexToRgbChannels(c.feedBg),
    '--color-surface1': hexToRgbChannels(c.surface1),
    '--color-surface2': hexToRgbChannels(c.surface2),
    '--color-hairline': hexToRgbChannels(c.hairline),
    '--color-text': hexToRgbChannels(c.text),
    '--color-text-dim': hexToRgbChannels(c.textDim),
    '--color-accent': hexToRgbChannels(c.accent),
    '--color-accent-dim': hexToRgbChannels(c.accentDim),
    '--color-on-accent': hexToRgbChannels(c.onAccent),
    '--color-success': hexToRgbChannels(c.success),
    '--color-danger': hexToRgbChannels(c.danger),
    '--color-navy': hexToRgbChannels(c.navy),
    '--color-chat-bg': hexToRgbChannels(c.chatBg),
    '--color-chat-own': hexToRgbChannels(c.chatOwn),
    '--color-on-chat-own': hexToRgbChannels(c.onChatOwn),
    '--color-chat-other': hexToRgbChannels(c.chatOther),
    '--color-chat-accent': hexToRgbChannels(c.chatAccent),
    '--color-chat-accent-text': hexToRgbChannels(c.chatAccentText),
    '--color-chat-accent-dim': hexToRgbChannels(c.chatAccentDim),
  });
}

/** Style objects that set the Tailwind color variables for a subtree. */
export const themeVars: Record<ColorScheme, ReturnType<typeof vars>> = {
  light: toCssVars(palettes.light),
  dark: toCssVars(palettes.dark),
};
