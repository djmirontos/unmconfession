// Type-only import: erased at build time, so it never loads the native module.
import type { SignInResponse } from '@react-native-google-signin/google-signin';
import { TurboModuleRegistry } from 'react-native';

import { logError } from '@/lib/log';

type GoogleSignInLib = typeof import('@react-native-google-signin/google-signin');

/** OAuth "Web application" client id (public). Google issues the ID token for this audience. */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? '';

// Android Google Play services status codes, passed through as strings by the library.
const NETWORK_ERROR = '7';
const DEVELOPER_ERROR = '10';

/** False in Expo Go (the native module is not there) or when the web client id is not set. */
export function isGoogleSignInAvailable(): boolean {
  return WEB_CLIENT_ID !== '' && TurboModuleRegistry.get('RNGoogleSignin') != null;
}

let loading: Promise<GoogleSignInLib | null> | null = null;

/**
 * Loads and configures the library once (call at startup). Loaded lazily because importing it
 * without the native module throws, which would crash Expo Go. Never throws; null if unavailable.
 */
export function loadGoogleSignIn(): Promise<GoogleSignInLib | null> {
  if (!isGoogleSignInAvailable()) return Promise.resolve(null);
  loading ??= import('@react-native-google-signin/google-signin')
    .then((lib) => {
      lib.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
      return lib;
    })
    .catch((error: unknown) => {
      logError('google.load', error);
      return null;
    });
  return loading;
}

export type GoogleIdTokenResult = { type: 'success'; idToken: string } | { type: 'cancelled' };

/**
 * Shows Google's account picker and returns the ID token. Failures throw an Error whose
 * message is a code mapped to user-facing text in lib/errors.ts.
 * The library's free ("Original") API has no nonce option, so none is sent to Supabase.
 */
export async function getGoogleIdToken(): Promise<GoogleIdTokenResult> {
  const lib = await loadGoogleSignIn();
  if (!lib) throw new Error('google_unavailable');
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = lib;

  let response: SignInResponse;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    response = await GoogleSignin.signIn();
  } catch (error) {
    logError('google.signIn', error);
    if (!isErrorWithCode(error)) throw new Error('google_failed');
    switch (error.code) {
      case statusCodes.SIGN_IN_CANCELLED:
      case statusCodes.IN_PROGRESS:
        return { type: 'cancelled' };
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        throw new Error('google_play_services');
      case NETWORK_ERROR:
        throw new Error('network_error');
      case DEVELOPER_ERROR:
        throw new Error('google_config');
      default:
        throw new Error('google_failed');
    }
  }

  if (!isSuccessResponse(response)) return { type: 'cancelled' };
  const { idToken } = response.data;
  if (!idToken) throw new Error('google_no_id_token');
  return { type: 'success', idToken };
}

/** Forgets the Google account on this phone so the picker shows next time. Never throws. */
export async function signOutOfGoogle(): Promise<void> {
  try {
    const lib = await loadGoogleSignIn();
    await lib?.GoogleSignin.signOut();
  } catch (error) {
    logError('google.signOut', error);
  }
}
