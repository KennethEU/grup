#!/usr/bin/env node
// Kodegennemgang: giver uddelingen + alle trin i afspilningen præcis svarets
// grupper? Både det hele spor og et afskåret spor (lille loft).
//
//   node gennemgang/afspil.mjs [testdata/saet-1 …]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { solve } from '../engine/solve.js';
import { buildPlayback } from '../engine/playback.js';

const sets = process.argv.slice(2).length ? process.argv.slice(2) : ['testdata/saet-1'];

function replay(playback) {
  const a = playback.attempts[playback.best];
  const groupOf = new Map(a.deal.map(([s, g]) => [s, g]));
  const swap = (x, y) => {
    const gx = groupOf.get(x);
    if (gx === undefined || !groupOf.has(y)) throw new Error(`ukendt elev i bytning ${x}/${y}`);
    groupOf.set(x, groupOf.get(y));
    groupOf.set(y, gx);
  };
  for (const step of a.moves) {
    if (step.move !== undefined) groupOf.set(step.move, step.to);
    else if (step.swap) swap(step.swap[0], step.swap[1]);
    else if (step.swaps) for (const [x, y] of step.swaps) swap(x, y);
    else throw new Error('ukendt trin ' + JSON.stringify(step));
  }
  const groups = a.groups.map(() => []);
  for (const [s, g] of groupOf) groups[g].push(s);
  return groups.map((m) => m.slice().sort());
}

const same = (a, b) => a.length === b.length && a.every((g, i) => g.join('\u0000') === b[i].slice().sort().join('\u0000'));

let checked = 0;
let problems = 0;
let cutChecked = 0;
for (const set of sets) {
  const files = readdirSync(set).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  for (const file of files) {
    const input = JSON.parse(readFileSync(join(set, file), 'utf8'));
    const task = buildTask(input);
    const layout = computeLayout(task);
    const feas = checkFeasibility(task, layout);
    if (feas.reasons.length || layout.total === 0) continue;
    let result;
    try {
      result = await solve(task, layout, feas.blocks, { budget: { maxSeconds: 2, maxAttempts: 2, minAttempts: 1 }, seed: 3, hooks: {}, input });
    } catch (e) {
      console.log(`${set}/${file}: solve fejlede: ${e.message}`);
      continue;
    }
    if (!result.best) continue;
    const want = result.best.groups.map((m) => m.map((s) => task.ids[s]).sort());
    const full = buildPlayback(task, result.best);
    if (!full) {
      console.log(`${set}/${file}: ingen afspilning`);
      continue;
    }
    if (!same(replay(full), want)) {
      problems++;
      console.log(`FEJL ${set}/${file}: hele sporet ender ikke i grupperne (${full.attempts[0].moves.length} trin)`);
    }
    const steps = full.attempts[0].moves.length;
    if (steps > 5) {
      const cut = buildPlayback(task, result.best, Math.max(2, Math.floor(steps / 2)));
      cutChecked++;
      if (!cut.attempts[0].cut) console.log(`${set}/${file}: cut forventet`);
      if (!same(replay(cut), want)) {
        problems++;
        console.log(`FEJL ${set}/${file}: det afskårne spor ender ikke i grupperne`);
      }
    }
    checked++;
  }
}
console.log(`Afspilning tjekket for ${checked} input (${cutChecked} også afskåret): ${problems} problemer.`);
