import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ComingSoon } from '@/components/layout/ComingSoon';
import { TabScreen } from '@/components/layout/TabScreen';
import { Avatar } from '@/components/profile/Avatar';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { ThemeSwitch } from '@/components/profile/ThemeSwitch';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAvatarPrompt } from '@/hooks/useAvatarPrompt';
import { type Profile, useMembership } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar';
import { signOut } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';

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

function MemberProfile({ profile }: { profile: Profile }) {
  const updateAvatar = useUpdateAvatar();
  const { showPrompt, markSeen } = useAvatarPrompt(profile.id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = () => {
    setPickerOpen(true);
    markSeen();
  };

  return (
    <>
      {showPrompt ? <AvatarPrompt onPick={openPicker} onDismiss={markSeen} /> : null}
      <View className="flex-row items-center gap-4">
        <Avatar avatarKey={profile.avatar_key} size={64} />
        <View className="flex-1 gap-1">
          <Text className="text-2xl font-bold text-text" accessibilityLabel={`Nickname ${profile.nickname ?? ''}`}>
            {profile.nickname}
          </Text>
          <Text className="text-sm text-text-dim">Your nickname is permanent.</Text>
        </View>
      </View>
      <Section title="Avatar">
        {pickerOpen ? (
          <AvatarPicker value={profile.avatar_key} onChange={(key) => updateAvatar.mutate(key)} />
        ) : (
          <Button label="Change avatar" variant="secondary" icon="happy-outline" onPress={openPicker} />
        )}
        <FormMessage tone="error" message={updateAvatar.isError ? getErrorMessage(updateAvatar.error) : null} />
      </Section>
    </>
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

export default function ProfileScreen() {
  const router = useRouter();
  const { status, profile } = useMembership();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <TabScreen title="Profile">
      {status === 'guest' ? <GuestProfile /> : null}
      {status === 'loading' ? <ProfileSkeleton /> : null}
      {status === 'member' && profile ? <MemberProfile profile={profile} /> : null}

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

      {status !== 'guest' ? (
        <>
          {status === 'member' ? (
            <>
              <Button label="My Posts" variant="secondary" icon="document-text-outline" onPress={() => router.push('/my-posts')} />
              <Button label="Blocked users" variant="secondary" icon="ban-outline" onPress={() => router.push('/blocked-users')} />
            </>
          ) : null}
          <ComingSoon label="Notifications arrive in a later module." />
          <FormMessage tone="error" message={error} />
          <Button label="Log out" variant="danger" icon="log-out-outline" loading={signingOut} onPress={handleSignOut} />
        </>
      ) : null}
    </TabScreen>
  );
}
