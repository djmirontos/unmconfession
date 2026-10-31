import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { SettingsGroup } from '@/components/profile/SettingsRow';
import { SwitchRow } from '@/components/profile/SwitchRow';
import { PushSettingsSection } from '@/components/push/PushSettingsSection';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMySettings, useSetNotificationPref } from '@/hooks/useMySettings';
import { getErrorMessage } from '@/lib/errors';
import type { MySettings, NotificationPref } from '@/lib/settings';
import { useToastStore } from '@/stores/toastStore';

const ROWS: readonly { pref: NotificationPref; label: string; help: string }[] = [
  { pref: 'notifyReactions', label: 'Reactions', help: 'Reactions on your posts and comments.' },
  { pref: 'notifyComments', label: 'Comments', help: 'Comments on your posts and listings.' },
  { pref: 'notifyReplies', label: 'Replies', help: 'Replies to your comments.' },
];

/** Profile → Notification preferences: three in-app switches. */
export default function NotificationPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const settings = useMySettings();
  const setPref = useSetNotificationPref();
  const showToast = useToastStore((s) => s.show);

  const change = (pref: NotificationPref, on: boolean) =>
    setPref.mutate({ pref, on }, { onError: (error) => showToast(getErrorMessage(error)) });

  const data: MySettings | undefined = settings.data;
  // A failed refresh (usually offline): keep the cached switches but lock them until it reconnects.
  const offline = settings.isRefetchError;

  let body;
  if (!data) {
    body = settings.isError ? (
      <ErrorState message={getErrorMessage(settings.error)} onRetry={() => void settings.refetch()} />
    ) : (
      <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Skeleton height={64} className="rounded-2xl" />
        <Skeleton height={64} className="rounded-2xl" />
        <Skeleton height={64} className="rounded-2xl" />
      </View>
    );
  } else {
    body = (
      <>
        {offline ? <RefreshErrorBanner onRetry={() => void settings.refetch()} /> : null}
        <SettingsGroup title="Notify me about">
          {ROWS.map((row, i) => (
            <SwitchRow
              key={row.pref}
              label={row.label}
              help={row.help}
              value={data[row.pref]}
              disabled={offline}
              first={i === 0}
              onChange={(on) => change(row.pref, on)}
            />
          ))}
        </SettingsGroup>
        {offline ? (
          <Text className="px-1 text-sm text-text-dim">You seem to be offline. The switches work again once you reconnect.</Text>
        ) : null}
        <Text className="px-1 text-sm text-text-dim">Moderation notices (approved, rejected, removed) are always shown.</Text>
      </>
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Notification preferences" />
      <ScrollView contentContainerClassName="gap-3 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {body}
        {/* Alerts on the phone itself (push), separate from the in-app list above. */}
        <View className="pt-4">
          <PushSettingsSection />
        </View>
      </ScrollView>
    </View>
  );
}
