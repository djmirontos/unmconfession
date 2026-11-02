// Run with: npm run test:softupdate  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

// lib/softUpdate.ts imports '@/lib/versionGate' (tsconfig paths).
register('./aliasHook.mjs', import.meta.url);
const { getBuildType } = await import('../lib/buildType.ts');
const S = await import('../lib/softUpdate.ts');
const { useSoftUpdateStore } = await import('../stores/softUpdateStore.ts');

const GITHUB = 'https://github.com/example/app/releases/latest';
const PLAY = 'https://play.google.com/store/apps/details?id=com.unmfreedom.confessions&hl=en';
const row = (over = {}) => ({
  latest_app_version: '1.0.3',
  update_url: GITHUB,
  play_update_url: PLAY,
  latest_update_message: null,
  ...over,
});
const info = (over = {}) => ({ latestAppVersion: '1.0.3', updateUrl: GITHUB, playUpdateUrl: null, message: null, ...over });

// ---------------------------------------------------------------- build type

test('only the production channel is a Play build', () => {
  assert.equal(getBuildType('production'), 'play');
  for (const channel of ['preview', 'staging', 'development', '', null, undefined, 'Production']) {
    assert.equal(getBuildType(channel), 'github', String(channel));
  }
});

// ---------------------------------------------------------------- parsing get_latest_app_info

test('toLatestAppInfo reads the first row', () => {
  assert.deepEqual(S.toLatestAppInfo([row(), row({ latest_app_version: '9.9.9' })]), {
    latestAppVersion: '1.0.3',
    updateUrl: GITHUB,
    playUpdateUrl: PLAY,
    message: null,
  });
});

test('toLatestAppInfo accepts null URLs and message', () => {
  assert.deepEqual(S.toLatestAppInfo([row({ update_url: null, play_update_url: null, latest_update_message: null })]), {
    latestAppVersion: '1.0.3',
    updateUrl: null,
    playUpdateUrl: null,
    message: null,
  });
});

test('toLatestAppInfo keeps only https links', () => {
  for (const bad of ['http://example.com/app.apk', 'javascript:alert(1)', 'https://', 'https://exa mple.com', 42]) {
    const parsed = S.toLatestAppInfo([row({ update_url: bad, play_update_url: bad })]);
    assert.equal(parsed.updateUrl, null, String(bad));
    assert.equal(parsed.playUpdateUrl, null, String(bad));
  }
});

test('toLatestAppInfo trims the message, caps it at 200 characters, and treats blank as none', () => {
  assert.equal(S.toLatestAppInfo([row({ latest_update_message: '  Fixes and speed.  ' })]).message, 'Fixes and speed.');
  assert.equal(S.toLatestAppInfo([row({ latest_update_message: '   ' })]).message, null);
  assert.equal(S.toLatestAppInfo([row({ latest_update_message: 'x'.repeat(250) })]).message.length, 200);
  assert.equal(S.toLatestAppInfo([row({ latest_update_message: 5 })]).message, null);
});

test('toLatestAppInfo: malformed, empty, non-array or an unparseable version give null', () => {
  assert.equal(S.toLatestAppInfo([]), null);
  assert.equal(S.toLatestAppInfo(null), null);
  assert.equal(S.toLatestAppInfo(row()), null);
  assert.equal(S.toLatestAppInfo(['row']), null);
  assert.equal(S.toLatestAppInfo([null]), null);
  for (const v of ['1.0', '1.0.3-beta', 'latest', '', null, 103]) {
    assert.equal(S.toLatestAppInfo([row({ latest_app_version: v })]), null, String(v));
  }
});

// ---------------------------------------------------------------- update link

test('Play builds use the Play link, or the Play listing when none is set', () => {
  assert.equal(S.resolveUpdateLink('play', info({ playUpdateUrl: PLAY })), PLAY);
  assert.equal(S.resolveUpdateLink('play', info({ playUpdateUrl: null })), S.PLAY_FALLBACK_URL);
  assert.equal(S.PLAY_FALLBACK_URL, 'https://play.google.com/store/apps/details?id=com.unmfreedom.confessions');
});

test('GitHub builds use the GitHub link, and get none without it', () => {
  assert.equal(S.resolveUpdateLink('github', info()), GITHUB);
  assert.equal(S.resolveUpdateLink('github', info({ updateUrl: null, playUpdateUrl: PLAY })), null);
});

// ---------------------------------------------------------------- when it shows

const base = {
  installed: '1.0.2',
  info: info(),
  forceRequired: false,
  restored: true,
  membershipStatus: 'member',
  laterTapped: false,
  link: GITHUB,
};
const show = (over) => S.shouldShowSoftUpdate({ ...base, ...over });

