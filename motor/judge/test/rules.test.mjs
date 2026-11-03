// Test af målingerne én regel ad gangen, med tal regnet i hånden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../judge.mjs';
import { pairs, evenSpreadPairs, variance, similarityLimit } from '../rules.mjs';
import { makeInput, makeAnswer, studentsOf, ids, ruleValue } from './helpers.mjs';

const fast = { samples: 20 };

test('par og jævn spredning', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(pairs), [0, 0, 1, 3, 6, 10]);
  assert.equal(evenSpreadPairs(9, 4), 6); // 3/2/2/2 → 3 + 1 + 1 + 1
  assert.equal(evenSpreadPairs(4, 4), 0);
  assert.equal(evenSpreadPairs(5, 4), 1);
  assert.equal(evenSpreadPairs(7, 2), 9); // 4/3 → 6 + 3
});

test('varians er "delt med antal"', () => {
  assert.equal(variance([1, 3]), 1);
  assert.equal(variance([5, 5, 8]), 2);
  assert.equal(variance([7]), 0);
});

test('Adskil: par af elever med NOGEN af de valgte værdier; store/små bogstaver tæller ikke', () => {
  const students = studentsOf(8, (i) => ({ Niveau: ['Høj', 'høj ', 'HØJ', 'Lav', 'Middel', 'Lav', 'Lav', 'Lav'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'separate', column: 'Niveau', values: ['Høj', 'Middel'] }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  const r = grade.rules[0];
  assert.equal(r.value, 3); // s1, s2, s3 sammen → 3 par; s5 alene i sin gruppe
  assert.equal(r.best, 2); // 4 elever på 2 grupper → 2 + 2 → 1 + 1
  assert.equal(r.distance, 1);
  assert.equal(r.met, false);
  assert.deepEqual(r.groupsMet, [false, true]);
});

test('Adskil altid: bedst mulige tager højde for Skal sammen-blokke', () => {
  const students = studentsOf(8, (i) => ({ Sprog: i <= 2 ? 'Spansk' : 'Tysk' }));
  const input = makeInput({ students, rules: [{ type: 'strict_separate', column: 'Sprog', values: ['spansk'] }], together: [ids(1, 2)] });
  const grade = judge(input, { ...makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]) }, fast);
  assert.equal(grade.rules[0].value, 1);
  assert.equal(grade.rules[0].best, 1);
});

test('Undgå hinanden: alle aftaler som ét tal, i par', () => {
  const input = makeInput({ students: studentsOf(12, () => ({})), avoid: [ids(1, 2, 3, 4, 5), ids(6, 7)] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 6), ids(4, 5, 7, 8), ids(9, 10, 11, 12)]), fast);
  assert.equal(grade.avoid.value, 3 + 1); // s1–s3 sammen (3 par), s4+s5 (1 par); s6 og s7 adskilt
  assert.equal(grade.avoid.best, 2); // 5 elever på 3 grupper → 2/2/1 → 1 + 1
  assert.equal(grade.avoid.met, false);
});

