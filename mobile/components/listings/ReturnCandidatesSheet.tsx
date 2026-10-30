import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { Avatar } from '@/components/profile/Avatar';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useReturnCandidates } from '@/hooks/useListingReturn';
import { getReturnErrorMessage } from '@/lib/errors';
import { type LostFoundType, PICKER_EMPTY, PICKER_NOTE, pickerTitle, type ReturnCandidate } from '@/lib/itemReturns';

const AVATAR = 40;

function RowSkeleton() {
  return (
    <View className="min-h-14 flex-row items-center gap-3 px-2 py-2">
      <Skeleton width={AVATAR} height={AVATAR} className="rounded-full" />
      <Skeleton width="45%" height={14} />
    </View>
  );
}

type Props = {
  listingId: string;
  type: LostFoundType;
  open: boolean;
  /** A start request is running: rows are locked. */
  busy: boolean;
  /** The last start_item_return error, shown above Cancel. */
  error: string | null;
  onPick: (candidate: ReturnCandidate) => void;
  onClose: () => void;
};

/** Bottom sheet: the members who commented on the post and can be picked for the return. */
export function ReturnCandidatesSheet({ listingId, type, open, busy, error, onPick, onClose }: Props) {
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const candidates = useReturnCandidates(listingId, open);

  let body;
  if (!candidates.data) {
    body = candidates.isError ? (
      <ErrorState message={getReturnErrorMessage(candidates.error)} onRetry={() => void candidates.refetch()} />
    ) : (
      <View accessibilityLabel="Loading" accessibilityRole="progressbar">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </View>
    );
  } else if (candidates.data.length === 0) {
    body = <EmptyState icon="chatbubbles-outline" title={PICKER_EMPTY} message={PICKER_NOTE} />;
  } else {
    body = (
      <ScrollView contentContainerClassName="gap-1 pb-1">
        {candidates.data.map((c) => (
          <Pressable
            key={c.userId}
            onPress={() => onPick(c)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Choose ${c.nickname}`}
            accessibilityState={{ disabled: busy }}
            className={`min-h-14 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-surface2 ${busy ? 'opacity-60' : ''}`}
          >
            <Avatar avatarKey={c.avatarKey} userId={c.userId} nickname={c.nickname} size={AVATAR} />
            <Text numberOfLines={1} className="flex-1 text-base font-bold text-text">
              {c.nickname}
            </Text>
          </Pressable>
        ))}
        <Text className="px-2 pt-2 text-xs text-text-dim">{PICKER_NOTE}</Text>
      </ScrollView>
    );
  }

  return (
    <Modal visible={open} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          className="max-h-[75%] gap-3 rounded-t-3xl border-t border-hairline bg-surface1 px-4 pt-3"
          style={{ paddingBottom: bottomInset + 12 }}
          accessibilityViewIsModal
        >
          <View className="h-1 w-10 self-center rounded-full bg-hairline" />
          <Text accessibilityRole="header" className="px-2 text-lg font-bold text-text">
            {pickerTitle(type)}
          </Text>
          <View className="shrink">{body}</View>
          <FormMessage tone="error" message={error} />
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}
