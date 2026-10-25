import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type AvatarCategory = 'classic' | 'faces' | 'animals' | 'nature' | 'food' | 'travel' | 'fun';

export const AVATAR_CATEGORIES: readonly { value: AvatarCategory; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'faces', label: 'Faces' },
  { value: 'animals', label: 'Animals' },
  { value: 'nature', label: 'Nature' },
  { value: 'food', label: 'Food' },
  { value: 'travel', label: 'Travel' },
  { value: 'fun', label: 'Fun' },
];

/**
 * One avatar stored in profiles.avatar_key (^[a-z0-9_]{1,40}$). Classic presets are icon
 * badges; emoji avatars sit on a soft circle tinted from `hue` (lighter in light theme,
 * deeper in dark), fixed per emoji.
 */
export type AvatarDef = { key: string; label: string; category: AvatarCategory } & (
  | { kind: 'icon'; icon: IconName; color: string }
  | { kind: 'emoji'; emoji: string; hue: number }
);

const icon = (key: string, label: string, name: IconName, color: string): AvatarDef => ({
  key,
  label,
  category: 'classic',
  kind: 'icon',
  icon: name,
  color,
});
const emoji = (category: AvatarCategory, name: string, label: string, char: string, hue: number): AvatarDef => ({
  key: `em_${name}`,
  label,
  category,
  kind: 'emoji',
  emoji: char,
  hue,
});

