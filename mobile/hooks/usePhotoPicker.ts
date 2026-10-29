import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';

type Purpose = 'post' | 'avatar';

function explainDenied(what: 'camera' | 'photos', canAskAgain: boolean, purpose: Purpose) {
  const title = what === 'camera' ? 'Camera access is off' : 'Photo access is off';
  const target = purpose === 'avatar' ? 'your profile picture' : 'your post';
  const body =
    what === 'camera'
      ? `To take a photo for ${target}, allow camera access.`
      : `To add ${purpose === 'avatar' ? 'a photo for your profile picture' : 'photos to your post'}, allow access to your photos.`;
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
// Profile pictures: the picker's own square crop (one photo, still no lossy pass).
const AVATAR_OPTIONS: ImagePicker.ImagePickerOptions = { ...BASE_OPTIONS, allowsEditing: true, aspect: [1, 1] };

/** Camera and gallery pickers that hand back local URIs, with friendly permission handling. */
export function usePhotoPicker(onPicked: (uris: string[]) => void, purpose: Purpose = 'post') {
  const options = purpose === 'avatar' ? AVATAR_OPTIONS : BASE_OPTIONS;
  const fromLibrary = useCallback(
    async (limit: number) => {
      if (limit <= 0) return;
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return explainDenied('photos', permission.canAskAgain, purpose);
      const result = await ImagePicker.launchImageLibraryAsync({
        ...options,
        allowsMultipleSelection: purpose === 'post' && limit > 1,
        selectionLimit: purpose === 'post' ? limit : 1,
      });
      if (!result.canceled) onPicked(result.assets.map((a) => a.uri));
    },
    [onPicked, options, purpose],
  );

  const fromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return explainDenied('camera', permission.canAskAgain, purpose);
    const result = await ImagePicker.launchCameraAsync(options);
    if (!result.canceled) onPicked(result.assets.map((a) => a.uri));
  }, [onPicked, options, purpose]);

  return { fromLibrary, fromCamera };
}
