export type RequiredField<K extends string> = {
  key: K;
  /** Plain name shown in "Still needed: …". */
  label: string;
  /** Defaults to "blank string, empty array, or nothing". */
  isEmpty?: (value: unknown) => boolean;
};

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.every(isBlank);
  return false;
}

/**
 * Required fields that are still empty, in form order. Uses the schema's errors
 * (no second copy of the rules): a field is listed only when validation flags
 * it AND it is empty. Filled-but-invalid fields keep their inline error instead.
 */
export function missingFields<K extends string>(
  fields: readonly RequiredField<K>[],
  values: { [P in K]: unknown },
  errors: Partial<Record<K, string>>,
): string[] {
  return fields
    .filter((f) => errors[f.key] !== undefined && (f.isEmpty ?? isBlank)(values[f.key]))
    .map((f) => f.label);
}
