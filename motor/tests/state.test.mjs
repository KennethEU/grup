// Trin 2: de små tællere (modules.js) skal give samme tal som den præcise
// måling (rules.js), også efter mange bytninger og flytninger. Og "prøv"
// (tryMoves) skal give præcis den ændring, som "gør" (commitMoves) giver.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { computeBaselines, evaluate } from '../engine/rules.js';
import { Attempt } from '../engine/search.js';
import { makeRandom, randomInt } from '../engine/random.js';

const SET = 'testdata/saet-1';
const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();

const close = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));

test('tællerne = den præcise måling efter tilfældige bytninger (alle input i sæt 1)', () => {
  let checked = 0;
  for (const file of files) {
    const input = JSON.parse(readFileSync(join(SET, file), 'utf8'));
    const task = buildTask(input);
    const layout = computeLayout(task);
    const feas = checkFeasibility(task, layout);
    if (feas.reasons.length || layout.total === 0) continue;
    const groupPool = layout.groups.map((g) => g.pool);
    const baselines = computeBaselines(task, layout, groupPool, 20);
    const attempt = new Attempt(task, layout, feas.blocks, baselines, 1);
    attempt.build();
    const state = attempt.state;
    const random = makeRandom(7);
    const check = () => {
      const exact = evaluate(task, state.groupsAsLists(), groupPool, feas.blocks, baselines);
      state.model.levels.forEach((level, l) => {
        if (level.kind === 'collect') return; // Saml: tal + en fast størrelse
        assert.ok(close(state.totals[l], exact.vector[l]), `${file} trin ${l}: ${state.totals[l]} ≠ ${exact.vector[l]}`);
      });
    };
    check();
    for (let k = 0; k < 60; k++) {
      // En tilfældig bytning af to enkelte elever i samme pulje.
      const s = randomInt(random, task.n);
      const t = randomInt(random, task.n);
      const g = state.groupOf[s];
      const h = state.groupOf[t];
      if (g === h || attempt.groupPool[g] !== attempt.groupPool[h]) continue;
      if (attempt.blockOf[s] >= 0 || attempt.blockOf[t] >= 0) continue;
      const moves = [s, h, t, g];
      const tried = Float64Array.from(state.tryMoves(moves));
      const done = state.commitMoves(moves);
      tried.forEach((d, l) => assert.ok(close(d, done[l]), `${file}: prøv ≠ gør på trin ${l}`));
    }
    check();
    checked++;
  }
  assert.ok(checked > 250);
});
