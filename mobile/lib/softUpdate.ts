// Soft update reminder ("Update available" with Update / Later). Pure, no React Native imports
// (tests/softUpdate.test.mjs). The hard gate (lib/versionGate.ts, ForceUpdateGate) is separate.
import type { BuildType } from '@/lib/buildType';
import type { MembershipStatus } from '@/hooks/useProfile';
import { isUpdateRequired, parseVersion, safeUpdateUrl } from '@/lib/versionGate';

export type LatestAppInfo = {
  latestAppVersion: string;
  updateUrl: string | null;
  playUpdateUrl: string | null;
  message: string | null;
};

export const PLAY_FALLBACK_URL = 'https://play.google.com/store/apps/details?id=com.unmfreedom.confessions';

export const SOFT_UPDATE_COPY = {
  title: 'Update available',
  defaultMessage: 'New update available. Please update to the latest version.',
  update: 'Update',
  later: 'Later',
} as const;

const MESSAGE_MAX = 200;

/**
 * get_latest_app_info: the first row, or null when it is missing or its version does not parse.
 * The generated types call the URL and message columns strings; the database allows null.
 */
export function toLatestAppInfo(raw: unknown): LatestAppInfo | null {
  if (!Array.isArray(raw)) return null;
  const row: unknown = raw[0];
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.latest_app_version !== 'string' || !parseVersion(r.latest_app_version)) return null;
  const message = typeof r.latest_update_message === 'string' ? r.latest_update_message.trim().slice(0, MESSAGE_MAX).trim() : '';
  return {
    latestAppVersion: r.latest_app_version,
    updateUrl: safeUpdateUrl(r.update_url as string | null | undefined),
    playUpdateUrl: safeUpdateUrl(r.play_update_url as string | null | undefined),
    message: message === '' ? null : message,
  };
}

/**
 * Where Update goes. A Play install can only be updated by Play (a GitHub APK has another signing
 * key), so Play builds never get the GitHub link. GitHub builds without a link get no popup.
 */
export function resolveUpdateLink(buildType: BuildType, info: LatestAppInfo): string | null {
  return buildType === 'play' ? (info.playUpdateUrl ?? PLAY_FALLBACK_URL) : info.updateUrl;
}

/**
 * The hard gate's Update link. GitHub builds: get_app_requirements' update_url, as before. Play builds
 * never use it (it may point to GitHub): the Play link from get_latest_app_info when already known,
 * else the Play listing, so the gate works offline and with nothing fetched.
 */
export function resolveGateLink(
  buildType: BuildType,
  requirementUpdateUrl: string | null | undefined,
  latestInfoPlayUrl: string | null | undefined,
): string | null {
  return buildType === 'play' ? (safeUpdateUrl(latestInfoPlayUrl) ?? PLAY_FALLBACK_URL) : safeUpdateUrl(requirementUpdateUrl);
}

/** Show only when a newer version is published and nothing more important is on screen. Guests too. */
export function shouldShowSoftUpdate(input: {
  installed: string | null;
  info: LatestAppInfo | null;
  forceRequired: boolean;
  restored: boolean;
  membershipStatus: MembershipStatus;
  laterTapped: boolean;
  link: string | null;
}): boolean {
  if (!input.info || input.installed === null || input.link === null) return false;
  if (input.forceRequired || !input.restored || input.laterTapped) return false;
  if (input.membershipStatus === 'needs-nickname' || input.membershipStatus === 'loading') return false;
  // installed < latest, part by part (1.0.10 > 1.0.2); unparseable or '0.0.0' never shows.
  return isUpdateRequired(input.installed, input.info.latestAppVersion);
}

export const softUpdateMessage = (info: LatestAppInfo): string => info.message ?? SOFT_UPDATE_COPY.defaultMessage;
