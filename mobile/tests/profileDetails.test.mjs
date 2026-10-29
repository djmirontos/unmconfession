// Run with: npm run test:details  (Node 22.6+ strips the TypeScript types of the import)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDetailLines,
  DETAIL_LIMITS,
  detailsChanged,
  EMPTY_DETAILS,
  getDetailsErrorMessage,
  normalizeDetails,
  validateDetails,
  YEAR_LEVELS,
} from '../lib/profileDetails.ts';

const empty = { college: null, course: null, yearLevel: null, hobbies: null, about: null };

test('YEAR_LEVELS are exactly the seven database values', () => {
  assert.deepEqual([...YEAR_LEVELS], ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Graduate', 'Alumni']);
});

test('limits match the database', () => {
  assert.deepEqual({ ...DETAIL_LIMITS }, { college: 60, course: 80, hobbies: 100, about: 150 });
});

test('normalizeDetails trims, collapses spaces and turns empty into null', () => {
  const out = normalizeDetails({ ...empty, college: '  College  of\n Engineering ', course: '   ', about: '' });
  assert.equal(out.college, 'College of Engineering');
  assert.equal(out.course, null);
  assert.equal(out.about, null);
});

test('validateDetails checks lengths after normalizing', () => {
  assert.deepEqual(validateDetails({ ...empty, about: 'a'.repeat(150) }), {});
  assert.deepEqual(validateDetails({ ...empty, about: ` ${'a'.repeat(150)}   ` }), {});
  assert.ok(validateDetails({ ...empty, about: 'a'.repeat(151) }).about);
  assert.ok(validateDetails({ ...empty, college: 'c'.repeat(61) }).college);
  assert.ok(validateDetails({ ...empty, course: 'c'.repeat(81) }).course);
  assert.ok(validateDetails({ ...empty, hobbies: 'h'.repeat(101) }).hobbies);
});

test('validateDetails accepts only the listed year levels', () => {
  assert.deepEqual(validateDetails({ ...empty, yearLevel: '2nd year' }), {});
  assert.ok(validateDetails({ ...empty, yearLevel: '2nd Year' }).yearLevel);
  assert.ok(validateDetails({ ...empty, yearLevel: '6th year' }).yearLevel);
});

test('validateDetails leaves contact info and keywords to the server', () => {
  assert.deepEqual(validateDetails({ ...empty, about: 'ig: @juan, 09171234567, juan.com' }), {});
});

test('detailsChanged ignores whitespace-only differences', () => {
  const saved = { ...EMPTY_DETAILS, course: 'BS Nursing' };
  assert.equal(detailsChanged(saved, { ...saved, course: ' BS  Nursing ' }), false);
  assert.equal(detailsChanged(saved, { ...saved, show: true }), true);
  assert.equal(detailsChanged(saved, { ...saved, course: '' }), true);
});

test('getDetailsErrorMessage: own texts, reused account wording, fallback', () => {
  assert.equal(getDetailsErrorMessage('details_contact'), 'Please remove links, phone numbers, @ handles and app names.');
  assert.equal(getDetailsErrorMessage('details_flagged'), "Some words aren't allowed. Please rephrase.");
  assert.equal(getDetailsErrorMessage('details_invalid'), 'Please check your answers and try again.');
  assert.equal(getDetailsErrorMessage('banned', { banned: 'Banned text' }), 'Banned text');
  assert.equal(getDetailsErrorMessage('network', { network: 'Offline text' }), 'Offline text');
  assert.equal(getDetailsErrorMessage('rate_limited', { rate_limited: 'x' }), 'Could not save your details. Please try again.');
  assert.equal(getDetailsErrorMessage(null), 'Could not save your details. Please try again.');
});

test('buildDetailLines keeps order and skips empty fields', () => {
  assert.deepEqual(buildDetailLines({ ...empty, about: 'Hi', college: 'CAS', yearLevel: '3rd year', hobbies: '  ' }), [
    { label: 'College', value: 'CAS' },
    { label: 'Year', value: '3rd year' },
    { label: 'About me', value: 'Hi' },
  ]);
  assert.deepEqual(buildDetailLines(empty), []);
  assert.deepEqual(buildDetailLines(null), []);
});
