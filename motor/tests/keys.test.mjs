// Ugyldige størrelser og nøglen "samme besked" i check og svaret
// (spørgsmål 47). Nøglen er code + rule + pool + values + eleverne (sorteret).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { run, check } from '../engine/engine.js';

const key = (m) => JSON.stringify([m.code, m.rule, m.pool, m.values, [...m.students].sort()]);
const noDuplicateKeys = (messages, label) => {
  const keys = messages.map(key);
  assert.equal(new Set(keys).size, keys.length, `${label}: to beskeder med samme nøgle`);
};

function classInput(rows, extra = {}) {
  return {
    contractVersion: 3,
    view: 'home',
    students: rows.map((row, i) => ({ _rowId: `r${i}`, ...row })),
    rules: [],
    columnOrders: {},
    agreements: { together: [], avoid: [] },
    lockedGroups: [],
    size: { mode: 'perGroup', target: 4, adjust: 'plus' },
    topics: [],
    budget: { maxSeconds: 1, maxAttempts: 3 },
    seed: 1,
    ...extra,
  };
}

const twelve = Array.from({ length: 12 }, (_, i) => ({ Navn: `Elev ${i}` }));

// ------------------------------------------------ 1. størrelser

const badSizes = [
  { mode: 'perGroup', target: -2, adjust: 'plus' },
  { mode: 'perGroup', target: -2, adjust: 'minus' },
  { mode: 'perGroup', target: -1, adjust: 'plus' },
  { mode: 'perGroup', target: 0, adjust: 'plus' },
  { mode: 'perGroup', target: 0, adjust: 'minus' },
  { mode: 'perGroup', target: 2.5, adjust: 'plus' },
  { mode: 'perGroup', target: '4', adjust: 'plus' },
  { mode: 'perGroup', target: 1000, adjust: 'plus' },
  { mode: 'count', count: 0 },
  { mode: 'count', count: -1 },
  { mode: 'something' },
];

for (const size of badSizes) {
  test(`størrelse ${JSON.stringify(size)}: unsupported / invalid-input i check og run`, { timeout: 2000 }, async () => {
    const input = classInput(twelve, { size });
    const before = check(input);
    assert.equal(before.status, 'unsupported');
    assert.equal(before.reason.code, 'invalid-input');
    assert.deepEqual(before.messages, []);
    const answer = await run(input, {});
    assert.equal(answer.status, 'unsupported');
    assert.equal(answer.reason.code, 'invalid-input');
    assert.ok(answer.reason.text.length > 0);
  });
}

test('count ikke større end antallet af låste grupper: invalid-input', { timeout: 2000 }, async () => {
  const input = classInput(twelve, {
    size: { mode: 'count', count: 2 },
    lockedGroups: [
      { id: 'L1', members: ['x1', 'x2'] },
      { id: 'L2', members: ['x3', 'x4'] },
    ],
  });
  assert.equal(check(input).reason.code, 'invalid-input');
  assert.equal((await run(input, {})).reason.code, 'invalid-input');
});

test('gyldige små størrelser virker stadig (1 pr. gruppe, 1 gruppe)', { timeout: 5000 }, async () => {
  for (const size of [{ mode: 'perGroup', target: 1, adjust: 'plus' }, { mode: 'count', count: 1 }, { mode: 'perGroup', target: 999, adjust: 'minus' }]) {
    const answer = await run(classInput(twelve, { size }), {});
    assert.equal(answer.status, 'ok', JSON.stringify(size));
  }
});

// ------------------------------------------------ 3. nøglen

// 3a og 3d: to Undgå hinanden-aftaler med en fælles elev og tre elever hver,
// i to grupper. Før kørslen én advarsel pr. aftale; efter kørslen ét resultat
// pr. aftale med præcis aftalens elever, og ingen advarsel ved siden af.
test('Undgå hinanden: én advarsel og ét resultat pr. aftale, med samme elever', async () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ Navn: `Elev ${i}` }));
  const avoid = [['r1', 'r2', 'r7'], ['r2', 'r5', 'r6']];
  const input = classInput(eight, { agreements: { together: [], avoid } });
  const before = check(input);
  noDuplicateKeys(before.messages, 'check');
  const warnings = before.messages.filter((m) => m.code === 'avoid-unavoidable');
  assert.equal(warnings.length, 2);
  const answer = await run(input, {});
  noDuplicateKeys(answer.messages, 'svar');
  assert.ok(!answer.messages.some((m) => m.code === 'avoid-unavoidable'), 'advarslen er erstattet af resultatet');
  const results = answer.messages.filter((m) => m.code === 'rule-not-met' && m.rule === null);
  assert.equal(results.length, 2);
  for (const w of warnings) {
    const r = results.find((x) => JSON.stringify([...x.students].sort()) === JSON.stringify([...w.students].sort()));
    assert.ok(r, `resultat for ${w.students}`);
    assert.equal(r.pool, w.pool);
    assert.equal(r.unavoidable, true);
  }
});

