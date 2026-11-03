// Trin 7: regelmodulerne bedømmer "én elev i én gruppe" (spec. 13) præcis som
// en måling af hele delingen før og efter, men uden at måle alt forfra.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { computeBaselines, evaluate } from '../engine/rules.js';
import { placementJudge } from '../engine/placement.js';
import { makeRandom, randomInt } from '../engine/random.js';

const SET = 'testdata/saet-1';
const ANSWERS = 'testdata/saet-1-nuvaerende';
const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const close = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));

test('én elev i hver gruppe: samme ændring som at måle det hele før og efter', () => {
  const random = makeRandom(11);
  let checked = 0;
  for (const file of files.filter((_, i) => i % 3 === 0)) {
    const input = JSON.parse(readFileSync(join(SET, file), 'utf8'));
    const answer = JSON.parse(readFileSync(join(ANSWERS, file), 'utf8'));
    if (answer.status !== 'ok') continue;
    const task = buildTask(input);
    const layout = computeLayout(task);
    const { blocks } = checkFeasibility(task, layout);
    const groups = answer.groups.map((g) => g.members.filter((id) => task.indexOf.has(id)).map((id) => task.indexOf.get(id)));
    if (groups.length !== layout.total) continue; // de kendte størrelsesforskelle
    const groupPool = layout.groups.map((g) => g.pool);
    // Gruppernes puljer skal passe til opdelingen: brug den nuværendes grupper,
    // hvor de passer, pulje for pulje.
    const order = [];
    const used = new Set();
    for (const p of groupPool) {
      const g = groups.findIndex((m, i) => !used.has(i) && (layout.wholeTask || task.poolOf[m[0]] === p));
      if (g < 0) break;
      used.add(g);
      order.push(groups[g]);
    }
    if (order.length !== groups.length) continue;
    const baselines = computeBaselines(task, layout, groupPool, 20);
    // En tilfældig elev tages ud og bedømmes i hver gruppe i sin pulje.
    const s = randomInt(random, task.n);
    if (blocks.some((b) => b.includes(s))) continue;
    const without = order.map((m) => m.filter((x) => x !== s));
    const judge = placementJudge(task, layout, baselines, without);
    const before = evaluate(task, without, groupPool, blocks, baselines).vector;
    without.forEach((members, g) => {
      if (!layout.wholeTask && groupPool[g] !== task.poolOf[s]) return;
      const change = judge.levelChange(s, g);
      const withS = without.map((m, i) => (i === g ? [...m, s] : m));
      const after = evaluate(task, withS, groupPool, blocks, baselines).vector;
      const perRule = judge.ruleChange(s, g);
      judge.levels.forEach((level, l) => {
        if (level.kind === 'heavy') assert.ok(close(perRule.get(level.rule) ?? 0, change[l]), `${file}: regel ${level.rule}`);
        if (level.kind === 'collect') return;
        assert.ok(close(change[l], after[l] - before[l]), `${file} gruppe ${g} trin ${l}: ${change[l]} ≠ ${after[l] - before[l]}`);
      });
    });
    checked++;
  }
  assert.ok(checked > 50, `kun ${checked}`);
});
