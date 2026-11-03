#!/usr/bin/env node
// Kodegennemgang: giver de små tællere (modules.js + state.js) ALTID samme
// tal som en måling forfra (rules.js)?
//
//   node gennemgang/taellere.mjs [testdata/saet-1 testdata/saet-2 …]
//
// For hvert input køres et helt forsøg (byg → forbedr → ryst → forbedr …),
// og ved flere tidspunkter tjekkes tre ting:
//   (a) bogføringen: state.totals = summen af modulernes værdier lige nu,
//   (b) tællerne: hvert moduls værdi pr. gruppe = et frisk modul bygget op
//       fra de samme grupper (tester count/sum-tællerne og Fordels cache),
//   (c) forfra: state.totals = rules.js' rangordens-række (evaluate), trin
//       for trin. Saml på tekst: med det faste fradrag lagt til. Saml med
//       tal: kun rapporteret, ikke tjekket (kendt tilnærmelse).
// Desuden tjekkes "prøv" (tryMoves) mod "gør" (commitMoves) for flytninger
// (størrelsen ændres), bytninger og blok-mod-enkelte.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { computeBaselines, evaluate, goalWeights } from '../engine/rules.js';
import { buildModules } from '../engine/modules.js';
import { State } from '../engine/state.js';
import { Attempt } from '../engine/search.js';
import { makeRandom, randomInt } from '../engine/random.js';

const sets = process.argv.slice(2).length ? process.argv.slice(2) : ['testdata/saet-1'];
const close = (a, b, tol = 1e-7) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
let problems = 0;
let checked = 0;
const numericCollect = [];

function report(text) {
  problems++;
  if (problems <= 40) console.log('FEJL ' + text);
}

function collectTextOffset(task, baselines, groups, groupPool) {
  const weights = goalWeights(task);
  let off = 0;
  for (const rule of task.rules) {
    if (rule.type !== 'group_sort' || rule.mode !== 'text') continue;
    const base = baselines.get(rule.index)?.valueCount;
    if (!(base > 0)) continue;
    const maxSize = new Map();
    const counts = new Map();
    groups.forEach((members, g) => {
      const p = groupPool[g];
      maxSize.set(p, Math.max(maxSize.get(p) || 0, members.length));
      for (const s of members) {
        const v = rule.textId[s];
        if (v < 0) continue;
        if (!counts.has(p)) counts.set(p, new Map());
        const m = counts.get(p);
        m.set(v, (m.get(v) || 0) + 1);
      }
    });
    let bound = 0;
    for (const [p, m] of counts) for (const c of m.values()) bound += Math.ceil(c / Math.max(1, maxSize.get(p)));
    off += (weights.get(rule.index) / base) * bound;
  }
  return off;
}

function check(file, label, attempt, task, layout, baselines, groupPool, blocks) {
  const state = attempt.state;
  const groups = state.groupsAsLists();
  const mods = state.modules;
  const L = state.levelCount;
  // (a) bogføring
  const live = new Float64Array(L);
  for (let g = 0; g < state.G; g++) for (let m = 0; m < mods.length; m++) live[mods[m].level] += mods[m].weight * mods[m].value(g);
  for (let l = 0; l < L; l++) if (!close(state.totals[l], live[l])) report(`${file} ${label} (a) trin ${l}: totals ${state.totals[l]} ≠ modulernes sum ${live[l]}`);
  // (b) tællere mod friske moduler
  const fresh = buildModules(task, layout, baselines);
  const fs = new State(task, layout, fresh);
  groups.forEach((members, g) => {
    for (const s of members) fs.raw(s, g);
  });
  fs.recompute();
  for (let m = 0; m < mods.length; m++) {
    for (let g = 0; g < state.G; g++) {
      const a = mods[m].value(g);
      const b = fresh.modules[m].value(g);
      if (!close(a, b)) report(`${file} ${label} (b) modul ${m} (regel ${mods[m].rule}, trin ${mods[m].level}) gruppe ${g}: ${a} ≠ frisk ${b}`);
    }
  }
  // (c) forfra
  const exact = evaluate(task, groups, groupPool, blocks, baselines);
  state.model.levels.forEach((level, l) => {
    let expected = exact.vector[l];
    if (level.kind === 'collect') {
      expected += collectTextOffset(task, baselines, groups, groupPool);
      if (task.rules.some((r) => r.type === 'group_sort' && r.mode === 'numeric')) {
        numericCollect.push({ file, label, totals: state.totals[l], exact: expected });
        return;
      }
    }
    if (!close(state.totals[l], expected)) report(`${file} ${label} (c) trin ${l} (${level.kind}${level.rule !== null ? ' regel ' + level.rule : ''}): tællere ${state.totals[l]} ≠ forfra ${expected}`);
  });
}

