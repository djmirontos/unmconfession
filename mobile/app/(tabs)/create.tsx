import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LostFoundForm } from '@/components/create/LostFoundForm';
import { PollForm } from '@/components/create/PollForm';
import { PostTextForm } from '@/components/create/PostTextForm';
import { SellForm } from '@/components/create/SellForm';
import { TabHeader } from '@/components/layout/TabHeader';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccountLoadError } from '@/components/auth/AccountLoadError';
import { useMembership } from '@/hooks/useProfile';
import { useRequireAuth } from '@/hooks/useRequireAuth';

type FormKind = 'confession' | 'shoutout' | 'poll' | 'sell' | 'lost_found';

const KINDS: readonly { value: FormKind; label: string }[] = [
  { value: 'confession', label: 'Confession' },
  { value: 'shoutout', label: 'Shoutout' },
  { value: 'poll', label: 'Poll' },
  { value: 'sell', label: 'Sell' },
  { value: 'lost_found', label: 'Lost & Found' },
];

/** All five forms stay mounted (hidden when inactive), so switching keeps text and photos. */
function Forms({ userId, active }: { userId: string; active: FormKind }) {
  const show = (kind: FormKind) => ({ display: active === kind ? ('flex' as const) : ('none' as const) });
  return (
    <>
      <View style={show('confession')}>
        <PostTextForm userId={userId} kind="confession" />
      </View>
      <View style={show('shoutout')}>
        <PostTextForm userId={userId} kind="shoutout" />
      </View>
      <View style={show('poll')}>
        <PollForm userId={userId} />
      </View>
      <View style={show('sell')}>
        <SellForm userId={userId} />
      </View>
      <View style={show('lost_found')}>
        <LostFoundForm userId={userId} />
      </View>
    </>
  );
}

function GuestPrompt() {
  const requireAuth = useRequireAuth();
  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      <Text className="text-base text-text">Sign in to post confessions, shoutouts, polls and listings.</Text>
      <Button label="Sign in to post" onPress={() => requireAuth('post')} />
    </View>
  );
}

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { status, session, retry } = useMembership();
  const [kind, setKind] = useState<FormKind>('confession');
  const userId = session?.user.id ?? null;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <TabHeader title="Create" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-5 p-4 pb-12">
          {status === 'member' && userId ? (
            <>
              <ChipGroup options={KINDS} value={kind} onChange={setKind} accessibilityLabel="What to post" scroll />
              <Forms userId={userId} active={kind} />
            </>
          ) : status === 'guest' ? (
            <GuestPrompt />
          ) : status === 'error' ? (
            <AccountLoadError onRetry={retry} />
          ) : (
            <View className="gap-3">
              <Skeleton height={36} className="rounded-full" />
              <Skeleton height={160} className="rounded-xl" />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