// 3a: to Skal sammen-beskeder med samme kode skelnes på eleverne.
test('Skal sammen: to beskeder med samme kode har hver sin nøgle', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ Sprog: i < 4 ? 'Tysk' : 'Fransk' }));
  const input = classInput(rows, {
    rules: [{ type: 'strict_separate', column: 'Sprog', values: ['Tysk'] }],
    agreements: { together: [['r0', 'r1'], ['r2', 'r3']], avoid: [] },
  });
  const before = check(input);
  const together = before.messages.filter((m) => m.code === 'together-vs-separate');
  assert.equal(together.length, 2);
  noDuplicateKeys(before.messages, 'check');
});

// 3b og 3c med Opdel: Fordel og Adskil får ét resultat pr. pulje, med samme
// regel, pulje og values som i check, og advarslen sendes ikke ved siden af.
test('Opdel: Fordel og Adskil pr. pulje, samme nøgle som i check, ingen dobbelt besked', async () => {
  // To puljer (Mat, Bio) med 8 elever hver og 2 grupper hver. Fordel på Køn:
  // 3 A og 5 B pr. pulje går ikke lige op i 2 grupper. Adskil: 3 markerede i
  // hver pulje kan ikke stå i hver sin af 2 grupper.
  const rows = [];
  for (const linje of ['Mat', 'Bio']) {
    for (let i = 0; i < 8; i++) rows.push({ Linje: linje, Køn: i < 3 ? 'A' : 'B', Rolle: i % 3 === 0 ? 'Leder' : '' });
  }
  const input = classInput(rows, {
    rules: [
      { type: 'aggregate', column: 'Linje' },
      { type: 'separate', column: 'Rolle', values: ['Leder'] },
      { type: 'distribute', column: 'Køn' },
    ],
  });
  const before = check(input);
  noDuplicateKeys(before.messages, 'check');
  const answer = await run(input, {});
  noDuplicateKeys(answer.messages, 'svar');
  // 3c: ingen advarsel i svaret, når samme regel og pulje har et resultat.
  for (const w of answer.messages.filter((m) => m.code === 'separate-unavoidable')) {
    assert.ok(!answer.messages.some((m) => m.code === 'rule-not-met' && m.rule === w.rule && m.pool === w.pool), 'advarsel og resultat');
  }
  const separateWarnings = before.messages.filter((m) => m.code === 'separate-unavoidable');
  assert.equal(separateWarnings.length, 2);
  for (const w of separateWarnings) {
    const r = answer.messages.find((m) => m.code === 'rule-not-met' && m.rule === w.rule && m.pool === w.pool);
    assert.ok(r, `resultat for Adskil i ${w.pool}`);
    assert.equal(r.unavoidable, true);
  }
  // 3b: Fordels values er de samme i check og svaret for samme regel og pulje.
  for (const r of answer.messages.filter((m) => m.code === 'rule-not-met' && m.rule === 2)) {
    assert.ok(r.pool !== null, 'Fordel har puljen med');
    const pre = before.messages.find((m) => m.code === 'rule-not-met' && m.rule === 2 && m.pool === r.pool);
    if (pre) assert.deepEqual(r.values, pre.values);
  }
});

test('Fordel uden Opdel: samme values i check og svaret', async () => {
  const rows = 'AAAAAAAB'.split('').map((v) => ({ Køn: v }));
  const input = classInput(rows, { rules: [{ type: 'distribute', column: 'Køn' }] });
  const pre = check(input).messages.find((m) => m.code === 'rule-not-met' && m.rule === 0);
  const answer = await run(input, {});
  const post = answer.messages.find((m) => m.code === 'rule-not-met' && m.rule === 0);
  assert.ok(pre && post);
  assert.equal(key(pre), key(post));
});
