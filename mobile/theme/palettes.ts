// The hex palettes, one per scheme. No imports, so tests can check them in Node
// (tests/chatColors.test.mjs). theme/colors.ts turns them into the Tailwind CSS variables.

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
  // Chat only (Messenger-style blue; the rest of the app keeps the amber accent).
  /** The conversation background: neutral, not blue. */
  chatBg: string;
  /** My bubbles, the send button and unread badges. */
  chatOwn: string;
  /** Text and icons on chatOwn. */
  onChatOwn: string;
  /** The other member's bubbles. */
  chatOther: string;
  /** Blue for icons, borders and bars (graphics: 3:1 or more on the chat surfaces). */
  chatAccent: string;
  /** Blue for text on bg, chatBg and surface1 (4.5:1 or more). */
  chatAccentText: string;
  /** A soft blue fill behind a chatAccent icon. */
  chatAccentDim: string;
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
  chatBg: '#0A0A0B',
  chatOwn: '#0866FF',
  onChatOwn: '#FFFFFF',
  chatOther: '#2A2A2D',
  chatAccent: '#4D94FF',
  chatAccentText: '#4D94FF',
  chatAccentDim: '#0E2A52',
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
  chatBg: '#FFFFFF',
  chatOwn: '#0866FF',
  onChatOwn: '#FFFFFF',
  chatOther: '#F0F0F0',
  chatAccent: '#0866FF',
  chatAccentText: '#0A5BD9',
  chatAccentDim: '#E3EEFF',
};

export const palettes: Record<ColorScheme, ThemeColors> = { light, dark };
