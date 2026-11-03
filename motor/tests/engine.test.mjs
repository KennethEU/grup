// Hele motoren: run(input, hooks) og check(input).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { run, check, ENGINE_INFO } from '../engine/engine.js';
import { judge } from '../judge/judge.mjs';

const SET = 'testdata/saet-1';
const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const load = (file) => JSON.parse(readFileSync(join(SET, file), 'utf8'));
const quick = (input, seed = 1) => ({ ...input, seed, budget: { maxSeconds: 1, maxAttempts: 2, minAttempts: 1 } });

// Hvert 7. input i sæt 1 (et udsnit af alle slags), med et lille budget.
const sample = files.filter((_, i) => i % 7 === 0);

test('ENGINE_INFO følger kontrakten', () => {
  assert.equal(ENGINE_INFO.contractVersion, 3);
  assert.equal(ENGINE_INFO.name, 'grup-motor');
});

test('udsnit af sæt 1: ingen fejl i de faste krav, og stop kun med grund', async () => {
  for (const file of sample) {
    const input = quick(load(file));
    const answer = await run(input, {});
    assert.notEqual(answer.status, 'error', `${file}: ${answer.detail}`);
    const grade = judge(input, answer, { samples: 1 });
    assert.deepEqual(grade.failures, [], file);
    if (answer.status === 'impossible') {
      assert.ok(grade.stop.justified, file);
      assert.ok(answer.messages.every((m) => typeof m.text === 'string' && m.text.length > 0), file);
    }
  }
});

test('samme input og samme frø giver samme grupper; nyt frø kan give andre', async () => {
  const input = load('010-rigtig-realistisk-seks-regler.json');
  const a = await run(quick(input, 5), {});
  const b = await run(quick(input, 5), {});
  assert.deepEqual(a.groups, b.groups);
  const c = await run(quick(input, 6), {});
  assert.equal(c.status, 'ok');
});

test('teksterne nævner aldrig en elevs _rowId', async () => {
  for (const file of sample) {
    const input = quick(load(file));
    const answer = await run(input, {});
    const ids = new Set(input.students.map((s) => s._rowId));
    for (const m of answer.messages || []) {
      for (const word of m.text.split(/[^\p{L}\p{N}_-]+/u)) assert.ok(!ids.has(word), `${file}: "${m.text}"`);
      assert.ok(m.students.every((id) => typeof id === 'string'), file);
    }
  }
});

test('afspilningen ender i svarets grupper', async () => {
  for (const file of sample) {
    const answer = await run(quick(load(file)), {});
    if (answer.status !== 'ok') continue;
    const pb = answer.playback.attempts[answer.playback.best];
    const groupOf = new Map(pb.deal.map(([s, g]) => [s, g]));
    for (const step of pb.moves) {
      if (step.move !== undefined) groupOf.set(step.move, step.to);
      const pairs = step.swap ? [step.swap] : step.swaps || [];
      for (const [x, y] of pairs) {
        const gx = groupOf.get(x);
        groupOf.set(x, groupOf.get(y));
        groupOf.set(y, gx);
      }
    }
    answer.groups.forEach((g, i) => g.members.forEach((s) => assert.equal(groupOf.get(s), i, file)));
    assert.deepEqual(pb.groups, answer.groups.map((g) => g.members), file);
  }
});

test('Stop: svarer "stopped" med en hel deling', async () => {
  const input = { ...load('136-tilfaeldig-32.json'), seed: 1 };
  let calls = 0;
  const started = Date.now();
  const answer = await run(input, { isCancelled: () => ++calls > 2, onProgress: () => {} });
  assert.equal(answer.status, 'stopped');
  assert.ok(Date.now() - started < 5000);
  const grade = judge(input, answer, { samples: 1 });
  assert.deepEqual(grade.failures, []);
});

