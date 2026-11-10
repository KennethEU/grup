#!/usr/bin/env node
// Hvor mange ryst-runder uden fremgang ("stale") skal et forsøg have?
// For hvert input køres 20 forsøg med hver indstilling (samme frø), og den
// bedste række og det samlede arbejde (afprøvede bytninger) sammenlignes med
// motorens nuværende indstilling.
//
//   node tools/fable/stale-test.mjs <input-mappe> [--max-n 60] [--stale 10,20,30] [--main 1,2,3]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTask } from '../../engine/task.js';
import { computeLayout } from '../../engine/sizes.js';
import { checkFeasibility } from '../../engine/feasibility.js';
import { computeBaselines, evaluate, compareVectors, levelPlan } from '../../engine/rules.js';
import { Attempt } from '../../engine/search.js';
import { attemptSeed } from '../../engine/random.js';
import { attemptParams } from '../../engine/solve.js';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const inputDir = args[0];
const maxN = Number(option('--max-n', '60'));
const variants = option('--stale', '10,20,30').split(',').map(Number);
const mains = option('--main', '1,2,3').split(',').map(Number);

const tally = new Map(variants.map((v) => [v, { heavy: [0, 0, 0], goals: [0, 0, 0], collect: [0, 0, 0], work: 0 }]));
let baseWork = 0;
let cases = 0;
for (const file of readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  if (input.students.length > maxN) continue;
  const task = buildTask(input);
  const layout = computeLayout(task);
  const { reasons, blocks } = checkFeasibility(task, layout);
  if (reasons.length || !layout.total) continue;
  const groupPool = layout.groups.map((g) => g.pool);
  const baselines = computeBaselines(task, layout, groupPool);
  const goalsAt = levelPlan(task).findIndex((l) => l.kind === 'goals');
  const params = attemptParams(task, input.budget || {});
  const bestOf20 = async (stale, main) => {
    let best = null;
    let work = 0;
    for (let i = 0; i < 20; i++) {
      const attempt = new Attempt(task, layout, blocks, baselines, attemptSeed(main, i));
      const result = await attempt.run({ ...params, stale: stale ?? params.stale });
      work += attempt.state.evaluations;
      const v = evaluate(task, result.groups, groupPool, blocks, baselines, { tieBreak: false }).vector;
      if (!best || compareVectors(v, best) < 0) best = v;
    }
    return { best, work };
  };
  for (const main of mains) {
    const base = await bestOf20(null, main);
    baseWork += base.work;
    cases++;
    for (const stale of variants) {
      const r = await bestOf20(stale, main);
      const t = tally.get(stale);
      t.work += r.work;
      const cmp = (from, to) => compareVectors(r.best.slice(from, to), base.best.slice(from, to), 1e-6);
      const h = cmp(0, goalsAt);
      const g = h === 0 ? cmp(goalsAt, goalsAt + 1) : null;
      const c = h === 0 && g === 0 ? cmp(goalsAt + 1, goalsAt + 2) : null;
      t.heavy[h + 1]++;
      if (g !== null) t.goals[g + 1]++;
      if (c !== null) t.collect[c + 1]++;
      if (h > 0 || g > 0) console.log(`  stale ${stale} dårligere: ${file} frø ${main}`);
    }
  }
}
console.log(`${cases} kørsler (input × hovedfrø), 20 forsøg hver. Tal: bedre / ens / dårligere end i dag.`);
for (const [stale, t] of tally) console.log(`stale ${String(stale).padStart(3)}: tunge ${t.heavy.join('/')} · mål ${t.goals.join('/')} · Saml ${t.collect.join('/')} · arbejde ${((100 * t.work) / baseWork).toFixed(0)} % af i dag`);
