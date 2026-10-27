import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { codeFromError, keywordErrorCode, messageFor } from '@/lib/errors';
import { matchContent, matchNickname, pgOnlySyntax, wordTermCanMatch } from '@/lib/keywords/match';
import {
  activeFilterCount,
  applyKeywordFilters,
  clearSheetFilters,
  type KeywordQuery,
  keywordInsertRow,
  keywordUpdateRow,
  likePattern,
} from '@/lib/keywords/query';
import { checkKeyword } from '@/lib/keywords/safety';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  keywordFiltersSchema,
  keywordInputError,
  keywordInputSchema,
  keywordUpdateSchema,
  TERM_MAX,
} from '@/lib/keywords/schemas';

const ID = '3f0c5a52-1f8b-4d3e-9a7c-2b6d8e4f1a90';
const USER = '7b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const valid = { term: '  shabu  ', match_type: 'word', category: 'prohibited_item', applies_to: ['post', 'listing'], active: true };

// ------------------------------------------------------------ schema

describe('keyword form schema', () => {
  it('accepts a valid keyword and trims the term', () => {
    const r = keywordInputSchema.safeParse(valid);
    expect(r.success && r.data.term).toBe('shabu');
  });
  it('refuses an empty or blank term', () => {
    expect(keywordInputSchema.safeParse({ ...valid, term: '' }).success).toBe(false);
    expect(keywordInputSchema.safeParse({ ...valid, term: '   ' }).success).toBe(false);
  });
  it('refuses a term longer than 200 characters', () => {
    expect(keywordInputSchema.safeParse({ ...valid, term: 'x'.repeat(TERM_MAX) }).success).toBe(true);
    expect(keywordInputSchema.safeParse({ ...valid, term: 'x'.repeat(TERM_MAX + 1) }).success).toBe(false);
  });
  it('needs at least one scope, only the four allowed values, no duplicates', () => {
    expect(keywordInputSchema.safeParse({ ...valid, applies_to: [] }).success).toBe(false);
    expect(keywordInputSchema.safeParse({ ...valid, applies_to: ['post', 'profile'] }).success).toBe(false);
    expect(keywordInputSchema.safeParse({ ...valid, applies_to: ['post', 'post'] }).success).toBe(false);
    expect(keywordInputSchema.safeParse({ ...valid, applies_to: ['post', 'comment', 'listing', 'nickname'] }).success).toBe(true);
  });
  it('refuses unknown match types and categories', () => {
    expect(keywordInputSchema.safeParse({ ...valid, match_type: 'glob' }).success).toBe(false);
    expect(keywordInputSchema.safeParse({ ...valid, category: 'rude' }).success).toBe(false);
  });
  it('accepts the four categories added in 7e.1d', () => {
    for (const category of ['adult_content', 'violence', 'hate_speech', 'gambling']) {
      expect(keywordInputSchema.safeParse({ ...valid, category }).success).toBe(true);
    }
  });
  it('lists the categories in display order, each with a label', () => {
    expect(CATEGORIES).toEqual(['abuse', 'doxxing', 'prohibited_item', 'spam', 'adult_content', 'violence', 'hate_speech', 'gambling', 'other']);
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c]?.trim()).toBeTruthy();
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort());
    expect(CATEGORY_LABELS.hate_speech).toBe('Hate speech');
  });
  it('maps a term problem to its own code, anything else to the generic one', () => {
    const term = keywordInputSchema.safeParse({ ...valid, term: '' });
    const scope = keywordInputSchema.safeParse({ ...valid, applies_to: [] });
    expect(term.success ? null : keywordInputError(term.error.issues)).toBe('keyword_term_invalid');
    expect(scope.success ? null : keywordInputError(scope.error.issues)).toBe('keyword_invalid');
  });
});

