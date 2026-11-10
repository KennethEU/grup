#!/usr/bin/env node
// Holder en kørsel (analyse-run.mjs --json) op mod den dybe søgning (deep.mjs):
// i hvor mange svar fandt den dybe søgning noget bedre, og på hvilket trin?
//
//   node tools/fable/compare-deep.mjs <kørsel.json> <dyb.json> [--list]

import { readFileSync } from 'node:fs';
import { compareVectors } from '../../engine/rules.js';

const [runFile, deepFile] = process.argv.slice(2);
const list = process.argv.includes('--list');
const rows = JSON.parse(readFileSync(runFile, 'utf8'));
const deep = JSON.parse(readFileSync(deepFile, 'utf8'));
const sizeClass = (n) => (n < 20 ? '8-19' : n <= 32 ? '20-32' : n <= 60 ? '33-60' : n <= 100 ? '61-100' : '100+');
const tally = {};
const lines = [];
for (const row of rows) {
  const d = deep[row.file];
  if (!d || row.noise) continue; // noise: målenes tal er regnestøj (se analyse-run.mjs)
  const t = (tally[sizeClass(row.n)] ||= { answers: 0, heavy: 0, goals: 0, collect: 0, today: 0, same: 0, engineBetter: 0, inputs: 0, inputsLost: 0 });
  t.inputs++;
  const hasToday = row.types.includes('distribute');
  const core = hasToday ? d.vector.slice(0, -1) : d.vector;
  const deepMisses = hasToday ? d.vector[d.vector.length - 1] : 0;
  let lost = false;
  for (const s of row.seeds) {
    t.answers++;
    const g = row.goalsAt;
    const misses = s.rules.reduce((sum, r) => sum + r.misses, 0);
    const cmp = (from, to) => compareVectors(core.slice(from, to), s.vector.slice(from, to), 1e-6);
    let where;
    const h = cmp(0, g);
    const go = cmp(g, g + 1);
    const co = cmp(g + 1, g + 2);
    if (h) where = h < 0 ? 'heavy' : 'engineBetter';
    else if (go) where = go < 0 ? 'goals' : 'engineBetter';
    else if (co) where = co < 0 ? 'collect' : 'engineBetter';
    else if (deepMisses !== misses) where = deepMisses < misses ? 'today' : 'engineBetter';
    else where = 'same';
    t[where]++;
    if (where !== 'same' && where !== 'engineBetter') {
      lost = true;
      if (list) lines.push(`${where.padEnd(8)} ${s.name} n=${row.n} [${row.types.join(',')}] motor ${JSON.stringify(s.vector.map((x) => +x.toFixed(4)))}+${misses} · dyb ${JSON.stringify(d.vector.map((x) => +x.toFixed(4)))} (${d.method} ${d.foundAt})`);
    }
  }
  if (lost) t.inputsLost++;
}
console.log('Den dybe søgning fandt noget bedre end motorens svar (antal svar; fem frø pr. input):');
console.log('  elever   input  svar | tunge   mål  Saml  kun dagens test | ens | motoren bedst | input med tab');
for (const k of ['8-19', '20-32', '33-60', '61-100', '100+']) {
  const t = tally[k];
  if (!t) continue;
  console.log(`  ${k.padEnd(8)} ${String(t.inputs).padStart(5)} ${String(t.answers).padStart(5)} | ${String(t.heavy).padStart(5)} ${String(t.goals).padStart(5)} ${String(t.collect).padStart(5)} ${String(t.today).padStart(16)} | ${String(t.same).padStart(4)} | ${String(t.engineBetter).padStart(6)} | ${t.inputsLost}`);
}
for (const line of lines) console.log(line);
