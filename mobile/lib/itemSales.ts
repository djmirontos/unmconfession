// Buyer-confirmed sales on Buy & Sell listings (Module 13c, Trusted Seller). The RPC calls live in
// hooks/useListingSale.ts. Candidates are the same shape as for returns (lib/itemReturns.ts).

export type { ReturnCandidate as SaleCandidate } from '@/lib/itemReturns';

/** get_listing_sale: the viewer's part in the listing's pending or confirmed sale. */
export type Sale = {
  id: string;
  status: 'pending' | 'confirmed';
  role: 'seller' | 'buyer';
  otherId: string;
  otherNickname: string | null;
  otherAvatarKey: string | null;
  createdAt: string;
};

type SaleRow = {
  sale_id: string | null;
  status: string | null;
  role: string | null;
  other_id: string | null;
  other_nickname: string | null;
  other_avatar_key: string | null;
  created_at: string | null;
};

/** The first valid row, or null (no sale, or not a participant). */
export function toSale(rows: readonly SaleRow[] | null | undefined): Sale | null {
  for (const r of rows ?? []) {
    if (!r.sale_id || !r.other_id || !r.created_at) continue;
    if (r.status !== 'pending' && r.status !== 'confirmed') continue;
    if (r.role !== 'seller' && r.role !== 'buyer') continue;
    return {
      id: r.sale_id,
      status: r.status,
      role: r.role,
      otherId: r.other_id,
      otherNickname: r.other_nickname,
      otherAvatarKey: r.other_avatar_key,
      createdAt: r.created_at,
    };
  }
  return null;
}

export type SaleView =
  | { kind: 'none' }
  | { kind: 'can_start' }
  | { kind: 'seller_pending'; sale: Sale }
  | { kind: 'buyer_pending'; sale: Sale }
  | { kind: 'confirmed_seller'; sale: Sale }
  | { kind: 'confirmed_buyer'; sale: Sale };

export type SaleViewInput = {
  /** A full member (signed in, with a nickname). Guests see nothing. */
  member: boolean;
  isSeller: boolean;
  listingKind: 'sell' | 'lost_found';
  price: number | null;
  /** undefined while loading or after a load failure: nothing is shown (no flashing button). */
  sale: Sale | null | undefined;
};

/** What the listing screen shows about a sale, for this viewer. Free items (price 0) cannot be sold to a buyer. */
export function saleView({ member, isSeller, listingKind, price, sale }: SaleViewInput): SaleView {
  if (!member || listingKind !== 'sell' || sale === undefined) return { kind: 'none' };
  if (sale) {
    if (sale.status === 'confirmed') return sale.role === 'seller' ? { kind: 'confirmed_seller', sale } : { kind: 'confirmed_buyer', sale };
    return sale.role === 'seller' ? { kind: 'seller_pending', sale } : { kind: 'buyer_pending', sale };
  }
  return isSeller && (price ?? 0) > 0 ? { kind: 'can_start' } : { kind: 'none' };
}

const name = (nickname: string | null) => nickname ?? 'Deleted user';

// ---------------------------------------------------------------- wording

export const SALE_START_LABEL = 'Mark as sold to a buyer';
export const SALE_PICKER_TITLE = 'Who bought it?';
export const SALE_PICKER_EMPTY = 'Nobody eligible has commented yet. Ask the buyer to comment on this listing first.';

export function saleConfirmText(nickname: string): { title: string; message: string; action: string } {
  return { title: 'Send request', message: `Send ${nickname} a request to confirm they bought this?`, action: 'Send' };
}

export const saleStartSuccess = (nickname: string) => `Request sent to ${nickname}`;

export const SALE_TOASTS = {
  accepted: 'Thanks! The sale is confirmed.',
  declined: 'Request declined',
  cancelled: 'Request cancelled',
} as const;

/** The banner text for a pending or confirmed sale. */
export function saleBannerText(view: SaleView): string | null {
  switch (view.kind) {
    case 'seller_pending':
      return `Waiting for ${name(view.sale.otherNickname)} to confirm`;
    case 'buyer_pending':
      return `${name(view.sale.otherNickname)} says you bought this item.`;
    case 'confirmed_seller':
      return `Sold. ${name(view.sale.otherNickname)} confirmed this sale.`;
    case 'confirmed_buyer':
      return `Sold. You bought this from ${name(view.sale.otherNickname)}.`;
    default:
      return null;
  }
}
