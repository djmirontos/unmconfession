import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { signInWithGoogle } from '@/lib/auth';
import { isGoogleSignInAvailable } from '@/lib/googleSignIn';

type Props = {
  onSuccess?: () => void;
  onError: (message: string | null) => void;
};

/**
 * Native Google Sign-In. A nickname screen follows if the account has none. In Expo Go (no
 * native module) or without the web client id it stays visible but disabled.
 */
export function GoogleButton({ onSuccess, onError }: Props) {
  const [loading, setLoading] = useState(false);
  const available = isGoogleSignInAvailable();

  const handlePress = async () => {
    onError(null);
    setLoading(true);
    const result = await signInWithGoogle();
    setLoading(false);
    if (result.status === 'success') onSuccess?.();
    else if (result.status === 'failed') onError(result.message);
  };

  return (
    <View className="gap-1.5">
      <Button
        label="Continue with Google"
        icon="logo-google"
        variant="secondary"
        loading={loading}
        disabled={!available}
        onPress={handlePress}
      />
      {available ? null : (
        <Text className="text-center text-xs text-text-dim">
          Google sign-in needs the installed app (development build)
        </Text>
      )}
    </View>
  );
}
