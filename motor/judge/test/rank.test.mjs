// Test af rangordenen (spec. 7): rækkefølgen og de trinvise vægte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, compareVectors } from '../judge.mjs';
import { makeInput, makeAnswer, studentsOf, ids } from './helpers.mjs';

const fast = { samples: 50 };

test('rækkefølgen: Adskil altid → Undgå → tunge i opskriftens rækkefølge → mål → Saml', () => {
  const input = makeInput({
    students: studentsOf(8, (i) => ({ A: 'x', B: 'y', C: 'z', D: 'w', E: 'v' })),
    rules: [
      { type: 'distribute', column: 'A' },
      { type: 'cluster', column: 'B' },
      { type: 'strict_separate', column: 'C', values: ['z'] },
      { type: 'group_sort', column: 'D' },
      { type: 'separate', column: 'E', values: ['v'] },
    ],
    avoid: [ids(1, 2)],
  });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  assert.deepEqual(grade.precedence.steps.map((s) => s.step), [0, 1, 2, 4, 4, 5, 6]);
  assert.deepEqual(grade.precedence.steps.filter((s) => s.step === 4).map((s) => s.rule), [1, 4]);
});

test('ét brud mindre på en tung regel slår alt nedenunder', () => {
  const a = [0, 0, 0, 1, 0, 0];
  const b = [0, 0, 0, 0, 9, 99];
  assert.ok(compareVectors(b, a) < 0);
  assert.ok(compareVectors(a, b) > 0);
  assert.equal(compareVectors([0, 1.0000000001], [0, 1]), 0);
});

test('målene vejes trinvist: øverste n, næste n − 1 … nederste 1', () => {
  const input = makeInput({
    students: studentsOf(8, (i) => ({ K: i % 2 ? 'P' : 'D', S: String(i), N: String(9 - i) })),
    rules: [
      { type: 'distribute', column: 'K' },
      { type: 'separate', column: 'K', values: ['P'] },
      { type: 'balance', column: 'S' },
      { type: 'minimizediff', column: 'N' },
    ],
  });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  const goals = grade.precedence.steps.find((s) => s.step === 5);
  assert.deepEqual(goals.parts.map((p) => [p.rule, p.weight]), [[0, 3], [2, 2], [3, 1]]);
  const expected = goals.parts.reduce((sum, p) => sum + p.weight * p.normalized, 0);
  assert.ok(Math.abs(goals.value - expected) < 1e-12);
});

test('målene måles på samme skala: delt med en tilfældig delings tal', () => {
  const input = makeInput({ students: studentsOf(8, (i) => ({ S: String(i) })), rules: [{ type: 'balance', column: 'S' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  const r = grade.rules[0];
  const goals = grade.precedence.steps.find((s) => s.step === 5);
  assert.ok(r.randomBaseline > 0);
  assert.ok(Math.abs(goals.parts[0].normalized - r.value / r.randomBaseline) < 1e-12);
});

test('en bedre deling får en bedre række (Fordel)', () => {
  const input = makeInput({ students: studentsOf(8, (i) => ({ K: i <= 4 ? 'P' : 'D' })), rules: [{ type: 'distribute', column: 'K' }] });
  const bad = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  const good = judge(input, makeAnswer([ids(1, 2, 5, 6), ids(3, 4, 7, 8)]), fast);
  assert.ok(compareVectors(good.precedence.vector, bad.precedence.vector) < 0);
});

test('samme input og samme svar giver præcis samme karakter (fast frø)', () => {
  const input = makeInput({ students: studentsOf(12, (i) => ({ S: String(i % 5), K: i % 3 ? 'P' : 'D' })), rules: [{ type: 'balance', column: 'S' }, { type: 'distribute', column: 'K' }] });
  const answer = makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8), ids(9, 10, 11, 12)]);
  assert.deepEqual(judge(input, answer).precedence, judge(input, answer).precedence);
});
