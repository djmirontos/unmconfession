import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { AccountLoadError } from '@/components/auth/AccountLoadError';
import { TabScreen } from '@/components/layout/TabScreen';
import { CountBadge } from '@/components/notifications/NotificationBell';
import { Avatar } from '@/components/profile/Avatar';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { SettingsGroup, SettingsRow } from '@/components/profile/SettingsRow';
import { ThemeSwitch } from '@/components/profile/ThemeSwitch';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAvatarPrompt } from '@/hooks/useAvatarPrompt';
import { useMySettings } from '@/hooks/useMySettings';
import { type Profile, useMembership } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar';
import { logOut } from '@/lib/auth';
import { appVersion, FEEDBACK_EMAIL, feedbackMailto } from '@/lib/config';
import { formatManilaDay } from '@/lib/manilaDate';
import { inNicknameCooldown } from '@/lib/settings';
import { useToastStore } from '@/stores/toastStore';

const AVATAR_SIZE = 80;
// Any avatar failure (offline, a deleted account, …) rolls back and shows the same short line.
const AVATAR_FAILED = 'Could not change your avatar. Please try again.';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      <Text accessibilityRole="header" className="text-xs font-bold uppercase tracking-widest text-text-dim">
        {title}
      </Text>
      {children}
    </View>
  );
}

function GuestProfile() {
  const router = useRouter();
  return (
    <Section title="Join UNM Freedom Confessions">
      <Text className="text-base text-text">
        You are browsing as a guest. Sign in to post, comment, react and vote under a nickname.
      </Text>
      <Button label="Create an account" onPress={() => router.push('/sign-up')} />
      <Button label="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
    </Section>
  );
}

