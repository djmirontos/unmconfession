import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { ErrorState } from '@/components/feed/ListStates';
import { SettingsGroup } from '@/components/profile/SettingsRow';
import { SwitchRow } from '@/components/profile/SwitchRow';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePushPermission } from '@/hooks/usePushPermission';
import { type PushSettingKey, usePushSettings, useSetPushSetting } from '@/hooks/usePushSettings';
import { useTheme } from '@/hooks/useTheme';
import { getPushErrorMessage } from '@/lib/errors';
import { askForPush } from '@/lib/pushAsk';
import { permissionBanner } from '@/lib/pushPermission';
import { pushHasRuntimePrompt } from '@/lib/pushRegistration';

const TYPES: readonly { setting: Exclude<PushSettingKey, 'enabled'>; label: string; help: string }[] = [
  { setting: 'comments', label: 'Comments', help: 'Comments on your posts and listings.' },
  { setting: 'replies', label: 'Replies', help: 'Replies to your comments.' },
  { setting: 'deals', label: 'Deals', help: 'Item returns and sales.' },
  { setting: 'moderation', label: 'Moderation', help: 'Decisions about your content.' },
  { setting: 'reactions', label: 'Reactions', help: 'Reactions on your posts and comments. Off by default.' },
];

/** The phone's permission: a notice with the one action that can change it. */
function PermissionBanner({ kind, onEnable }: { kind: 'blocked' | 'not-asked'; onEnable: () => void }) {
  const { colors } = useTheme();
  const blocked = kind === 'blocked';
  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      <View className="flex-row items-start gap-3">
        <Ionicons name={blocked ? 'notifications-off-outline' : 'notifications-outline'} size={20} color={colors.textDim} />
        <Text className="flex-1 text-sm text-text">
          {blocked
            ? 'Notifications are turned off for this app on your phone. Turn them on in your phone settings to get push notifications.'
            : 'Push notifications are not turned on yet on this phone.'}
        </Text>
      </View>
      {blocked ? (
        <Button label="Open phone settings" variant="secondary" icon="settings-outline" onPress={() => void Linking.openSettings()} />
      ) : (
        <Button label="Enable" variant="secondary" icon="notifications-outline" onPress={onEnable} />
      )}
    </View>
  );
}

/** Settings → Push notifications: the master switch and one switch per kind of notification. */
export function PushSettingsSection() {
  const settings = usePushSettings();
  const setSetting = useSetPushSetting();
  const { permission, refresh } = usePushPermission();
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const banner = permission ? permissionBanner(pushHasRuntimePrompt(), permission) : 'none';

  const change = (setting: PushSettingKey, on: boolean) => {
    setError(null);
    setSetting.mutate(
      { setting, on },
      { onError: (e) => setError({ message: getPushErrorMessage(e), retry: () => change(setting, on) }) },
    );
  };

  const enable = () => {
    void askForPush('settings').then((decision) => {
      if (decision === 'blocked') void Linking.openSettings();
      void refresh();
    });
  };

  let body;
  if (!settings.data) {
    body = settings.isError ? (
      <ErrorState message={getPushErrorMessage(settings.error)} onRetry={() => void settings.refetch()} />
    ) : (
      <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Skeleton height={64} className="rounded-2xl" />
        <Skeleton height={200} className="rounded-2xl" />
      </View>
    );
  } else {
    const data = settings.data;
    body = (
      <>
        <SettingsGroup title="Push notifications">
          <SwitchRow
            label="Push notifications"
            help="Alerts on this phone, even when the app is closed."
            value={data.enabled}
            disabled={false}
            first
            onChange={(on) => change('enabled', on)}
          />
          {TYPES.map((row) => (
            <SwitchRow
              key={row.setting}
              label={row.label}
              help={row.help}
              value={data[row.setting]}
              disabled={!data.enabled}
              dimmed={!data.enabled}
              first={false}
              onChange={(on) => change(row.setting, on)}
            />
          ))}
        </SettingsGroup>
        {error ? (
          <View className="gap-2">
            <FormMessage tone="error" message={error.message} />
            <Button label="Try again" variant="ghost" icon="refresh" onPress={error.retry} />
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View className="gap-3">
      {banner !== 'none' ? <PermissionBanner kind={banner} onEnable={enable} /> : null}
      {body}
    </View>
  );
}
