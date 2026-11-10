// Fordel og "Det kunne ikke undgås": beskeden må kun stå, når der beviseligt
// ikke kan være færre grupper uden om dagens test (bounds.js minMisses). Før
// var det nok at vide, at MINDST én gruppe måtte falde uden om; så stod der
// også "kunne ikke undgås" om 2 grupper, hvor 1 var nok, og motoren stoppede
// efter første forsøg.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { computeBounds, minMissesInPool } from '../engine/bounds.js';
import { makeContext, measureDistribute, evaluate, computeBaselines, atBestPossible } from '../engine/rules.js';
import { postRunMessages } from '../engine/messages.js';
import { run } from '../engine/engine.js';
import { makeRandom } from '../engine/random.js';

const load = (file) => JSON.parse(readFileSync(file, 'utf8'));

// En klasse med Fordel på kolonnen X. values er fx 'AAAAAAB'.
function classInput(values, groupCount) {
  return {
    contractVersion: 3,
    view: 'home',
    students: [...values].map((v, i) => ({ _rowId: `r${i}`, X: v })),
    rules: [{ type: 'distribute', column: 'X' }],
    columnOrders: {},
    agreements: { together: [], avoid: [] },
    lockedGroups: [],
    size: { mode: 'count', count: groupCount },
    topics: [],
    budget: { maxSeconds: 2, maxAttempts: 20, minAttempts: 3 },
    seed: 1,
  };
}

test('grænsen regnet i hånden', () => {
  // 6 A og 1 B i grupper på 4 og 3: hver må have 2 A, så én gruppe må falde uden om.
  assert.equal(minMissesInPool([6, 1], [4, 3]), 1);
  // 5 A og 1 B i tre grupper på 2: hver må have 1 A. Én uden om giver plads
  // til 2 + 1 + 1 = 4 A, to uden om til 5. Svaret er 2.
  assert.equal(minMissesInPool([5, 1], [2, 2, 2]), 2);
  // 4 A og 4 B i to grupper på 4 går op.
  assert.equal(minMissesInPool([4, 4], [4, 4]), 0);
  // Tre værdier, men B og C har kun én elev hver: kun én gruppe kan få alle tre.
  assert.equal(minMissesInPool([6, 1, 1], [4, 4]), 1);
  // Ingen værdier (ingen har udfyldt kolonnen): intet at falde uden om.
  assert.equal(minMissesInPool([], [4, 4]), 0);
});

// Alle måder at dele eleverne i grupper med de givne størrelser, og det
// mindste antal grupper uden om dagens test blandt dem.
function trueMinMisses(task, sizes) {
  const groups = sizes.map(() => []);
  const groupPool = sizes.map(() => 0);
  let best = Infinity;
  const place = (i) => {
    if (i === task.n) {
      best = Math.min(best, measureDistribute(makeContext(task, groups, groupPool), task.rules[0]).misses);
      return;
    }
    for (let g = 0; g < groups.length; g++) {
      if (groups[g].length >= sizes[g]) continue;
      groups[g].push(i);
      place(i + 1);
      groups[g].pop();
    }
  };
  place(0);
  return best;
}

test('grænsen er aldrig over det mindst mulige (alle små klasser prøvet udtømmende)', () => {
  let checked = 0;
  let exact = 0;
  for (let n = 4; n <= 8; n++) {
    for (let k = 2; k <= 3; k++) {
      // Sammensætninger med to eller tre værdier.
      const mixes = [];
      for (let a = 1; a < n; a++) {
        mixes.push('A'.repeat(a) + 'B'.repeat(n - a));
        for (let b = 1; a + b < n; b++) if (b <= a && n - a - b <= b) mixes.push('A'.repeat(a) + 'B'.repeat(b) + 'C'.repeat(n - a - b));
      }
      for (const mix of mixes) {
        const task = buildTask(classInput(mix, k));
        const layout = computeLayout(task);
        const bound = computeBounds(task, layout).get(0).minMisses[0];
        const truth = trueMinMisses(task, layout.pools[0].sizes);
        assert.ok(bound <= truth, `${mix} i ${k} grupper: grænsen ${bound} er over det mulige ${truth}`);
        if (bound === truth) exact++;
        checked++;
      }
    }
  }
  assert.ok(checked >= 80, `kun ${checked} prøvet`);
  // I disse klasser (kun én regel) rammer grænsen præcist.
  assert.equal(exact, checked);
});

