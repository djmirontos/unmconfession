import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type AvatarPreset = { key: string; icon: IconName; color: string };

// Preset keys stored in profiles.avatar_key. Rendered as icon badges until
// illustrated avatar art is bundled; the keys stay the same.
export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { key: 'avatar_01', icon: 'paw', color: '#FFB020' },
  { key: 'avatar_02', icon: 'planet', color: '#7C8CFF' },
  { key: 'avatar_03', icon: 'rocket', color: '#FF7A59' },
  { key: 'avatar_04', icon: 'leaf', color: '#5BD68A' },
  { key: 'avatar_05', icon: 'flame', color: '#FF5A4D' },
  { key: 'avatar_06', icon: 'moon', color: '#B48CFF' },
  { key: 'avatar_07', icon: 'sunny', color: '#FFD23F' },
  { key: 'avatar_08', icon: 'flash', color: '#3FC8FF' },
  { key: 'avatar_09', icon: 'musical-notes', color: '#FF8FC7' },
  { key: 'avatar_10', icon: 'football', color: '#9BD35A' },
  { key: 'avatar_11', icon: 'game-controller', color: '#5AD3C8' },
  { key: 'avatar_12', icon: 'book', color: '#E0A872' },
];

const FALLBACK = AVATAR_PRESETS[0] as AvatarPreset;

export function getAvatarPreset(key: string | null | undefined): AvatarPreset {
  return AVATAR_PRESETS.find((p) => p.key === key) ?? FALLBACK;
}
