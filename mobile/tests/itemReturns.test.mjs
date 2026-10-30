// Run with: npm run test:returns  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

import { bannerText, confirmText, pickerTitle, returnView, startLabel, toCandidates, toReturn } from '../lib/itemReturns.ts';

const OTHER = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const row = (over = {}) => ({
  return_id: 'r1',
  status: 'pending',
  role: 'finder',
  other_id: OTHER,
  other_nickname: 'maria',
  other_avatar_key: null,
  created_at: '2026-10-30T02:00:00Z',
  ...over,
});
const base = { member: true, isAuthor: true, listingKind: 'lost_found', lostFoundType: 'lost', ret: null };

test('toReturn maps the row and ignores invalid ones', () => {
  assert.deepEqual(toReturn([row()]), {
    id: 'r1',
    status: 'pending',
    role: 'finder',
    otherId: OTHER,
    otherNickname: 'maria',
    otherAvatarKey: null,
    createdAt: '2026-10-30T02:00:00Z',
  });
  assert.equal(toReturn([]), null);
  assert.equal(toReturn(null), null);
  assert.equal(toReturn([row({ status: 'declined' })]), null);
  assert.equal(toReturn([row({ role: 'helper' })]), null);
  assert.equal(toReturn([row({ return_id: null })]), null);
});

test('toCandidates drops rows without an id or nickname', () => {
  assert.deepEqual(toCandidates([{ user_id: OTHER, nickname: 'maria', avatar_key: 'c_0123456789ab' }, { user_id: OTHER, nickname: null, avatar_key: null }]), [
    { userId: OTHER, nickname: 'maria', avatarKey: 'c_0123456789ab' },
  ]);
  assert.deepEqual(toCandidates(null), []);
});

test('returnView: none for guests, Buy & Sell, while loading, and for non-authors without a return', () => {
  assert.equal(returnView({ ...base, member: false }).kind, 'none');
  assert.equal(returnView({ ...base, listingKind: 'sell' }).kind, 'none');
  assert.equal(returnView({ ...base, ret: undefined }).kind, 'none');
  assert.equal(returnView({ ...base, isAuthor: false }).kind, 'none');
  assert.equal(returnView({ ...base, lostFoundType: null }).kind, 'none');
});

test('returnView: the author can start when there is no return', () => {
  assert.deepEqual(returnView(base), { kind: 'can_start', type: 'lost' });
  assert.deepEqual(returnView({ ...base, lostFoundType: 'found' }), { kind: 'can_start', type: 'found' });
});

test('returnView: pending and confirmed per role (the author button is hidden)', () => {
  assert.equal(returnView({ ...base, ret: toReturn([row()]) }).kind, 'finder_pending');
  assert.equal(returnView({ ...base, isAuthor: false, ret: toReturn([row({ role: 'owner' })]) }).kind, 'owner_pending');
  assert.equal(returnView({ ...base, ret: toReturn([row({ status: 'confirmed' })]) }).kind, 'confirmed_finder');
  assert.equal(returnView({ ...base, ret: toReturn([row({ status: 'confirmed', role: 'owner' })]) }).kind, 'confirmed_owner');
});

test('wording per listing type and banner state', () => {
  assert.equal(startLabel('lost'), 'I got my item back');
  assert.equal(startLabel('found'), 'I returned this item');
  assert.equal(pickerTitle('lost'), 'Who helped?');
  assert.equal(pickerTitle('found'), 'Who is the owner?');
  assert.equal(confirmText('lost', 'maria').message, 'Confirm that maria helped you get your item back? This closes the post.');
  assert.equal(confirmText('found', 'maria').message, 'Send maria a request to confirm you returned their item?');
  const at = (over) => bannerText(returnView({ ...base, ret: toReturn([row(over)]) }));
  assert.equal(at({}), 'Waiting for maria to confirm');
  assert.equal(at({ role: 'owner' }), 'maria says they returned this item to you.');
  assert.equal(at({ status: 'confirmed' }), 'Returned. maria confirmed you returned their item.');
  assert.equal(at({ status: 'confirmed', role: 'owner' }), 'Returned. maria helped you get this item back.');
  assert.equal(at({ status: 'confirmed', other_nickname: null }), 'Returned. Deleted user confirmed you returned their item.');
  assert.equal(bannerText({ kind: 'none' }), null);
});

// lib/errors.ts with the error shape a failed supabase.rpc() returns (code in the message, P0001).
register('./aliasHook.mjs', import.meta.url);
const { getReturnErrorMessage, getErrorMessage } = await import('../lib/errors.ts');
const rpcError = (message) => ({ message, code: 'P0001', details: null, hint: null });

test('getReturnErrorMessage maps the return codes', () => {
  assert.equal(getReturnErrorMessage(rpcError('not_commenter')), 'That member has not commented on this post.');
  assert.equal(getReturnErrorMessage(rpcError('account_too_new')), 'Both accounts must be at least 3 days old.');
  assert.equal(getReturnErrorMessage(rpcError('already_returned')), 'This post already has a return.');
  assert.equal(getReturnErrorMessage(rpcError('expired')), 'This request has expired.');
  assert.equal(getReturnErrorMessage(rpcError('invalid_user')), 'That member cannot be picked for this return.');
  assert.equal(getReturnErrorMessage(rpcError('forbidden')), 'Only the person who posted this can do that.');
  assert.equal(getReturnErrorMessage(rpcError('not_found')), 'This post or request is no longer available.');
});

test('getReturnErrorMessage reuses the shared wording for other codes', () => {
  assert.equal(getReturnErrorMessage(rpcError('rate_limited')), getErrorMessage(rpcError('rate_limited')));
  assert.equal(getReturnErrorMessage(rpcError('banned')), 'This account has been banned.');
  assert.equal(getReturnErrorMessage(new TypeError('Network request failed')), 'No connection. Check your internet and try again.');
  assert.equal(getReturnErrorMessage(new Error('boom')), 'Something went wrong. Please try again.');
});

test('return-only codes keep the usual text in other mappers', () => {
  // "expired" is recognised as a code, but only getReturnErrorMessage has text for it.
  assert.equal(getErrorMessage(rpcError('expired')), 'Something went wrong. Please try again.');
  assert.equal(getErrorMessage(rpcError('not_found')), 'This item no longer exists.');
});
