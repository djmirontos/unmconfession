import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { SubmitFooter } from '@/components/create/SubmitFooter';
import { PostImages } from '@/components/feed/PostImages';
import { useTheme } from '@/hooks/useTheme';
import type { MyItem } from '@/lib/myPosts';
import { editTimeLeftMs, formatTimeLeft } from '@/lib/ownItems';

function Note({ icon, children }: { icon: 'time-outline' | 'shield-checkmark-outline'; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-3 rounded-xl border border-hairline bg-surface2 p-3">
      <Ionicons name={icon} size={20} color={colors.textDim} />
      <Text className="flex-1 text-sm text-text">{children}</Text>
    </View>
  );
}

/** Ticks every 30 s so the remaining edit time stays current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

type Props = {
  item: MyItem;
  /** The editable fields of the form. */
  children: ReactNode;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  missing: readonly string[];
  onSave: () => void;
};

/** Shared edit layout: fields, read-only photos, the 24-hour and review notes, Save with "Still needed". */
export function EditShell({ item, children, canSave, saving, error, missing, onSave }: Props) {
  const now = useNow();
  const left = editTimeLeftMs(item.createdAt, now);

  return (
    <View className="gap-5">
      {children}
      {item.images.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Photos</Text>
          <PostImages images={item.images} />
          <Text className="text-sm text-text-dim">Photos can&apos;t be changed after posting.</Text>
        </View>
      ) : null}
      <Note icon="shield-checkmark-outline">
        If your edit matches our review filters, it will be sent for review before it shows again.
      </Note>
      <Note icon="time-outline">
        You can edit for 24 hours after posting. {left > 0 ? formatTimeLeft(left) : 'The edit window has closed.'}
      </Note>
      <SubmitFooter label="Save" onPress={onSave} submitting={saving} disabled={!canSave} error={error} missing={missing} />
    </View>
  );
}
