// Test af de faste kontroller (spec. 15.1): hver fejl skal fanges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../judge.mjs';
import { makeInput, makeAnswer, studentsOf, ids, failureChecks } from './helpers.mjs';

const fast = { samples: 10 };
const base = () => makeInput({ students: studentsOf(8, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })), rules: [{ type: 'distribute', column: 'Køn' }] });
const good = () => makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]);

test('et gyldigt svar har ingen fejl', () => {
  const grade = judge(base(), good(), fast);
  assert.deepEqual(grade.failures, []);
  assert.equal(grade.precedence.vector[0], 0);
});

test('en manglende, en dobbelt og en ukendt elev fanges', () => {
  assert.deepEqual(failureChecks(judge(base(), makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7)]), fast)).filter((c) => c === 'membership'), ['membership']);
  assert.ok(failureChecks(judge(base(), makeAnswer([ids(1, 2, 3, 4), ids(4, 5, 6, 7, 8)]), fast)).includes('membership'));
  assert.ok(failureChecks(judge(base(), makeAnswer([ids(1, 2, 3, 4), ['s5', 's6', 's7', 's8', 'x']]), fast)).includes('membership'));
  assert.ok(failureChecks(judge(base(), makeAnswer([ids(1, 2, 3, 4, 5, 6, 7, 8), []]), fast)).includes('membership'));
});

test('fejl står først i rangordenen, så de ikke kan overses', () => {
  const grade = judge(base(), makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7)]), fast);
  assert.ok(grade.precedence.vector[0] > 0);
  assert.equal(grade.precedence.steps[0].label, 'Faste krav (antal fejl)');
});

test('forkerte størrelser og forkert antal grupper fanges', () => {
  assert.ok(failureChecks(judge(base(), makeAnswer([ids(1, 2, 3, 4, 5), ids(6, 7, 8)]), fast)).includes('sizes'));
  assert.ok(failureChecks(judge(base(), makeAnswer([ids(1, 2, 3), ids(4, 5, 6), ids(7, 8)]), fast)).includes('sizes'));
});

test('elever fra en låst gruppe må ikke stå i de nye grupper', () => {
  const input = base();
  input.lockedGroups = [{ id: 'L1', number: 1, name: 'Gruppe 1', members: ['x1', 'x2'], topic: null }];
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), [...ids(5, 6, 7, 8), 'x1']]), fast);
  assert.ok(failureChecks(grade).includes('locked'));
  const bogus = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)], [], { L9: 'EU' }), fast);
  assert.ok(failureChecks(bogus).includes('locked'));
});

test('Opdel: en gruppe, der blander puljer, fanges', () => {
  const input = makeInput({ students: studentsOf(8, (i) => ({ Hold: i <= 4 ? 'a' : 'b' })), rules: [{ type: 'aggregate', column: 'Hold' }] });
  assert.deepEqual(judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast).failures, []);
  assert.ok(failureChecks(judge(input, makeAnswer([ids(1, 2, 3, 5), ids(4, 6, 7, 8)]), fast)).includes('split'));
});

test('Opdel med to regler: grupperne skal være rene på begge', () => {
  const input = makeInput({ students: studentsOf(8, (i) => ({ Hold: i <= 4 ? 'a' : 'b', Valg: i % 2 ? 'x' : 'y' })), rules: [{ type: 'aggregate', column: 'Hold' }, { type: 'aggregate', column: 'Valg' }], size: { mode: 'perGroup', target: 2, adjust: 'plus' } });
  assert.deepEqual(judge(input, makeAnswer([ids(1, 3), ids(2, 4), ids(5, 7), ids(6, 8)]), fast).failures, []);
  assert.ok(failureChecks(judge(input, makeAnswer([ids(1, 2), ids(3, 4), ids(5, 7), ids(6, 8)]), fast)).includes('split'));
});

test('en delt Skal sammen-blok fanges', () => {
  const input = base();
  input.agreements.together = [ids(1, 5)];
  assert.ok(failureChecks(judge(input, good(), fast)).includes('together'));
  assert.deepEqual(judge(input, makeAnswer([ids(1, 5, 3, 4), ids(2, 6, 7, 8)]), fast).failures, []);
});

test('svaret "ok", når dannelsen skulle have stoppet, fanges', () => {
  const input = base();
  input.agreements.together = [ids(1, 2)];
  input.agreements.avoid = [ids(1, 2)];
  assert.ok(failureChecks(judge(input, good(), fast)).includes('stop'));
});

test('"umulig" uden grund fanges; med grund er det rigtigt', () => {
  const impossible = { contractVersion: 2, status: 'impossible', groups: null, messages: [] };
  const plain = judge(base(), impossible, fast);
  assert.equal(plain.stop.justified, false);
  assert.ok(failureChecks(plain).includes('stop'));
  const input = base();
  input.agreements.together = [ids(1, 2, 3, 4, 5)];
  const grade = judge(input, impossible, fast);
  assert.equal(grade.stop.justified, true);
  assert.deepEqual(grade.failures, []);
  assert.equal(grade.stop.reasons[0].code, 'together-too-big');
});

test('dommeren stoler aldrig på svarets egne rules og messages', () => {
  const answer = makeAnswer([ids(1, 3, 5, 7), ids(2, 4, 6, 8)]);
  answer.rules = [{ rule: 0, met: true }];
  answer.messages = [{ type: 'note', code: 'rule-not-met', unavoidable: true, text: 'Alt er fint.' }];
  const grade = judge(base(), answer, fast);
  assert.equal(grade.rules[0].met, false);
  assert.equal(grade.rules[0].value, 8); // 4 piger i én gruppe og 4 drenge i den anden: 2 + 2 i hver
});

