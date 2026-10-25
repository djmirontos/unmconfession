import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/profile/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { AVATAR_CATEGORIES, type AvatarCategory, type AvatarDef, avatarsIn, getAvatar } from '@/lib/avatars';

const PER_ROW = 5;
const CELL = 56;
// The biggest category has 12, so 3 rows: the sheet keeps its height when switching.
const ROWS = 3;
const ROW_GAP = 8;

type Props = {
  visible: boolean;
  /** The member's current avatar key (ringed, and its category opens first). */
  value: string;
  onSelect: (key: string) => void;
  onClose: () => void;
};

function Cell({ avatar, selected, onPress }: { avatar: AvatarDef; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={avatar.label}
      accessibilityState={{ selected }}
      style={{ width: CELL, height: CELL }}
      className={`items-center justify-center rounded-full border-2 ${selected ? 'border-accent' : 'border-transparent'} active:opacity-70`}
    >
      <Avatar avatarKey={avatar.key} size={CELL - 8} />
    </Pressable>
  );
}

/** Bottom sheet: category chips and a 5-per-row grid of avatars. */
function AvatarPickerSheet({ value, onSelect, onClose }: Omit<Props, 'visible'>) {
  // Opens on the category of the current avatar.
  const [category, setCategory] = useState<AvatarCategory>(getAvatar(value).category);
  const items = avatarsIn(category);
  const rows = Array.from({ length: ROWS }, (_, r) => items.slice(r * PER_ROW, (r + 1) * PER_ROW));

  return (
    <View className="gap-4 pb-2">
      <Text accessibilityRole="header" className="px-2 text-base font-bold text-text">
        Choose an avatar
      </Text>
      <ChipGroup options={AVATAR_CATEGORIES} value={category} onChange={setCategory} accessibilityLabel="Avatar category" scroll />
      <View style={{ gap: ROW_GAP, height: ROWS * CELL + (ROWS - 1) * ROW_GAP }} accessibilityRole="radiogroup" accessibilityLabel="Avatars">
        {rows.map((row, r) => (
          <View key={r} className="flex-row justify-between">
            {Array.from({ length: PER_ROW }, (_, i) => {
              const avatar = row[i];
              return avatar ? (
                <Cell key={avatar.key} avatar={avatar} selected={avatar.key === value} onPress={() => onSelect(avatar.key)} />
              ) : (
                // Keeps the columns aligned in a short last row.
                <View key={`empty-${i}`} style={{ width: CELL, height: CELL }} />
              );
            })}
          </View>
        ))}
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" className="h-11 items-center justify-center rounded-xl active:bg-surface2">
        <Text className="text-base text-text-dim">Cancel</Text>
      </Pressable>
    </View>
  );
}

export function AvatarPicker({ visible, value, onSelect, onClose }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel="Close avatar picker">
      {/* Mounted only while open, so each opening starts on the current avatar's category. */}
      {visible ? <AvatarPickerSheet value={value} onSelect={onSelect} onClose={onClose} /> : null}
    </BottomSheet>
  );
}
