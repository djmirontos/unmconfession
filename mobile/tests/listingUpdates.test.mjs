// Run with: npm run test:listingupdates  (Node 22.6+ strips the TypeScript types of the import)
// The Feed's "new listings" banners: markers, seeding, dismiss, the visit rule, account isolation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { test } from 'node:test';

register('./aliasHook.mjs', import.meta.url);
const L = await import('../lib/listingUpdates.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Server marks keep microseconds; they are stored and sent back exactly as received.
const M1 = '2026-11-03T08:00:00.123456+00:00';
const M2 = '2026-11-03T09:00:00.654321+00:00';
const M3 = '2026-11-03T10:00:00.000001+00:00';
const row = (section, new_count, mark) => ({ section, new_count, mark });

/** In-memory storage whose reads and writes complete only when released, in any order. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const pending = [];
  const writes = [];
  return {
    data,
    writes,
    pending,
    storage: {
      read: (key) =>
        new Promise((resolve) => pending.push({ kind: 'read', run: () => resolve({ ...(data.get(key) ?? {}) }) })),
      write: (key, markers) =>
        new Promise((resolve) =>
          pending.push({
            kind: 'write',
            run: () => {
              data.set(key, markers);
              writes.push([key, markers]);
              resolve();
            },
          }),
        ),
    },
    /** Completes every pending operation, oldest first (completing one can start the next). */
    async drain() {
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 0));
        if (pending.length) pending.shift().run();
      }
    },
  };
}

// ---------------------------------------------------------------- wording and parsing

test('wording: singular, plural, 99+', () => {
  assert.equal(L.newListingsLabel(1), '1 new listing');
  assert.equal(L.newListingsLabel(2), '2 new listings');
  assert.equal(L.newListingsLabel(99), '99 new listings');
  assert.equal(L.newListingsLabel(100), '99+ new listings');
  assert.equal(L.newListingsLabel(5000), '99+ new listings');
  assert.equal(L.bannerText('sell', 1), 'New in Buy & Sell · 1 new listing');
  assert.equal(L.bannerText('lost_found', 3), 'New in Lost & Found · 3 new listings');
});

test('parse: the two known sections; unknown sections and malformed rows are dropped', () => {
  assert.deepEqual(L.parseUpdates([row('sell', 2, M1), row('lost_found', 0, M1)]), {
    sell: { count: 2, mark: M1 },
    lost_found: { count: 0, mark: M1 },
  });
  const messy = [row('jobs', 4, M1), row('sell', -1, M1), row('sell', 1.5, M1), row('lost_found', 2, 'yesterday'), null, 'x', row('sell', '3', M1)];
  assert.deepEqual(L.parseUpdates(messy), {});
  assert.deepEqual(L.parseUpdates(null), {});
});

test('a section missing from the answer gets no count and is not seeded', () => {
  const { shown, seeds } = L.readCounts({}, L.parseUpdates([row('sell', 0, M1)]));
  assert.deepEqual(shown, { sell: { count: 0, mark: M1 } });
  assert.deepEqual(seeds, [['sell', M1]]);
  assert.equal('lost_found' in shown, false);
});

test('since arguments: stored strings sent verbatim, a missing marker left out (null = seed)', () => {
  assert.deepEqual(L.sinceArgs({ sell: M1 }), { p_since_sell: M1 });
  assert.deepEqual(L.sinceArgs({ sell: M1, lost_found: M2 }), { p_since_sell: M1, p_since_lost_found: M2 });
  assert.deepEqual(L.sinceArgs({}), {});
});

// ---------------------------------------------------------------- seed

test('seed: a section without a marker shows nothing and its mark is stored; the other section is untouched', () => {
  const sent = { lost_found: M1 };
  const { shown, seeds } = L.readCounts(sent, L.parseUpdates([row('sell', 7, M2), row('lost_found', 3, M2)]));
  assert.deepEqual(shown.sell, { count: 0, mark: M2 });
  assert.deepEqual(shown.lost_found, { count: 3, mark: M2 });
  assert.deepEqual(seeds, [['sell', M2]]);
});

// ---------------------------------------------------------------- advance-only

