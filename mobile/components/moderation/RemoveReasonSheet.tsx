import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useTheme } from '@/hooks/useTheme';
import { REMOVAL_REASONS, type RemovalReason } from '@/lib/moderation';

type Props = {
  /** What is being removed ("post", "comment", "listing"); null = closed. */
  noun: string | null;
  busy: boolean;
  /** Inline message (reason required, moderators only, or a failure). */
  error: string | null;
  onClose: () => void;
  /** Called with the picked reason; the screen confirms, then removes (or rejects). */
  onContinue: (reason: RemovalReason) => void;
  /** Remove a published item (default) or reject a held one: same reasons, different words. */
  mode?: 'remove' | 'reject';
};

const COPY = {
  remove: {
    title: 'Remove this',
    help: 'The author is told the reason. Open reports on it are closed.',
    button: 'Remove…',
    pick: 'Pick a reason for removing this.',
    icon: 'trash-outline',
  },
  reject: {
    title: 'Reject this',
    help: 'It will not be published. The author is told the reason.',
    button: 'Reject…',
    pick: 'Pick a reason for rejecting this.',
    icon: 'close-circle-outline',
  },
} as const;

/** Bottom sheet: pick the reason (required) to remove or reject, the same list as the web panel. */
export function RemoveReasonSheet({ noun, busy, error, onClose, onContinue, mode = 'remove' }: Props) {
  const copy = COPY[mode];
  const { colors } = useTheme();
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const [reason, setReason] = useState<RemovalReason | null>(null);
  const [missing, setMissing] = useState(false);

  const close = () => {
    if (busy) return;
    setReason(null);
    setMissing(false);
    onClose();
  };

  const next = () => {
    if (busy) return;
    if (!reason) {
      setMissing(true);
      return;
    }
    onContinue(reason);
  };

  return (
    <Modal visible={noun !== null} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          className="max-h-[90%] rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
          accessibilityViewIsModal
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-hairline" />
          <ScrollView contentContainerClassName="gap-3 pb-1">
            <View className="gap-1 px-2">
              <Text accessibilityRole="header" className="text-lg font-bold text-text">
                {copy.title} {noun ?? 'item'}
              </Text>
              <Text className="text-sm text-text-dim">{copy.help}</Text>
            </View>
            <View accessibilityRole="radiogroup" className="gap-1">
              {REMOVAL_REASONS.map((r) => {
                const selected = r.value === reason;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => {
                      setReason(r.value);
                      setMissing(false);
                    }}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: busy }}
                    accessibilityLabel={r.label}
                    className={`min-h-12 flex-row items-center gap-3 rounded-xl border px-3 py-2 active:bg-surface2 ${selected ? 'border-accent bg-accent-dim' : 'border-transparent'}`}
                  >
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.accent : colors.textDim} />
                    <Text className={`shrink text-base text-text ${selected ? 'font-bold' : ''}`}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <FormMessage tone="error" message={missing ? copy.pick : error} />
            <Button label={copy.button} variant="danger" icon={copy.icon} loading={busy} disabled={busy} onPress={next} />
            <Button label="Cancel" variant="ghost" disabled={busy} onPress={close} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
