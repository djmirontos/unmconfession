// The keyword rules of the database, in TypeScript, for the form's "Try it" preview.
// Content (posts, comments, listings): public._moderation_decision (v1 schema):
//   word      text ~* ('\m' || _re_escape(term) || '\M')
//   contains  strpos(lower(text), lower(term)) > 0
//   regex     text ~* term
// Nicknames: public._nickname_flagged (migration 8b, 20261026110000_nickname_keywords.sql).
// Every regex here is compiled inside try/catch and only ever runs on the short preview text.

import type { MatchType } from '@/lib/keywords/schemas';

export type MatchResult =
  | { kind: 'match' }
  | { kind: 'no-match' }
  /** The browser cannot reproduce the database exactly (PostgreSQL-only regex syntax). */
  | { kind: 'unsupported'; reason: string }
  /** JavaScript cannot compile the pattern (PostgreSQL may still accept it). */
  | { kind: 'invalid' };

// PostgreSQL "word characters" for \m and \M: letters, digits and underscore.
const WORD = '[\\p{L}\\p{N}_]';
const WORD_CHAR = /^[\p{L}\p{N}_]$/u;

// Literal text in a 'u' regex. "-" is left alone: it is only special inside [...], and "\-"
// outside a class is a syntax error with the u flag.
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ARE syntax that JavaScript reads differently or not at all: \m \M \y \Y \A \Z (word and string
// anchors), \b \B (backspace and backslash in ARE), [[:class:]] [[.x.]] [[=x=]], embedded
// options like (?i), and the *** director prefix.
const PG_ONLY = /\\[mMyYAZbB]|\[\[[:.=]|\(\?[a-zA-Z]+\)|^\*\*\*/;

/** Why a regex cannot be previewed exactly, or null if JavaScript reads it the same way. */
export function pgOnlySyntax(pattern: string): string | null {
  return PG_ONLY.test(pattern)
    ? 'This pattern uses PostgreSQL-only syntax (such as \\m, \\y, \\b or [[:alpha:]]), so the browser cannot preview it exactly.'
    : null;
}

/** new RegExp(pattern, 'i'), or null when JavaScript cannot compile it. */
export function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function regexResult(pattern: string, text: string): MatchResult {
  const pgOnly = pgOnlySyntax(pattern);
  if (pgOnly) return { kind: 'unsupported', reason: pgOnly };
  const re = compileRegex(pattern);
  if (!re) return { kind: 'invalid' };
  return re.test(text) ? { kind: 'match' } : { kind: 'no-match' };
}

const result = (hit: boolean): MatchResult => (hit ? { kind: 'match' } : { kind: 'no-match' });

/**
 * \m only matches before a word character and \M only after one, so a whole-word term that
 * starts or ends with anything else (a space, "#", "-") can never match in the database.
 */
export function wordTermCanMatch(term: string): boolean {
  const chars = [...term];
  return chars.length > 0 && WORD_CHAR.test(chars[0] ?? '') && WORD_CHAR.test(chars[chars.length - 1] ?? '');
}

/** Posts, comments and listings (_moderation_decision). Case-insensitive throughout. */
export function matchContent(term: string, matchType: MatchType, text: string): MatchResult {
  switch (matchType) {
    case 'word': {
      if (!wordTermCanMatch(term)) return { kind: 'no-match' };
      // \m = not after a word character and before one; \M = after one and not before one.
      const re = new RegExp(`(?<!${WORD})(?=${WORD})${escapeRegExp(term)}(?<=${WORD})(?!${WORD})`, 'iu');
      return result(re.test(text));
    }
    case 'contains':
      return result(text.toLowerCase().includes(term.toLowerCase()));
    case 'regex':
      return regexResult(term, text);
  }
}

// translate(lower(x), '013457', 'oieast')
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
const unleet = (s: string) => s.toLowerCase().replace(/[013457]/g, (d) => LEET[d] ?? d);

/** Nicknames (_nickname_flagged): leet digits read as letters, "_" and "." separate words. */
export function matchNickname(term: string, matchType: MatchType, nickname: string): MatchResult {
  const leet = unleet(nickname);
  const termLeet = unleet(term);
  switch (matchType) {
    case 'contains': {
      const needle = termLeet.replace(/[_. ]/g, '');
      return result(needle !== '' && leet.replace(/[_.]/g, '').includes(needle));
    }
    case 'word':
      return result(leet.split(/[_.]+/).some((part) => part === termLeet));
    case 'regex': {
      // The database skips a pattern it cannot run instead of refusing the name.
      const r = regexResult(term, nickname.toLowerCase());
      return r.kind === 'invalid' ? { kind: 'invalid' } : r;
    }
  }
}
