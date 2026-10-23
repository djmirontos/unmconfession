import type { Condition } from '@/lib/createSchemas';

export const CONDITION_LABELS: Record<Condition, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const peso = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 });

/** 1250.5 -> "₱1,250.5"; 0 -> "Free". */
export function formatPrice(value: number): string {
  return value === 0 ? 'Free' : `₱${peso.format(value)}`;
}
