import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { PhotoItem, PhotoStatus } from '@/hooks/usePhotoAttachments';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { useTheme } from '@/hooks/useTheme';
import { LIMITS } from '@/lib/createSchemas';

const THUMB = 88;

const STATUS_LABEL: Record<PhotoStatus, string | null> = {
  processing: 'Preparing…',
  ready: null,
  uploading: 'Uploading…',
  uploaded: null,
  failed: 'Failed',
};

function AddButton({ icon, label, onPress, disabled }: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ width: THUMB, height: THUMB }}
      className={`items-center justify-center gap-1 rounded-xl border border-dashed border-hairline bg-surface2 ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
    >
      <Ionicons name={icon} size={22} color={colors.textDim} />
      <Text className="text-xs font-bold text-text-dim">{label}</Text>
    </Pressable>
  );
}

function Thumb({ item, index, onRemove, locked }: { item: PhotoItem; index: number; onRemove: () => void; locked: boolean }) {
  const label = STATUS_LABEL[item.status];
  return (
    <View style={{ width: THUMB, height: THUMB }} className="overflow-hidden rounded-xl bg-surface2">
      <Image
        source={{ uri: item.previewUri ?? item.sourceUri }}
        style={{ width: THUMB, height: THUMB }}
        contentFit="cover"
        accessibilityLabel={`Photo ${index + 1}${label ? `, ${label}` : ''}`}
      />
      {label ? (
        <View className={`absolute inset-0 items-center justify-center ${item.status === 'failed' ? 'bg-danger/70' : 'bg-black/50'}`}>
          <Text className="text-xs font-bold text-white">{label}</Text>
        </View>
      ) : null}
      {item.status === 'uploaded' ? (
        <View className="absolute bottom-1 left-1 rounded-full bg-black/60 p-0.5">
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
        </View>
      ) : null}
      {locked ? null : (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove photo ${index + 1}`}
          className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60"
        >
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

type Props = {
  items: readonly PhotoItem[];
  remaining: number;
  onAdd: (uris: string[]) => void;
  onRemove: (key: string) => void;
  /** True while submitting: no adding or removing. */
  locked: boolean;
};

/** Up to 3 photos: thumbnails with status and remove, plus gallery and camera buttons. */
export function PhotoAttachments({ items, remaining, onAdd, onRemove, locked }: Props) {
  const picker = usePhotoPicker(onAdd);
  const full = remaining <= 0;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Photos (optional)</Text>
        <Text className="text-xs text-text-dim">
          {items.length}/{LIMITS.photos}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {items.map((item, index) => (
          <Thumb key={item.key} item={item} index={index} onRemove={() => onRemove(item.key)} locked={locked} />
        ))}
        {full ? null : (
          <>
            <AddButton icon="images-outline" label="Gallery" onPress={() => void picker.fromLibrary(remaining)} disabled={locked} />
            <AddButton icon="camera-outline" label="Camera" onPress={() => void picker.fromCamera()} disabled={locked} />
          </>
        )}
      </View>
      <Text className="text-xs text-text-dim">Photos are resized and location data is removed before upload.</Text>
    </View>
  );
}