test('shows when a newer version is published', () => {
  assert.equal(show({}), true);
});

test('guests and members whose account failed to load see it too', () => {
  assert.equal(show({ membershipStatus: 'guest' }), true);
  assert.equal(show({ membershipStatus: 'error' }), true);
});

test('hidden while the hard gate is active', () => {
  assert.equal(show({ forceRequired: true }), false);
});

test('hidden until the session is restored, on the nickname screen, and while the account loads', () => {
  assert.equal(show({ restored: false }), false);
  assert.equal(show({ membershipStatus: 'needs-nickname' }), false);
  assert.equal(show({ membershipStatus: 'loading' }), false);
});

test('hidden after Later, without a link, or without info', () => {
  assert.equal(show({ laterTapped: true }), false);
  assert.equal(show({ link: null }), false);
  assert.equal(show({ info: null }), false);
});

test('compares versions part by part', () => {
  assert.equal(show({ installed: '1.0.2', info: info({ latestAppVersion: '1.0.10' }) }), true);
  assert.equal(show({ installed: '1.0.10', info: info({ latestAppVersion: '1.0.2' }) }), false);
  assert.equal(show({ installed: '1.0.2', info: info({ latestAppVersion: '1.0.2' }) }), false);
  assert.equal(show({ installed: '1.1.0', info: info({ latestAppVersion: '1.0.9' }) }), false);
  assert.equal(show({ installed: '0.9.9', info: info({ latestAppVersion: '1.0.0' }) }), true);
});

test("'0.0.0' (nothing published) and unparseable versions never show", () => {
  assert.equal(show({ info: info({ latestAppVersion: '0.0.0' }) }), false);
  assert.equal(show({ installed: null }), false);
  assert.equal(show({ installed: 'dev' }), false);
  assert.equal(show({ info: info({ latestAppVersion: 'x.y.z' }) }), false);
});

test('the message falls back to the default text', () => {
  assert.equal(S.softUpdateMessage(info()), 'New update available. Please update to the latest version.');
  assert.equal(S.softUpdateMessage(info({ message: 'Big fixes.' })), 'Big fixes.');
  assert.equal(S.SOFT_UPDATE_COPY.title, 'Update available');
  assert.equal(S.SOFT_UPDATE_COPY.update, 'Update');
  assert.equal(S.SOFT_UPDATE_COPY.later, 'Later');
});

// ---------------------------------------------------------------- Later (in memory)

test('Later starts false and stays set once tapped', () => {
  assert.equal(useSoftUpdateStore.getState().laterTapped, false);
  useSoftUpdateStore.getState().setLater();
  assert.equal(useSoftUpdateStore.getState().laterTapped, true);
  useSoftUpdateStore.getState().setLater();
  assert.equal(useSoftUpdateStore.getState().laterTapped, true);
});

// ---------------------------------------------------------------- hard gate link

test('gate on GitHub builds: update_url as before, or no link', () => {
  assert.equal(S.resolveGateLink('github', GITHUB, PLAY), GITHUB);
  assert.equal(S.resolveGateLink('github', null, PLAY), null);
  assert.equal(S.resolveGateLink('github', undefined, null), null);
  assert.equal(S.resolveGateLink('github', '', null), null);
});

test('gate on Play builds never uses update_url', () => {
  assert.equal(S.resolveGateLink('play', GITHUB, null), S.PLAY_FALLBACK_URL);
  assert.equal(S.resolveGateLink('play', GITHUB, PLAY), PLAY);
});

test('gate on Play builds: the Play link when known, else the Play listing (offline, nothing fetched)', () => {
  assert.equal(S.resolveGateLink('play', null, PLAY), PLAY);
  assert.equal(S.resolveGateLink('play', null, null), S.PLAY_FALLBACK_URL);
  assert.equal(S.resolveGateLink('play', undefined, undefined), S.PLAY_FALLBACK_URL);
  assert.equal(S.resolveGateLink('play', '', ''), S.PLAY_FALLBACK_URL);
});

test('gate links must be https', () => {
  for (const bad of ['http://example.com/app.apk', 'javascript:alert(1)', 'https://']) {
    assert.equal(S.resolveGateLink('github', bad, null), null, bad);
    assert.equal(S.resolveGateLink('play', bad, bad), S.PLAY_FALLBACK_URL, bad);
  }
});

test('the store keeps the last good info for the gate', () => {
  assert.equal(useSoftUpdateStore.getState().info, null);
  useSoftUpdateStore.getState().setInfo(info({ playUpdateUrl: PLAY }));
  assert.equal(useSoftUpdateStore.getState().info.playUpdateUrl, PLAY);
});
