// Run with: npm run test:feedviews  (Node 22.6+ strips the TypeScript types of the import)
// The Feed's Latest | Popular | Polls views and the Chats placeholder tab.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const V = await import('../lib/feedViews.ts');
const L = await import('../lib/listingUpdates.ts');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(path, import.meta.url));

// ---------------------------------------------------------------- selector rules

test('three views in order, Latest by default', () => {
  assert.deepEqual(
    V.FEED_VIEWS.map((v) => [v.key, v.label]),
    [
      ['latest', 'Latest'],
      ['popular', 'Popular'],
      ['polls', 'Polls'],
    ],
  );
  assert.equal(V.getLastFeedView(), 'latest');
});

test('the choice is remembered for the session (module state, not a store)', () => {
  V.setLastFeedView('polls');
  assert.equal(V.getLastFeedView(), 'polls');
  V.setLastFeedView('latest');
  assert.equal(V.getLastFeedView(), 'latest');
  assert.doesNotMatch(read('../lib/feedViews.ts'), /zustand|create\(/);
});

test('lazy mounting: Latest always; Popular and Polls only once selected, then they stay', () => {
  let mounted = V.mountedViews(new Set(), 'latest');
  assert.deepEqual([...mounted].sort(), ['latest']);
  mounted = V.mountedViews(mounted, 'popular');
  assert.deepEqual([...mounted].sort(), ['latest', 'popular']);
  // Back to Latest: Popular stays mounted (hidden), Polls is still not mounted.
  mounted = V.mountedViews(mounted, 'latest');
  assert.deepEqual([...mounted].sort(), ['latest', 'popular']);
  mounted = V.mountedViews(mounted, 'polls');
  assert.deepEqual([...mounted].sort(), ['latest', 'polls', 'popular']);
  // Nothing new: the same set object (no re-render).
  assert.equal(V.mountedViews(mounted, 'popular'), mounted);
  // A session that last showed Polls starts with Latest and Polls only.
  assert.deepEqual([...V.mountedViews(new Set(), 'polls')].sort(), ['latest', 'polls']);
});

test('a list is live only while shown, its tab focused and the app open', () => {
  assert.equal(V.listIsLive(true, true, true), true);
  assert.equal(V.listIsLive(true, true, false), false);
  assert.equal(V.listIsLive(true, false, true), false);
  assert.equal(V.listIsLive(false, true, true), false);
});

test('the new-listings count query is disabled when Latest is not active', () => {
  const src = read('../hooks/useListingUpdates.ts');
  assert.match(src, /export function useListingUpdates\(active = true\)/);
  assert.match(src, /const enabled = active && canQueryUpdates\(restored, status\);/);
  // Its other guard is unchanged.
  assert.equal(L.canQueryUpdates(true, 'member'), true);
  assert.equal(L.canQueryUpdates(false, 'member'), false);
});

// ---------------------------------------------------------------- structure (source scans)

test('the selector is pinned outside every list header on the Feed screen', () => {
  const src = read('../app/(tabs)/index.tsx');
  assert.doesNotMatch(src, /ListHeaderComponent/);
  const control = src.indexOf('<SegmentedControl');
  assert.ok(control > src.indexOf('</TabHeader>'), 'right under the header');
  assert.ok(control < src.indexOf('<FeedList'), 'above the lists');
  assert.ok(control < src.indexOf('<PopularList') && control < src.indexOf('<PollsList'));
  // Popular and Polls are mounted lazily; each list gets its active flag.
  assert.match(src, /mounted\.has\('popular'\) \?/);
  assert.match(src, /mounted\.has\('polls'\) \?/);
  assert.match(src, /<FeedList active=\{view === 'latest' && isFocused\} \/>/);
  assert.match(src, /'Nothing popular yet\. React or comment on a post to get things moving\.'/);
  assert.match(src, /'No active polls right now\. Create one from the \+ tab\.'/);
});

test('SegmentedControl is a tab list of 44 pt tabs with the selected state', () => {
  const src = read('../components/ui/SegmentedControl.tsx');
  assert.match(src, /accessibilityRole="tablist"/);
  assert.match(src, /accessibilityRole="tab"/);
  assert.match(src, /accessibilityState=\{\{ selected \}\}/);
  assert.match(src, /min-h-11/);
  assert.match(src, /bg-accent/);
  assert.match(src, /text-on-accent/);
  assert.match(src, /bg-surface2/);
});

test('five tabs in order: Feed, Chats, Create, Buy & Sell, Profile', () => {
  const src = read('../app/(tabs)/_layout.tsx');
  // Chats has two variants (chat on / not on); one screen either way.
  const names = [...new Set([...src.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]))];
  assert.deepEqual(names, ['index', 'chats', 'create', 'market', 'profile']);
  assert.doesNotMatch(src, /name="trending"/);
});