test('matrix "Fuld": mindst én fra hver kilde, jævnt pr. kilde og i størrelse', () => {
  const input = makeInput({
    view: 'matrix',
    students: studentsOf(12, () => ({})),
    size: { mode: 'full' },
    matrix: { source: 'topic', homeGroups: [
      { id: 'S1', members: ids(1, 2, 3, 4, 5, 6), topic: 'A' },
      { id: 'S2', members: ids(7, 8, 9), topic: 'B' },
      { id: 'S3', members: ids(10, 11, 12), topic: 'C' },
    ] },
  });
  // 3 matrixgrupper (kilderne B og C har 3); A har 3 ekstra, en til hver.
  const ok = makeAnswer([ids(1, 2, 7, 10), ids(3, 4, 8, 11), ids(5, 6, 9, 12)]);
  assert.deepEqual(judge(input, ok, fast).failures, []);
  const missing = makeAnswer([ids(1, 2, 7, 8), ids(3, 4, 10, 11), ids(5, 6, 9, 12)]);
  const texts = judge(input, missing, fast).failures.map((f) => f.text);
  assert.ok(texts.some((t) => t.includes('ingen fra kilden "C"')), texts.join(' | '));
  // A's ekstra elever klumpet: 3, 2, 1 fra A, men størrelserne er 5, 4, 3.
  const uneven = makeAnswer([ids(1, 2, 3, 7, 10), ids(4, 5, 8, 11), ids(6, 9, 12)]);
  assert.ok(failureChecks(judge(input, uneven, fast)).includes('matrix'));
});

test('matrix "Fuld": jævn størrelse er ikke nok; hver kilde skal også være jævn (svar5 34)', () => {
  const input = makeInput({
    view: 'matrix',
    students: studentsOf(12, () => ({})),
    size: { mode: 'full' },
    matrix: { source: 'homeGroup', homeGroups: [
      { id: 'S1', members: ids(1, 2, 3, 4), topic: null },
      { id: 'S2', members: ids(5, 6, 7, 8), topic: null },
      { id: 'S3', members: ids(9, 10), topic: null },
      { id: 'S4', members: ids(11, 12), topic: null },
    ] },
  });
  // To grupper á 6: S1's to ekstra i gruppe 1 og S2's to ekstra i gruppe 2.
  const clumped = makeAnswer([ids(1, 2, 3, 5, 9, 11), ids(4, 6, 7, 8, 10, 12)]);
  const grade = judge(input, clumped, fast);
  assert.ok(failureChecks(grade).includes('matrix'));
  assert.ok(!failureChecks(grade).includes('sizes'));
  const spread = makeAnswer([ids(1, 2, 5, 6, 9, 11), ids(3, 4, 7, 8, 10, 12)]);
  assert.deepEqual(judge(input, spread, fast).failures, []);
});

test('matrix: stamgrupper uden emne er hver sit emne', () => {
  const input = makeInput({
    view: 'matrix',
    students: studentsOf(9, () => ({})),
    size: { mode: 'full' },
    matrix: { source: 'topic', homeGroups: [
      { id: 'S1', members: ids(1, 2, 3), topic: 'A' },
      { id: 'S2', members: ids(4, 5, 6), topic: null },
      { id: 'S3', members: ids(7, 8, 9), topic: null },
    ] },
  });
  assert.deepEqual(judge(input, makeAnswer([ids(1, 4, 7), ids(2, 5, 8), ids(3, 6, 9)]), fast).failures, []);
  // To fra S2 og ingen fra S3 i første gruppe: forkert, selvom ingen af dem har emne.
  assert.ok(failureChecks(judge(input, makeAnswer([ids(1, 4, 5), ids(2, 6, 8), ids(3, 7, 9)]), fast)).includes('matrix'));
});

test('emner skal følge reglen; uden emner må grupperne ikke have emner', () => {
  const input = base();
  input.topics = ['Klima', 'EU'];
  assert.deepEqual(judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)], ['Klima', 'EU']), fast).failures, []);
  assert.ok(failureChecks(judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)], ['EU', 'Klima']), fast)).includes('topics'));
  assert.ok(failureChecks(judge(base(), makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)], ['Klima', null]), fast)).includes('topics'));
});

test('status "unsupported" og "error" bedømmes ikke, men er ingen fejl i grupperne', () => {
  const grade = judge(base(), { contractVersion: 2, status: 'unsupported', reason: { code: 'not-built', text: 'x' } }, fast);
  assert.equal(grade.gradable, false);
  assert.deepEqual(grade.failures, []);
});

test('status "stopped" med grupper bedømmes som almindelige grupper', () => {
  const answer = { ...good(), status: 'stopped' };
  const grade = judge(base(), answer, fast);
  assert.equal(grade.gradable, true);
  assert.deepEqual(grade.failures, []);
});

test('puljer: lige gode fordelinger godtages, men dommeren melder, om reglen ved lighed blev fulgt', () => {
  const students = studentsOf(12, (i) => ({ Hold: i <= 6 ? 'a' : 'b' }));
  const input = makeInput({ students, rules: [{ type: 'aggregate', column: 'Hold' }], size: { mode: 'count', count: 3 } });
  const byRule = judge(input, makeAnswer([ids(1, 2, 3), ids(4, 5, 6), ids(7, 8, 9, 10, 11, 12)]), fast);
  assert.deepEqual(byRule.failures, []);
  assert.equal(byRule.tiebreak.followed, true);
  const other = judge(input, makeAnswer([ids(1, 2, 3, 4, 5, 6), ids(7, 8, 9), ids(10, 11, 12)]), fast);
  assert.deepEqual(other.failures, []);
  assert.equal(other.tiebreak.followed, false);
  assert.deepEqual(other.tiebreak.expected, [2, 1]);
});