test('laterMark: newer wins, older and ties keep the stored string exactly', () => {
  assert.equal(L.laterMark(undefined, M1), M1);
  assert.equal(L.laterMark(M1, M2), M2);
  assert.equal(L.laterMark(M2, M1), M2);
  // Same instant written differently: the stored string stays.
  assert.equal(L.laterMark('2026-11-03T09:00:00.654321+00:00', '2026-11-03T09:00:00.654321Z'), '2026-11-03T09:00:00.654321+00:00');
  assert.equal(L.laterMark(M1, 'not a date'), M1);
});

test('advance: an older mark never overwrites a newer one', async () => {
  const fake = fakeStorage();
  const store = L.createMarkerStore(fake.storage);
  const h = store.hydrate('u1');
  await fake.drain();
  await h;
  assert.equal(store.advance('u1', 'sell', M2), true);
  assert.equal(store.advance('u1', 'sell', M1), false);
  assert.equal(store.get('u1').sell, M2);
  await fake.drain();
  await store.flush('u1');
  assert.deepEqual(fake.data.get('u1'), { sell: M2 });
});

test('the write queue is serialized: a later write can never land before an earlier one', async () => {
  const fake = fakeStorage();
  const store = L.createMarkerStore(fake.storage);
  const h = store.hydrate('u1');
  await fake.drain();
  await h;
  store.advance('u1', 'sell', M1);
  store.advance('u1', 'sell', M3);
  // Only one write is in flight at a time (the second starts after the first finishes).
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fake.pending.filter((p) => p.kind === 'write').length, 1);
  await fake.drain();
  await store.flush('u1');
  assert.deepEqual(fake.writes.map(([, m]) => m.sell), [M1, M3]);
  assert.deepEqual(fake.data.get('u1'), { sell: M3 });
});

test('out-of-order completion of count answers cannot move a marker back', async () => {
  const fake = fakeStorage();
  const store = L.createMarkerStore(fake.storage);
  const h = store.hydrate('u1');
  await fake.drain();
  await h;
  // A dismissal at M3, then an older answer (seed at M1) arriving late.
  store.advance('u1', 'lost_found', M3);
  store.advance('u1', 'lost_found', M1);
  await fake.drain();
  await store.flush('u1');
  assert.equal(fake.data.get('u1').lost_found, M3);
});

// ---------------------------------------------------------------- hydration

test('hydration: the stored marker is read first and is never replaced by a seed', async () => {
  const fake = fakeStorage({ u1: { sell: M1, lost_found: M1 } });
  const store = L.createMarkerStore(fake.storage);
  const h = store.hydrate('u1');
  assert.equal(store.isHydrated('u1'), false);
  await fake.drain();
  await h;
  const sent = store.get('u1');
  assert.deepEqual(L.sinceArgs(sent), { p_since_sell: M1, p_since_lost_found: M1 });
  // So the answer counts instead of seeding.
  const { seeds } = L.readCounts(sent, L.parseUpdates([row('sell', 2, M2), row('lost_found', 0, M2)]));
  assert.deepEqual(seeds, []);
});

test('advance before the storage read waits for it, so the other stored section survives', async () => {
  const fake = fakeStorage({ u1: { sell: M1, lost_found: M1 } });
  const store = L.createMarkerStore(fake.storage);
  assert.equal(store.advance('u1', 'lost_found', M2), false); // deferred until read
  await fake.drain();
  await store.flush('u1');
  assert.deepEqual(fake.data.get('u1'), { sell: M1, lost_found: M2 });
});

test('a failed storage read is not "no markers": hydrate rejects and nothing is written', async () => {
  let fail = true;
  const data = new Map([['u1', { sell: M1 }]]);
  const writes = [];
  const store = L.createMarkerStore({
    read: async (key) => {
      if (fail) throw new Error('storage');
      return data.get(key) ?? {};
    },
    write: async (key, m) => {
      writes.push([key, m]);
      data.set(key, m);
    },
  });
  await assert.rejects(store.hydrate('u1'));
  store.advance('u1', 'lost_found', M2);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(writes, []);
  // Retried next time.
  fail = false;
  await store.hydrate('u1');
  assert.deepEqual(store.get('u1'), { sell: M1 });
});

