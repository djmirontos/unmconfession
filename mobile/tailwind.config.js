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
      },
    },
  },
  plugins: [],
};
