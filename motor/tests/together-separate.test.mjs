// Skal sammen og Adskil (den almindelige): dannelsen stopper kun, når blokken
// beviseligt giver flere par, end klassen ellers er nødt til (spørgsmål 51).
// Adskil altid i en blok stopper stadig altid.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { run, check } from '../engine/engine.js';
import { stopReasons } from '../judge/feasibility.mjs';
import { buildTask as judgeTask } from '../judge/task.mjs';
import { expectedLayout } from '../judge/sizes.mjs';

const key = (m) => JSON.stringify([m.code, m.rule, m.pool, m.values, [...m.students].sort()]);

function input(rows, extra = {}) {
  return {
    contractVersion: 3,
    view: 'home',
    students: rows.map((row, i) => ({ _rowId: `r${i}`, ...row })),
    rules: [{ type: 'separate', column: 'Rolle', values: ['Ordstyrer'] }],
    columnOrders: {},
    agreements: { together: [['r0', 'r1']], avoid: [] },
    lockedGroups: [],
    size: { mode: 'count', count: 7 },
    topics: [],
    budget: { maxSeconds: 2, maxAttempts: 5 },
    seed: 1,
    ...extra,
  };
}

// m ordstyrere (de første) blandt n elever.
const roles = (n, m) => Array.from({ length: n }, (_, i) => ({ Rolle: i < m ? 'Ordstyrer' : 'Elev' }));
const judgeStops = (inp) => {
  const jt = judgeTask(inp);
  return stopReasons(jt, expectedLayout(jt)).reasons.map((r) => r.code);
};

test('(a) Kenneths klasse: 9 af 30 i 7 grupper, 2 i en blok: ingen stop, 2 par, og beskeden nævner parret', async () => {
  const inp = input(roles(30, 9));
  const before = check(inp);
  assert.equal(before.status, 'ok');
  assert.ok(!before.messages.some((m) => m.code === 'together-vs-separate'));
  const pre = before.messages.find((m) => m.code === 'together-separate-pair');
  assert.equal(pre.type, 'note');
  assert.deepEqual([...pre.students].sort(), ['r0', 'r1']);
  assert.deepEqual(judgeStops(inp), []);

  const answer = await run(inp, {});
  assert.equal(answer.status, 'ok');
  // Blokken står samlet, og den er et af de 2 par.
  const g = answer.groups.findIndex((x) => x.members.includes('r0'));
  assert.ok(answer.groups[g].members.includes('r1'));
  const result = answer.messages.find((m) => m.code === 'rule-not-met' && m.rule === 0);
  assert.match(result.text, /2 par ender i samme gruppe/);
  assert.match(result.text, /Det kunne ikke undgås med denne klasse\. \{elever\} er et af parrene, fordi de skal være sammen\./);
  assert.match(result.text, new RegExp(`\\{gruppe:${g}\\}`));
  assert.deepEqual([...result.students].sort(), ['r0', 'r1']);
  assert.equal(result.unavoidable, true);
  // Noten fra check sendes ikke også i svaret (resultatet siger det).
  assert.ok(!answer.messages.some((m) => m.code === 'together-separate-pair'));
  // Ingen to beskeder med samme nøgle.
  const keys = answer.messages.map(key);
  assert.equal(new Set(keys).size, keys.length);
});

test('(b) 7 ordstyrere i 7 grupper, 2 i en blok: et par, der ellers kunne undgås, så den stopper', async () => {
  const inp = input(roles(30, 7));
  const before = check(inp);
  assert.equal(before.status, 'impossible');
  const stop = before.messages.find((m) => m.code === 'together-vs-separate');
  assert.equal(stop.type, 'impossible');
  assert.match(stop.text, /flere par i samme gruppe, end klassen ellers er nødt til/);
  assert.deepEqual(judgeStops(inp), ['together-vs-separate']);
  const answer = await run(inp, {});
  assert.equal(answer.status, 'impossible');
});

test('Adskil altid i en blok stopper stadig, også når parret ikke koster noget', async () => {
  const inp = input(roles(30, 9), { rules: [{ type: 'strict_separate', column: 'Rolle', values: ['Ordstyrer'] }] });
  assert.equal(check(inp).status, 'impossible');
  assert.equal((await run(inp, {})).status, 'impossible');
  assert.deepEqual(judgeStops(inp), ['together-vs-separate']);
});

test('(c) Opdel: blokken tæller kun i sin egen pulje', async () => {
  // To puljer med 12 elever og 3 grupper hver. Mat: 4 ordstyrere (mindst 1
  // par), blokken r0+r1 koster intet. Bio: 3 ordstyrere i 3 grupper (0 par).
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ Linje: 'Mat', Rolle: i < 4 ? 'Ordstyrer' : 'Elev' });
  for (let i = 0; i < 12; i++) rows.push({ Linje: 'Bio', Rolle: i < 3 ? 'Ordstyrer' : 'Elev' });
  const rules = [{ type: 'aggregate', column: 'Linje' }, { type: 'separate', column: 'Rolle', values: ['Ordstyrer'] }];
  const size = { mode: 'perGroup', target: 4, adjust: 'plus' };
  const runs = input(rows, { rules, size });
  assert.equal(check(runs).status, 'ok');
  assert.deepEqual(judgeStops(runs), []);
  const answer = await run(runs, {});
  assert.equal(answer.status, 'ok');
  const results = answer.messages.filter((m) => m.code === 'rule-not-met' && m.rule === 1);
  assert.deepEqual(results.map((m) => m.pool), ['Mat']);
  assert.deepEqual([...results[0].students].sort(), ['r0', 'r1']);
  assert.equal(results[0].unavoidable, true);

  // Samme blok i Bio (r12+r13): dér kunne parret undgås, så den stopper,
  // selvom hele klassen har 7 ordstyrere i 6 grupper (Mat har sit eget par).
  const stops = input(rows, { rules, size, agreements: { together: [['r12', 'r13']], avoid: [] } });
  assert.equal(check(stops).status, 'impossible');
  assert.deepEqual(judgeStops(stops), ['together-vs-separate']);
});
