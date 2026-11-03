#!/usr/bin/env node
// Kodegennemgang: fremgang og Stop på et stort hold, som appen kører det
// (seed null). Spec. 11.3 / kontrakt 4–5: første fremgang inden for 1 s,
// derefter højst 2 s imellem, og Stop besvares inden for ca. 1 s.
//
//   node gennemgang/stop-tid.mjs <input.json> [stop-efter-sekunder …]

import { readFileSync } from 'node:fs';
import { run } from '../engine/engine.js';

const file = process.argv[2];
const stops = process.argv.slice(3).map(Number);
const base = JSON.parse(readFileSync(file, 'utf8'));
console.log(`${file}: ${base.students.length} elever, ${base.rules.map((r) => r.type).join(',')}, ${base.size.mode}`);

async function once(stopAfter) {
  const input = { ...base, seed: null, budget: { maxSeconds: base.students.length > 100 ? 30 : 10, maxAttempts: 20, minAttempts: base.students.length > 60 ? 2 : 3 } };
  const t0 = performance.now();
  const stamps = [];
  let cancelledAt = null;
  const answer = await run(input, {
    onProgress: () => stamps.push((performance.now() - t0) / 1000),
    isCancelled: () => {
      if (stopAfter === null) return false;
      const t = (performance.now() - t0) / 1000;
      if (t >= stopAfter) {
        if (cancelledAt === null) cancelledAt = t;
        return true;
      }
      return false;
    },
  });
  const total = (performance.now() - t0) / 1000;
  let maxGap = stamps.length ? stamps[0] : total;
  for (let i = 1; i < stamps.length; i++) maxGap = Math.max(maxGap, stamps[i] - stamps[i - 1]);
  if (stamps.length) maxGap = Math.max(maxGap, total - stamps[stamps.length - 1]);
  const first = stamps.length ? stamps[0].toFixed(2) : '-';
  const line = `stop ${stopAfter === null ? 'nej' : stopAfter + ' s'}: status ${answer.status}, ${answer.stats?.attempts ?? '-'} forsøg, ${total.toFixed(2)} s i alt, første fremgang ${first} s, ${stamps.length} fremgange, største hul ${maxGap.toFixed(2)} s`;
  console.log(line + (cancelledAt !== null ? `, Stop set efter ${cancelledAt.toFixed(2)} s → svar ${(total - cancelledAt).toFixed(2)} s senere, grupper: ${answer.groups ? answer.groups.length : 'ingen'}` : ''));
}

await once(null);
for (const s of stops) await once(s);
