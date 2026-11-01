import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { ModContentCard, ModDetailSkeleton, SectionTitle } from '@/components/moderation/ModContentCard';
import { ReasonChip } from '@/components/moderation/ReportQueueCard';
import { Button } from '@/components/ui/Button';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useDismissReports } from '@/hooks/useDismissReports';
import { useReportDetail } from '@/hooks/useReportDetail';
import { useStaffGuard } from '@/hooks/useStaffGuard';
import { useStaffRemove } from '@/hooks/useStaffRemove';
import { useTheme } from '@/hooks/useTheme';
import { atNickname } from '@/lib/blocks';
import { getModerationActionError, getModerationErrorMessage } from '@/lib/errors';
import { allowedActions, parseModTarget, type ReportEntry, targetTypeLabel } from '@/lib/moderation';
import { refreshModeration } from '@/lib/moderationCache';
import { formatRelative } from '@/lib/time';
import { useToastStore } from '@/stores/toastStore';

function ReportRow({ report }: { report: ReportEntry }) {
  const handled = report.status !== 'open';
  return (
    <View className={`gap-1.5 rounded-2xl border border-hairline bg-surface1 p-4 ${handled ? 'opacity-60' : ''}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        <ReasonChip label={report.reason} />
        <Text className="text-xs text-text-dim">
          {atNickname(report.reporter)} · {formatRelative(report.createdAt)}
          {handled ? ` · ${report.status === 'dismissed' ? 'Dismissed' : 'Handled'}` : ''}
        </Text>
      </View>
      {report.note ? (
        <Text selectable className="text-sm text-text">
          {report.note}
        </Text>
      ) : null}
    </View>
  );
}

/** Staff: one reported item in full, every report on it, and Remove / Dismiss. */
export default function ReportDetailScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const isStaff = useStaffGuard();
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const target = useMemo(() => parseModTarget(params.type, params.id), [params.type, params.id]);
  const detail = useReportDetail(target);
  const dismiss = useDismissReports();
  const [pulling, setPulling] = useState(false);

  const backToList = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/moderation/reports');
  }, [router]);

  // Remove (shared with the "⋯" menu) refreshes the caches itself; then leave.
  const staffRemove = useStaffRemove(backToList);
  const busy = staffRemove.busy || dismiss.isPending;

  // Dismissed, or another moderator got there first: say so, refresh the queue, counts and totals, and leave.
  const finish = useCallback(
    (message: string) => {
      showToast(message);
      void refreshModeration(queryClient);
      backToList();
    },
    [showToast, queryClient, backToList],
  );

  const confirmDismiss = () => {
    if (!target || busy) return;
    Alert.alert('Dismiss these reports?', 'The item stays up. Every open report on it is closed as dismissed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        onPress: () =>
          dismiss.mutate(target, {
            onSuccess: () => finish('Reports dismissed'),
            onError: (error) => {
              const outcome = getModerationActionError(error);
              if (outcome.kind === 'already_handled') finish(outcome.message);
              else Alert.alert('Could not dismiss the reports', outcome.message);
            },
          }),
      },
    ]);
  };

  const onRefresh = useCallback(() => {
    setPulling(true);
    void detail.refetch().finally(() => setPulling(false));
  }, [detail]);

  if (!isStaff) return <View className="flex-1 bg-bg" />;

  const title = target ? `${targetTypeLabel(target.type)} report` : 'Report';

  if (!target) {
    return (
      <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
        <BackHeader title={title} />
        <EmptyState icon="alert-circle-outline" title="This report link isn't valid" />
      </View>
    );
  }

  const data = detail.data;
  let body;
  if (!data) {
    body = detail.isError ? (
      <View className="p-4">
        <ErrorState message={getModerationErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
      </View>
    ) : (
      <ModDetailSkeleton label="Loading report" />
    );
  } else {
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
        {data.content ? (
          <ModContentCard content={data.content} />
        ) : (
          <EmptyState icon="trash-outline" title="This item no longer exists" message="It may have been deleted by its author." />
        )}
        <View className="gap-2 pt-3">
          <SectionTitle>{`Reports (${data.openCount} open)`}</SectionTitle>
          {data.reports.length === 0 ? (
            <Text className="px-1 text-sm text-text-dim">No reports on this item.</Text>
          ) : (
            data.reports.map((r) => <ReportRow key={r.id} report={r} />)
          )}
        </View>
      </ScrollView>
    );
  }

  const actions = data ? allowedActions(target.type, data.content?.status ?? null, data.openCount) : [];
  const canRemove = actions.includes('remove');
  const canDismiss = actions.includes('dismiss');

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title={title} />
      <View className="flex-1">{body}</View>
      {data ? (
        <View className="gap-2 border-t border-hairline bg-surface1 px-4 pt-3" style={{ paddingBottom: bottomInset + 12 }}>
          {target.type === 'profile' ? (
            <Text className="text-sm text-text-dim">Other profile actions are available in the web admin panel.</Text>
          ) : null}
          {!canRemove && !canDismiss ? (
            <Text className="text-sm text-text-dim">There is nothing left to handle here.</Text>
          ) : (
            <View className="flex-row gap-3">
              {canDismiss ? (
                <View className="flex-1">
                  <Button label="Dismiss reports" variant="secondary" icon="checkmark-done-outline" loading={dismiss.isPending} disabled={busy} onPress={confirmDismiss} />
                </View>
              ) : null}
              {canRemove ? (
                <View className="flex-1">
                  <Button
                    label="Remove"
                    variant="danger"
                    icon="trash-outline"
                    disabled={busy}
                    onPress={() => staffRemove.start(target)}
                  />
                </View>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
      {staffRemove.sheet}
    </View>
  );
}
