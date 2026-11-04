// "New listings" banners on the Feed (v1.0.4). Pure, no React and no imports (tests/listingUpdates.test.mjs).
//
// What a member has already looked at is a MARKER per section, kept only on the phone, one record
// per account key (the user id, or "guest"). Markers are the server's own mark strings, stored and
// sent back verbatim (Date.parse is used only to compare them), and they only ever move forward.
// get_listing_updates counts listings first published in (marker, mark]; a section without a
// marker is SEEDED: its mark is stored and nothing is shown.

export const LISTING_SECTIONS = ['sell', 'lost_found'] as const;
export type ListingSection = (typeof LISTING_SECTIONS)[number];

export const GUEST_ACCOUNT = 'guest';
/** The account a marker record belongs to: the signed-in user id, or "guest". */
export const accountKeyOf = (userId: string | null | undefined): string => userId || GUEST_ACCOUNT;

export type Markers = Partial<Record<ListingSection, string>>;
/** One section's answer: how many are new in the window, and the window's end. */
export type SectionUpdate = { count: number; mark: string };
export type ListingUpdates = Partial<Record<ListingSection, SectionUpdate>>;

const isSection = (value: unknown): value is ListingSection => value === 'sell' || value === 'lost_found';
const validMark = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

// ---------------------------------------------------------------- wording

export const SECTION_TITLE: Record<ListingSection, string> = { sell: 'Buy & Sell', lost_found: 'Lost & Found' };

/** "1 new listing", "12 new listings", "99+ new listings" (100 or more). */
export function newListingsLabel(count: number): string {
  if (count >= 100) return '99+ new listings';
  return `${count} new ${count === 1 ? 'listing' : 'listings'}`;
}

/** "New in Buy & Sell · 3 new listings". */
export const bannerText = (section: ListingSection, count: number) => `New in ${SECTION_TITLE[section]} · ${newListingsLabel(count)}`;

// ---------------------------------------------------------------- parsing the RPC

/** get_listing_updates rows: the two known sections only; unknown sections and malformed rows are dropped. */
export function parseUpdates(rows: unknown): ListingUpdates {
  const out: ListingUpdates = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const count = r.new_count;
    if (!isSection(r.section) || !validMark(r.mark)) continue;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) continue;
    out[r.section] = { count, mark: r.mark };
  }
  return out;
}

/** RPC arguments: the stored strings as they are; a missing marker is left out (null = seed). */
export function sinceArgs(markers: Markers): { p_since_sell?: string; p_since_lost_found?: string } {
  return {
    ...(markers.sell !== undefined ? { p_since_sell: markers.sell } : {}),
    ...(markers.lost_found !== undefined ? { p_since_lost_found: markers.lost_found } : {}),
  };
}

// ---------------------------------------------------------------- marker rules

/** The later of two marks; ties (and an unparseable new one) keep the stored one. */
export function laterMark(stored: string | undefined, next: string): string {
  if (stored === undefined) return next;
  if (!validMark(next)) return stored;
  return Date.parse(next) > Date.parse(stored) ? next : stored;
}

/** No count call before the stored session is read and the membership is known (a member would look like a guest). */
export const canQueryUpdates = (restored: boolean, membershipStatus: string): boolean =>
  restored && membershipStatus !== 'loading';

/**
 * A count answer for the markers that were sent: sections that had a marker show their count;
 * sections without one are seeded (their mark stored, count 0). A section missing from the answer
 * shows nothing and is NOT seeded.
 */
export function readCounts(sent: Markers, updates: ListingUpdates): { shown: ListingUpdates; seeds: [ListingSection, string][] } {
  const shown: ListingUpdates = {};
  const seeds: [ListingSection, string][] = [];
  for (const section of LISTING_SECTIONS) {
    const update = updates[section];
    if (!update) continue;
    if (sent[section] === undefined) {
      seeds.push([section, update.mark]);
      shown[section] = { count: 0, mark: update.mark };
    } else {
      shown[section] = update;
    }
  }
  return { shown, seeds };
}

/** After a dismiss or a visit: that section shows 0 until the next count (same mark). */
export function clearShown(updates: ListingUpdates | undefined, section: ListingSection): ListingUpdates | undefined {
  const current = updates?.[section];
  if (!updates || !current || current.count === 0) return updates;
  return { ...updates, [section]: { ...current, count: 0 } };
}

// ---------------------------------------------------------------- visiting a section

export type ListRefetchResult = { status: string; isError: boolean; isPlaceholderData?: boolean; dataUpdatedAt: number };

/**
 * Opening a section clears its banner only after a fresh, successful load of the default list:
 * a refetch that finished after it started, no search text, the Lost & Found type "all" (the
 * hide-sold toggle does not matter: only open listings are counted), and the same account.
 */
export function shouldCommitVisit(input: {
  startedAt: number;
  result: ListRefetchResult;
  search: string;
  lostFoundType: string;
  startedKey: string;
  currentKey: string;
}): boolean {
  const { startedAt, result, search, lostFoundType, startedKey, currentKey } = input;
  if (startedKey !== currentKey) return false;
  if (result.status !== 'success' || result.isError || result.isPlaceholderData) return false;
  if (!(result.dataUpdatedAt > startedAt)) return false;
  return search.trim() === '' && lostFoundType === 'all';
}

