import { nicknameSchema } from '@/lib/validation';

/** Texts of the choose-nickname screen (first Google sign-in). The 18+/Terms text lives in TermsCheckbox. */
export const CHOOSE_NICKNAME_COPY = {
  title: 'One last step',
  subtitle: "Pick a nickname. It's how you appear on UNM Freedom Confessions, so don't use your real name.",
  save: 'Save nickname',
  checking: 'Checking…',
  termsMissing: 'Tick the box to continue',
  cancel: 'Cancel sign-up',
  cancelHelp: 'This signs you out of this phone.',
  suggest: 'Suggest a name',
  suggesting: 'Finding a name…',
  suggestNone: "Couldn't find one right now, try again",
} as const;

// Shared with NicknameField's live feedback, so the tap and the field say the same thing.
export const NICKNAME_HINT = '3–20 characters: letters, numbers, underscore or dot.';
export const NICKNAME_UNAVAILABLE = 'Taken or not allowed. Try another one.';

/** What the app knows about the typed name. 'error': the check failed; the server decides on save. */
export type NicknameAvailability = 'unknown' | 'available' | 'unavailable' | 'error';

export type SaveCheck =
  | { kind: 'nickname'; message: string }
  | { kind: 'check'; nickname: string }
  | { kind: 'taken'; message: string }
  | { kind: 'terms'; message: string }
  | { kind: 'ready'; nickname: string };

/**
 * The first thing missing when Save is tapped, in this order: the name itself (empty, format,
 * reserved), its availability (unknown: check first, then ask again), the Terms box, then ready.
 */
export function saveCheck(input: {
  nickname: string;
  availability: NicknameAvailability;
  needsTerms: boolean;
  acceptedTerms: boolean;
}): SaveCheck {
  if (input.nickname.trim() === '') return { kind: 'nickname', message: NICKNAME_HINT };
  const parsed = nicknameSchema.safeParse(input.nickname);
  if (!parsed.success) return { kind: 'nickname', message: parsed.error.issues[0]?.message ?? NICKNAME_HINT };
  if (input.availability === 'unknown') return { kind: 'check', nickname: parsed.data };
  if (input.availability === 'unavailable') return { kind: 'taken', message: NICKNAME_UNAVAILABLE };
  if (input.needsTerms && !input.acceptedTerms) return { kind: 'terms', message: CHOOSE_NICKNAME_COPY.termsMissing };
  return { kind: 'ready', nickname: parsed.data };
}