function AvatarPrompt({ onPick, onDismiss }: { onPick: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-accent bg-accent-dim p-4">
      <Ionicons name="happy-outline" size={28} color={colors.accent} />
      <Pressable className="flex-1 gap-0.5" onPress={onPick} accessibilityRole="button" accessibilityLabel="Pick your avatar">
        <Text className="text-base font-bold text-text">Pick your avatar</Text>
        <Text className="text-sm text-text-dim">Choose how you appear next to your nickname.</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss avatar tip">
        <Ionicons name="close" size={20} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

/** Avatar (tap to change, pencil badge), nickname and email. */
function ProfileHeader({ profile, email, onChangeAvatar }: { profile: Profile; email: string | null; onChangeAvatar: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-4 rounded-2xl border border-hairline bg-surface1 p-4">
      <Pressable onPress={onChangeAvatar} accessibilityRole="button" accessibilityLabel="Change avatar" className="active:opacity-80">
        <Avatar avatarKey={profile.avatar_key} size={AVATAR_SIZE} />
        <View className="absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-2 border-surface1 bg-accent">
          <Ionicons name="pencil" size={13} color={colors.onAccent} />
        </View>
      </Pressable>
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} ellipsizeMode="tail" className="text-2xl font-bold text-text">
          {profile.nickname}
        </Text>
        {email ? (
          <Text numberOfLines={1} ellipsizeMode="tail" className="text-sm text-text-dim">
            {email}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function AccountGroup({ nickname }: { nickname: string | null }) {
  const router = useRouter();
  const unread = useUnreadNotifications();
  const settings = useMySettings();
  const next = settings.data?.nicknameNextChangeAt;
  const nicknameValue = inNicknameCooldown(settings.data) && next ? `Next change on ${formatManilaDay(next)}` : (nickname ?? '');

  return (
    <SettingsGroup title="Account">
      <SettingsRow first icon="at-outline" label="Nickname" value={nicknameValue} onPress={() => router.push('/change-nickname')} />
      <SettingsRow icon="document-text-outline" label="My Posts" onPress={() => router.push('/my-posts')} />
      <SettingsRow
        icon="notifications-outline"
        label="Notifications"
        accessory={<CountBadge count={unread} />}
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={() => router.push('/notifications')}
      />
      <SettingsRow icon="ban-outline" label="Blocked users" onPress={() => router.push('/blocked-users')} />
      <SettingsRow icon="options-outline" label="Notification preferences" onPress={() => router.push('/notification-preferences')} />
    </SettingsGroup>
  );
}

/** Shown when no mail app opens: the address, selectable so it can be copied. */
function FeedbackFallback({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel="Close">
      <View className="gap-3 px-2 pb-2">
        <Text accessibilityRole="header" className="text-base font-bold text-text">
          Send feedback
        </Text>
        <Text className="text-sm text-text-dim">No mail app opened. You can write to us at:</Text>
        <Text selectable className="text-base font-bold text-text">
          {FEEDBACK_EMAIL}
        </Text>
        <Button label="Close" variant="secondary" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

function AboutGroup() {
  const router = useRouter();
  const [mailFailed, setMailFailed] = useState(false);
  const sendFeedback = () => {
    Linking.openURL(feedbackMailto()).catch(() => setMailFailed(true));
  };
  return (
    <SettingsGroup title="About">
      <SettingsRow first icon="people-outline" label="Community rules" onPress={() => router.push('/legal/rules')} />
      <SettingsRow icon="reader-outline" label="Terms of Use" onPress={() => router.push('/legal/terms')} />
      <SettingsRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
      <SettingsRow icon="code-slash-outline" label="Open source notices" onPress={() => router.push('/licenses')} />
      <SettingsRow icon="mail-outline" label="Send feedback" onPress={sendFeedback} />
      <SettingsRow icon="information-circle-outline" label="Version" value={appVersion()} />
      <FeedbackFallback visible={mailFailed} onClose={() => setMailFailed(false)} />
    </SettingsGroup>
  );
}

function MemberProfile({ profile, email }: { profile: Profile; email: string | null }) {
  const router = useRouter();
  const updateAvatar = useUpdateAvatar();
  const showToast = useToastStore((s) => s.show);
  const { showPrompt, markSeen } = useAvatarPrompt(profile.id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = () => {
    setPickerOpen(true);
    markSeen();
  };
  const chooseAvatar = (key: string) => {
    setPickerOpen(false);
    if (key === profile.avatar_key) return;
    updateAvatar.mutate(key, {
      onSuccess: () => showToast('Avatar updated'),
      onError: () => showToast(AVATAR_FAILED),
    });
  };

  return (
    <View className="gap-3">
      {showPrompt ? <AvatarPrompt onPick={openPicker} onDismiss={markSeen} /> : null}
      <ProfileHeader profile={profile} email={email} onChangeAvatar={openPicker} />
      <AccountGroup nickname={profile.nickname} />
      <AboutGroup />
      <SettingsGroup title="Appearance">
        <View className="p-3">
          <ThemeSwitch />
        </View>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          first
          destructive
          icon="log-out-outline"
          label="Log out"
          onPress={() => void logOut()}
        />
      </SettingsGroup>
      <SettingsGroup title="Danger zone">
        <SettingsRow
          first
          destructive
          chevron
          icon="trash-outline"
          label="Delete account"
          onPress={() => router.push('/delete-account')}
        />
      </SettingsGroup>
      <AvatarPicker visible={pickerOpen} value={profile.avatar_key} onSelect={chooseAvatar} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View className="flex-row items-center gap-4">
      <Skeleton width={64} height={64} className="rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton width="50%" height={18} />
        <Skeleton width="35%" height={12} />
      </View>
    </View>
  );
}

/** Guests and the moment before the profile loads: the screen as it was before 8c. */
/** `onRetry` is set when the profile failed to load (signed in, nothing cached). */
function GuestOrLoading({ loading, onRetry }: { loading: boolean; onRetry?: () => void }) {
  const router = useRouter();

  return (
    <>
      {onRetry ? <AccountLoadError onRetry={onRetry} /> : loading ? <ProfileSkeleton /> : <GuestProfile />}
      <Section title="Appearance">
        <ThemeSwitch />
      </Section>
      <Section title="About">
        <Button
          label="Open source notices"
          variant="secondary"
          icon="document-text-outline"
          onPress={() => router.push('/licenses')}
        />
      </Section>
      {loading ? (
        <Button label="Log out" variant="danger" icon="log-out-outline" onPress={() => void logOut()} />
      ) : null}
    </>
  );
}

export default function ProfileScreen() {
  const { status, profile, session, retry } = useMembership();

  return (
    <TabScreen title="Profile">
      {status === 'member' && profile ? (
        <MemberProfile profile={profile} email={session?.user.email ?? null} />
      ) : (
        <GuestOrLoading loading={status !== 'guest'} onRetry={status === 'error' ? retry : undefined} />
      )}
    </TabScreen>
  );
}
