import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SheetAction } from '@/components/ui/ActionSheet';
import { useTheme } from '@/hooks/useTheme';
import { REACTION_GLYPH, REACTION_KEYS, REACTION_LABEL, type ReactionKey } from '@/lib/chatReactions';

// The bar (six 44 px buttons) and up to three action rows; used to keep the card on screen.
const BAR_H = 56;
const ROW_H = 48;
const GAP = 8;

type Props = {
  /** Where the finger was (pageY), or null to centre it (a screen reader's "More options"). */
  anchorY: number | null;
  /** My current reaction on this message (highlighted); null for none. Omitted: no bar. */
  mine?: ReactionKey | null;
  showReactions: boolean;
  actions: readonly SheetAction[];
  onReact: (key: ReactionKey) => void;
  onClose: () => void;
};

/**
 * Long press on a message: a compact bar of the six reactions above the existing actions (Reply,
 * Copy, Delete). Rendered only while open (the screen mounts it with a target), so closed rows
 * cost nothing. The modal fades in; nothing on the rows animates.
 */
export function MessageActionsOverlay({ anchorY, mine = null, showReactions, actions, onReact, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const cardH = (showReactions ? BAR_H + GAP : 0) + actions.length * ROW_H + 16;
  const minTop = insets.top + GAP;
  const maxTop = Math.max(minTop, height - insets.bottom - cardH - GAP);
  const top = anchorY === null ? Math.max(minTop, (height - cardH) / 2) : Math.min(maxTop, Math.max(minTop, anchorY - BAR_H - GAP));

  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={{ top }} className="absolute left-4 right-4 gap-2" accessibilityViewIsModal>
        {showReactions ? (
          <View className="flex-row justify-between self-center rounded-full border border-hairline bg-surface1 p-1" accessibilityRole="toolbar" accessibilityLabel="Reactions">
            {REACTION_KEYS.map((key) => {
              const selected = mine === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    onClose();
                    onReact(key);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={selected ? `${REACTION_LABEL[key]}, your reaction. Tap to remove` : `React with ${REACTION_LABEL[key]}`}
                  accessibilityState={{ selected }}
                  className={`h-11 w-11 items-center justify-center rounded-full ${selected ? 'border border-chat-accent bg-chat-accent-dim' : 'active:bg-surface2'}`}
                >
                  <Text allowFontScaling={false} style={{ fontSize: 24, lineHeight: 30 }}>
                    {REACTION_GLYPH[key]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {actions.length > 0 ? (
          <View className="overflow-hidden rounded-2xl border border-hairline bg-surface1">
            {actions.map((action, i) => (
              <Pressable
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel ?? action.label}
                className={`min-h-12 flex-row items-center gap-3 px-4 py-2 active:bg-surface2 ${i > 0 ? 'border-t border-hairline' : ''}`}
              >
                <Ionicons name={action.icon} size={20} color={action.destructive ? colors.danger : colors.text} />
                <Text className={`text-base font-semibold ${action.destructive ? 'text-danger' : 'text-text'}`}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
