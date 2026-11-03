// Trin 1: motorens opgave, størrelser og stop-tjek skal give præcis det samme
// som dommerens (spec. 16: "det samme opgave-modul som motoren"). Motoren har
// sine egne filer, fordi mappen engine/ skal kunne flyttes ind i Grupper
// alene; denne test sikrer, at de to ikke kan glide fra hinanden.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildTask } from '../engine/task.js';
import { computeLayout, splitEven, groupsForTarget } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { parseNumber, normalizeText } from '../engine/values.js';
import { buildTask as judgeTask } from '../judge/task.mjs';
import { expectedLayout } from '../judge/sizes.mjs';
import { stopReasons } from '../judge/feasibility.mjs';

const SET = 'testdata/saet-1';
const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();

test('tal og tekst læses som i spec. 3.1–3.2', () => {
  assert.equal(parseNumber('7,5'), 7.5);
  assert.equal(parseNumber('7.5'), 7.5);
  assert.equal(parseNumber('1.000'), 1);
  assert.equal(parseNumber('1.000,5'), null);
  assert.equal(parseNumber('7 dage'), null);
  assert.equal(parseNumber('02'), 2);
  assert.equal(normalizeText(' Pige '), 'pige');
  assert.equal(normalizeText(''), null);
});

test('størrelser: eksemplerne i spec. 4.1', () => {
  assert.deepEqual(splitEven(26, groupsForTarget(26, 4, 'plus')), [5, 5, 4, 4, 4, 4]);
  assert.deepEqual(splitEven(26, groupsForTarget(26, 4, 'minus')), [4, 4, 4, 4, 4, 3, 3]);
  assert.deepEqual(splitEven(5, groupsForTarget(5, 4, 'plus')), [5]);
  assert.deepEqual(splitEven(5, groupsForTarget(5, 4, 'minus')), [3, 2]);
});

test('sæt 1: puljer og størrelser er som dommerens', () => {
  for (const file of files) {
    const input = JSON.parse(readFileSync(join(SET, file), 'utf8'));
    const task = buildTask(input);
    const layout = computeLayout(task);
    const jTask = judgeTask(input);
    const jLayout = expectedLayout(jTask);
    assert.equal(layout.total, jLayout.total, file);
    assert.equal(layout.wholeTask, jLayout.wholeTask, file);
    if (!layout.wholeTask) {
      const jPools = [...jTask.pools.values()];
      assert.equal(task.pools.length, jPools.length, file);
      task.pools.forEach((pool, i) => {
        assert.equal(pool.name, jPools[i].name, file);
        assert.deepEqual(pool.members.map((s) => task.ids[s]), jPools[i].ids, file);
      });
      // Præcis samme fordeling mellem puljerne (reglen ved lighed, svar6 37).
      assert.deepEqual(
        layout.pools.map((p) => p.sizes),
        jLayout.pools.map((p) => p.sizes),
        file,
      );
    } else {
      assert.deepEqual(layout.pools[0].sizes, jLayout.pools[0].sizes, file);
    }
  }
});

test('sæt 1: samme grunde til at stoppe som dommerens', () => {
  let stops = 0;
  for (const file of files) {
    const input = JSON.parse(readFileSync(join(SET, file), 'utf8'));
    const task = buildTask(input);
    const mine = checkFeasibility(task, computeLayout(task));
    const jTask = judgeTask(input);
    const theirs = stopReasons(jTask, expectedLayout(jTask));
    const codes = (list) => list.map((r) => r.code).sort();
    assert.deepEqual(codes(mine.reasons), codes(theirs.reasons), file);
    assert.equal(mine.packing, theirs.packing, file);
    if (mine.reasons.length) stops++;
  }
  // 32 før spørgsmål 51; 142, 215 og 257 (Skal sammen og almindelig Adskil,
  // hvor blokken ikke koster et ekstra par) stopper ikke længere.
  assert.equal(stops, 29);
});
