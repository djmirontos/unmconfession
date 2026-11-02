// Run with: npm run test:appversions  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { buildReportArgs, shouldReport } = await import('../lib/appVersions.ts');

// ---------------------------------------------------------------- report arguments

test('a valid version and platform become the RPC arguments', () => {
  assert.deepEqual(buildReportArgs('1.0.2', 'android'), { p_version: '1.0.2', p_platform: 'android' });
  assert.deepEqual(buildReportArgs('9999.0.10', 'ios'), { p_version: '9999.0.10', p_platform: 'ios' });
});

test('android and ios both pass', () => {
  for (const platform of ['android', 'ios']) assert.equal(buildReportArgs('1.0.2', platform)?.p_platform, platform);
});

test('versions the database would refuse are not sent', () => {
  for (const version of ['', '1.0', '1.0.0-beta', 'a.b.c', null, undefined, '12345.0.0', ' 1.0.2', '1.0.2 ', '1..2', '-1.0.0']) {
    assert.equal(buildReportArgs(version, 'android'), null, String(version));
  }
});

test('other platforms are not sent', () => {
  for (const platform of ['web', 'windows', 'macos', '', 'Android']) {
    assert.equal(buildReportArgs('1.0.2', platform), null, platform);
  }
});

// ---------------------------------------------------------------- once per user per launch

test('the same user is reported only once', () => {
  const reported = new Set();
  assert.equal(shouldReport(reported, 'user-a'), true);
  assert.equal(shouldReport(reported, 'user-a'), false);
  assert.equal(shouldReport(reported, 'user-a'), false);
});

test('a second user on the same launch (account switch) is reported too', () => {
  const reported = new Set();
  assert.equal(shouldReport(reported, 'user-a'), true);
  assert.equal(shouldReport(reported, 'user-b'), true);
  assert.equal(shouldReport(reported, 'user-b'), false);
  assert.deepEqual([...reported], ['user-a', 'user-b']);
});