// ---------------------------------------------------------------- account isolation

test('guest and member markers are separate; signing in starts with that account own markers', async () => {
  const fake = fakeStorage({ guest: { sell: M3 } });
  const store = L.createMarkerStore(fake.storage);
  assert.equal(L.accountKeyOf(null), 'guest');
  assert.equal(L.accountKeyOf('u1'), 'u1');
  const g = store.hydrate('guest');
  const m = store.hydrate('u1');
  await fake.drain();
  await Promise.all([g, m]);
  assert.deepEqual(store.get('guest'), { sell: M3 });
  // The member has no markers of their own yet: their first count seeds, never uses the guest's.
  assert.deepEqual(L.sinceArgs(store.get('u1')), {});
});

test('reset (sign-out) drops the in-memory copies but keeps the stored markers', async () => {
  const fake = fakeStorage();
  const store = L.createMarkerStore(fake.storage);
  const h = store.hydrate('u1');
  await fake.drain();
  await h;
  store.advance('u1', 'sell', M2);
  store.reset();
  assert.equal(store.isHydrated('u1'), false);
  await fake.drain();
  await store.flush('u1');
  // The dismissal made before signing out is still stored, and read back on the next sign-in.
  const again = store.hydrate('u1');
  await fake.drain();
  await again;
  assert.equal(store.get('u1').sell, M2);
});

test('forget (account deleted) drops the copy and the queued writes', async () => {
  const fake = fakeStorage();
  const store = L.createMarkerStore(fake.storage);
  const h = store.hydrate('u1');
  await fake.drain();
  await h;
  store.advance('u1', 'sell', M1);
  store.advance('u1', 'sell', M2);
  // The first write is in flight; the second waits in the queue.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fake.pending.filter((p) => p.kind === 'write').length, 1);
  store.forget('u1');
  await fake.drain();
  await store.flush('u1');
  assert.deepEqual(fake.writes.map(([, m]) => m.sell), [M1]);
  assert.equal(store.isHydrated('u1'), false);
});

test('guards: no count call before the session is read or while the membership loads', () => {
  assert.equal(L.canQueryUpdates(false, 'guest'), false);
  assert.equal(L.canQueryUpdates(true, 'loading'), false);
  assert.equal(L.canQueryUpdates(true, 'guest'), true);
  assert.equal(L.canQueryUpdates(true, 'member'), true);
  assert.equal(L.canQueryUpdates(true, 'needs-nickname'), true);
});

// ---------------------------------------------------------------- dismiss

test('dismiss hides only that section and keeps the displayed mark', () => {
  const shown = { sell: { count: 3, mark: M1 }, lost_found: { count: 2, mark: M1 } };
  const after = L.clearShown(shown, 'sell');
  assert.deepEqual(after, { sell: { count: 0, mark: M1 }, lost_found: { count: 2, mark: M1 } });
  assert.equal(L.clearShown(after, 'sell'), after);
  assert.equal(L.clearShown(undefined, 'sell'), undefined);
});

test('dismiss stores the mark of the count on screen, not a newer one', () => {
  const src = read('../lib/listingUpdatesSync.ts');
  const fn = src.slice(src.indexOf('export function dismissListingUpdate'), src.indexOf('/** Visit step a'));
  assert.match(fn, /markers\.advance\(accountKey, section, shown\.mark\)/);
  assert.doesNotMatch(fn, /Date\.now|new Date|fetch/);
});

// ---------------------------------------------------------------- visit

const ok = (at) => ({ status: 'success', isError: false, isPlaceholderData: false, dataUpdatedAt: at });

function visitHarness(over = {}) {
  let key = 'u1';
  let clock = 1000;
  const calls = { fresh: 0, refetch: 0, commits: [] };
  const deps = {
    section: 'sell',
    currentKey: () => key,
    freshUpdates: async () => {
      calls.fresh++;
      return { sell: { count: 2, mark: M2 } };
    },
    refetchList: async () => {
      calls.refetch++;
      clock += 10;
      return ok(clock);
    },
    filters: () => ({ search: '', lostFoundType: 'all' }),
    commit: (k, section, mark) => calls.commits.push([k, section, mark]),
    now: () => clock,
    ...over,
  };
  return { deps, calls, setKey: (k) => (key = k), tick: (n) => (clock += n) };
}