test('fremgang: kommer med kontraktens felter', async () => {
  const input = { ...load('136-tilfaeldig-32.json'), seed: 1, budget: { maxSeconds: 2, maxAttempts: 3, minAttempts: 1 } };
  const seen = [];
  await run(input, { onProgress: (p) => seen.push(p), isCancelled: () => false });
  assert.ok(seen.length > 0);
  const p = seen[0];
  assert.equal(p.contractVersion, 3);
  for (const key of ['seconds', 'attempt', 'rulesMet', 'rulesTotal', 'rulesNotMet', 'atBestPossible', 'heavyBroken']) {
    assert.ok(key in p.progress, key);
  }
});

test('check(input) svarer med beskeder uden grupper', () => {
  const ok = check(load('009-rigtig-realistisk-adskil-altid-spansk.json'));
  assert.equal(ok.status, 'ok');
  assert.ok(!('groups' in ok));
  const stop = check(load('029-graense-blok-for-stor.json'));
  assert.equal(stop.status, 'impossible');
  assert.ok(stop.messages.some((m) => m.code === 'together-too-big'));
});

test('beskederne har kontraktens felter, og en kode fra listen', () => {
  const CODES = new Set(['together-too-big', 'together-cannot-pack', 'together-vs-avoid', 'together-vs-separate', 'together-across-lock', 'together-across-pool', 'separate-unavoidable', 'avoid-unavoidable', 'rule-not-met', 'cluster-unavoidable', 'opposing-rules', 'duplicate-rule', 'split-empty-cells', 'small-pool', 'fewer-groups-than-pools', 'non-numeric-cells', 'text-only-column', 'unranked-values', 'fewer-groups-than-asked', 'more-groups-than-asked', 'more-topics-than-groups', 'topic-rounding', 'matrix-limited-by', 'matrix-empty-source', 'not-in-home-group', 'matrix-sources-spread', 'together-separate-pair']);
  const seen = new Set();
  for (const file of files) {
    const result = check(load(file));
    for (const m of result.messages) {
      assert.ok(CODES.has(m.code), m.code);
      assert.ok(['impossible', 'conflict', 'note'].includes(m.type));
      for (const key of ['rule', 'column', 'pool', 'poolValues', 'students', 'values', 'text']) assert.ok(key in m, key);
      assert.ok(m.values.length <= 3);
      if (m.code === 'rule-not-met') assert.equal(typeof m.unavoidable, 'boolean');
      seen.add(m.code);
    }
  }
  // Sæt 1 rammer næsten alle koderne.
  assert.ok(seen.size >= 23, [...seen].join(', '));
});

test('fremgang inden for 1 sekund og derefter mindst hvert 2.; Stop besvares inden for 1 sekund', async () => {
  const input = { ...load('225-tilfaeldig-121.json'), seed: 2, budget: { maxSeconds: 6, maxAttempts: 20, minAttempts: 2 } };
  const started = Date.now();
  const times = [];
  let stopAt = null;
  const answer = await run(input, {
    onProgress: () => times.push(Date.now() - started),
    isCancelled: () => {
      if (stopAt === null && Date.now() - started > 3000) stopAt = Date.now();
      return stopAt !== null;
    },
  });
  const answered = Date.now();
  assert.equal(answer.status, 'stopped');
  assert.ok(times.length > 0 && times[0] < 1000, `første fremgang efter ${times[0]} ms`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] < 2000, `hul på ${times[i] - times[i - 1]} ms`);
  assert.ok(answered - stopAt < 1000, `Stop tog ${answered - stopAt} ms`);
  assert.ok(Array.isArray(answer.groups) && answer.groups.length > 0);
});

test('uden frø (som appen): budget efter tid, ingen fejl i de faste krav', async () => {
  for (const file of sample.slice(0, 12)) {
    const input = { ...load(file), seed: null, budget: { maxSeconds: 0.5, maxAttempts: 20, minAttempts: 2 } };
    const answer = await run(input, { onProgress: () => {}, isCancelled: () => false });
    assert.notEqual(answer.status, 'error', `${file}: ${answer.detail}`);
    if (answer.status === 'ok') assert.ok(answer.stats.attempts >= 1, file);
    assert.deepEqual(judge(input, answer, { samples: 1 }).failures, [], file);
  }
});
