import { Text, Pressable } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

type Props = { count: number; onPress: () => void };

/** Floats over the list while the user is scrolled down and new posts are waiting. */
export function NewPostsPill({ count, onPress }: Props) {
  if (count === 0) return null;
  const label = `${count} new ${count === 1 ? 'post' : 'posts'}`;
  return (
    <Animated.View
      entering={FadeInUp.duration(180)}
      exiting={FadeOutUp.duration(150)}
      className="absolute left-0 right-0 top-3 items-center"
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Scroll to top`}
        className="rounded-full bg-accent px-4 py-2 shadow-md active:opacity-80"
      >
        <Text className="text-sm font-bold text-on-accent">{label} ↑</Text>
      </Pressable>
    </Animated.View>
  );
}
