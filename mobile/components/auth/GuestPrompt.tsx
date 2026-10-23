import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useRequireAuth } from '@/hooks/useRequireAuth';

/** Shown on member-only screens reached by a guest; the button opens the sign-in sheet. */
export function GuestPrompt({ message }: { message: string }) {
  const requireAuth = useRequireAuth();
  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-surface1 p-4">
      <Text className="text-base text-text">{message}</Text>
      <Button label="Sign in" onPress={() => requireAuth('default')} />
    </View>
  );
}
