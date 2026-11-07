import { Ionicons } from '@expo/vector-icons';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import { fetchMyWarning } from '@/lib/notifications';
import { muteInForce, muteLine, noteSuspendedUntil, warningReasonLabel, warningTitle } from '@/lib/warnings';
import { useAuthStore } from '@/stores/authStore';
import { closeWarningSheet, useWarningSheetStore } from '@/stores/warningSheetStore';

/**
 * A notice from the moderators, opened from its notification row or a tapped push. Shows the kind,
 * the reason, the optional note and, for a mute, until when. Never who sent it (the server keeps no
 * sender on the notice). Mounted once at the root.
 */
export function WarningSheet() {
  const router = useRouter();
  const { colors } = useTheme();
  const notificationId = useWarningSheetStore((s) => s.notificationId);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const query = useQuery({
    queryKey: ['warning-notice', userId ?? '', notificationId ?? ''],
    queryFn: notificationId && userId ? () => fetchMyWarning(notificationId) : skipToken,
    staleTime: 60 * 1000,
  });
  // "Has it ended?" is decided at the time the notice was read from the server.
  const readAt = query.dataUpdatedAt;

  const notice = query.data;
  // A mute in force: the usual "suspended" message can say until when.
  useEffect(() => {
    if (notice?.kind === 'mute' && muteInForce(notice.untilAt, readAt)) noteSuspendedUntil(notice.untilAt);
  }, [notice, readAt]);

  const openRules = () => {
    closeWarningSheet();
    router.push('/legal/rules');
  };

  let body;
  if (notice === undefined) {
    body = query.isError ? (
      <View className="gap-3 py-2">
        <Text className="text-base text-text">{getErrorMessage(query.error)}</Text>
        <Button label="Retry" variant="secondary" icon="refresh" onPress={() => void query.refetch()} />
      </View>
    ) : (
      <View className="gap-3 py-2" accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Skeleton width="50%" height={18} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="65%" height={14} />
      </View>
    );
  } else if (notice === null) {
    body = <Text className="py-2 text-base text-text-dim">This notice is no longer available.</Text>;
  } else {
    body = (
      <View className="gap-3 py-2">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-surface2">
            <Ionicons name="shield-outline" size={22} color={colors.text} />
          </View>
          <Text accessibilityRole="header" className="flex-1 text-lg font-bold text-text">
            {warningTitle(notice.kind)}
          </Text>
        </View>
        <View className="gap-0.5">
          <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Reason</Text>
          <Text className="text-base text-text">{warningReasonLabel(notice.reason)}</Text>
        </View>
        {notice.note ? (
          <View className="gap-0.5">
            <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Note from the moderators</Text>
            <Text className="text-base text-text">{notice.note}</Text>
          </View>
        ) : null}
        {notice.kind === 'mute' ? <Text className="text-base font-semibold text-text">{muteLine(notice.untilAt, readAt)}</Text> : null}
        <Button label="Review the community rules" variant="secondary" icon="people-outline" onPress={openRules} />
      </View>
    );
  }

  return (
    <BottomSheet visible={notificationId !== null} onClose={closeWarningSheet} closeLabel="Close notice">
      <View className="px-2 pb-2">{body}</View>
      <Button label="Close" variant="ghost" onPress={closeWarningSheet} />
    </BottomSheet>
  );
}
