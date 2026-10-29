// Run with: npm run test:reactors  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildReactorTabs, nextCursor, REACTORS_PAGE_SIZE, reactorAccessibilityLabel, reactorLabel } from '../lib/reactors.ts';

const ME = '3f1c2a9e-7b6d-4e21-9a0b-5c4d3e2f1a0b';
const OTHER = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';

test('buildReactorTabs puts All first with the sum, then the types in server order', () => {
  assert.deepEqual(
    buildReactorTabs([
      { type: 'love', total: 5 },
      { type: 'like', total: 3 },
      { type: 'haha', total: 1 },
    ]),
    [
      { key: 'all', total: 9 },
      { key: 'love', total: 5 },
      { key: 'like', total: 3 },
      { key: 'haha', total: 1 },
    ],
  );
});

test('buildReactorTabs leaves out empty types and keeps All at zero', () => {
  assert.deepEqual(buildReactorTabs([{ type: 'wow', total: 0 }]), [{ key: 'all', total: 0 }]);
  assert.deepEqual(buildReactorTabs([]), [{ key: 'all', total: 0 }]);
});

test('nextCursor uses the last row of a full page', () => {
  const page = Array.from({ length: REACTORS_PAGE_SIZE }, (_, i) => ({ reacted_at: `2026-10-29T10:${String(59 - i).padStart(2, '0')}:00Z`, user_id: OTHER }));
  page[page.length - 1] = { reacted_at: '2026-10-29T09:00:00.123456+00:00', user_id: ME };
  assert.deepEqual(nextCursor(page), { before_ts: '2026-10-29T09:00:00.123456+00:00', before_user: ME });
});

test('nextCursor is null for a short or empty page', () => {
  assert.equal(nextCursor([{ reacted_at: '2026-10-29T09:00:00Z', user_id: ME }]), null);
  assert.equal(nextCursor([]), null);
  assert.deepEqual(nextCursor([{ reacted_at: 't', user_id: ME }], 1), { before_ts: 't', before_user: ME });
});

test('reactorLabel says You for my own row', () => {
  assert.equal(reactorLabel({ user_id: ME, nickname: 'juan.dc' }, ME), 'You');
  assert.equal(reactorLabel({ user_id: OTHER, nickname: 'maria' }, ME), 'maria');
  assert.equal(reactorLabel({ user_id: OTHER, nickname: 'maria' }, null), 'maria');
});

test('reactorAccessibilityLabel', () => {
  assert.equal(reactorAccessibilityLabel('maria', 'Love'), 'maria reacted Love. View profile');
});
