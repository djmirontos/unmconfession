// Run with: npm run test:version  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isUpdateRequired,
  parseCachedRequirement,
  parseRequirementRows,
  parseVersion,
  resolveRequirement,
  safeUpdateUrl,
} from '../lib/versionGate.ts';

const req = (minAppVersion, updateUrl = null, updateMessage = null) => ({ minAppVersion, updateUrl, updateMessage });

test('parseVersion accepts exactly three non-negative integers', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('0.0.0'), [0, 0, 0]);
  assert.deepEqual(parseVersion('10.20.300'), [10, 20, 300]);
  assert.deepEqual(parseVersion('01.2.3'), [1, 2, 3]);
});

test('parseVersion rejects everything else', () => {
  for (const bad of ['', '1', '1.2', '1.2.3.4', '1.2.x', '-1.2.3', '1.-2.3', '1.2.3-beta', ' 1.2.3', '1.2.3 ', '1..3', 'v1.2.3', '1.0.0 (12)', '1.2.3\n', '99999999999999999999.0.0']) {
    assert.equal(parseVersion(bad), null, JSON.stringify(bad));
  }
});

test('isUpdateRequired compares numerically, strictly lower only', () => {
  assert.equal(isUpdateRequired('1.0.0', '1.0.1'), true);
  assert.equal(isUpdateRequired('1.9.0', '1.10.0'), true);
  assert.equal(isUpdateRequired('1.10.0', '1.9.0'), false);
  assert.equal(isUpdateRequired('2.0.0', '1.99.99'), false);
  assert.equal(isUpdateRequired('1.2.3', '1.2.3'), false);
  assert.equal(isUpdateRequired('0.9.9', '1.0.0'), true);
  assert.equal(isUpdateRequired('1.0.0', '0.0.0'), false);
});

test('isUpdateRequired fails open when either side does not parse', () => {
  assert.equal(isUpdateRequired('unknown', '9.9.9'), false);
  assert.equal(isUpdateRequired('1.0.0', 'garbage'), false);
  assert.equal(isUpdateRequired('', ''), false);
});

test('parseRequirementRows reads the one-row table and rejects bad shapes', () => {
  assert.deepEqual(
    parseRequirementRows([{ min_app_version: '1.2.0', update_url: 'https://x.test', update_message: null }]),
    req('1.2.0', 'https://x.test'),
  );
  assert.equal(parseRequirementRows([]), null);
  assert.equal(parseRequirementRows(null), null);
  assert.equal(parseRequirementRows({ min_app_version: '1.0.0' }), null);
  assert.equal(parseRequirementRows([{ min_app_version: 1, update_url: null, update_message: null }]), null);
});

test('parseCachedRequirement survives missing or corrupt storage', () => {
  assert.equal(parseCachedRequirement(null), null);
  assert.equal(parseCachedRequirement('{not json'), null);
  assert.equal(parseCachedRequirement('{"minAppVersion":1}'), null);
  assert.deepEqual(parseCachedRequirement(JSON.stringify(req('1.0.0'))), req('1.0.0'));
});

test('resolveRequirement: fresh wins, then cache, else nothing', () => {
  const fresh = req('2.0.0');
  const cached = req('1.0.0');
  assert.deepEqual(resolveRequirement({ kind: 'ok', requirement: fresh }, cached), fresh);
  assert.deepEqual(resolveRequirement({ kind: 'ok', requirement: fresh }, null), fresh);
  assert.deepEqual(resolveRequirement({ kind: 'error' }, cached), cached);
  assert.deepEqual(resolveRequirement({ kind: 'timeout' }, cached), cached);
  assert.deepEqual(resolveRequirement(null, cached), cached);
  assert.equal(resolveRequirement({ kind: 'error' }, null), null);
  assert.equal(resolveRequirement({ kind: 'timeout' }, null), null);
  assert.equal(resolveRequirement(null, null), null);
});

test('safeUpdateUrl accepts https:// links only', () => {
  assert.equal(safeUpdateUrl('https://x'), 'https://x');
  assert.equal(
    safeUpdateUrl('https://github.com/djmirontos/unm-releases/releases/latest'),
    'https://github.com/djmirontos/unm-releases/releases/latest',
  );
  assert.equal(safeUpdateUrl('  https://x  '), 'https://x');
  for (const bad of ['http://x', 'javascript:alert(1)', 'HTTPS://x', 'ftp://x', 'https://', 'https:// x', '', '   ', null, undefined]) {
    assert.equal(safeUpdateUrl(bad), null, JSON.stringify(bad));
  }
});
