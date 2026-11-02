// App version report (report_app_version). Pure, no React Native imports (tests/appVersions.test.mjs).

// Same rule as the database check on member_app_versions.app_version.
const VERSION = /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/;

export type ReportArgs = { p_version: string; p_platform: 'android' | 'ios' };

/** The RPC arguments, or null when the version or platform would be refused (then nothing is sent). */
export function buildReportArgs(version: string | null | undefined, platform: string): ReportArgs | null {
  if (typeof version !== 'string' || !VERSION.test(version)) return null;
  if (platform !== 'android' && platform !== 'ios') return null;
  return { p_version: version, p_platform: platform };
}

/** Once per user per launch: adds the id and returns true only the first time. */
export function shouldReport(reported: Set<string>, userId: string): boolean {
  if (reported.has(userId)) return false;
  reported.add(userId);
  return true;
}