function randomOps(file, attempt, random, count) {
  const { state, task } = attempt;
  let done = 0;
  for (let k = 0; k < count * 10 && done < count; k++) {
    const s = randomInt(random, task.n);
    const g = state.groupOf[s];
    const groups = attempt.groupsOfPool[attempt.groupPool[g]];
    if (groups.length < 2) continue;
    const h = groups[randomInt(random, groups.length)];
    if (h === g) continue;
    const bs = attempt.blockOf[s];
    let moves;
    if (bs < 0) {
      if (state.size[g] === state.size[h] + 1 && random() < 0.4) {
        if (attempt.matrixFull && !attempt.sourceOk(s, g, h)) continue;
        moves = [s, h];
      } else {
        const list = state.members[h];
        const t = list[randomInt(random, list.length)];
        if (attempt.blockOf[t] >= 0 || !attempt.swapOk(s, t, g, h)) continue;
        moves = [s, h, t, g];
      }
    } else {
      const block = attempt.blocks[bs];
      const singles = state.members[h].filter((t) => attempt.blockOf[t] < 0);
      if (singles.length < block.length) continue;
      moves = [];
      for (const x of block) moves.push(x, h);
      for (let i = 0; i < block.length; i++) moves.push(singles[i], g);
    }
    const tried = Float64Array.from(state.tryMoves(moves));
    const before = Float64Array.from(state.totals);
    attempt.apply(moves, moves.length === 2 ? 'move' : moves.length === 4 ? 'swap' : 'swaps', 'worse');
    for (let l = 0; l < state.levelCount; l++) {
      const d = state.totals[l] - before[l];
      if (!close(tried[l], d, 1e-6)) report(`${file} prøv ≠ gør (${moves.length === 2 ? 'flyt' : moves.length === 4 ? 'byt' : 'blok'}) trin ${l}: ${tried[l]} ≠ ${d}`);
    }
    done++;
  }
}

for (const set of sets) {
  const files = readdirSync(set).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  for (const file of files) {
    const input = JSON.parse(readFileSync(join(set, file), 'utf8'));
    const task = buildTask(input);
    const layout = computeLayout(task);
    const feas = checkFeasibility(task, layout);
    if (feas.reasons.length || layout.total === 0) continue;
    const groupPool = layout.groups.map((g) => g.pool);
    const baselines = computeBaselines(task, layout, groupPool);
    const attempt = new Attempt(task, layout, feas.blocks, baselines, 11);
    attempt.evaluationLimit = 60000;
    attempt.build();
    const tag = `${set}/${file}`;
    check(tag, 'efter byg', attempt, task, layout, baselines, groupPool, feas.blocks);
    attempt.localSearch(Array.from({ length: task.n }, (_, i) => i));
    check(tag, 'efter forbedring', attempt, task, layout, baselines, groupPool, feas.blocks);
    const random = makeRandom(5);
    for (let k = 0; k < 4; k++) {
      const active = attempt.shake(3);
      attempt.localSearch(active);
      randomOps(tag, attempt, random, 15);
      check(tag, `ryst ${k}`, attempt, task, layout, baselines, groupPool, feas.blocks);
    }
    checked++;
  }
}
console.log(`Tjekket ${checked} input, ${problems} problemer.`);
if (numericCollect.length) {
  const worst = numericCollect.map((x) => ({ ...x, diff: Math.abs(x.totals - x.exact) })).sort((a, b) => b.diff - a.diff).slice(0, 5);
  console.log(`Saml med tal (ikke tjekket, kendt tilnærmelse): ${numericCollect.length} målinger; størst forskel:`);
  for (const w of worst) console.log(`  ${w.file} ${w.label}: tællere ${w.totals.toFixed(4)} · forfra ${w.exact.toFixed(4)}`);
}
