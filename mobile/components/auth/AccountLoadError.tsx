import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';

/** Signed in, but the profile could not be loaded and nothing is cached. */
export function AccountLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="gap-3">
      <FormMessage tone="error" message="Could not load your account. Check your connection and try again." />
      <Button label="Try again" variant="secondary" icon="refresh" onPress={onRetry} />
    </View>
  );
}
