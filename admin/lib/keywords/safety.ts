// Self-protection for keyword edits: a pattern that matches (almost) everything would hold
// every post for review. Enforced in the Server Actions, shown in the form.

import { compileRegex, pgOnlySyntax, wordTermCanMatch } from '@/lib/keywords/match';
import { type MatchType, TERM_MAX } from '@/lib/keywords/schemas';

// Short, fixed texts only: the user's pattern never runs on unbounded input here.
export const SAMPLE_TEXTS = ['hello', 'the', 'a', '123', 'test post'] as const;

export type KeywordCheck = {
  /** Error codes (lib/errors.ts): the keyword is refused. */
  errors: string[];
  /** Shown in the form, never blocking. */
  warnings: string[];
};

export function checkKeyword(term: string, matchType: MatchType): KeywordCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const t = term.trim();

  if (matchType === 'regex') {
    if (t.length > TERM_MAX) errors.push('keyword_term_invalid');
    const pgOnly = pgOnlySyntax(t);
    const re = pgOnly ? null : compileRegex(t);
    if (pgOnly) {
      warnings.push(`${pgOnly} It could not be checked for matching everything; test it carefully.`);
    } else if (!re) {
      warnings.push('The browser cannot read this pattern, so it was not checked. The database will refuse it if it is not valid.');
    } else if (re.test('') || SAMPLE_TEXTS.every((s) => re.test(s))) {
      errors.push('keyword_matches_everything');
    }
    return { errors, warnings };
  }

  if ([...t].length === 1) {
    warnings.push(
      matchType === 'contains'
        ? 'A single character matches a lot of ordinary text and would hold many posts.'
        : 'A single-character word is very short; check that it will not hold ordinary posts.',
    );
  }
  if (matchType === 'word' && t !== '' && !wordTermCanMatch(t)) {
    warnings.push('A whole-word term must start and end with a letter, digit or underscore, so this one never matches posts, comments or listings.');
  }
  return { errors, warnings };
}
