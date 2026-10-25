import { ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { SettingsGroup } from '@/components/profile/SettingsRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMySettings, useSetNotificationPref } from '@/hooks/useMySettings';
import { useTheme } from '@/hooks/useTheme';
import { getErrorMessage } from '@/lib/errors';
import type { MySettings, NotificationPref } from '@/lib/settings';
import { useToastStore } from '@/stores/toastStore';

const ROWS: readonly { pref: NotificationPref; label: string; help: string }[] = [
  { pref: 'notifyReactions', label: 'Reactions', help: 'Reactions on your posts and comments.' },
  { pref: 'notifyComments', label: 'Comments', help: 'Comments on your posts and listings.' },
  { pref: 'notifyReplies', label: 'Replies', help: 'Replies to your comments.' },
];

function PrefRow({
  label,
  help,
  value,
  disabled,
  first,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  disabled: boolean;
  first: boolean;
  onChange: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className={`min-h-16 flex-row items-center gap-3 px-4 py-3 ${first ? '' : 'border-t border-hairline'}`}>
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-bold text-text">{label}</Text>
        <Text className="text-sm text-text-dim">{help}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={help}
        trackColor={{ false: colors.hairline, true: colors.accent }}
        thumbColor={colors.surface1}
        ios_backgroundColor={colors.hairline}
      />
    </View>
  );
}

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
            <PrefRow
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
      </ScrollView>
    </View>
  );
}
