import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';

function explainDenied(what: 'camera' | 'photos', canAskAgain: boolean) {
  const title = what === 'camera' ? 'Camera access is off' : 'Photo access is off';
  const body =
    what === 'camera'
      ? 'To take a photo for your post, allow camera access.'
      : 'To add photos to your post, allow access to your photos.';
  Alert.alert(
    title,
    canAskAgain ? body : `${body} You can turn it on in Settings.`,
    canAskAgain
      ? [{ text: 'OK' }]
      : [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
  );
}

// quality 1: no lossy pass here, the manipulator does the single JPEG encode.
// exif false: do not even read metadata into JS.
const BASE_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };

/** Camera and gallery pickers that hand back local URIs, with friendly permission handling. */
export function usePhotoPicker(onPicked: (uris: string[]) => void) {
  const fromLibrary = useCallback(
    async (limit: number) => {
      if (limit <= 0) return;
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return explainDenied('photos', permission.canAskAgain);
      const result = await ImagePicker.launchImageLibraryAsync({
        ...BASE_OPTIONS,
        allowsMultipleSelection: limit > 1,
        selectionLimit: limit,
      });
      if (!result.canceled) onPicked(result.assets.map((a) => a.uri));
    },
    [onPicked],
  );

  const fromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return explainDenied('camera', permission.canAskAgain);
    const result = await ImagePicker.launchCameraAsync(BASE_OPTIONS);
    if (!result.canceled) onPicked(result.assets.map((a) => a.uri));
  }, [onPicked]);

  return { fromLibrary, fromCamera };
}
