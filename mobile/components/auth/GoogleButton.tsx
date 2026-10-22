import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { signInWithGoogle } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';

type Props = {
  onSuccess?: () => void;
  onError: (message: string | null) => void;
};

/** Google OAuth via the system browser. A nickname screen follows if the account has none. */
export function GoogleButton({ onSuccess, onError }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    onError(null);
    setLoading(true);
    try {
      if (await signInWithGoogle()) onSuccess?.();
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      label="Continue with Google"
      icon="logo-google"
      variant="secondary"
      loading={loading}
      onPress={handlePress}
    />
  );
}
