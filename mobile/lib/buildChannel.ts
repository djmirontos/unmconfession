import * as Updates from 'expo-updates';

import { type BuildType, getBuildType } from '@/lib/buildType';

/** This build's type, from the channel EAS baked into the native build (null in local runs: GitHub). */
export function currentBuildType(): BuildType {
  return getBuildType(Updates.channel);
}
