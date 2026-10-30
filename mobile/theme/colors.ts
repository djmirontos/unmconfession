import { vars } from 'nativewind';

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  bg: string;
  /** Behind flush feed cards only: the strip between posts, clearly darker than surface1 (cards). */
  feedBg: string;
  surface1: string;
  surface2: string;
  hairline: string;
  text: string;
  textDim: string;
  accent: string;
  accentDim: string;
  onAccent: string;
  success: string;
  danger: string;
  /** Focus outline for the next box of the verification code input. */
  navy: string;
};

// LyriaHub "Dark Studio": near-black surfaces, one amber accent, hairline borders.
const dark: ThemeColors = {
  bg: '#0A0A0B',
  feedBg: '#060608',
  surface1: '#121214',
  surface2: '#1A1A1D',
  hairline: '#2A2A2E',
  text: '#F2F0EB',
  textDim: '#8E8C86',
  accent: '#FFB020',
  accentDim: '#3A2C0C',
  onAccent: '#1A1100',
  success: '#5BD68A',
  danger: '#FF5A4D',
  navy: '#8FB0FF',
};

// The inverse: warm off-white surfaces, near-black text. Accent, success and
// danger are deepened so they keep contrast on light backgrounds.
const light: ThemeColors = {
  bg: '#F7F6F2',
  feedBg: '#EFEDE8',
  surface1: '#FFFFFF',
  surface2: '#EFEDE7',
  hairline: '#DEDBD3',
  text: '#141413',
  textDim: '#6B6963',
  accent: '#F0A000',
  accentDim: '#FFF0D1',
  onAccent: '#1A1100',
  success: '#1E8E4F',
  danger: '#D33A2E',
  navy: '#1F3A8A',
};

export const palettes: Record<ColorScheme, ThemeColors> = { light, dark };

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
  });
}

/** Style objects that set the Tailwind color variables for a subtree. */
export const themeVars: Record<ColorScheme, ReturnType<typeof vars>> = {
  light: toCssVars(light),
  dark: toCssVars(dark),
};
