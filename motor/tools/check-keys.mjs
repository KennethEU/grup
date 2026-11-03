#!/usr/bin/env node
// Tjekker nøglen "samme besked" i check(input) og i svarene (spørgsmål 45 og
// 47), som appen måler den:
//
//   node tools/check-keys.mjs <input-mappe> <svar-mappe>
//
// Nøglen er code + rule + pool + values + eleverne (sorteret). Værktøjet
// tæller fire ting, der alle skal være 0:
//   a) to beskeder med samme nøgle i ét svar (eller i ét check),
//   b) Fordels rule-not-met med andre values i svaret end i check (samme
//      regel og pulje),
//   c) en advarsel før kørslen og et resultat for samme regel og pulje (for
//      Undgå hinanden: samme aftale) i ét svar,
//   d) et Undgå hinanden-resultat, hvis elever ikke er præcis én aftale.
// Til sammenligning tælles (a) også med den gamle nøgle uden elever.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../engine/engine.js';

const [inputDir, answerDir] = process.argv.slice(2);
if (!answerDir) {
  console.log('Brug: node tools/check-keys.mjs <input-mappe> <svar-mappe>');
  process.exit(1);
}

const WARNINGS = new Set(['separate-unavoidable', 'cluster-unavoidable', 'avoid-unavoidable']);
const sorted = (list) => [...list].sort();
const key = (m) => JSON.stringify([m.code, m.rule, m.pool, m.values, sorted(m.students)]);
const oldKey = (m) => JSON.stringify([m.code, m.rule, m.pool, m.values]);
const count = { answers: 0, checks: 0, a: 0, aOld: 0, b: 0, bPairs: 0, c: 0, d: 0, avoidResults: 0, sameInBoth: 0 };
const examples = { a: [], b: [], c: [], d: [] };
const note = (kind, text) => {
  count[kind]++;
  if (examples[kind].length < 5) examples[kind].push(text);
};

const duplicates = (messages, keyOf) => {
  const seen = new Set();
  let dups = 0;
  for (const m of messages) {
    const k = keyOf(m);
    if (seen.has(k)) dups++;
    seen.add(k);
  }
  return dups;
};

for (const file of readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  const before = check(input);
  if (!before.messages) continue;
  count.checks++;
  if (duplicates(before.messages, key)) note('a', `${file} check`);
  if (duplicates(before.messages, oldKey)) count.aOld++;
  const ruleTypes = (input.rules || []).map((r) => r.type);
  const present = new Set((input.students || []).map((s) => s._rowId));
  const agreements = new Set(
    ((input.agreements && input.agreements.avoid) || [])
      .map((list) => [...new Set(list.filter((id) => present.has(id)))])
      .filter((list) => list.length >= 2)
      .map((list) => JSON.stringify(sorted(list))),
  );
  const stem = file.replace(/\.json$/, '');
  const names = existsSync(answerDir) ? readdirSync(answerDir).filter((f) => f.startsWith(`${stem}.`) && f.endsWith('.json')) : [];
  for (const name of names) {
    const answer = JSON.parse(readFileSync(join(answerDir, name), 'utf8'));
    if (!answer.messages) continue;
    const msgs = answer.messages;
    if (duplicates(msgs, key)) note('a', name);
    if (duplicates(msgs, oldKey)) count.aOld++;
    if (answer.status !== 'ok') continue;
    count.answers++;
    // Hvor mange af check's beskeder kommer igen med samme nøgle?
    const answerKeys = new Set(msgs.map(key));
    count.sameInBoth += before.messages.filter((m) => answerKeys.has(key(m))).length;
    // b) Fordel: samme regel og pulje, samme values.
    for (const m of msgs) {
      if (m.code !== 'rule-not-met' || m.rule === null || ruleTypes[m.rule] !== 'distribute') continue;
      const pre = before.messages.find((x) => x.code === 'rule-not-met' && x.rule === m.rule && x.pool === m.pool);
      if (!pre) continue;
      count.bPairs++;
      if (JSON.stringify(pre.values) !== JSON.stringify(m.values)) note('b', `${name} regel ${m.rule}: check ${JSON.stringify(pre.values)} · svar ${JSON.stringify(m.values)}`);
    }
    // c) advarsel og resultat for det samme i ét svar.
    const results = msgs.filter((m) => m.code === 'rule-not-met');
    for (const w of msgs.filter((m) => WARNINGS.has(m.code))) {
      const same = results.some(
        (r) => r.rule === w.rule && r.pool === w.pool && (w.rule !== null || JSON.stringify(sorted(r.students)) === JSON.stringify(sorted(w.students))),
      );
      // Den gamle form: ét resultat pr. regel uden pulje dækker alle puljer.
      const ruleLevel = w.rule !== null && results.some((r) => r.rule === w.rule);
      if (same || ruleLevel) note('c', `${name}: ${w.code} regel ${w.rule} pulje ${w.pool}`);
    }
    // d) Undgå hinanden-resultater: præcis én aftales elever.
    for (const r of results) {
      if (r.rule !== null || !r.text.startsWith('Undgå hinanden')) continue;
      count.avoidResults++;
      if (!agreements.has(JSON.stringify(sorted(r.students)))) note('d', `${name}: ${JSON.stringify(r.students)}`);
    }
  }
}

console.log(`${count.checks} check, ${count.answers} svar`);
console.log(`a) samme nøgle to gange i ét svar/check: ${count.a} (med den gamle nøgle uden elever: ${count.aOld} svar og check)`);
console.log(`b) Fordel med andre values end i check: ${count.b} af ${count.bPairs} par`);
console.log(`c) advarsel og resultat for det samme i ét svar: ${count.c}`);
console.log(`d) Undgå hinanden-resultat, der ikke er én aftale: ${count.d} af ${count.avoidResults}`);
console.log(`Beskeder fra check, der kommer igen med samme nøgle i svaret: ${count.sameInBoth}`);
for (const [kind, list] of Object.entries(examples)) for (const line of list) console.log(`  ${kind}: ${line}`);