test('visit: a positive count commits its own mark after a fresh, successful refetch', async () => {
  const h = visitHarness();
  assert.equal(await L.runVisit(h.deps), 'committed');
  assert.deepEqual(h.calls, { fresh: 1, refetch: 1, commits: [['u1', 'sell', M2]] });
});

test('visit: a zero count clears nothing and does not refetch the list', async () => {
  const h = visitHarness({ freshUpdates: async () => ({ sell: { count: 0, mark: M2 } }) });
  assert.equal(await L.runVisit(h.deps), 'nothing');
  assert.equal(h.calls.refetch, 0);
  assert.deepEqual(h.calls.commits, []);
});

test('visit: a failed count call clears nothing; pull to refresh still reloads the list', async () => {
  const h = visitHarness({ freshUpdates: async () => null });
  assert.equal(await L.runVisit(h.deps), 'nothing');
  assert.equal(h.calls.refetch, 0);
  const pull = visitHarness({ freshUpdates: async () => null, alwaysRefetch: true });
  assert.equal(await L.runVisit(pull.deps), 'nothing');
  assert.equal(pull.calls.refetch, 1);
  assert.deepEqual(pull.calls.commits, []);
});

test('visit: cached data (dataUpdatedAt not after the start) does not commit', async () => {
  const h = visitHarness({ refetchList: async () => ok(500) });
  assert.equal(await L.runVisit(h.deps), 'not-committed');
  const same = visitHarness();
  same.deps.refetchList = async () => ok(1000); // equal to the start, not later
  assert.equal(await L.runVisit(same.deps), 'not-committed');
});

test('visit: a failed, errored, placeholder or cancelled refetch does not commit', async () => {
  for (const result of [
    { status: 'error', isError: true, dataUpdatedAt: 9999 },
    { status: 'success', isError: true, dataUpdatedAt: 9999 },
    { status: 'success', isError: false, isPlaceholderData: true, dataUpdatedAt: 9999 },
    { status: 'pending', isError: false, dataUpdatedAt: 0 },
  ]) {
    const h = visitHarness({ refetchList: async () => result });
    assert.equal(await L.runVisit(h.deps), 'not-committed', JSON.stringify(result));
  }
  const thrown = visitHarness({
    refetchList: async () => {
      throw new Error('cancelled');
    },
  });
  assert.equal(await L.runVisit(thrown.deps), 'not-committed');
});

test('visit: search text or a Lost/Found type filter does not commit; hide-closed does not matter', async () => {
  for (const filters of [{ search: 'bike', lostFoundType: 'all' }, { search: '', lostFoundType: 'lost' }, { search: '', lostFoundType: 'found' }]) {
    const h = visitHarness({ filters: () => filters });
    assert.equal(await L.runVisit(h.deps), 'not-committed', JSON.stringify(filters));
  }
  // Whitespace-only search counts as empty.
  const spaces = visitHarness({ filters: () => ({ search: '   ', lostFoundType: 'all' }) });
  assert.equal(await L.runVisit(spaces.deps), 'committed');
  // The hide-sold toggle is not an input at all.
  assert.equal(L.shouldCommitVisit.toString().includes('hideClosed'), false);
});

test('visit: an account change during the load discards it', async () => {
  const h = visitHarness();
  h.deps.refetchList = async () => {
    h.setKey('u2');
    return ok(5000);
  };
  assert.equal(await L.runVisit(h.deps), 'not-committed');
  const out = visitHarness();
  out.deps.refetchList = async () => {
    out.setKey('guest');
    return ok(5000);
  };
  assert.equal(await L.runVisit(out.deps), 'not-committed');
  assert.deepEqual(out.calls.commits, []);
});