test('Klyng: elever, der står alene med deres værdi; tomme celler tæller ikke', () => {
  const students = studentsOf(8, (i) => ({ Sprog: ['Tysk', 'Tysk', 'Fransk', 'Spansk', 'Fransk', 'Fransk', '', 'Tysk'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'cluster', column: 'Sprog' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  assert.equal(grade.rules[0].value, 3); // Fransk og Spansk alene i gruppe 1, Tysk alene i gruppe 2
  assert.equal(grade.rules[0].best, 1); // kun Spansk har én elev i klassen
  assert.deepEqual(grade.rules[0].groupsMet, [false, false]);
});

test('Fordel: 13 piger og 13 drenge i 6 grupper — kun afvigelse ud over ⌊f⌋…⌈f⌉ tæller', () => {
  const sizes = [5, 5, 4, 4, 4, 4];
  const girls = [3, 3, 2, 2, 2, 1];
  const groups = [];
  let next = 1;
  const students = {};
  sizes.forEach((size, g) => {
    const members = [];
    for (let i = 0; i < size; i++) {
      const id = `s${next++}`;
      students[id] = { Køn: i < girls[g] ? 'Pige' : 'Dreng' };
      members.push(id);
    }
    groups.push(members);
  });
  const input = makeInput({ students, rules: [{ type: 'distribute', column: 'Køn' }] });
  const grade = judge(input, makeAnswer(groups), fast);
  // Gruppe med 1 pige og 3 drenge: f = 2 for begge → 1 for lidt + 1 for meget.
  assert.equal(grade.rules[0].value, 2);
  assert.deepEqual(grade.rules[0].groupsMet, [true, true, true, true, true, false]);
});

test('Fordel "opfyldt" som i dag: alle værdier med og ingen for mange', () => {
  const students = studentsOf(6, (i) => ({ Fag: ['A', 'B', 'C', 'A', 'B', 'C'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'distribute', column: 'Fag' }], size: { mode: 'perGroup', target: 3, adjust: 'plus' } });
  const good = judge(input, makeAnswer([ids(1, 2, 3), ids(4, 5, 6)]), fast);
  assert.equal(good.rules[0].met, true);
  const bad = judge(input, makeAnswer([ids(1, 4, 2), ids(3, 5, 6)]), fast);
  assert.deepEqual(bad.rules[0].groupsMet, [false, false]); // gruppe 1 mangler C, gruppe 2 mangler A
  assert.equal(bad.rules[0].value, 2 + 2);
});

test('Balancér: summen af |gruppens snit − puljens snit|, tekst og tomme celler tæller ikke', () => {
  const students = studentsOf(8, (i) => ({ Snit: ['2,0', '4', 'Fritaget', '', '6', '8', '6', '8'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'balance', column: 'Snit' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  // Gruppe 1: snit 3. Gruppe 2: snit 7. Puljens snit: (2+4+6+8+6+8)/6 = 34/6.
  const poolMean = 34 / 6;
  assert.ok(Math.abs(grade.rules[0].value - (Math.abs(3 - poolMean) + Math.abs(7 - poolMean))) < 1e-12);
  assert.equal(grade.rules[0].met, false);
});

test('Balancér: opfyldt inden for 5 % af spændet; under to grupper med tal = ikke målt', () => {
  const students = studentsOf(8, (i) => ({ Snit: ['0', '10', '5', '5', '0', '10', '4', '6'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'balance', column: 'Snit' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  assert.equal(grade.rules[0].value, 0);
  assert.equal(grade.rules[0].met, true);
  const one = makeInput({ students: studentsOf(8, (i) => ({ Snit: i <= 4 ? String(i) : 'x' })), rules: [{ type: 'balance', column: 'Snit' }] });
  const g1 = judge(one, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  assert.equal(g1.rules[0].met, null);
  assert.deepEqual(g1.rules[0].groupsMet, [true, null]);
  // Tolerancen: spænd 11 → 0,55. Snittene 5,5 og 5 ligger begge 0,25 fra puljens 5,25.
  const edge = makeInput({ students: studentsOf(4, (i) => ({ Snit: ['0', '11', '10', '0'][i - 1] })), rules: [{ type: 'balance', column: 'Snit' }], size: { mode: 'perGroup', target: 2, adjust: 'plus' } });
  const ge = judge(edge, makeAnswer([ids(1, 2), ids(3, 4)]), fast);
  assert.deepEqual(ge.rules[0].groupsMet, [true, true]);
});

test('Ensartede: summen af gruppernes varians og grænsen max(1; 0,1·(spænd/2)²)', () => {
  const students = studentsOf(5, (i) => ({ Snit: ['1', '3', '5', '5', '8'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'minimizediff', column: 'Snit' }], size: { mode: 'count', count: 2 } });
  const grade = judge(input, makeAnswer([ids(1, 2), ids(3, 4, 5)]), fast);
  assert.equal(grade.rules[0].value, 1 + 2);
  assert.equal(similarityLimit(7), 1.225);
  assert.equal(similarityLimit(2), 1);
  assert.deepEqual(grade.rules[0].groupsMet, [true, false]);
});

test('Ensartede med rangering: Lav=1, Middel=2, Høj=3; ukendte værdier er tomme', () => {
  const students = studentsOf(4, (i) => ({ Niveau: ['Lav', 'høj', 'Middel', 'Ukendt'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'minimizediff', column: 'Niveau' }], columnOrders: { Niveau: ['Lav', 'Middel', 'Høj'] }, size: { mode: 'perGroup', target: 2, adjust: 'plus' } });
  const grade = judge(input, makeAnswer([ids(1, 2), ids(3, 4)]), fast);
  assert.equal(grade.rules[0].value, 1); // [1, 3] → varians 1; [2] → 0
  const none = makeInput({ students, rules: [{ type: 'minimizediff', column: 'Niveau' }], size: { mode: 'perGroup', target: 2, adjust: 'plus' } });
  assert.equal(judge(none, makeAnswer([ids(1, 2), ids(3, 4)]), fast).rules[0].met, null); // kun tekst → ikke målt
});

test('Saml på tekst: værditælling minus det mindst mulige, og dagens "én værdi pr. gruppe"', () => {
  const students = studentsOf(8, (i) => ({ Interesse: ['A', 'A', 'B', 'B', 'A', 'B', 'C', 'C'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'group_sort', column: 'Interesse' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  const r = grade.rules[0];
  assert.equal(r.mode, 'text');
  assert.equal(r.value, 5 - 3); // 2 + 3 forskellige; A, B og C kunne hver stå i én gruppe
  assert.equal(r.met, false);
  assert.equal(r.today.share, 0);
  const perfect = judge(makeInput({ students: studentsOf(8, (i) => ({ Interesse: i <= 4 ? 'A' : 'B' })), rules: [{ type: 'group_sort', column: 'Interesse' }] }), makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  assert.equal(perfect.rules[0].value, 0);
  assert.equal(perfect.rules[0].met, true);
  assert.equal(perfect.rules[0].today.share, 1);
});

test('Saml på tal med tekst: varians for grupper med tal, værditælling for grupper uden', () => {
  const students = studentsOf(8, (i) => ({ Snit: ['1', '3', '5', '5', 'Syg', 'Fritaget', 'Syg', 'Syg'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'group_sort', column: 'Snit' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  const r = grade.rules[0];
  assert.equal(r.mode, 'numeric');
  assert.equal(r.parts.variance, 2.75); // [1, 3, 5, 5]: snit 3,5, varians (6,25+0,25+2,25+2,25)/4
  assert.equal(r.parts.valueCount, 0); // "Syg" og "Fritaget" er to værdier; færre grupper kan de ikke stå i
  assert.equal(r.met, false);
  assert.equal(r.today.share, 0); // gruppe 1 over grænsen (1), gruppe 2 har to værdier
});

test('Opdel som regel: blandede grupper tælles', () => {
  const students = studentsOf(8, (i) => ({ Hold: i <= 4 ? 'a' : 'b' }));
  const input = makeInput({ students, rules: [{ type: 'aggregate', column: 'Hold' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 5), ids(4, 6, 7, 8)]), fast);
  assert.equal(grade.rules[0].value, 2);
  assert.ok(grade.failures.some((f) => f.check === 'split'));
});

test('Puljer: Balancér måles mod SIN pulje, Fordel inden for puljen', () => {
  const students = studentsOf(8, (i) => ({ Hold: i <= 4 ? 'a' : 'b', Snit: i <= 4 ? '2' : '8', Køn: i % 2 ? 'Pige' : 'Dreng' }));
  const input = makeInput({ students, size: { mode: 'perGroup', target: 2, adjust: 'plus' }, rules: [{ type: 'aggregate', column: 'Hold' }, { type: 'balance', column: 'Snit' }, { type: 'distribute', column: 'Køn' }] });
  const grade = judge(input, makeAnswer([ids(1, 2), ids(3, 4), ids(5, 6), ids(7, 8)]), fast);
  assert.equal(grade.failures.length, 0);
  assert.equal(ruleValue(grade, 1), 0);
  assert.equal(ruleValue(grade, 2), 0);
});

test('Fordel: puljens størrelse tæller også elever med tom celle', () => {
  // 2 piger, 2 drenge og 2 tomme i grupper á 3: f = 2 · 3 / 6 = 1 for begge køn.
  const students = studentsOf(6, (i) => ({ Køn: ['Pige', 'Pige', '', 'Dreng', 'Dreng', ''][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'distribute', column: 'Køn' }], size: { mode: 'perGroup', target: 3, adjust: 'plus' } });
  const grade = judge(input, makeAnswer([ids(1, 2, 3), ids(4, 5, 6)]), fast);
  assert.equal(grade.rules[0].value, 4); // hver gruppe: 1 for mange af det ene køn og 1 for lidt af det andet
});

test('Fordel "opfyldt": en gruppe, der mangler en værdi, er ikke opfyldt, selv uden for mange', () => {
  // A, B og C; grupper á 4: højst ⌈4/3⌉ = 2 af hver, og alle tre skal være med.
  const students = studentsOf(8, (i) => ({ Fag: ['A', 'A', 'B', 'B', 'A', 'B', 'C', 'C'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'distribute', column: 'Fag' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  assert.deepEqual(grade.rules[0].groupsMet, [false, true]);
});

test('Balancér: 5 % af spændet, ikke mere', () => {
  // Spænd 10 → grænse 0,5. Snittene 5,75 og 4,25 ligger 0,75 fra puljens 5.
  const students = studentsOf(8, (i) => ({ Snit: ['0', '10', '6', '7', '0', '10', '4', '3'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'balance', column: 'Snit' }] });
  const grade = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)]), fast);
  assert.equal(grade.rules[0].value, 1.5);
  assert.deepEqual(grade.rules[0].groupsMet, [false, false]);
});

test('Saml med tal: værditællingen for grupper uden tal er med i "opfyldt"', () => {
  const students = studentsOf(6, (i) => ({ Snit: ['1', '1', 'Syg', 'Fritaget', 'Syg', 'Fritaget'][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'group_sort', column: 'Snit' }], size: { mode: 'perGroup', target: 2, adjust: 'plus' } });
  const grade = judge(input, makeAnswer([ids(1, 2), ids(3, 4), ids(5, 6)]), fast);
  assert.equal(grade.rules[0].parts.variance, 0);
  assert.equal(grade.rules[0].parts.valueCount, 2); // 2 + 2 forskellige; Syg og Fritaget kunne stå i hver sin gruppe
  assert.equal(grade.rules[0].met, false);
});

test('Fordel: dagens test ved siden af det nye "retfærdige antal" (svar6 39)', () => {
  // A, A, B, A, B og en tom celle; grupper á 3. Antal værdier = 2 (kun de udfyldte),
  // gruppens størrelse = 3 (også den tomme): højst ⌈3/2⌉ = 2 af hver.
  const students = studentsOf(6, (i) => ({ Fag: ['A', 'A', 'B', 'A', 'B', ''][i - 1] }));
  const input = makeInput({ students, rules: [{ type: 'distribute', column: 'Fag' }], size: { mode: 'perGroup', target: 3, adjust: 'plus' } });
  const grade = judge(input, makeAnswer([ids(1, 2, 3), ids(4, 5, 6)]), fast);
  const r = grade.rules[0];
  assert.deepEqual(r.groupsMet, [true, true]);
  assert.equal(r.today.share, 1);
  // Det retfærdige antal: A har 3 af 6 → f = 1,5 → 1–2; B har 2 → f = 1. Ingen afvigelse.
  assert.equal(r.value, 0);
  assert.equal(r.fair.met, true);
  const skew = judge(input, makeAnswer([ids(1, 2, 4), ids(3, 5, 6)]), fast).rules[0];
  assert.equal(skew.fair.met, false); // tre A i én gruppe
  assert.equal(skew.today.share, 0); // A tre gange og B mangler; B to gange og A mangler
});
