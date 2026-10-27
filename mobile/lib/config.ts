import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const FEEDBACK_EMAIL = 'support@klasmeyt.com';

const APP_NAME = 'UNM Freedom Confessions';

/** The app.json version ("1.0.0") this build runs; null if unavailable. */
export function installedVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/** "1.0.0", or "1.0.0 (12)" when the build sets a build number. */
export function appVersion(): string {
  const config = Constants.expoConfig;
  const version = installedVersion() ?? 'unknown';
  const build = Platform.OS === 'android' ? config?.android?.versionCode : config?.ios?.buildNumber;
  return build !== undefined ? `${version} (${build})` : version;
}

/** The Send feedback e-mail: app version and OS only, never the user id, nickname or email. */
export function feedbackMailto(): string {
  const subject = `${APP_NAME} feedback`;
  const body = ['', '', '---', `App: ${APP_NAME} ${appVersion()}`, `Platform: ${Platform.OS} ${String(Platform.Version)}`].join('\n');
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