test('Chats while chat is not on: the press is prevented and shows the toast; dimmed, labelled, no badge', () => {
  const src = read('../app/(tabs)/_layout.tsx');
  // The placeholder is the else branch of the one chat gate, unchanged from before.
  assert.match(src, /const chatOn = useChatEnabled\(\)\.enabled;/);
  assert.match(src, /\{chatOn \? \(\s*<Tabs\.Screen\s+name="chats"/);
  const start = src.indexOf('name="chats"', src.indexOf(') : ('));
  const block = src.slice(start, src.indexOf('<Tabs.Screen', start));
  assert.match(src, /const CHATS_COMING_SOON = 'Chats are coming soon';/);
  assert.match(block, /tabPress: \(event\) => \{\s*event\.preventDefault\(\);\s*useToastStore\.getState\(\)\.show\(CHATS_COMING_SOON\);/);
  assert.match(block, /tabBarAccessibilityLabel: 'Chats, coming soon'/);
  assert.match(block, /tabBarItemStyle: \{ opacity: 0\.5 \}/);
  assert.match(block, /chatbubbles-outline/);
  assert.doesNotMatch(block, /tabBarBadge|requireAuth/);
});

test('Chats while chat is on: opens normally, badge = unread chats + requests, nothing dimmed', () => {
  const src = read('../app/(tabs)/_layout.tsx');
  const on = src.slice(src.indexOf('{chatOn ? ('), src.indexOf(') : ('));
  assert.match(on, /tabBarBadge: badge \? formatBadge\(badge\) : undefined/);
  assert.doesNotMatch(on, /preventDefault|opacity|coming soon/);
  assert.match(src, /const badge = chatOn \? chatBadge\(chatUnread\.data\) : undefined;/);
});

test('Create keeps its guest sign-in press and Profile its unread dot', () => {
  const src = read('../app/(tabs)/_layout.tsx');
  const create = src.slice(src.indexOf('name="create"'), src.indexOf('name="market"'));
  assert.match(create, /if \(!requireAuth\('post'\)\) event\.preventDefault\(\);/);
  assert.match(src, /tabBarIcon: ProfileTabIcon/);
  assert.match(src, /unread > 0/);
});

test('chats.tsx keeps its coming-soon empty state (the list only when chat is on); trending.tsx is gone', () => {
  assert.ok(exists('../app/(tabs)/chats.tsx'));
  const chats = read('../app/(tabs)/chats.tsx');
  assert.match(chats, /\{chatOn \? <ChatList \/> : <EmptyState icon="chatbubbles-outline" title="Chats are coming soon" \/>\}/);
  assert.doesNotMatch(chats, /useQuery|supabase/);
  assert.equal(exists('../app/(tabs)/trending.tsx'), false);
});

test("FeedList's timer and focus refetch are gated on active", () => {
  const src = read('../components/feed/FeedList.tsx');
  assert.match(src, /usePostCountsRefresh\(\(\) => visibleIds\.current, listIsLive\(appActive, isFocused, active\)\);/);
  assert.match(src, /useRefetchWhenStale\(announcementQuery, active\);/);
  assert.match(src, /useListingUpdates\(active\)/);
  assert.match(src, /maintainVisibleContentPosition=\{KEEP_POSITION\}/);
});

test('ChipGroup and the Market tab are untouched by the new control', () => {
  assert.doesNotMatch(read('../components/ui/ChipGroup.tsx'), /tablist|SegmentedControl/);
  const market = read('../app/(tabs)/market.tsx');
  assert.match(market, /<ChipGroup options=\{SEGMENTS\}/);
  assert.doesNotMatch(market, /SegmentedControl/);
});
