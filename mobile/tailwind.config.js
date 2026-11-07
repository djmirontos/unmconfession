// Semantic color tokens. Values are CSS variables set per scheme from
// theme/colors.ts (the single source of the hex palettes).
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        'feed-bg': token('feed-bg'),
        surface1: token('surface1'),
        surface2: token('surface2'),
        hairline: token('hairline'),
        text: token('text'),
        'text-dim': token('text-dim'),
        accent: token('accent'),
        'accent-dim': token('accent-dim'),
        'on-accent': token('on-accent'),
        success: token('success'),
        danger: token('danger'),
        navy: token('navy'),
        // Chat screens only (theme/palettes.ts): Messenger-style blue on a neutral background.
        'chat-bg': token('chat-bg'),
        'chat-own': token('chat-own'),
        'on-chat-own': token('on-chat-own'),
        'chat-other': token('chat-other'),
        'chat-accent': token('chat-accent'),
        'chat-accent-text': token('chat-accent-text'),
        'chat-accent-dim': token('chat-accent-dim'),
      },
    },
  },
  plugins: [],
};
