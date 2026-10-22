import { useState } from 'react';
import { type NativeSyntheticEvent, Pressable, Text, type TextLayoutEventData, View } from 'react-native';

const COLLAPSED_LINES = 6;
const BODY_CLASS = 'text-base leading-6 text-text';

type Props = { postId: string; body: string; targetName: string | null; full?: boolean };

/** Shoutout target, then the text clamped to 6 lines with "Read more" when it really overflows. */
export function PostBody({ postId, body, targetName, full = false }: Props) {
  // Both keyed by post: list cells are recycled, so plain values would leak to the next post.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [measured, setMeasured] = useState<{ id: string; overflows: boolean } | null>(null);

  const expanded = full || expandedId === postId;
  const overflows = measured?.id === postId && measured.overflows;

  // Measured on a hidden, unclamped copy: with numberOfLines set, Android and iOS
  // report different line counts, but the unclamped copy reports all lines on both.
  const onMeasure = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const next = e.nativeEvent.lines.length > COLLAPSED_LINES;
    if (measured?.id !== postId || measured.overflows !== next) setMeasured({ id: postId, overflows: next });
  };

  return (
    <View className="gap-1.5">
      {targetName ? (
        <Text className="text-sm font-bold text-accent">
          To: <Text className="text-text">{targetName}</Text>
        </Text>
      ) : null}
      <View className="overflow-hidden">
        {expanded ? null : (
          <View
            className="absolute left-0 right-0 top-0 opacity-0"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text className={BODY_CLASS} onTextLayout={onMeasure}>
              {body}
            </Text>
          </View>
        )}
        <Text className={BODY_CLASS} numberOfLines={expanded ? undefined : COLLAPSED_LINES} selectable={full}>
          {body}
        </Text>
      </View>
      {!expanded && overflows ? (
        <Pressable onPress={() => setExpandedId(postId)} hitSlop={8} accessibilityRole="button" className="self-start">
          <Text className="text-sm font-bold text-text-dim">Read more</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