test('grænsen er aldrig over det, gyldige svar faktisk når (facit og den nuværende motor, sæt 1 og 2)', () => {
  let checked = 0;
  for (const [set, dirs] of [
    ['testdata/saet-1', ['testdata/saet-1-facit', 'testdata/saet-1-nuvaerende']],
    ['testdata/saet-2', ['testdata/saet-2-facit', 'testdata/saet-2-nuvaerende']],
  ]) {
    for (const file of readdirSync(set).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
      const input = load(join(set, file));
      if (!input.rules.some((r) => r.type === 'distribute')) continue;
      const task = buildTask(input);
      const layout = computeLayout(task);
      if (checkFeasibility(task, layout).reasons.length || !layout.total || layout.wholeTask) continue;
      const bounds = computeBounds(task, layout);
      for (const dir of dirs) {
        if (!existsSync(join(dir, file))) continue;
        const answer = load(join(dir, file));
        if (!answer.groups) continue;
        const groups = answer.groups.map((g) => (g.members || g).map((id) => task.indexOf.get(id)).filter((s) => s !== undefined));
        // Svar med andre gruppestørrelser end opdelingens er ikke gyldige delinger.
        const sizes = (list) => list.slice().sort((a, b) => a - b).join(',');
        if (sizes(groups.map((m) => m.length)) !== sizes(layout.groups.map((g) => g.size))) continue;
        const groupPool = groups.map((m) => (m.length ? task.poolOf[m[0]] : 0));
        const ctx = makeContext(task, groups, groupPool);
        for (const rule of task.rules) {
          if (rule.type !== 'distribute') continue;
          const m = measureDistribute(ctx, rule);
          const { minMisses } = bounds.get(rule.index);
          minMisses.forEach((bound, p) => {
            const misses = m.groups.filter((g, i) => groupPool[i] === p && !g.met).length;
            assert.ok(misses >= bound, `${dir}/${file} regel ${rule.index} pulje ${p}: ${misses} uden om, men grænsen siger mindst ${bound}`);
            checked++;
          });
        }
      }
    }
  }
  assert.ok(checked > 300, `kun ${checked} tjekket`);
});

// 6 A og 1 B i grupper på 4 og 3. Begge delinger nedenfor har det retfærdige
// antal (tallet er 0), men kun i den ene består en gruppe dagens test.
function sixAndOne() {
  const input = classInput('AAAAAAB', 2);
  const task = buildTask(input);
  const layout = computeLayout(task);
  const groupPool = layout.groups.map((g) => g.pool);
  const { blocks } = checkFeasibility(task, layout);
  const bounds = computeBounds(task, layout);
  const baselines = computeBaselines(task, layout, groupPool);
  const judge = (groups) => {
    const evaluation = evaluate(task, groups, groupPool, blocks, baselines);
    const [note] = postRunMessages(task, groups, evaluation, { layout, bounds, blocks });
    return { evaluation, note, atBest: atBestPossible(task, evaluation, bounds) };
  };
  return { input, task, layout, bounds, judge };
}

test('to grupper uden om, hvor én er nok: ikke "kunne ikke undgås", og motoren stopper ikke', () => {
  const { layout, bounds, judge } = sixAndOne();
  assert.deepEqual(layout.pools[0].sizes, [4, 3]);
  assert.deepEqual(bounds.get(0).minMisses, [1]);
  // AAAB + AAA: tre A i begge grupper (højst 2 er tilladt), altså 2 uden om.
  const two = judge([[0, 1, 2, 6], [3, 4, 5]]);
  assert.equal(two.evaluation.results[0].value, 0, 'det retfærdige antal er nået');
  assert.equal(two.evaluation.results[0].misses, 2);
  assert.equal(two.note.unavoidable, false);
  assert.match(two.note.text, /2 grupper/);
  assert.doesNotMatch(two.note.text, /kunne ikke undgås/);
  assert.equal(two.atBest, false, 'motoren må ikke stoppe her');
});

test('én gruppe uden om, og én er det mindst mulige: "kunne ikke undgås", og motoren stopper', () => {
  const { judge } = sixAndOne();
  // AAAA + AAB: kun den første gruppe falder uden om.
  const one = judge([[0, 1, 2, 3], [4, 5, 6]]);
  assert.equal(one.evaluation.results[0].misses, 1);
  assert.equal(one.note.unavoidable, true);
  assert.match(one.note.text, /1 gruppe .*kunne ikke undgås/);
  assert.equal(one.atBest, true);
});

test('som appen (uden frø): motoren ender på én gruppe uden om i alle 30 kørsler', async () => {
  const { input } = sixAndOne();
  const realRandom = Math.random;
  try {
    for (let seed = 1; seed <= 30; seed++) {
      Math.random = makeRandom(seed);
      const answer = await run({ ...input, seed: null }, {});
      const note = answer.messages.find((m) => m.code === 'rule-not-met' && m.rule === 0);
      assert.match(note.text, /1 gruppe /, `hovedfrø ${seed}: ${note.text}`);
      assert.equal(note.unavoidable, true);
    }
  } finally {
    Math.random = realRandom;
  }
});
