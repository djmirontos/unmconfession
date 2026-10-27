// The only place where database and auth error codes become user-facing text.

const MESSAGES: Record<string, string> = {
  // Sign-in (generic on purpose: never reveal whether an email has an account)
  invalid_login: 'Email or password is incorrect.',
  no_panel_access: 'This account does not have access to the moderation panel.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  invalid_code: 'Enter the 6-digit code from your authenticator app.',
  code_incorrect: 'That code is not correct or has expired. Check your authenticator app and try again.',
  enroll_failed: 'Could not start the authenticator setup. Try again.',
  session_missing: 'Your session has ended. Sign in again.',
  // Database (raised by the RPCs)
  forbidden: 'You do not have permission to do this.',
  not_found: 'This item no longer exists.',
  account_deleted: 'This account has been deleted.',
  cannot_target_self: 'You cannot do this to your own account.',
  cannot_target_admin: 'Admins cannot be changed here.',
  account_not_restricted: 'Only a banned or suspended account can be deleted here.',
  invalid_until: 'Choose an end date in the future.',
  reason_required: 'Enter a reason.',
  reason_too_long: 'The reason is too long (300 characters at most).',
  invalid_email: 'Enter a valid email address.',
  last_admin: 'At least one active admin must remain.',
  // Review queue
  invalid_transition: 'Someone else already handled this item.',
  invalid_body: 'The text must not be empty and must fit the limit (2000 characters for posts, 1000 for comments).',
  invalid_target: 'Only posts and comments can be edited.',
  invalid_action: 'That action is not available.',
  approve_failed_after_edit: 'The edit was saved, but approving failed. Try approving again.',
  // Reports, content, users
  cannot_restore_deleted: 'The author deleted this item, so it cannot be restored.',
  deleted_by_author: 'The author deleted this themselves, so it cannot be restored.',
  // admin_set_nickname raises account_deleted; renameUser turns it into this, so other actions keep the generic text.
  nickname_account_deleted: 'This account was deleted, so its nickname cannot be changed.',
  nickname_invalid: 'Use 3 to 20 letters, digits, underscores or dots.',
  nickname_taken: 'That nickname is already taken.',
  no_user_with_email: 'No user with that email.',
  confirm_mismatch: 'Type the nickname exactly as shown to confirm.',
  identity_unavailable: 'This account has no sign-in record (it may have been deleted).',
  // Keywords
  invalid_regex: 'This regular expression is not valid.',
  keyword_exists: 'That term already exists for this match type.',
  keyword_invalid: 'Invalid keyword settings.',
  keyword_term_invalid: 'Enter a term of 1 to 200 characters.',
  keyword_matches_everything: 'This pattern would match almost everything and hold all content.',
  // Fallbacks
  invalid_input: 'Check the form and try again.',
  network: 'Could not reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Try again.',
};

const DB_CODES = new Set(Object.keys(MESSAGES));

// Supabase Auth error codes mapped to our codes.
const AUTH_CODES: Record<string, string> = {
  invalid_credentials: 'invalid_login',
  email_not_confirmed: 'invalid_login',
  user_not_found: 'invalid_login',
  user_banned: 'invalid_login',
  validation_failed: 'invalid_login',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  mfa_verification_failed: 'code_incorrect',
  mfa_challenge_expired: 'code_incorrect',
  mfa_verification_rejected: 'code_incorrect',
  session_not_found: 'session_missing',
  session_expired: 'session_missing',
  refresh_token_not_found: 'session_missing',
};

/**
 * Writes to public.keywords: the unique index on (lower(term), match_type) and the table's check
 * constraints get keyword wording; invalid_regex (keywords_validate) and the rest map as usual.
 */
export function keywordErrorCode(error: unknown): string {
  const pgCode = field(error, 'code');
  const message = field(error, 'message') ?? '';
  if (pgCode === '23505' && /keywords_term_key/.test(message)) return 'keyword_exists';
  if (pgCode === '23514') return 'keyword_invalid';
  return codeFromError(error);
}

/** Rename-specific wording: a deleted account explains that its nickname cannot change. */
export function renameErrorCode(code: string): string {
  return code === 'account_deleted' ? 'nickname_account_deleted' : code;
}

export function messageFor(code: string): string {
  return MESSAGES[code] ?? MESSAGES.unknown;
}

function field(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

/** Turns a Postgrest error (the RPC raises its code as the message), an Auth error or anything else into one of our codes. */
export function codeFromError(error: unknown): string {
  if (error == null) return 'unknown';
  const authCode = field(error, 'code');
  if (authCode && AUTH_CODES[authCode]) return AUTH_CODES[authCode];
  const message = field(error, 'message')?.trim();
  if (message && DB_CODES.has(message)) return message;
  if (authCode === '42501') return 'forbidden';
  // Unique index on lower(nickname): two renames at the same moment.
  if (authCode === '23505' && /nickname/i.test(message ?? '')) return 'nickname_taken';
  if (field(error, 'name') === 'AuthRetryableFetchError' || (error instanceof TypeError && /fetch/i.test(error.message))) {
    return 'network';
  }
  return 'unknown';
}
