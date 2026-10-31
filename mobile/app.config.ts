import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the whole config; this file only adds the one value that must come from the
// environment. google-services.json (FCM, Android push) is never committed: EAS builds read it from
// the GOOGLE_SERVICES_JSON file variable, local builds from ./google-services.json (gitignored).
export default ({ config }: ConfigContext): ExpoConfig => {
  if (!config.name || !config.slug) throw new Error('app.json must set expo.name and expo.slug');
  return {
    ...config,
    name: config.name,
    slug: config.slug,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
  };
};
