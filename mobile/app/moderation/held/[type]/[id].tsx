import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { ModContentCard, ModDetailSkeleton } from '@/components/moderation/ModContentCard';
import { RemoveReasonSheet } from '@/components/moderation/RemoveReasonSheet';
import { ReasonChip } from '@/components/moderation/ReportQueueCard';
import { Button } from '@/components/ui/Button';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useHeldItem } from '@/hooks/useHeldItem';
import { useReviewHeld } from '@/hooks/useReviewHeld';
import { useStaffGuard } from '@/hooks/useStaffGuard';
import { useTheme } from '@/hooks/useTheme';
import { getModerationActionError, getModerationErrorMessage } from '@/lib/errors';
import {
  allowedReviewActions,
  type HeldTarget,
  holdLabel,
  parseHeldTarget,
  type RemovalReason,
  removalReasonText,
  type ReviewAction,
  targetTypeLabel,
} from '@/lib/moderation';
import { afterHeldReview } from '@/lib/moderationCache';
import { useToastStore } from '@/stores/toastStore';

const PICK_REJECT = 'Pick a reason for rejecting this.';

/** Staff: one held post, comment or listing in full, with Approve and Reject. */
export default function HeldDetailScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const isStaff = useStaffGuard();
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const target = useMemo(() => parseHeldTarget(params.type, params.id), [params.type, params.id]);
  const item = useHeldItem(target);
  const review = useReviewHeld();
  const [rejecting, setRejecting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const backToList = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/moderation/held');
  }, [router]);

  // Done, or another moderator got there first: say so, refresh the queue, counts and lists, and leave.
  const finish = useCallback(
    (done: HeldTarget, action: ReviewAction, message: string) => {
      setRejecting(false);
      showToast(message);
      afterHeldReview(queryClient, done, action);
      backToList();
    },
    [showToast, queryClient, backToList],
  );

  const run = (current: HeldTarget, action: ReviewAction, reason: RemovalReason | null) => {
    setSheetError(null);
    review.mutate(
      { target: current, action, reason },
      {
        onSuccess: () => finish(current, action, action === 'approve' ? 'Approved' : 'Rejected'),
        onError: (error) => {
          const outcome = getModerationActionError(error);
          if (outcome.kind === 'already_handled') finish(current, action, outcome.message);
          else if (action === 'reject') setSheetError(outcome.kind === 'reason_required' ? PICK_REJECT : outcome.message);
          else Alert.alert('Could not approve this', outcome.message);
        },
      },
    );
  };

  const confirmApprove = () => {
    if (!target || review.isPending) return;
    const noun = targetTypeLabel(target.type).toLowerCase();
    Alert.alert(`Approve this ${noun}?`, 'It is published right away and the author is notified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => run(target, 'approve', null) },
    ]);
  };

  const confirmReject = (reason: RemovalReason) => {
    if (!target || review.isPending) return;
    const noun = targetTypeLabel(target.type).toLowerCase();
    Alert.alert(`Reject this ${noun}?`, `Reason: ${removalReasonText(reason) ?? ''}. It will not be published and the author is notified.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => run(target, 'reject', reason) },
    ]);
  };

  const onRefresh = useCallback(() => {
    setPulling(true);
    void item.refetch().finally(() => setPulling(false));
  }, [item]);

  if (!isStaff) return <View className="flex-1 bg-bg" />;

  if (!target) {
    return (
      <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
        <BackHeader title="Held item" />
        <EmptyState icon="alert-circle-outline" title="This link isn't valid" />
      </View>
    );
  }

  const title = `Held ${targetTypeLabel(target.type).toLowerCase()}`;
  const data = item.data;
  let body;
  if (data === undefined) {
    body = item.isError ? (
      <View className="p-4">
        <ErrorState message={getModerationErrorMessage(item.error)} onRetry={() => void item.refetch()} />
      </View>
    ) : (
      <ModDetailSkeleton label="Loading held item" />
    );
  } else {
    const hold = data ? holdLabel(data.hold) : null;
    body = (
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface1}
          />
        }
      >
        {data ? (
          <ModContentCard content={data.content}>
            {hold ? (
              <View className="flex-row" accessible accessibilityLabel={`Held because: ${hold}`}>
                <ReasonChip label={hold} />
              </View>
            ) : null}
          </ModContentCard>
        ) : (
          <EmptyState icon="trash-outline" title="This item no longer exists" message="It may have been deleted by its author." />
        )}
      </ScrollView>
    );
  }

  const actions = data ? allowedReviewActions(data.content.status) : [];

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title={title} />
      <View className="flex-1">{body}</View>
      {data !== undefined ? (
        <View className="gap-2 border-t border-hairline bg-surface1 px-4 pt-3" style={{ paddingBottom: bottomInset + 12 }}>
          {actions.length === 0 ? (
            <Text className="text-sm text-text-dim">There is nothing left to handle here.</Text>
          ) : (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button
                  label="Approve"
                  variant="primary"
                  icon="checkmark-circle-outline"
                  loading={review.isPending && review.variables?.action === 'approve'}
                  disabled={review.isPending}
                  onPress={confirmApprove}
                />
              </View>
              <View className="flex-1">
                <Button
                  label="Reject"
                  variant="danger"
                  icon="close-circle-outline"
                  disabled={review.isPending}
                  onPress={() => {
                    setSheetError(null);
                    setRejecting(true);
                  }}
                />
              </View>
            </View>
          )}
        </View>
      ) : null}
      <RemoveReasonSheet
        key={rejecting ? 'open' : 'closed'}
        mode="reject"
        noun={rejecting ? targetTypeLabel(target.type).toLowerCase() : null}
        busy={review.isPending}
        error={sheetError}
        onClose={() => setRejecting(false)}
        onContinue={confirmReject}
      />
    </View>
  );
}
