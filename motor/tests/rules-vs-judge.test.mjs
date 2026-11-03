// Trin 2: motorens regelmoduler skal måle præcis som dommeren. Testen måler
// den nuværende motors 268 svar på sæt 1 med begge og sammenligner hver
// regels tal, bedst mulige og opfyldt, og hele rangordens-rækken.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { evaluate, computeBaselines } from '../engine/rules.js';
import { judge } from '../judge/judge.mjs';

const SET = 'testdata/saet-1';
const ANSWERS = 'testdata/saet-1-nuvaerende';
const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();

// Gruppens pulje: den, flest af medlemmerne er i (som dommeren).
function majorityPool(task, members) {
  const counts = new Map();
  for (const s of members) counts.set(task.poolOf[s], (counts.get(task.poolOf[s]) || 0) + 1);
  let best = -1;
  let bestCount = -1;
  for (const [p, c] of counts) if (c > bestCount) [best, bestCount] = [p, c];
  return best;
}

const close = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));

test('sæt 1: motorens målinger = dommerens på den nuværende motors svar', () => {
  let compared = 0;
  for (const file of files) {
    if (!existsSync(join(ANSWERS, file))) continue;
    const input = JSON.parse(readFileSync(join(SET, file), 'utf8'));
    const answer = JSON.parse(readFileSync(join(ANSWERS, file), 'utf8'));
    if (answer.status !== 'ok') continue;
    const task = buildTask(input);
    const layout = computeLayout(task);
    const { blocks } = checkFeasibility(task, layout);
    const groups = answer.groups.map((g) => g.members.filter((id) => task.indexOf.has(id)).map((id) => task.indexOf.get(id)));
    const groupPool = layout.wholeTask ? groups.map(() => 0) : groups.map((m) => majorityPool(task, m));
    const groupPoolForBaseline = layout.groups.map((g) => g.pool);
    const baselines = computeBaselines(task, layout, groupPoolForBaseline);
    // Uden Fordels lille tillæg for dagens test (det kender dommeren ikke).
    const mine = evaluate(task, groups, groupPool, blocks, baselines, { tieBreak: false });
    const theirs = judge(input, answer);
    theirs.rules.forEach((r, i) => {
      const m = mine.results[i];
      assert.ok(close(m.value, r.value), `${file} regel ${i} value ${m.value} ≠ ${r.value}`);
      assert.ok(close(m.best ?? null, r.best ?? null), `${file} regel ${i} best`);
      assert.equal(m.met, r.met, `${file} regel ${i} met`);
    });
    assert.equal(mine.avoid.value, theirs.avoid.value, `${file} avoid`);
    assert.equal(mine.avoid.best, theirs.avoid.best, `${file} avoid best`);
    // Rangordens-rækken uden de faste krav (dommerens første tal).
    const theirVector = theirs.precedence.vector.slice(1);
    assert.equal(mine.vector.length, theirVector.length, file);
    mine.vector.forEach((v, i) => assert.ok(close(v, theirVector[i]), `${file} trin ${i}: ${v} ≠ ${theirVector[i]}`));
    compared++;
  }
  assert.equal(compared, 268);
});
