/**
 * Per-key "latest value wins" sender. While a request for a key is running,
 * only the most recent wanted value is kept and sent once the current one
 * finishes; a value equal to the last confirmed one is not sent again.
 * State lives only for one burst: it starts from the caller's current value
 * and is dropped when the key goes idle, so later changes elsewhere are respected.
 */
export function createLatestOnlyQueue<V>(
  send: (key: string, value: V) => Promise<void>,
  onError: (key: string, error: unknown, lastConfirmed: V) => void,
) {
  const confirmed = new Map<string, V>();
  const wanted = new Map<string, V>();
  const running = new Set<string>();

  async function drain(key: string): Promise<void> {
    running.add(key);
    try {
      while (wanted.has(key)) {
        const target = wanted.get(key) as V;
        wanted.delete(key);
        if (Object.is(confirmed.get(key), target)) continue;
        await send(key, target);
        confirmed.set(key, target);
      }
    } catch (error) {
      wanted.delete(key);
      onError(key, error, confirmed.get(key) as V);
    } finally {
      running.delete(key);
      confirmed.delete(key);
    }
  }

  /** `current` is the value before this change (used only when the key is idle). */
  return function push(key: string, current: V, next: V): Promise<void> | undefined {
    wanted.set(key, next);
    if (running.has(key)) return undefined;
    confirmed.set(key, current);
    return drain(key);
  };
}
