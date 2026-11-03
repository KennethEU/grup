#!/usr/bin/env node
// Kodegennemgang: kanttilfælde og robusthed. Hvert tilfælde køres gennem
// run() (og check()), og det vigtigste af svaret skrives kort.
//
//   node gennemgang/kant.mjs

import { run, check } from '../engine/engine.js';

const students = (n, make = () => ({})) => Array.from({ length: n }, (_, i) => ({ _rowId: 'r' + i, ...make(i) }));
const base = (over) => ({
  contractVersion: 2,
  view: 'home',
  students: students(8, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng', Tal: String(i) })),
  rules: [],
  columnOrders: {},
  agreements: { together: [], avoid: [] },
  lockedGroups: [],
  size: { mode: 'perGroup', target: 4, adjust: 'plus' },
  topics: [],
  matrix: null,
  budget: { maxSeconds: 1, maxAttempts: 3, minAttempts: 1 },
  seed: 1,
  ...over,
});

const cases = {
  'én gruppe (count 1), Fordel + Balancér': base({ size: { mode: 'count', count: 1 }, rules: [{ type: 'distribute', column: 'Køn' }, { type: 'balance', column: 'Tal' }] }),
  'alle i én Skal sammen-blok (4 elever, 4 pr. gruppe)': base({ students: students(4), agreements: { together: [['r0', 'r1', 'r2', 'r3']], avoid: [] } }),
  'to blokke á 2 i grupper á 2 + Undgå på tværs': base({ students: students(4), size: { mode: 'count', count: 2 }, agreements: { together: [['r0', 'r1'], ['r2', 'r3']], avoid: [['r0', 'r2']] } }),
  'blok større end gruppen + en anden blok, der er fin': base({ agreements: { together: [['r0', 'r1', 'r2', 'r3', 'r4', 'r5'], ['r6', 'r7']], avoid: [] } }),
  'blok med Adskil imod sig OG på tværs af pulje': base({
    rules: [{ type: 'separate', column: 'Køn', values: ['Pige'] }, { type: 'aggregate', column: 'Køn' }],
    agreements: { together: [['r1', 'r3']], avoid: [] },
  }),
  'blok kun med ukendte elever + Undgå med én kendt': base({ agreements: { together: [['x1', 'x2']], avoid: [['r0', 'x9']] } }),
  'samme elev i to Skal sammen-lister (ikke slået sammen)': base({ agreements: { together: [['r0', 'r1'], ['r1', 'r2']], avoid: [] } }),
  'n = 1': base({ students: students(1) }),
  'perGroup target 10 (+1) med 3 elever': base({ students: students(3), size: { mode: 'perGroup', target: 10, adjust: 'plus' } }),
  'perGroup target 10 (-1) med 3 elever': base({ students: students(3), size: { mode: 'perGroup', target: 10, adjust: 'minus' } }),
  'count 20 med 8 elever': base({ size: { mode: 'count', count: 20 } }),
  'count 3 med 2 låste (→ 1 ny)': base({ size: { mode: 'count', count: 3 }, lockedGroups: [{ id: 'L1', number: 1, name: 'G1', members: ['x1'], topic: null }, { id: 'L2', number: 2, name: 'G2', members: ['x2'], topic: 'Gammelt' }], topics: ['A', 'B'] }),
  'Adskil med værdier ingen har, og med mellemrum/store bogstaver': base({ rules: [{ type: 'separate', column: 'Køn', values: ['  PIGE ', 'Ukendt'] }] }),
  'Balancér på kolonne helt uden tal (tekst)': base({ rules: [{ type: 'balance', column: 'Køn' }] }),
  'Balancér på kolonne helt tom': base({ students: students(8, () => ({ Tom: '' })), rules: [{ type: 'balance', column: 'Tom' }] }),
  'Opdel hvor alle celler er tomme': base({ students: students(8, () => ({ Hold: '' })), rules: [{ type: 'aggregate', column: 'Hold' }] }),
  'Opdel med 3 puljer og count 2': base({ students: students(9, (i) => ({ Hold: 'abc'[i % 3] })), rules: [{ type: 'aggregate', column: 'Hold' }], size: { mode: 'count', count: 2 } }),
  'flere emner end grupper': base({ topics: ['A', 'B', 'C', 'D'] }),
  'mode full i stamgrupper (ugyldigt input)': base({ size: { mode: 'full' } }),
  'matrix full med Opdel-regel': base({
    view: 'matrix',
    students: students(8, (i) => ({ Hold: i < 4 ? 'x' : 'y' })),
    rules: [{ type: 'aggregate', column: 'Hold' }],
    size: { mode: 'full' },
    matrix: { source: 'homeGroup', homeGroups: [{ id: 'S1', members: ['r0', 'r1', 'r4', 'r5'], topic: null }, { id: 'S2', members: ['r2', 'r3', 'r6', 'r7'], topic: null }] },
  }),
  'matrix full, elever uden stamgruppe og en tom kilde': base({
    view: 'matrix',
    size: { mode: 'full' },
    matrix: { source: 'topic', homeGroups: [{ id: 'S1', members: ['r0', 'r1', 'r2'], topic: 'A' }, { id: 'S2', members: ['r3', 'r4'], topic: 'B' }, { id: 'S3', members: ['x1'], topic: 'C' }] },
  }),
  'matrix perGroup med kilder': base({
    view: 'matrix',
    size: { mode: 'perGroup', target: 2, adjust: 'plus' },
    matrix: { source: 'topic', homeGroups: [{ id: 'S1', members: ['r0', 'r1', 'r2', 'r3'], topic: 'A' }, { id: 'S2', members: ['r4', 'r5', 'r6', 'r7'], topic: 'B' }] },
  }),
  'dubleret _rowId': base({ students: [...students(7), { _rowId: 'r0' }] }),
  'kolonnenavne: tom, constructor, __proto__, emoji': base({
    students: students(8, (i) => ({ '': 'a', constructor: i % 2 ? 'x' : 'y', __proto__: { a: 1 }, '🎓 Niveau': i % 3 ? 'Høj' : 'Lav' })),
    rules: [{ type: 'distribute', column: '' }, { type: 'distribute', column: 'constructor' }, { type: 'cluster', column: '🎓 Niveau' }],
  }),
  'regel på kolonne, der mangler hos eleverne': base({ rules: [{ type: 'distribute', column: 'Findes ikke' }, { type: 'balance', column: 'Findes ikke' }] }),
  'tal: "1.000", "7,5", "-3", "02", "1 000", "7.", ",5", "+4"': base({
    students: students(8, (i) => ({ T: ['1.000', '7,5', '-3', '02', '1 000', '7.', ',5', '+4'][i] })),
    rules: [{ type: 'balance', column: 'T' }],
  }),
  'rangering med tal-celler udenfor og tom rangering': base({
    students: students(8, (i) => ({ N: ['Lav', 'Middel', 'Høj', '7', '', 'høj ', 'LAV', 'Mellem'][i] })),
    rules: [{ type: 'minimizediff', column: 'N' }, { type: 'group_sort', column: 'N' }],
    columnOrders: { N: ['Lav', 'Middel', 'Høj'] },
  }),
  'Saml på tal med nogle tekstceller': base({
    students: students(8, (i) => ({ K: ['4', '7', '10', '12', 'Fritaget', 'Syg', '02', '7'][i] })),
    rules: [{ type: 'group_sort', column: 'K' }],
  }),
  'samme regel to gange + Balancér/Ensartede på samme kolonne': base({ rules: [{ type: 'distribute', column: 'Køn' }, { type: 'distribute', column: 'Køn' }, { type: 'balance', column: 'Tal' }, { type: 'minimizediff', column: 'Tal' }] }),
  'meget lange værdier og linjeskift': base({ students: students(8, (i) => ({ X: i % 2 ? 'a'.repeat(5000) : 'b\nc' })), rules: [{ type: 'distribute', column: 'X' }] }),
  'budget mangler / tomme felter': { contractVersion: 2, view: 'home', students: students(6), rules: [], size: { mode: 'perGroup', target: 3, adjust: 'plus' } },
  'students tom': base({ students: [] }),
};

for (const [name, input] of Object.entries(cases)) {
  let out;
  try {
    const answer = await run(input, {});
    const sizes = answer.groups ? answer.groups.map((g) => g.members.length).join(',') : '-';
    const msgs = (answer.messages || []).map((m) => `${m.code}${m.unavoidable !== undefined ? `(${m.unavoidable ? 'uundg' : 'igen'})` : ''}: ${m.text}`);
    out = `${answer.status}${answer.reason ? ' ' + answer.reason.code + (answer.detail ? ' ' + answer.detail.split('\n')[0] : '') : ''} · grupper ${sizes}${answer.lockedTopics && Object.keys(answer.lockedTopics).length ? ' · lockedTopics ' + JSON.stringify(answer.lockedTopics) : ''}${answer.groups && answer.groups.some((g) => g.topic) ? ' · emner ' + answer.groups.map((g) => g.topic).join(',') : ''} · rules ${JSON.stringify((answer.rules || []).map((r) => r.met))}\n    ${msgs.join('\n    ') || '(ingen beskeder)'}`;
    const c = check(input);
    if (c.status === 'error') out += '\n    check(): error';
  } catch (e) {
    out = 'KASTEDE ' + e.message;
  }
  console.log(`\n## ${name}\n  ${out}`);
}
