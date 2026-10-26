import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * iOS only: true while the keyboard is up. The "will" events never fire on Android, where the
 * window pans instead and anything below the focused input is simply hidden under the keyboard.
 */
export function useKeyboardWillShow() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
