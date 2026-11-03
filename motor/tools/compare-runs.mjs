#!/usr/bin/env node
// Sammenligner to kørsler af den nye motor på samme testsæt, frø for frø
// (fx før og efter en ændring, begge kørt med run-set.mjs --unseeded):
//
//   node tools/compare-runs.mjs <input-mappe> <før-mappe> <efter-mappe>
//
// For hvert svar (001-x.seed1.json …) måles rangordens-rækken med motorens
// egen måling, uden Fordels lille tillæg for dagens test, så den er den samme
// som dommerens. Tunge regler = rækken før målene; mål og Saml = resten.
// Desuden tælles, hvor mange grupper der ikke består Fordels dagens test
// (færre er bedre for læreren). Tiden og antal forsøg kommer fra _times.json.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { computeBaselines, evaluate, compareVectors, levelPlan } from '../engine/rules.js';

const [inputDir, beforeDir, afterDir] = process.argv.slice(2);
if (!afterDir) {
  console.log('Brug: node tools/compare-runs.mjs <input-mappe> <før-mappe> <efter-mappe>');
  process.exit(1);
}

const tally = { heavy: { better: 0, same: 0, worse: 0 }, goals: { better: 0, same: 0, worse: 0 }, misses: { better: 0, same: 0, worse: 0 } };
const worse = [];
for (const file of readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  const task = buildTask(input);
  const layout = computeLayout(task);
  const { reasons, blocks } = checkFeasibility(task, layout);
  if (reasons.length || !layout.total) continue;
  const groupPool = layout.groups.map((g) => g.pool);
  const baselines = computeBaselines(task, layout, groupPool);
  const goalsAt = levelPlan(task).findIndex((level) => level.kind === 'goals');
  const stem = file.replace(/\.json$/, '');
  const measure = (dir, name) => {
    const answer = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    if (!answer.groups) return null;
    const groups = answer.groups.map((g) => g.members.map((id) => task.indexOf.get(id)));
    const evaluation = evaluate(task, groups, groupPool, blocks, baselines, { tieBreak: false });
    const misses = task.rules.reduce((sum, rule) => sum + (evaluation.results[rule.index].misses || 0), 0);
    return { vector: evaluation.vector, misses };
  };
  for (const name of readdirSync(beforeDir).filter((f) => f.startsWith(`${stem}.`) && f.endsWith('.json'))) {
    if (!existsSync(join(afterDir, name))) continue;
    const ma = measure(afterDir, name);
    const mb = measure(beforeDir, name);
    if (!ma || !mb) continue;
    const a = ma.vector;
    const b = mb.vector;
    tally.misses[ma.misses < mb.misses ? 'better' : ma.misses > mb.misses ? 'worse' : 'same']++;
    const heavy = compareVectors(a.slice(0, goalsAt), b.slice(0, goalsAt));
    const goals = compareVectors(a.slice(goalsAt), b.slice(goalsAt));
    tally.heavy[heavy < 0 ? 'better' : heavy > 0 ? 'worse' : 'same']++;
    // Målene tæller kun, når de tunge regler er ens (ellers bestemmer de).
    if (heavy === 0) tally.goals[goals < 0 ? 'better' : goals > 0 ? 'worse' : 'same']++;
    if (heavy > 0 || (heavy === 0 && goals > 0)) worse.push(`${name}: efter ${JSON.stringify(a.map((x) => +x.toFixed(4)))} · før ${JSON.stringify(b.map((x) => +x.toFixed(4)))}`);
  }
}

const times = (dir) => (existsSync(join(dir, '_times.json')) ? JSON.parse(readFileSync(join(dir, '_times.json'), 'utf8')) : []);
const describe = (list) => {
  if (!list.length) return '(ingen tider)';
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const big = list.filter((t) => t.students > 100);
  const attempts = list.filter((t) => t.attempts !== null).map((t) => t.attempts);
  return `snit ${avg(list.map((t) => t.seconds)).toFixed(2)} s, højst ${Math.max(...list.map((t) => t.seconds)).toFixed(1)} s; over 100 elever snit ${big.length ? avg(big.map((t) => t.seconds)).toFixed(2) : '-'} s; forsøg snit ${avg(attempts).toFixed(1)}, højst ${Math.max(...attempts)}`;
};
console.log(`Tunge regler (efter mod før, frø for frø): bedre ${tally.heavy.better} · lige ${tally.heavy.same} · dårligere ${tally.heavy.worse}`);
console.log(`Mål og Saml (når de tunge er ens):          bedre ${tally.goals.better} · lige ${tally.goals.same} · dårligere ${tally.goals.worse}`);
console.log(`Fordel, grupper uden om dagens test:        færre ${tally.misses.better} · lige mange ${tally.misses.same} · flere ${tally.misses.worse}`);
console.log(`Tid før:   ${describe(times(beforeDir))}`);
console.log(`Tid efter: ${describe(times(afterDir))}`);
for (const line of worse) console.log(`  dårligere ${line}`);
