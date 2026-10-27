import { formatExact } from '@/lib/format';

// Manila has no daylight saving time: always UTC+8.
const MANILA_OFFSET = '+08:00';
const DAY = 24 * 60 * 60 * 1000;

export const SUSPENSION_PRESETS = [
  { value: '1d', label: '1 day', days: 1 },
  { value: '3d', label: '3 days', days: 3 },
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
] as const;

export type PresetValue = (typeof SUSPENSION_PRESETS)[number]['value'];

export function presetUntil(value: PresetValue, now = Date.now()): string {
  const preset = SUSPENSION_PRESETS.find((p) => p.value === value);
  if (!preset) throw new Error('Unknown preset');
  return new Date(now + preset.days * DAY).toISOString();
}

/**
 * A datetime-local value typed in Manila time ("2026-11-01T14:30") as a UTC ISO string,
 * or null if it is malformed.
 */
export function manilaLocalToUtc(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const date = new Date(`${local.length === 16 ? `${local}:00` : local}${MANILA_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isFuture(iso: string, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t > now;
}

/** Status line for an account: a past end date reads "Suspension ended". */
export function suspensionLabel(status: string, until: string | null, now = Date.now()): string | null {
  if (status !== 'suspended') return null;
  if (until === null) return 'Suspended (no end date)';
  return new Date(until).getTime() > now ? `Suspended until ${formatExact(until)}` : 'Suspension ended';
}