export type VisitDeps = {
  section: ListingSection;
  /** The current account key, read at the moment it is called. */
  currentKey: () => string;
  /** A count that is not older than its stale time (refetched first if it is); null on failure. */
  freshUpdates: (key: string) => Promise<ListingUpdates | null>;
  /** A forced network refetch of the section's list. */
  refetchList: () => Promise<ListRefetchResult>;
  /** The section's current search text and Lost & Found type ("all" for Buy & Sell). */
  filters: () => { search: string; lostFoundType: string };
  commit: (key: string, section: ListingSection, mark: string) => void;
  now: () => number;
  /** Pull to refresh: the list is refetched even when there is nothing to clear. */
  alwaysRefetch?: boolean;
};

/** a. fresh count (its mark), b. nothing new: stop, c. refetch the list, d. commit only on a fresh success. */
export async function runVisit(deps: VisitDeps): Promise<'committed' | 'nothing' | 'not-committed'> {
  const key = deps.currentKey();
  const updates = await deps.freshUpdates(key).catch(() => null);
  const update = updates?.[deps.section];
  const pending = update !== undefined && update.count > 0;
  if (!pending) {
    if (deps.alwaysRefetch) await deps.refetchList().catch(() => undefined);
    return 'nothing';
  }
  const startedAt = deps.now();
  let result: ListRefetchResult;
  try {
    result = await deps.refetchList();
  } catch {
    return 'not-committed';
  }
  const { search, lostFoundType } = deps.filters();
  if (!shouldCommitVisit({ startedAt, result, search, lostFoundType, startedKey: key, currentKey: deps.currentKey() })) {
    return 'not-committed';
  }
  deps.commit(key, deps.section, update.mark);
  return 'committed';
}

// ---------------------------------------------------------------- the marker store

export type MarkerStorage = {
  read: (key: string) => Promise<Markers>;
  write: (key: string, markers: Markers) => Promise<void>;
};

/**
 * In-memory markers per account key (the source of truth), hydrated once from storage, advanced
 * synchronously with max(), and persisted through one serialized write queue per key so a write
 * that started earlier can never land after a newer one.
 */
export function createMarkerStore(storage: MarkerStorage) {
  const memory = new Map<string, Markers>();
  const hydrations = new Map<string, Promise<void>>();
  const queues = new Map<string, Promise<void>>();
  // Bumped when an account's markers are forgotten (deleted account): its queued writes are dropped.
  const epochs = new Map<string, number>();

  const epochOf = (key: string) => epochs.get(key) ?? 0;

  function hydrate(key: string): Promise<void> {
    let pending = hydrations.get(key);
    if (!pending) {
      // After any write still queued for this key, so a fresh read never misses it.
      const epoch = epochOf(key);
      // A failed read rejects (and is retried next time): unknown is never treated as "no markers".
      pending = (queues.get(key) ?? Promise.resolve())
        .then(() => storage.read(key))
        .catch((error: unknown) => {
          if (hydrations.get(key) === pending) hydrations.delete(key);
          throw error;
        })
        .then((stored) => {
          if (epochOf(key) !== epoch) return;
          const merged: Markers = { ...stored };
          for (const section of LISTING_SECTIONS) {
            const mem = memory.get(key)?.[section];
            const st = stored[section];
            if (mem !== undefined) merged[section] = laterMark(st, mem);
          }
          memory.set(key, merged);
        });
      hydrations.set(key, pending);
    }
    return pending;
  }

  function persist(key: string): void {
    const snapshot = { ...(memory.get(key) ?? {}) };
    const epoch = epochOf(key);
    const next = (queues.get(key) ?? Promise.resolve()).then(() =>
      epochOf(key) === epoch ? storage.write(key, snapshot).catch(() => undefined) : undefined,
    );
    queues.set(key, next);
  }

  return {
    hydrate,
    /** Only meaningful after hydrate(key) resolved. */
    get: (key: string): Markers => ({ ...(memory.get(key) ?? {}) }),
    isHydrated: (key: string) => memory.has(key),
    /**
     * Moves a marker forward (never back). Not read from storage yet: it is applied right after the
     * read, so a partial record can never overwrite the stored one. Returns true when it changed now.
     */
    advance(key: string, section: ListingSection, mark: string): boolean {
      const apply = (): boolean => {
        const current = memory.get(key) ?? {};
        const next = laterMark(current[section], mark);
        if (next === current[section]) return false;
        memory.set(key, { ...current, [section]: next });
        persist(key);
        return true;
      };
      if (!memory.has(key)) {
        const epoch = epochOf(key);
        // Storage unreadable: nothing is written (the next count seeds or counts from what is stored).
        hydrate(key).then(
          () => {
            if (epochOf(key) === epoch) apply();
          },
          () => undefined,
        );
        return false;
      }
      return apply();
    },
    /** Waits for every queued write of this key (tests, account deletion). */
    flush: (key: string) => queues.get(key) ?? Promise.resolve(),
    /** Sign-out / account switch: forget the in-memory copies; stored markers stay on the phone. */
    reset(): void {
      memory.clear();
      hydrations.clear();
    },
    /** Account deleted: its copy goes and its queued writes are dropped (storage removes the key). */
    forget(key: string): void {
      epochs.set(key, epochOf(key) + 1);
      memory.delete(key);
      hydrations.delete(key);
    },
  };
}

export type MarkerStore = ReturnType<typeof createMarkerStore>;
