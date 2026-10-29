// "Who reacted" sheet (Module 14). No imports, so tests/reactors.test.mjs runs it in Node.

export const REACTORS_PAGE_SIZE = 30;

export type ReactorTabKey<T extends string> = 'all' | T;
export type ReactorTab<T extends string> = { key: ReactorTabKey<T>; total: number };

/** All (the sum) first, then one tab per type with reactions, in the order the server returned them. */
export function buildReactorTabs<T extends string>(counts: readonly { type: T; total: number }[]): ReactorTab<T>[] {
  const types = counts.filter((c) => c.total > 0);
  const all = types.reduce((sum, c) => sum + c.total, 0);
  return [{ key: 'all', total: all }, ...types.map((c) => ({ key: c.type, total: c.total }))];
}

export type ReactorsCursor = { before_ts: string; before_user: string };

/** The keyset cursor after a page: the last row's (reacted_at, user_id), or null when the page was not full. */
export function nextCursor(
  page: readonly { reacted_at: string; user_id: string }[],
  pageSize = REACTORS_PAGE_SIZE,
): ReactorsCursor | null {
  const last = page[page.length - 1];
  return page.length >= pageSize && last ? { before_ts: last.reacted_at, before_user: last.user_id } : null;
}

/** The name on a row: "You" for my own. */
export function reactorLabel(row: { user_id: string; nickname: string }, viewerId: string | null): string {
  return row.user_id === viewerId ? 'You' : row.nickname;
}

/** Screen-reader label of a row. */
export function reactorAccessibilityLabel(name: string, reaction: string): string {
  return `${name} reacted ${reaction}. View profile`;
}