// The single avatar table. Keys are stored, so never rename one; add new ones instead.
export const AVATARS: readonly AvatarDef[] = [
  icon('avatar_01', 'Paw', 'paw', '#FFB020'),
  icon('avatar_02', 'Planet', 'planet', '#7C8CFF'),
  icon('avatar_03', 'Rocket badge', 'rocket', '#FF7A59'),
  icon('avatar_04', 'Leaf', 'leaf', '#5BD68A'),
  icon('avatar_05', 'Flame', 'flame', '#FF5A4D'),
  icon('avatar_06', 'Moon', 'moon', '#B48CFF'),
  icon('avatar_07', 'Sun', 'sunny', '#FFD23F'),
  icon('avatar_08', 'Flash', 'flash', '#3FC8FF'),
  icon('avatar_09', 'Music notes', 'musical-notes', '#FF8FC7'),
  icon('avatar_10', 'Football', 'football', '#9BD35A'),
  icon('avatar_11', 'Game controller badge', 'game-controller', '#5AD3C8'),
  icon('avatar_12', 'Book badge', 'book', '#E0A872'),

  emoji('faces', 'grin', 'Grinning face', '😀', 45),
  emoji('faces', 'smile', 'Smiling face', '😊', 30),
  emoji('faces', 'cool', 'Face with sunglasses', '😎', 205),
  emoji('faces', 'starstruck', 'Star-struck', '🤩', 280),
  emoji('faces', 'nerd', 'Nerd face', '🤓', 190),
  emoji('faces', 'wink', 'Winking face', '😉', 330),
  emoji('faces', 'thinking', 'Thinking face', '🤔', 160),
  emoji('faces', 'party', 'Partying face', '🥳', 300),
  emoji('faces', 'ghost', 'Ghost', '👻', 250),
  emoji('faces', 'alien', 'Alien', '👽', 120),
  emoji('faces', 'robot', 'Robot', '🤖', 215),

  emoji('animals', 'cat', 'Cat', '🐱', 35),
  emoji('animals', 'dog', 'Dog', '🐶', 25),
  emoji('animals', 'fox', 'Fox', '🦊', 20),
  emoji('animals', 'panda', 'Panda', '🐼', 140),
  emoji('animals', 'koala', 'Koala', '🐨', 210),
  emoji('animals', 'tiger', 'Tiger', '🐯', 40),
  emoji('animals', 'lion', 'Lion', '🦁', 45),
  emoji('animals', 'frog', 'Frog', '🐸', 100),
  emoji('animals', 'owl', 'Owl', '🦉', 30),
  emoji('animals', 'penguin', 'Penguin', '🐧', 195),
  emoji('animals', 'unicorn', 'Unicorn', '🦄', 290),
  emoji('animals', 'octopus', 'Octopus', '🐙', 340),

  emoji('nature', 'sunflower', 'Sunflower', '🌻', 50),
  emoji('nature', 'blossom', 'Cherry blossom', '🌸', 335),
  emoji('nature', 'tulip', 'Tulip', '🌷', 350),
  emoji('nature', 'cactus', 'Cactus', '🌵', 110),
  emoji('nature', 'palm', 'Palm tree', '🌴', 130),
  emoji('nature', 'tree', 'Evergreen tree', '🌲', 145),
  emoji('nature', 'maple', 'Maple leaf', '🍁', 15),
  emoji('nature', 'mushroom', 'Mushroom', '🍄', 5),
  emoji('nature', 'rainbow', 'Rainbow', '🌈', 200),
  emoji('nature', 'sun_cloud', 'Sun behind cloud', '⛅', 205),
  emoji('nature', 'lightning', 'Lightning', '⚡', 55),
  emoji('nature', 'snowflake', 'Snowflake', '❄️', 195),

  emoji('food', 'pizza', 'Pizza', '🍕', 30),
  emoji('food', 'burger', 'Burger', '🍔', 35),
  emoji('food', 'fries', 'Fries', '🍟', 0),
  emoji('food', 'ramen', 'Ramen', '🍜', 25),
  emoji('food', 'sushi', 'Sushi', '🍣', 10),
  emoji('food', 'donut', 'Donut', '🍩', 320),
  emoji('food', 'ice_cream', 'Ice cream', '🍦', 185),
  emoji('food', 'mango', 'Mango', '🥭', 45),
  emoji('food', 'avocado', 'Avocado', '🥑', 90),
  emoji('food', 'boba', 'Bubble tea', '🧋', 30),
  emoji('food', 'coffee', 'Coffee', '☕', 25),
  emoji('food', 'watermelon', 'Watermelon', '🍉', 130),

  emoji('travel', 'airplane', 'Airplane', '✈️', 205),
  emoji('travel', 'car', 'Car', '🚗', 0),
  emoji('travel', 'ship', 'Ship', '🚢', 210),
  emoji('travel', 'rocket', 'Rocket', '🚀', 240),
  emoji('travel', 'bicycle', 'Bicycle', '🚲', 150),
  emoji('travel', 'train', 'Train', '🚆', 220),
  emoji('travel', 'scooter', 'Scooter', '🛵', 15),
  emoji('travel', 'sailboat', 'Sailboat', '⛵', 195),
  emoji('travel', 'helicopter', 'Helicopter', '🚁', 175),
  emoji('travel', 'balloon', 'Hot air balloon', '🎈', 350),

  emoji('fun', 'guitar', 'Guitar', '🎸', 15),
  emoji('fun', 'game', 'Game controller', '🎮', 260),
  emoji('fun', 'book', 'Books', '📚', 35),
  emoji('fun', 'camera', 'Camera', '📷', 220),
  emoji('fun', 'soccer', 'Soccer ball', '⚽', 120),
  emoji('fun', 'art', 'Artist palette', '🎨', 300),
  emoji('fun', 'basketball', 'Basketball', '🏀', 25),
  emoji('fun', 'headphones', 'Headphones', '🎧', 250),
  emoji('fun', 'dice', 'Dice', '🎲', 0),
  emoji('fun', 'trophy', 'Trophy', '🏆', 45),
  emoji('fun', 'microphone', 'Microphone', '🎤', 285),
];

const BY_KEY = new Map(AVATARS.map((a) => [a.key, a]));
const FALLBACK = AVATARS[0] as AvatarDef;

/** The avatar for a stored key; unknown or missing keys look like avatar_01 (never blank). */
export function getAvatar(key: string | null | undefined): AvatarDef {
  return (key ? BY_KEY.get(key) : undefined) ?? FALLBACK;
}

export const avatarsIn = (category: AvatarCategory) => AVATARS.filter((a) => a.category === category);

/** Soft circle behind an emoji: light in light theme, deep in dark, readable either way. */
export function emojiTint(hue: number, scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? `hsl(${hue}, 32%, 26%)` : `hsl(${hue}, 75%, 89%)`;
}