test('visit: the mark is taken before the list load starts', async () => {
  const order = [];
  const h = visitHarness({
    freshUpdates: async () => {
      order.push('mark');
      return { sell: { count: 1, mark: M1 } };
    },
  });
  const refetch = h.deps.refetchList;
  h.deps.refetchList = async () => {
    order.push('load');
    return refetch();
  };
  await L.runVisit(h.deps);
  assert.deepEqual(order, ['mark', 'load']);
  assert.deepEqual(h.calls.commits, [['u1', 'sell', M1]]);
});

// ---------------------------------------------------------------- count answers after an account change

test('a count answer for account A is thrown away after switching to B or signing out', () => {
  const src = read('../lib/listingUpdatesSync.ts');
  const fn = src.slice(src.indexOf('export async function fetchListingUpdates'), src.indexOf('function hideSection'));
  // The check comes after the call and before any seed is stored.
  const check = fn.indexOf('if (currentAccountKey() !== accountKey) throw');
  assert.ok(check > fn.indexOf("supabase.rpc('get_listing_updates'"));
  assert.ok(check < fn.indexOf('markers.advance'));
  assert.ok(fn.indexOf('await markers.hydrate(accountKey)') < fn.indexOf("supabase.rpc('get_listing_updates'"));
});

// ---------------------------------------------------------------- structure (source scans)

test('banner: body and × are sibling Pressables; the × is a 44 px button that does not navigate', () => {
  const src = read('../components/feed/ListingUpdateBanners.tsx');
  const body = src.indexOf('<Pressable');
  const bodyEnd = src.indexOf('</Pressable>', body);
  const close = src.indexOf('<Pressable', bodyEnd);
  assert.ok(body > 0 && bodyEnd > body && close > bodyEnd, 'the close Pressable starts after the body closes');
  const closeBlock = src.slice(close, src.indexOf('</Pressable>', close));
  assert.match(closeBlock, /accessibilityRole="button"/);
  assert.match(closeBlock, /h-11 w-11|hitSlop/);
  assert.match(closeBlock, /Dismiss \$\{title\} updates/);
  assert.doesNotMatch(closeBlock, /router|navigate|requestSegment/);
  // The body names the count for screen readers and is the only one that navigates.
  assert.match(src.slice(body, bodyEnd), /accessibilityLabel=\{`New in \$\{title\}, \$\{newListingsLabel\(banner\.count\)\}`\}/);
  assert.match(src, /pricetag-outline/);
  assert.match(src, /search-outline/);
});

test('clearMemberCaches keeps its for loop first and resets the banners after it', () => {
  const auth = read('../lib/auth.ts');
  const fn = auth.slice(auth.indexOf('export function clearMemberCaches() {'), auth.indexOf('const REVOKE_TIMEOUT_MS'));
  assert.match(fn, /^export function clearMemberCaches\(\) \{\s*for \(const key of \[/);
  assert.ok(fn.indexOf("queryClient.removeQueries({ queryKey: ['listing-updates'] })") > fn.indexOf('for (const key of'));
  assert.match(fn, /resetListingUpdates\(\)/);
  const forget = auth.slice(auth.indexOf('export async function forgetDeletedAccount'));
  assert.match(forget, /forgetListingUpdates\(userId\)/);
});

test('the storage key contains the account id, so account deletion removes it', async () => {
  const { listingUpdatesStorageKey } = await import('../lib/listingUpdatesStorage.ts').catch(() => ({ listingUpdatesStorageKey: null }));
  const src = read('../lib/listingUpdatesStorage.ts');
  assert.match(src, /`unm-listing-updates:\$\{accountKey\}`/);
  if (listingUpdatesStorageKey) assert.ok(listingUpdatesStorageKey('abc-123').includes('abc-123'));
  // forgetDeletedAccount removes every stored key that contains the user id.
  assert.match(read('../lib/auth.ts'), /keys\.filter\(\(k\) => k\.includes\(userId\)\)/);
});

test('the banners are mounted in the Feed list only', async () => {
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const users = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && readFileSync(p, 'utf8').includes('<ListingUpdateBanners')) users.push(e.name);
    }
  };
  for (const d of ['app', 'components']) walk(join(root, d));
  assert.deepEqual(users, ['FeedList.tsx']);
});
