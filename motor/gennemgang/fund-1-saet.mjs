#!/usr/bin/env node
// Fund 1 på testsættene: hvor ofte siger Fordel "Det kunne ikke undgås",
// selvom en anden deling (med samme størrelser og puljer) ville være
// opfyldt? Kun input, hvor Fordel (og evt. Opdel) er de eneste regler og
// der ingen aftaler er, så enhver deling i de rigtige størrelser er lovlig.
// Der søges med simple bytninger efter en deling, hvor alle Fordel-regler er
// opfyldt (dagens test).
//
//   node gennemgang/fund-1-saet.mjs <input-mappe> <svar-mappe>

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { makeContext, measureDistribute } from '../engine/rules.js';
import { makeRandom, randomInt } from '../engine/random.js';

const [inputDir, answerDir] = process.argv.slice(2);
let candidates = 0;
let falseClaims = 0;
let unresolved = 0;
for (const file of readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  if (input.view !== 'home') continue;
  if (!input.rules.length || !input.rules.every((r) => r.type === 'distribute' || r.type === 'aggregate')) continue;
  if (!input.rules.some((r) => r.type === 'distribute')) continue;
  if ((input.agreements?.together || []).length || (input.agreements?.avoid || []).length) continue;
  const stem = file.replace(/\.json$/, '');
  const names = readdirSync(answerDir).filter((f) => f.startsWith(stem + '.') && f.endsWith('.json'));
  for (const name of names) {
    const answer = JSON.parse(readFileSync(join(answerDir, name), 'utf8'));
    if (answer.status !== 'ok') continue;
    const claims = answer.messages.filter((m) => m.code === 'rule-not-met' && m.unavoidable && m.rule !== null && input.rules[m.rule].type === 'distribute');
    if (!claims.length) continue;
    candidates++;
    const task = buildTask(input);
    const layout = computeLayout(task);
    const groupPool = layout.groups.map((g) => g.pool);
    const groups = answer.groups.map((g) => g.members.map((id) => task.indexOf.get(id)));
    const rules = task.rules.filter((r) => r.type === 'distribute');
    const bad = (gs) => {
      const ctx = makeContext(task, gs, groupPool);
      let count = 0;
      for (const rule of rules) for (const g of measureDistribute(ctx, rule).groups) if (g.met === false) count++;
      return count;
    };
    let current = groups.map((m) => m.slice());
    let score = bad(current);
    const random = makeRandom(1);
    for (let k = 0; k < 40000 && score > 0; k++) {
      const g = randomInt(random, current.length);
      const h = randomInt(random, current.length);
      if (g === h || groupPool[g] !== groupPool[h]) continue;
      const i = randomInt(random, current[g].length);
      const j = randomInt(random, current[h].length);
      const a = current[g][i];
      current[g][i] = current[h][j];
      current[h][j] = a;
      const s = bad(current);
      if (s <= score) score = s;
      else {
        current[h][j] = current[g][i];
        current[g][i] = a;
      }
    }
    if (score === 0) {
      falseClaims++;
      console.log(`FALSK "uundgåeligt": ${name} (${task.n} elever, ${layout.total} grupper): ${claims.map((c) => c.text).join(' | ')}`);
    } else unresolved++;
  }
}
console.log(`${candidates} svar med "uundgåeligt" på Fordel (kun Fordel/Opdel, ingen aftaler): ${falseClaims} hvor en opfyldt deling blev fundet, ${unresolved} hvor ingen blev fundet.`);
