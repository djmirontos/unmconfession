// Optional profile details (Module 12d). No imports, so tests/profileDetails.test.mjs runs it in Node.
// The database (set_my_profile_details) re-checks everything and alone decides on contact info and keywords.

/** Exactly the values public.profile_details.year_level accepts. */
export const YEAR_LEVELS = ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Graduate', 'Alumni'] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

export const DETAIL_LIMITS = { college: 60, course: 80, hobbies: 100, about: 150 } as const;
export type DetailTextField = keyof typeof DETAIL_LIMITS;

export type ProfileDetails = {
  college: string | null;
  course: string | null;
  yearLevel: string | null;
  hobbies: string | null;
  about: string | null;
};

export type MyProfileDetails = ProfileDetails & { show: boolean };

export const EMPTY_DETAILS: MyProfileDetails = { show: false, college: null, course: null, yearLevel: null, hobbies: null, about: null };

/** Same as the database: trim, collapse runs of whitespace, empty -> null. */
export function normalizeText(value: string | null | undefined): string | null {
  const t = (value ?? '').replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

export function normalizeDetails<T extends ProfileDetails>(details: T): T {
  return {
    ...details,
    college: normalizeText(details.college),
    course: normalizeText(details.course),
    yearLevel: normalizeText(details.yearLevel),
    hobbies: normalizeText(details.hobbies),
    about: normalizeText(details.about),
  };
}

export const isYearLevel = (value: string): value is YearLevel => (YEAR_LEVELS as readonly string[]).includes(value);

/** Length and year rules only, per field (after normalizing). An empty object means it may be sent. */
export function validateDetails(details: ProfileDetails): Partial<Record<DetailTextField | 'yearLevel', string>> {
  const d = normalizeDetails(details);
  const errors: Partial<Record<DetailTextField | 'yearLevel', string>> = {};
  for (const field of Object.keys(DETAIL_LIMITS) as DetailTextField[]) {
    const value = d[field];
    if (value !== null && value.length > DETAIL_LIMITS[field]) errors[field] = `Keep it to ${DETAIL_LIMITS[field]} characters.`;
  }
  if (d.yearLevel !== null && !isYearLevel(d.yearLevel)) errors.yearLevel = 'Choose a year level from the list.';
  return errors;
}

/** True when the normalized form differs from what is saved (drives the Save button). */
export function detailsChanged(saved: MyProfileDetails, draft: MyProfileDetails): boolean {
  const a = normalizeDetails(saved);
  const b = normalizeDetails(draft);
  return (
    a.show !== b.show ||
    a.college !== b.college ||
    a.course !== b.course ||
    a.yearLevel !== b.yearLevel ||
    a.hobbies !== b.hobbies ||
    a.about !== b.about
  );
}

/** Codes set_my_profile_details raises; lib/errors.ts must recognise them in an error message. */
export const DETAILS_ERROR_CODES = ['details_contact', 'details_flagged', 'details_invalid'] as const;

const DETAILS_MESSAGES: Record<string, string> = {
  details_contact: 'Please remove links, phone numbers, @ handles and app names.',
  details_flagged: "Some words aren't allowed. Please rephrase.",
  details_invalid: 'Please check your answers and try again.',
};
// Account states and no connection keep the app's usual wording (passed in from lib/errors.ts).
const REUSED = new Set(['banned', 'suspended', 'nickname_required', 'network']);
const DETAILS_FAILED = 'Could not save your details. Please try again.';

/** Text for a save error code. `reuse` holds the shared wording for the account and network codes. */
export function getDetailsErrorMessage(code: string | null, reuse: Readonly<Record<string, string | undefined>> = {}): string {
  if (code && DETAILS_MESSAGES[code]) return DETAILS_MESSAGES[code];
  const shared = code && REUSED.has(code) ? reuse[code] : undefined;
  if (shared) return shared;
  return DETAILS_FAILED;
}

const LINES: readonly { field: keyof ProfileDetails; label: string }[] = [
  { field: 'college', label: 'College' },
  { field: 'course', label: 'Course' },
  { field: 'yearLevel', label: 'Year' },
  { field: 'hobbies', label: 'Hobbies' },
  { field: 'about', label: 'About me' },
];

/** The non-empty details as labelled lines, in display order. */
export function buildDetailLines(details: ProfileDetails | null | undefined): { label: string; value: string }[] {
  if (!details) return [];
  return LINES.flatMap(({ field, label }) => {
    const value = normalizeText(details[field]);
    return value === null ? [] : [{ label, value }];
  });
}
