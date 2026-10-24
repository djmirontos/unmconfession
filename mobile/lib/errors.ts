import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

// Codes raised by the DB (`raise exception '<code>'`) and by Supabase Auth (`AuthError.code`).
const MESSAGES: Record<string, string> = {
  // Database / RPC
  nickname_taken: 'That nickname is already taken. Try another one.',
  nickname_invalid: 'Nicknames are 3–20 characters: letters, numbers, underscore or dot.',
  nickname_reserved: 'That nickname is reserved. Please choose another one.',
  nickname_locked: 'Your nickname is permanent and can no longer be changed.',
  nickname_required: 'Choose a nickname before you take part.',
  banned: 'This account has been banned.',
  suspended: 'This account is suspended for now. Try again later.',
  rate_limited: 'You are doing that too often. Please wait a bit and try again.',
  not_authenticated: 'Please sign in first.',
  no_profile: 'Your account is not set up yet. Sign out and sign in again.',
  invalid_body: 'Check the text: it is empty or too long.',
  invalid_title: 'Add a title of up to 100 characters.',
  invalid_target: 'Only shoutouts have a "To" name.',
  target_required: 'Add who this shoutout is for.',
  too_many_images: 'You can add up to 3 photos.',
  invalid_images: 'One of the photos could not be used. Remove it and try again.',
  invalid_poll_options: 'A poll needs 2 to 6 different choices.',
  invalid_poll_end: 'Pick how long the poll runs.',
  condition_required: 'Pick the item condition.',
  invalid_price: 'Enter a price from ₱0 to ₱9,999,999.',
  lost_found_type_required: 'Choose whether you lost or found something.',
  // Poll voting.
  poll_closed: 'This poll has ended.',
  invalid_option: "That option isn't available.",
  // Reports.
  own_content: "You can't report your own post.",
  // Edit / delete own items.
  not_editable: 'This can no longer be edited. You can still delete it.',
  edit_window_closed: 'The 24-hour edit window has closed. You can still delete it.',
  not_found: 'This item no longer exists.',
  invalid_lost_found: 'Please add where it happened and choose a date from the last 60 days, up to today.',
  image_too_large: 'That photo is too large even after resizing. Try another one.',
  // Photo upload stages (thrown by lib/photos/upload.ts).
  photo_read_failed: 'We could not read that photo. Remove it and add it again.',
  upload_failed: 'The photo upload failed. Please try again.',
  network_error: 'No connection. Check your internet and try again.',

  // Supabase Auth
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Please verify your email first.',
  user_already_exists: 'An account with this email already exists. Try signing in.',
  email_exists: 'An account with this email already exists. Try signing in.',
  email_address_invalid: 'That email address is not valid.',
  weak_password: 'That password is too weak. Use at least 8 characters with letters and numbers.',
  same_password: 'Your new password must be different from the old one.',
  otp_expired: 'That code is wrong or has expired. Request a new one.',
  over_email_send_rate_limit: 'Too many emails sent. Please wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  signup_disabled: 'Sign-ups are closed right now.',
  user_banned: 'This account has been banned.',
  // Supabase Auth hides handle_new_user()'s exception behind this generic code.
  unexpected_failure: 'We could not create your account with that nickname. Please choose another one.',
};

const FALLBACK = 'Something went wrong. Please try again.';
const NETWORK = 'No connection. Check your internet and try again.';

const DB_CODE = new RegExp(`\\b(${Object.keys(MESSAGES).join('|')})\\b`);

/** Extracts a known error code from an Auth or Postgrest error, if any. */
export function getErrorCode(error: unknown): string | null {
  if (isAuthError(error) && error.code) return error.code;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return DB_CODE.exec(message)?.[1] ?? null;
  }
  return null;
}

function isNetworkError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  return error instanceof TypeError && /network request failed|fetch/i.test(error.message);
}

/** The one place DB and Auth errors become user-facing text. */
export function getErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (isNetworkError(error)) return NETWORK;
  return FALLBACK;
}

// Reaction failures use their own wording: a missing post reads as unavailable,
// and rate or permission problems reuse the generic connection text.
const REACTION_GENERIC = new Set(['rate_limited', 'banned', 'suspended', 'not_authenticated', 'nickname_required', 'no_profile']);

export function getReactionErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  if (code === 'not_found') return "This post isn't available anymore.";
  if (code && REACTION_GENERIC.has(code)) return NETWORK;
  return getErrorMessage(error);
}

// Comment wording for codes that mean something more specific in a thread.
const COMMENT_MESSAGES: Record<string, string> = {
  invalid_body: 'Write a comment of up to 1000 characters.',
  not_found: "This post isn't available anymore.",
  rate_limited: "You're commenting too fast. Try again in a few minutes.",
  not_editable: 'This comment can no longer be edited. You can still delete it.',
  edit_window_closed: 'The 24-hour edit window has closed. You can still delete it.',
};

export function getCommentErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  return (code && COMMENT_MESSAGES[code]) || getErrorMessage(error);
}

// Report wording: the limit is per day and the target may be gone.
const REPORT_MESSAGES: Record<string, string> = {
  rate_limited: "You've sent too many reports today. Try again tomorrow.",
  not_found: 'This content is no longer available.',
};

export function getReportErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  return (code && REPORT_MESSAGES[code]) || getErrorMessage(error);
}
