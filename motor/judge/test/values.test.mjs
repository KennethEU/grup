// Test af, hvordan celler læses (spec. 3.1–3.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, parseNumber, mostFrequentSpellings } from '../values.mjs';

test('tekst: store/små bogstaver og mellemrum i enderne betyder intet', () => {
  assert.equal(normalizeText('Pige'), normalizeText(' pige '));
  assert.equal(normalizeText('PIGE'), 'pige');
  assert.notEqual(normalizeText('Pi ge'), normalizeText('Pige'));
});

test('tekst: tom celle er "ikke udfyldt" (null)', () => {
  assert.equal(normalizeText(''), null);
  assert.equal(normalizeText('   '), null);
});

test('tal: komma og punktum er begge decimaltegn', () => {
  assert.equal(parseNumber('7,5'), 7.5);
  assert.equal(parseNumber('7.5'), 7.5);
  assert.equal(parseNumber(' 02 '), 2);
  assert.equal(parseNumber('-3'), -3);
  assert.equal(parseNumber('+4'), 4);
});

test('tal: "1.000" er 1, og to decimaltegn eller tekst er ikke et tal', () => {
  assert.equal(parseNumber('1.000'), 1);
  assert.equal(parseNumber('1.000,5'), null);
  assert.equal(parseNumber('7 dage'), null);
  assert.equal(parseNumber('Fritaget'), null);
  assert.equal(parseNumber(''), null);
});

test('den hyppigste stavemåde bruges i beskeder', () => {
  const spellings = mostFrequentSpellings(['Pige', 'pige', 'Pige', 'Dreng ', 'dreng', 'Dreng']);
  assert.equal(spellings.get('pige'), 'Pige');
  assert.equal(spellings.get('dreng'), 'Dreng');
});
