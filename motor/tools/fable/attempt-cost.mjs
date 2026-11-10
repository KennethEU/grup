#!/usr/bin/env node
// Hvad koster ét forsøg? Tid, antal afprøvede bytninger og ryst-runder for
// nogle input (frø fast, én kerne).
//
//   node tools/fable/attempt-cost.mjs <input.json> [flere …] [--attempts 20]

import { readFileSync } from 'node:fs';
import { buildTask } from '../../engine/task.js';
import { computeLayout } from '../../engine/sizes.js';
import { checkFeasibility } from '../../engine/feasibility.js';
import { computeBaselines } from '../../engine/rules.js';
import { Attempt } from '../../engine/search.js';
import { attemptSeed } from '../../engine/random.js';
import { attemptParams } from '../../engine/solve.js';

const args = process.argv.slice(2);
const count = args.includes('--attempts') ? Number(args[args.indexOf('--attempts') + 1]) : 20;
for (const file of args.filter((a, i) => a.endsWith('.json'))) {
  const input = JSON.parse(readFileSync(file, 'utf8'));
  const task = buildTask(input);
  const layout = computeLayout(task);
  const { blocks, reasons } = checkFeasibility(task, layout);
  if (reasons.length) continue;
  const groupPool = layout.groups.map((g) => g.pool);
  const t0 = performance.now();
  const baselines = computeBaselines(task, layout, groupPool);
  const tBase = performance.now() - t0;
  const params = attemptParams(task, input.budget || {});
  let evals = 0;
  let shakes = 0;
  const t1 = performance.now();
  for (let i = 0; i < count; i++) {
    const attempt = new Attempt(task, layout, blocks, baselines, attemptSeed(1, i));
    let k = 0;
    await attempt.run({ ...params, tick: async () => (k++, false) });
    evals += attempt.state.evaluations;
    shakes += k;
  }
  const ms = (performance.now() - t1) / count;
  console.log(`${file.split('/').pop().padEnd(48)} n=${String(task.n).padStart(3)} grupper=${String(layout.total).padStart(2)} moduler=${new Attempt(task, layout, blocks, baselines, 1).model.modules.length} · ${ms.toFixed(1)} ms/forsøg · ${Math.round(evals / count)} bytninger prøvet · ${(shakes / count).toFixed(0)} ryst · ${((ms * 1000) / (evals / count)).toFixed(2)} µs/bytning · skala ${tBase.toFixed(1)} ms`);
}
