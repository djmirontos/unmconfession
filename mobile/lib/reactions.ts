import type { ImageSourcePropType } from 'react-native';

import { Constants, type Database } from '@/types/database';

export type ReactionType = Database['public']['Enums']['reaction_type'];

/** Picker order, from the generated enum (like, love, haha, wow, sad, angry). */
export const REACTION_TYPES: readonly ReactionType[] = Constants.public.Enums.reaction_type;

// Microsoft Fluent Emoji (3D, MIT), resized to 96 px. Notice: app/licenses.tsx.
export const REACTIONS: Record<ReactionType, { label: string; image: ImageSourcePropType }> = {
  like: { label: 'Like', image: require('@/assets/reactions/like.png') },
  love: { label: 'Love', image: require('@/assets/reactions/love.png') },
  haha: { label: 'Haha', image: require('@/assets/reactions/haha.png') },
  wow: { label: 'Wow', image: require('@/assets/reactions/wow.png') },
  sad: { label: 'Sad', image: require('@/assets/reactions/sad.png') },
  angry: { label: 'Angry', image: require('@/assets/reactions/angry.png') },
};
