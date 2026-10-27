/** A URL query with the given parameters removed and everything else kept ("Clear" in a filter sheet). */
export function withoutParams(query: string, names: readonly string[]): string {
  const params = new URLSearchParams(query);
  for (const name of names) params.delete(name);
  return params.toString();
}
