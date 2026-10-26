import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useTheme } from '@/hooks/useTheme';
import { addDays, formatShortDate, localDateToYmd, lostFoundDateRange, ymdToLocalNoon } from '@/lib/manilaDate';

// Sentinel chip value; never sent to the server.
const PICK = 'pick';
const QUICK_DAYS = 4;

type Props = { value: string; onChange: (date: string) => void; disabled?: boolean };

/** Today, Yesterday and the two days before (Manila time), plus "Pick another date" for older ones. */
export function RecentDateChips({ value, onChange, disabled }: Props) {
  const { scheme } = useTheme();
  const bottomInset = useBottomInset();
  const [iosDraft, setIosDraft] = useState<Date | null>(null);

  // Recomputed each render so the chips roll over at Manila midnight.
  const { min, max } = lostFoundDateRange();
  const quick = Array.from({ length: QUICK_DAYS }, (_, i) => {
    const ymd = addDays(max, -i);
    return { value: ymd, label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : formatShortDate(ymd) };
  });
  const custom = value !== '' && !quick.some((q) => q.value === value);
  const options = [...quick, { value: PICK, label: custom ? formatShortDate(value) : 'Pick another date' }];

  const minDate = ymdToLocalNoon(min);
  const maxDate = ymdToLocalNoon(max);
  const initial = ymdToLocalNoon(value || max);

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate: minDate,
        maximumDate: maxDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onChange(localDateToYmd(date));
        },
      });
    } else {
      setIosDraft(initial);
    }
  };

  return (
    <>
      <ChipGroup
        options={options}
        value={custom ? PICK : value || null}
        onChange={(v) => (v === PICK ? openPicker() : onChange(v))}
        accessibilityLabel="Date"
        scroll
        disabled={disabled}
      />
      {Platform.OS === 'ios' ? (
        <Modal visible={iosDraft !== null} transparent animationType="slide" onRequestClose={() => setIosDraft(null)}>
          <View className="flex-1 justify-end">
            <Pressable
              className="absolute inset-0 bg-black/50"
              onPress={() => setIosDraft(null)}
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
            />
            <View className="gap-3 rounded-t-3xl bg-surface1 px-4 pt-3" style={{ paddingBottom: bottomInset + 16 }}>
              <DateTimePicker
                value={iosDraft ?? initial}
                mode="date"
                display="inline"
                minimumDate={minDate}
                maximumDate={maxDate}
                themeVariant={scheme}
                onChange={(_event: DateTimePickerEvent, date?: Date) => {
                  if (date) setIosDraft(date);
                }}
              />
              <Button
                label="Done"
                onPress={() => {
                  if (iosDraft) onChange(localDateToYmd(iosDraft));
                  setIosDraft(null);
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