describe('created_by never comes from the form', () => {
  it('the form schemas drop a created_by field', () => {
    const r = keywordInputSchema.safeParse({ ...valid, created_by: ID });
    expect(r.success && 'created_by' in r.data).toBe(false);
    const u = keywordUpdateSchema.safeParse({ ...valid, id: ID, created_by: ID });
    expect(u.success && 'created_by' in u.data).toBe(false);
  });
  it('insert rows use the session user id; update rows have no created_by at all', () => {
    const input = keywordInputSchema.parse({ ...valid, created_by: ID });
    expect(keywordInsertRow(input, USER).created_by).toBe(USER);
    expect('created_by' in keywordUpdateRow(input)).toBe(false);
  });
  it('the create action takes created_by from requireStaff(), not from the input', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/(panel)/keywords/actions.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(/keywordInsertRow\(parsed\.data, staff\.userId\)/);
    expect(src).not.toMatch(/created_by\s*:/);
  });
});

// ------------------------------------------------------------ self-protection

describe('self-protection', () => {
  it('refuses a regex that matches the empty string', () => {
    for (const p of ['.*', 'x?', '^', '(a|)']) expect(checkKeyword(p, 'regex').errors, p).toEqual(['keyword_matches_everything']);
  });
  it('refuses a regex that matches every sample text', () => {
    expect(checkKeyword('.', 'regex').errors).toEqual(['keyword_matches_everything']);
    expect(checkKeyword('[a-z0-9]', 'regex').errors).toEqual(['keyword_matches_everything']);
  });
  it('allows a normal regex', () => {
    expect(checkKeyword('09\\d{9}', 'regex')).toEqual({ errors: [], warnings: [] });
    expect(checkKeyword('sh[i1]t', 'regex').errors).toEqual([]);
  });
  it('refuses a regex longer than the term limit', () => {
    expect(checkKeyword(`a${'b'.repeat(TERM_MAX)}`, 'regex').errors).toContain('keyword_term_invalid');
  });
  it('warns (does not block) when JavaScript cannot compile the pattern', () => {
    const r = checkKeyword('(?<x', 'regex');
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
  it('warns (does not block) for PostgreSQL-only syntax it cannot check', () => {
    const r = checkKeyword('\\mfoo\\M', 'regex');
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/PostgreSQL-only/);
  });
  it('warns for a single-character plain term, and for a whole-word term that can never match', () => {
    expect(checkKeyword('x', 'contains')).toMatchObject({ errors: [] });
    expect(checkKeyword('x', 'contains').warnings).toHaveLength(1);
    expect(checkKeyword('x', 'word').warnings).toHaveLength(1);
    expect(checkKeyword('#tag', 'word').warnings[0]).toMatch(/never matches/);
    expect(checkKeyword('hello', 'word')).toEqual({ errors: [], warnings: [] });
  });
});

// ------------------------------------------------------------ preview (mirrors the SQL)

describe('content preview (_moderation_decision)', () => {
  const hit = (term: string, type: 'word' | 'contains' | 'regex', text: string) => matchContent(term, type, text).kind;

  it('word: whole words only, case-insensitive (\\m term \\M)', () => {
    expect(hit('shabu', 'word', 'May SHABU dito')).toBe('match');
    expect(hit('shabu', 'word', 'shabu-shabu dinner')).toBe('match');
    expect(hit('ass', 'word', 'class assignment')).toBe('no-match');
    expect(hit('ass', 'word', 'pass_word')).toBe('no-match'); // "_" is a word character
    expect(hit('ass', 'word', 'what an ass.')).toBe('match');
  });
  it('word: the term is literal, including regex characters and hyphens', () => {
    expect(hit('c.o.d', 'word', 'pay c.o.d please')).toBe('match');
    expect(hit('c.o.d', 'word', 'pay cxoxd please')).toBe('no-match');
    expect(hit('e-wallet', 'word', 'send via e-wallet')).toBe('match');
  });
  it('word: a term starting or ending with a non-word character never matches (like \\m and \\M)', () => {
    expect(wordTermCanMatch('#tag')).toBe(false);
    expect(hit('#tag', 'word', 'see #tag here')).toBe('no-match');
    expect(wordTermCanMatch('ñaño')).toBe(true);
    expect(hit('ñaño', 'word', 'Ang ÑAÑO ko')).toBe('match');
  });
  it('contains: substring, case-insensitive (strpos(lower, lower))', () => {
    expect(hit('fuck', 'contains', 'MOTHERFUCKER')).toBe('match');
    expect(hit('09', 'contains', 'call 0917')).toBe('match');
    expect(hit('xyz', 'contains', 'abc')).toBe('no-match');
  });
  it('regex: case-insensitive (~*)', () => {
    expect(hit('09\\d{9}', 'regex', 'text me 09171234567')).toBe('match');
    expect(hit('SH[I1]T', 'regex', 'sh1t')).toBe('match');
    expect(hit('^foo$', 'regex', 'foo bar')).toBe('no-match');
  });
  it('regex: PostgreSQL-only syntax is reported, not guessed; an uncompilable pattern is "invalid"', () => {
    expect(hit('\\yfoo\\y', 'regex', 'foo')).toBe('unsupported');
    expect(hit('[[:digit:]]+', 'regex', '123')).toBe('unsupported');
    expect(hit('(?<x', 'regex', 'x')).toBe('invalid');
    expect(pgOnlySyntax('a+b')).toBeNull();
  });
});

describe('nickname preview (_nickname_flagged)', () => {
  const hit = (term: string, type: 'word' | 'contains' | 'regex', name: string) => matchNickname(term, type, name).kind;

  it('contains: "_" and "." are ignored in the name, leet digits read as letters', () => {
    expect(hit('fuck', 'contains', 'f.u.c.k')).toBe('match');
    expect(hit('fuck', 'contains', 'xx_FUCK_xx')).toBe('match');
    expect(hit('shit', 'contains', 'sh1t_lord')).toBe('match');
    expect(hit('shit', 'contains', 'shirt')).toBe('no-match');
  });
  it('contains: "_", "." and spaces in the term are ignored too; an empty term never matches', () => {
    expect(hit('bad word', 'contains', 'my_badword')).toBe('match');
    expect(hit('_.', 'contains', 'anything')).toBe('no-match');
  });
  it('word: one part of the name, split on "_" and ".", equals the term', () => {
    expect(hit('ass', 'word', 'ass_king')).toBe('match');
    expect(hit('ass', 'word', 'class')).toBe('no-match');
    expect(hit('ass', 'word', '4ss.lord')).toBe('match');
  });
  it('regex: the lower-case name; a pattern the browser cannot run is "invalid" (the database skips it)', () => {
    expect(hit('^admin', 'regex', 'AdminGuy')).toBe('match');
    expect(hit('(?<x', 'regex', 'x')).toBe('invalid');
  });
});

// ------------------------------------------------------------ errors

describe('keyword error mapping', () => {
  it('a unique violation on keywords_term_key is "already exists"', () => {
    const e = { code: '23505', message: 'duplicate key value violates unique constraint "keywords_term_key"' };
    expect(keywordErrorCode(e)).toBe('keyword_exists');
    expect(messageFor('keyword_exists')).toBe('That term already exists for this match type.');
  });
  it('invalid_regex from keywords_validate has its own message', () => {
    expect(keywordErrorCode({ code: 'P0001', message: 'invalid_regex' })).toBe('invalid_regex');
    expect(codeFromError({ code: 'P0001', message: 'invalid_regex' })).toBe('invalid_regex');
    expect(messageFor('invalid_regex')).toBe('This regular expression is not valid.');
  });
  it('a check violation is the generic settings message; other codes keep their mapping', () => {
    expect(keywordErrorCode({ code: '23514', message: 'new row violates check constraint "keywords_applies_to_check"' })).toBe('keyword_invalid');
    expect(messageFor('keyword_invalid')).toBe('Invalid keyword settings.');
    expect(keywordErrorCode({ code: '42501', message: 'permission denied' })).toBe('forbidden');
    expect(keywordErrorCode({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_nickname_key"' })).toBe('nickname_taken');
  });
  it('the self-protection message', () => {
    expect(messageFor('keyword_matches_everything')).toBe('This pattern would match almost everything and hold all content.');
  });
});

// ------------------------------------------------------------ filters → query

describe('keyword filters → query', () => {
  type Call = [string, string, unknown];
  interface Recorder extends KeywordQuery<Recorder> {
    calls: Call[];
  }
  const recorder = (): Recorder => {
    const calls: Call[] = [];
    const q: Recorder = {
      calls,
      eq: (c, v) => (calls.push(['eq', c, v]), q),
      contains: (c, v) => (calls.push(['contains', c, v]), q),
      ilike: (c, v) => (calls.push(['ilike', c, v]), q),
    };
    return q;
  };

  it('no filters: no conditions', () => {
    expect(applyKeywordFilters(recorder(), {}).calls).toEqual([]);
  });
  it('every filter becomes its condition', () => {
    const filters = keywordFiltersSchema.parse({ category: 'spam', scope: 'nickname', match: 'regex', state: 'inactive', q: '50%_off' });
    expect(applyKeywordFilters(recorder(), filters).calls).toEqual([
      ['eq', 'category', 'spam'],
      ['contains', 'applies_to', ['nickname']],
      ['eq', 'match_type', 'regex'],
      ['eq', 'active', false],
      ['ilike', 'term', '%50\\%\\_off%'],
    ]);
  });
  it('accepts every category as a filter', () => {
    for (const category of CATEGORIES) {
      const filters = keywordFiltersSchema.parse({ category });
      expect(applyKeywordFilters(recorder(), filters).calls).toEqual([['eq', 'category', category]]);
    }
  });
  it('bad URL values fall back to "all"', () => {
    expect(keywordFiltersSchema.parse({ category: 'rude', scope: 'profile', match: 'glob', state: 'maybe' })).toEqual({});
  });
  it('escapes LIKE wildcards in the search', () => {
    expect(likePattern('a\\b')).toBe('%a\\\\b%');
  });
});

// ------------------------------------------------------------ phone filters (7e.1b)

describe('phone filter sheet', () => {
  it('counts the sheet filters that are set, not the search', () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ q: 'shabu' })).toBe(0);
    expect(activeFilterCount(keywordFiltersSchema.parse({ category: 'spam', state: 'inactive', q: 'x' }))).toBe(2);
    expect(activeFilterCount(keywordFiltersSchema.parse({ category: 'spam', scope: 'post', match: 'word', state: 'active' }))).toBe(4);
  });
  it('bad URL values do not count', () => {
    expect(activeFilterCount(keywordFiltersSchema.parse({ category: 'rude', scope: 'profile' }))).toBe(0);
  });
  it('"Clear" removes the sheet filters and keeps the search and anything else', () => {
    expect(clearSheetFilters('category=spam&scope=post&match=regex&state=active&q=shabu')).toBe('q=shabu');
    expect(clearSheetFilters('category=spam')).toBe('');
    expect(clearSheetFilters('q=a%20b&other=1&state=inactive')).toBe('q=a+b&other=1');
  });
});

// ------------------------------------------------------------ guards

describe('the keywords page and actions check access on the server', () => {
  const src = (path: string) => readFileSync(fileURLToPath(new URL(`../app/(panel)/keywords/${path}`, import.meta.url)), 'utf8');

  it('page calls requireStaff()', () => {
    expect(src('page.tsx')).toMatch(/await requireStaff\(\)/);
  });
  it('every action calls requireStaff() first', () => {
    const actions = [...src('actions.ts').matchAll(/export async function (\w+)\([^)]*\)[^\n]*\{\n\s*([^\n]*)/g)];
    expect(actions.map((m) => m[1]).sort()).toEqual(['createKeyword', 'deleteKeyword', 'setKeywordActive', 'updateKeyword']);
    for (const m of actions) expect(m[2], m[1]).toMatch(/^(const staff = )?await requireStaff\(\);$/);
  });
  it('never references a service-role key', () => {
    expect(src('actions.ts')).not.toMatch(/service.?role/i);
  });
});
