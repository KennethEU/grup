#!/usr/bin/env node
// Fordels dagens test: hvor mange grupper MÅ falde uden om? Her prøves en
// nedre grænse pr. pulje mod det, den dybe søgning faktisk fandt (deep.mjs),
// og mod motorens svar (analyse-run.mjs --json).
//
//   node tools/fable/misses-bound.mjs <input-mappe> <kørsel.json> <dyb.json>

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTask } from '../../engine/task.js';
import { computeLayout } from '../../engine/sizes.js';
import { poolValueCounts } from '../../engine/rules.js';

// Mindste antal grupper i puljen, der ikke kan bestå dagens test.
export function minMisses(valueCounts, sizes) {
  const V = valueCounts.length;
  const k = sizes.length;
  if (V === 0) return 0;
  const sorted = sizes.slice().sort((a, b) => b - a); // største først
  for (let f = 0; f <= k; f++) {
    // 1. Plads: de f største grupper falder uden om (kan rumme alt), resten
    //    højst ⌈størrelse / V⌉ af hver værdi.
    let room = 0;
    for (let i = 0; i < k; i++) room += i < f ? sorted[i] : Math.ceil(sorted[i] / V);
    if (valueCounts.some((c) => c > room)) continue;
    // 2. Dækning: de k − f grupper, der består, skal have min(V, størrelse)
    //    forskellige værdier hver; en værdi kan højst stå i én gruppe pr. elev.
    //    Billigst er at lade de grupper med størst krav falde uden om.
    const needs = sizes.map((s) => Math.min(V, s)).sort((a, b) => a - b);
    let need = 0;
    for (let i = 0; i < k - f; i++) need += needs[i];
    const reach = valueCounts.reduce((sum, c) => sum + Math.min(c, k - f), 0);
    if (need > reach) continue;
    return f;
  }
  return k;
}

const [inputDir, runFile, deepFile] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(runFile, 'utf8'));
const deep = JSON.parse(readFileSync(deepFile, 'utf8'));
let inputs = 0;
let tight = 0;
let engineAbove = 0;
let answers = 0;
let stoppedAbove = 0;
const loose = [];
for (const row of rows) {
  const d = deep[row.file];
  if (!d || !row.types.includes('distribute') || row.view === 'matrix') continue;
  const input = JSON.parse(readFileSync(join(inputDir, `${row.file}.json`), 'utf8'));
  const task = buildTask(input);
  const layout = computeLayout(task);
  let bound = 0;
  for (const rule of task.rules) {
    if (rule.type !== 'distribute') continue;
    const counts = poolValueCounts(task, rule);
    for (const pool of layout.pools) bound += minMisses([...counts[pool.index].values()], pool.sizes);
  }
  const deepMisses = d.vector[d.vector.length - 1];
  if (bound > deepMisses) console.log('FEJL: grænsen er over det fundne', row.file, bound, deepMisses);
  inputs++;
  if (bound === deepMisses) tight++;
  else loose.push(`${row.file} grænse ${bound} · dyb ${deepMisses}`);
  for (const s of row.seeds) {
    answers++;
    const misses = s.rules.reduce((sum, r) => sum + r.misses, 0);
    if (misses > bound) {
      engineAbove++;
      if (s.attempts === 1) stoppedAbove++;
    }
  }
}
console.log(`${inputs} input med Fordel: grænsen = det den dybe søgning fandt i ${tight}`);
console.log(`Motorens svar over grænsen: ${engineAbove} af ${answers}, heraf stoppet efter 1 forsøg: ${stoppedAbove}`);
console.log(loose.slice(0, 40).join('\n'));
