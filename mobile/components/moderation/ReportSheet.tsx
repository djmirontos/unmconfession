import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/hooks/useTheme';
import { getReportErrorMessage } from '@/lib/errors';
import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason, type ReportTarget, reportContent } from '@/lib/reports';
import { useToastStore } from '@/stores/toastStore';

// Android: how far below the note box the keyboard must clear. Gap (12) + Submit (48) + 20 breathing
// room, plus the error banner (12 gap + ~44) when shown. See TextField's keyboardGap.
const SUBMIT_REACH = Platform.OS === 'android' ? 80 : 0;
const ERROR_REACH = Platform.OS === 'android' ? 56 : 0;

type Props = {
  /** The item being reported; null = closed. */
  target: { type: ReportTarget; id: string } | null;
  onClose: () => void;
};

/** Bottom sheet: pick a reason, add an optional note, submit through report_content. */
export function ReportSheet({ target, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const showToast = useToastStore((s) => s.show);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // The note and Submit are at the end of the sheet: on focus, bring them into view.
  const revealSubmit = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: !reduceMotion }), 120);

  // Every way out clears the form, so each opening starts empty.
  const finish = () => {
    setReason(null);
    setNote('');
    setError(null);
    onClose();
  };

  const close = () => {
    if (!busy) finish();
  };

  const submit = async () => {
    if (!target || !reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reportContent(target.type, target.id, reason, note);
      finish();
      showToast('Thanks — our moderators will review this');
    } catch (e) {
      setError(getReportErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={target !== null}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable className="absolute inset-0 bg-black/50" onPress={close} accessibilityRole="button" accessibilityLabel="Close report" />
        <View
          className="max-h-[90%] rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
          accessibilityViewIsModal
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-hairline" />
          <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 pb-1">
            <Text accessibilityRole="header" className="px-2 text-lg font-bold text-text">
              Report this {target?.type ?? 'post'}
            </Text>
            <View accessibilityRole="radiogroup" className="gap-1">
              {REPORT_REASONS.map((r) => {
                const selected = r.value === reason;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setReason(r.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={r.label}
                    className={`h-12 flex-row items-center gap-3 rounded-xl border px-3 active:bg-surface2 ${selected ? 'border-accent bg-accent-dim' : 'border-transparent'}`}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? colors.accent : colors.textDim}
                    />
                    <Text className={`text-base text-text ${selected ? 'font-bold' : ''}`}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label="Note (optional)"
              placeholder="Anything the moderators should know"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={REPORT_NOTE_MAX}
              counter={{ length: note.length, max: REPORT_NOTE_MAX }}
              keyboardGap={SUBMIT_REACH + (error ? ERROR_REACH : 0)}
              onFocus={revealSubmit}
            />
            <FormMessage tone="error" message={error} />
            <Button
              label="Submit report"
              icon="flag-outline"
              onPress={() => void submit()}
              loading={busy}
              disabled={!reason}
              accessibilityHint={reason ? undefined : 'Choose a reason first'}
            />
            <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
