// Test af "kan Skal sammen lade sig gøre" (spec. 5.1) og emnefordelingen (spec. 14).
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPack } from '../feasibility.mjs';
import { judge } from '../judge.mjs';
import { buildTask } from '../task.mjs';
import { expectedTopics, newGroupNumbers } from '../topics.mjs';
import { boundaryCases } from '../../testdata/gen/boundary.mjs';
import { makeInput, makeAnswer, studentsOf, ids } from './helpers.mjs';

test('pakning af blokke', () => {
  assert.equal(canPack([4, 4], [4, 4]), true);
  assert.equal(canPack([3, 3, 2], [4, 4]), false);
  assert.equal(canPack([3, 2, 2, 1], [4, 4]), true);
  assert.equal(canPack([5], [4, 4, 4]), false);
  assert.equal(canPack([], [4]), true);
});

test('grænsetilfældene: dommeren stopper præcis dér, hvor den skal', () => {
  for (const c of boundaryCases()) {
    if (c.expect.shouldStop === undefined) continue;
    const grade = judge(c.input, { status: 'impossible' }, { samples: 5 });
    assert.equal(grade.stop.shouldStop, c.expect.shouldStop, c.name);
    if (c.expect.code) assert.ok(grade.stop.reasons.some((r) => r.code === c.expect.code), `${c.name}: ${JSON.stringify(grade.stop.reasons)}`);
  }
});

test('grænsetilfældene: bedst mulige og antal grupper', () => {
  for (const c of boundaryCases()) {
    const grade = judge(c.input, { status: 'impossible' }, { samples: 5 });
    if (c.expect.groups !== undefined) assert.equal(grade.layout.total, c.expect.groups, c.name);
    if (c.expect.sizes) assert.deepEqual(grade.layout.pools.flatMap((p) => p.sizes), c.expect.sizes, c.name);
  }
});

test('grænsetilfældene: bedst mulige pr. regel (med et svar i de rigtige størrelser)', async () => {
  const { randomGroupings } = await import('../rank.mjs');
  const { expectedLayout } = await import('../sizes.mjs');
  for (const c of boundaryCases()) {
    if (!c.expect.best && c.expect.avoidBest === undefined && !c.expect.met) continue;
    const task = buildTask(c.input);
    const groups = randomGroupings(task, expectedLayout(task), 1, 3)[0];
    const grade = judge(c.input, makeAnswer(groups), { samples: 5 });
    for (const [rule, best] of Object.entries(c.expect.best || {})) assert.equal(grade.rules[rule].best, best, c.name);
    for (const [rule, met] of Object.entries(c.expect.met || {})) assert.equal(grade.rules[rule].met, met, c.name);
    if (c.expect.avoidBest !== undefined) assert.equal(grade.avoid.best, c.expect.avoidBest, c.name);
  }
});

test('emner: kontraktens eksempel (låst gruppe nr. 2 med Klima)', () => {
  const input = makeInput({
    students: studentsOf(8, () => ({})),
    locked: [{ id: 'L1', number: 2, name: 'Gruppe 2', members: ['x9', 'x10'], topic: 'Klima' }],
    topics: ['Klima', 'Migration'],
    size: { mode: 'perGroup', target: 3, adjust: 'plus' },
  });
  const task = buildTask(input);
  assert.deepEqual(newGroupNumbers(task, 3), [1, 3, 4]);
  const result = expectedTopics(task, [ids(1, 2, 3, 4), ids(5, 6, 7, 8)]);
  assert.deepEqual(result.groupTopics, ['Migration', 'Klima']);
  assert.deepEqual(result.lockedTopics, {});
});

test('emner: største gruppe først, lige store efter nummer, ved lighed det første emne', () => {
  const task = buildTask(makeInput({ students: studentsOf(13, () => ({})), topics: ['A', 'B', 'C'] }));
  // Grupper på 4, 5 og 4: gruppen på 5 (nr. 2) får A; så nr. 1 → B; nr. 3 → C.
  const result = expectedTopics(task, [ids(1, 2, 3, 4), ids(5, 6, 7, 8, 9), ids(10, 11, 12, 13)]);
  assert.deepEqual(result.groupTopics, ['B', 'A', 'C']);
});

test('emner: en låst gruppe med et forældet emne får et nyt', () => {
  const task = buildTask(makeInput({
    students: studentsOf(8, () => ({})),
    topics: ['A', 'B'],
    locked: [{ id: 'L4', number: 4, name: 'Gruppe 4', members: ['x1', 'x2', 'x3', 'x4', 'x5'], topic: 'Gammelt' }],
  }));
  const result = expectedTopics(task, [ids(1, 2, 3, 4), ids(5, 6, 7, 8)]);
  assert.deepEqual(result.lockedTopics, { L4: 'A' }); // den låste er størst (5) og tages først
  assert.deepEqual(result.groupTopics, ['B', 'B']);
});

test('emner: en låst gruppe UDEN emne får også et emne (svar6 36)', () => {
  const task = buildTask(makeInput({
    students: studentsOf(8, () => ({})),
    topics: ['A', 'B'],
    locked: [{ id: 'L1', number: 1, name: 'Gruppe 1', members: ['x1', 'x2', 'x3'], topic: null }],
  }));
  const result = expectedTopics(task, [ids(1, 2, 3, 4), ids(5, 6, 7, 8)]);
  // Grupperne på 4 (nr. 2 og 3) tages før den låste på 3: A, B, og så den låste A.
  assert.deepEqual(result.groupTopics, ['A', 'B']);
  assert.deepEqual(result.lockedTopics, { L1: 'A' });
  const input = makeInput({ students: studentsOf(8, () => ({})), topics: ['A', 'B'], locked: [{ id: 'L1', number: 1, name: 'Gruppe 1', members: ['x1', 'x2', 'x3'], topic: null }] });
  const missing = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)], ['A', 'B']), { samples: 5 });
  assert.ok(missing.failures.some((f) => f.check === 'topics'));
  const given = judge(input, makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)], ['A', 'B'], { L1: 'A' }), { samples: 5 });
  assert.deepEqual(given.failures, []);
});
