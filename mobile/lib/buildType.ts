// Which store a build came from, from its EAS Update channel (fixed in the native build, so an
// OTA update cannot change it). Pure (tests/softUpdate.test.mjs); lib/buildChannel.ts reads the channel.

export type BuildType = 'play' | 'github';

/** 'production' is the Play AAB; every other channel (preview, staging, development, none) is a GitHub APK. */
export function getBuildType(channel: string | null | undefined): BuildType {
  return channel === 'production' ? 'play' : 'github';
}
