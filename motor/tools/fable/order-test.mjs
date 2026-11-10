#!/usr/bin/env node
// Virker regelrækkefølgen, som læreren forventer? Opskriften lover, at den
// øverste regel vejer tungest. Her vendes rækkefølgen af målene (Fordel,
// Balancér, Ensartede) om i hvert input, og motoren køres på begge udgaver.
// For det mål, der står øverst i den ene og nederst i den anden, sammenlignes
// tallet (delt med en tilfældig delings tal, så reglerne kan sammenlignes).
// Forventningen: reglen klarer sig bedst, når den står øverst.
//
//   node tools/fable/order-test.mjs <input-mappe> [--min-n 16] [--max-n 40] [--seeds 1,2,3]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../../engine/engine.js';
import { makeRandom } from '../../engine/random.js';
import { buildTask } from '../../engine/task.js';
import { computeLayout } from '../../engine/sizes.js';
import { checkFeasibility } from '../../engine/feasibility.js';
import { computeBaselines, evaluate, GOAL_TYPES } from '../../engine/rules.js';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const inputDir = args[0];
const minN = Number(option('--min-n', '16'));
const maxN = Number(option('--max-n', '40'));
const seeds = option('--seeds', '1,2,3').split(',').map(Number);

// Kører motoren som appen (uden frø, men med en fast talrække) og måler
// hvert måls tal på fælles skala.
async function measure(input, seed) {
  const task = buildTask(input);
  const layout = computeLayout(task);
  const { reasons, blocks } = checkFeasibility(task, layout);
  if (reasons.length || !layout.total) return null;
  Math.random = makeRandom(seed);
  const answer = await run({ ...input, seed: null }, {});
  if (!answer.groups) return null;
  const groupPool = layout.groups.map((g) => g.pool);
  const baselines = computeBaselines(task, layout, groupPool);
  const groups = answer.groups.map((g) => g.members.map((id) => task.indexOf.get(id)));
  const ev = evaluate(task, groups, groupPool, blocks, baselines, { tieBreak: false });
  return task.rules.map((r) => {
    const base = baselines.get(r.index)?.value;
    return { type: r.type, scaled: base > 0 ? ev.results[r.index].value / base : 0, heavy: ev.vector };
  });
}

const tally = { better: 0, same: 0, worse: 0 };
let sumTop = 0;
let sumBottom = 0;
let pairs = 0;
let inputs = 0;
const worseList = [];
for (const file of readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  if (input.students.length < minN || input.students.length > maxN) continue;
  const goalAt = input.rules.map((r, i) => (GOAL_TYPES.has(r.type) ? i : -1)).filter((i) => i >= 0);
  if (goalAt.length < 2) continue;
  // Samme opskrift med målene i omvendt rækkefølge (de andre regler bliver stående).
  const reversed = { ...input, rules: input.rules.slice() };
  goalAt.forEach((at, k) => (reversed.rules[at] = input.rules[goalAt[goalAt.length - 1 - k]]));
  const first = goalAt[0];
  const last = goalAt[goalAt.length - 1];
  let used = false;
  for (const seed of seeds) {
    const a = await measure(input, seed);
    const b = await measure(reversed, seed);
    if (!a || !b) continue;
    used = true;
    // Reglen på plads `first` i originalen står på plads `last` i den omvendte, og omvendt.
    for (const [top, bottom] of [
      [a[first].scaled, b[last].scaled],
      [b[first].scaled, a[last].scaled],
    ]) {
      pairs++;
      sumTop += top;
      sumBottom += bottom;
      const d = top - bottom;
      if (d < -1e-6) tally.better++;
      else if (d > 1e-6) {
        tally.worse++;
        worseList.push(`${file} frø ${seed}: øverst ${top.toFixed(3)} · nederst ${bottom.toFixed(3)}`);
      } else tally.same++;
    }
  }
  if (used) inputs++;
}
console.log(`${inputs} input med mindst to mål (${minN}–${maxN} elever), ${pairs} sammenligninger`);
console.log(`Samme regel øverst mod nederst: bedre øverst ${tally.better} · ens ${tally.same} · dårligere øverst ${tally.worse}`);
console.log(`Snit (1 = som en tilfældig deling, 0 = perfekt): øverst ${(sumTop / pairs).toFixed(3)} · nederst ${(sumBottom / pairs).toFixed(3)}`);
for (const line of worseList) console.log('  dårligere øverst:', line);
