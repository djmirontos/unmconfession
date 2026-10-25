import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** A titled card of rows (Account, About, …). Rows are separated by hairlines. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      {title ? (
        <Text accessibilityRole="header" className="px-1 text-xs font-bold uppercase tracking-widest text-text-dim">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-hairline bg-surface1">{children}</View>
    </View>
  );
}

type RowProps = {
  icon: IconName;
  label: string;
  /** Muted text on the right (e.g. the current nickname). */
  value?: string;
  /** Next to the chevron (e.g. the unread count). */
  accessory?: ReactNode;
  onPress: () => void;
  destructive?: boolean;
  /** No hairline above the first row of a group. */
  first?: boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
};

/** 56 px settings row: icon, label, optional value, chevron. */
export function SettingsRow({ icon, label, value, accessory, onPress, destructive, first, accessibilityLabel, disabled }: RowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityState={{ disabled: !!disabled }}
      className={`min-h-14 flex-row items-center gap-3 px-4 active:bg-surface2 ${first ? '' : 'border-t border-hairline'}`}
    >
      <Ionicons name={icon} size={22} color={destructive ? colors.danger : colors.text} />
      <Text className={`text-base font-bold ${destructive ? 'text-danger' : 'text-text'}`}>{label}</Text>
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">
        {value ? (
          <Text numberOfLines={1} ellipsizeMode="tail" className="shrink text-sm text-text-dim">
            {value}
          </Text>
        ) : null}
        {accessory}
      </View>
      {destructive ? null : <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
    </Pressable>
  );
}
