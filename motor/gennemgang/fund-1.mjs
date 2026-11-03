#!/usr/bin/env node
// Fund 1: Fordel siger "Det kunne ikke undgås med denne klasse", selvom en
// anden deling ville være opfyldt. 9 elever (5 A, 4 B), 4 pr. gruppe "+1"
// → grupper på 5 og 4. [A,A,A,B,B] + [A,A,B,B] er opfyldt; [A,A,B,B,B] +
// [A,A,A,B] er det ikke (3 A i en gruppe på 4), men begge har afvigelse 0
// fra det "retfærdige antal", så motoren ser dem som lige gode.
//
//   node gennemgang/fund-1.mjs   (bruger gennemgang/fund-1.json)

import { readFileSync } from 'node:fs';
import { run } from '../engine/engine.js';

const base = JSON.parse(readFileSync(new URL('./fund-1.json', import.meta.url), 'utf8'));
const seen = new Map();
for (let seed = 1; seed <= 40; seed++) {
  const answer = await run({ ...base, seed }, {});
  const groups = answer.groups.map((g) => g.members.map((id) => base.students.find((s) => s._rowId === id).Køn).sort().join('')).join(' + ');
  const msg = answer.messages.find((m) => m.code === 'rule-not-met');
  const key = `${groups} → met ${answer.rules[0].met}${msg ? `, besked: "${msg.text}" (unavoidable ${msg.unavoidable})` : ''}`;
  seen.set(key, (seen.get(key) || 0) + 1);
}
for (const [k, v] of seen) console.log(`${v} frø: ${k}`);
