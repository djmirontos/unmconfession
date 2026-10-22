import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { ComingSoon } from '@/components/layout/ComingSoon';
import { TabScreen } from '@/components/layout/TabScreen';
import { Avatar } from '@/components/profile/Avatar';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { ThemeSwitch } from '@/components/profile/ThemeSwitch';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Skeleton } from '@/components/ui/Skeleton';
import { type Profile, useMembership } from '@/hooks/useProfile';
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

function MemberProfile({ profile }: { profile: Profile }) {
  const updateAvatar = useUpdateAvatar();
  return (
    <>
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
        <AvatarPicker value={profile.avatar_key} onChange={(key) => updateAvatar.mutate(key)} />
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

      {status !== 'guest' ? (
        <>
          <ComingSoon label="My Posts, Notifications and Blocked users arrive in later modules." />
          <FormMessage tone="error" message={error} />
          <Button label="Log out" variant="danger" icon="log-out-outline" loading={signingOut} onPress={handleSignOut} />
        </>
      ) : null}
    </TabScreen>
  );
}
