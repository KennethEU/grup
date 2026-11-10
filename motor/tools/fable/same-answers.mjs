#!/usr/bin/env node
// Er to kørsler med frø endt med præcis de samme grupper, svar for svar?
// (Bruges til at vise, at en ændring kun gør motoren hurtigere.)
//
//   node tools/fable/same-answers.mjs <før-mappe> <efter-mappe>

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [beforeDir, afterDir] = process.argv.slice(2);
let same = 0;
let sameMembers = 0; // samme grupper, men eleverne står i en anden rækkefølge
const different = [];
for (const name of readdirSync(beforeDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  if (!existsSync(join(afterDir, name))) continue;
  const a = JSON.parse(readFileSync(join(beforeDir, name), 'utf8'));
  const b = JSON.parse(readFileSync(join(afterDir, name), 'utf8'));
  const exact = (x) => JSON.stringify([x.status, x.groups, x.rules, (x.messages || []).map((m) => [m.code, m.rule, m.unavoidable, m.text])]);
  const loose = (x) => JSON.stringify([x.status, (x.groups || []).map((g) => g.members.slice().sort()).sort()]);
  if (exact(a) === exact(b)) same++;
  else if (loose(a) === loose(b)) sameMembers++;
  else different.push(name);
}
console.log(`Præcis samme svar (grupper, rækkefølge, regler og beskeder): ${same}`);
console.log(`Samme grupper, anden rækkefølge eller andre beskeder:       ${sameMembers}`);
console.log(`Andre grupper:                                             ${different.length}`);
if (different.length) console.log('  ' + different.slice(0, 60).join(' '));
