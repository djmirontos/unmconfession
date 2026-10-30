// Run with: npm run test:sales  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

import {
  SALE_PICKER_EMPTY,
  SALE_PICKER_TITLE,
  SALE_START_LABEL,
  SALE_TOASTS,
  saleBannerText,
  saleConfirmText,
  saleStartSuccess,
  saleView,
  toSale,
} from '../lib/itemSales.ts';

const OTHER = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const row = (over = {}) => ({
  sale_id: 's1',
  status: 'pending',
  role: 'seller',
  other_id: OTHER,
  other_nickname: 'maria',
  other_avatar_key: null,
  created_at: '2026-10-30T02:00:00Z',
  ...over,
});
const base = { member: true, isSeller: true, listingKind: 'sell', price: 250, sale: null };

test('toSale maps the row and ignores invalid ones', () => {
  assert.deepEqual(toSale([row()]), {
    id: 's1',
    status: 'pending',
    role: 'seller',
    otherId: OTHER,
    otherNickname: 'maria',
    otherAvatarKey: null,
    createdAt: '2026-10-30T02:00:00Z',
  });
  assert.equal(toSale([]), null);
  assert.equal(toSale(null), null);
  assert.equal(toSale([row({ status: 'declined' })]), null);
  assert.equal(toSale([row({ role: 'owner' })]), null);
  assert.equal(toSale([row({ sale_id: null })]), null);
});

test('saleView: none for guests, Lost & Found, loading or failed loads, non-sellers and free items', () => {
  assert.equal(saleView({ ...base, member: false }).kind, 'none');
  assert.equal(saleView({ ...base, listingKind: 'lost_found' }).kind, 'none');
  assert.equal(saleView({ ...base, sale: undefined }).kind, 'none');
  assert.equal(saleView({ ...base, isSeller: false }).kind, 'none');
  assert.equal(saleView({ ...base, price: 0 }).kind, 'none');
  assert.equal(saleView({ ...base, price: null }).kind, 'none');
});

test('saleView: the seller can start on a priced listing without a sale', () => {
  assert.deepEqual(saleView(base), { kind: 'can_start' });
  assert.deepEqual(saleView({ ...base, price: 0.5 }), { kind: 'can_start' });
});

test('saleView: pending and confirmed per role (the start button is hidden)', () => {
  assert.equal(saleView({ ...base, sale: toSale([row()]) }).kind, 'seller_pending');
  assert.equal(saleView({ ...base, isSeller: false, sale: toSale([row({ role: 'buyer' })]) }).kind, 'buyer_pending');
  assert.equal(saleView({ ...base, sale: toSale([row({ status: 'confirmed' })]) }).kind, 'confirmed_seller');
  assert.equal(saleView({ ...base, isSeller: false, sale: toSale([row({ status: 'confirmed', role: 'buyer' })]) }).kind, 'confirmed_buyer');
  // A free listing that already has a sale still shows its banner.
  assert.equal(saleView({ ...base, price: 0, sale: toSale([row({ status: 'confirmed' })]) }).kind, 'confirmed_seller');
});

test('wording', () => {
  assert.equal(SALE_START_LABEL, 'Mark as sold to a buyer');
  assert.equal(SALE_PICKER_TITLE, 'Who bought it?');
  assert.equal(SALE_PICKER_EMPTY, 'Nobody eligible has commented yet. Ask the buyer to comment on this listing first.');
  assert.equal(saleConfirmText('maria').message, 'Send maria a request to confirm they bought this?');
  assert.equal(saleStartSuccess('maria'), 'Request sent to maria');
  assert.deepEqual({ ...SALE_TOASTS }, { accepted: 'Thanks! The sale is confirmed.', declined: 'Request declined', cancelled: 'Request cancelled' });
  const at = (over, seller = true) => saleBannerText(saleView({ ...base, isSeller: seller, sale: toSale([row(over)]) }));
  assert.equal(at({}), 'Waiting for maria to confirm');
  assert.equal(at({ role: 'buyer' }, false), 'maria says you bought this item.');
  assert.equal(at({ status: 'confirmed' }), 'Sold. maria confirmed this sale.');
  assert.equal(at({ status: 'confirmed', role: 'buyer' }, false), 'Sold. You bought this from maria.');
  assert.equal(at({ other_nickname: null }), 'Waiting for Deleted user to confirm');
  assert.equal(saleBannerText({ kind: 'none' }), null);
});

// lib/errors.ts with the error shape a failed supabase.rpc() returns (code in the message, P0001).
register('./aliasHook.mjs', import.meta.url);
const { getSaleErrorMessage, getReturnErrorMessage, getErrorMessage } = await import('../lib/errors.ts');
const rpcError = (message) => ({ message, code: 'P0001', details: null, hint: null });

test('getSaleErrorMessage maps the sale codes', () => {
  assert.equal(getSaleErrorMessage(rpcError('not_commenter')), 'That member has not commented on this listing.');
  assert.equal(getSaleErrorMessage(rpcError('account_too_new')), 'Both accounts must be at least 3 days old.');
  assert.equal(getSaleErrorMessage(rpcError('already_sold')), 'This listing already has a sale.');
  assert.equal(getSaleErrorMessage(rpcError('free_item')), 'Free items cannot be marked as sold to a buyer.');
  assert.equal(getSaleErrorMessage(rpcError('expired')), 'This request has expired.');
  assert.equal(getSaleErrorMessage(rpcError('invalid_user')), 'That member cannot be picked for this sale.');
  assert.equal(getSaleErrorMessage(rpcError('forbidden')), 'Only the seller can do that.');
  assert.equal(getSaleErrorMessage(rpcError('not_found')), 'This listing or request is no longer available.');
});

test('getSaleErrorMessage reuses the shared wording; returns keep their own texts', () => {
  assert.equal(getSaleErrorMessage(rpcError('rate_limited')), getErrorMessage(rpcError('rate_limited')));
  assert.equal(getSaleErrorMessage(rpcError('suspended')), 'This account is suspended for now. Try again later.');
  assert.equal(getSaleErrorMessage(new TypeError('Network request failed')), 'No connection. Check your internet and try again.');
  assert.equal(getSaleErrorMessage(new Error('boom')), 'Something went wrong. Please try again.');
  assert.equal(getReturnErrorMessage(rpcError('not_commenter')), 'That member has not commented on this post.');
  assert.equal(getErrorMessage(rpcError('free_item')), 'Something went wrong. Please try again.');
});
