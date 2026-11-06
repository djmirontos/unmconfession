import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, RefreshErrorBanner } from '@/components/feed/ListStates';
import { BackHeader } from '@/components/layout/BackHeader';
import { SettingsGroup } from '@/components/profile/SettingsRow';
import { SwitchRow } from '@/components/profile/SwitchRow';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChatScreenGuard } from '@/hooks/useChatScreenGuard';
import { useChatSettings, useSetChatSettings } from '@/hooks/useChats';
import type { WhoCanMessage } from '@/lib/chatApi';
import { getChatError } from '@/lib/errors';
import { useToastStore } from '@/stores/toastStore';

const WHO: readonly { key: WhoCanMessage; label: string }[] = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'nobody', label: 'Nobody' },
];

/** Profile → Chat privacy: who can send me a chat request, and whether my online status shows. */
export default function ChatPrivacyScreen() {
  const insets = useSafeAreaInsets();
  const ready = useChatScreenGuard();
  const settings = useChatSettings();
  const save = useSetChatSettings();
  const showToast = useToastStore((s) => s.show);
  const change = (next: { who?: WhoCanMessage; showOnline?: boolean }) =>
    void save(next).catch((error: unknown) => showToast(getChatError(error, 'chat').message));

  const data = settings.data;
  const offline = settings.isRefetchError;

  let body;
  if (!ready || !data) {
    body =
      ready && settings.isError ? (
        <ErrorState message={getChatError(settings.error, 'chat').message} onRetry={() => void settings.refetch()} />
      ) : (
        <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
          <Skeleton height={96} className="rounded-2xl" />
          <Skeleton height={64} className="rounded-2xl" />
        </View>
      );
  } else {
    body = (
      <>
        {offline ? <RefreshErrorBanner onRetry={() => void settings.refetch()} /> : null}
        <SettingsGroup title="Who can message me">
          <View className="gap-2 p-4">
            <SegmentedControl
              options={WHO}
              value={data.whoCanMessage}
              onChange={(who) => {
                if (!offline && who !== data.whoCanMessage) change({ who });
              }}
              accessibilityLabel="Who can message me"
            />
            <Text className="text-sm text-text-dim">
              {data.whoCanMessage === 'everyone'
                ? 'Any member can send you a chat request. Chats you already have stay open.'
                : 'Nobody can send you new chat requests. Chats you already have stay open.'}
            </Text>
          </View>
        </SettingsGroup>
        <SettingsGroup>
          <SwitchRow
            first
            label="Show my online status"
            help="People you chat with see when you're online. No last-seen time is ever shown."
            value={data.showOnline}
            disabled={offline}
            onChange={(showOnline) => change({ showOnline })}
          />
        </SettingsGroup>
      </>
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <BackHeader title="Chat privacy" />
      <ScrollView contentContainerClassName="gap-4 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {body}
      </ScrollView>
    </View>
  );
}
