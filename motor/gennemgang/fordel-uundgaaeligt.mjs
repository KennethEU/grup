#!/usr/bin/env node
// Kodegennemgang: når Fordel siger "Det kunne ikke undgås med denne klasse",
// fordi det retfærdige antal er nået (fair.met), findes der så alligevel en
// deling, der består dagens test (met)? Små puljer prøves udtømmende.

import { makeContext, measureDistribute } from '../engine/rules.js';
import { buildTask } from '../engine/task.js';

function* partitions(items, sizes) {
  // Alle måder at dele items i grupper med de givne størrelser (uordnede grupper af samme størrelse giver dubletter; fint).
  if (!sizes.length) {
    yield [];
    return;
  }
  const [first, ...rest] = sizes;
  const n = items.length;
  function* choose(start, k, acc) {
    if (k === 0) {
      yield acc;
      return;
    }
    for (let i = start; i <= n - k; i++) yield* choose(i + 1, k - 1, [...acc, items[i]]);
  }
  for (const group of choose(0, first, [])) {
    const left = items.filter((x) => !group.includes(x));
    for (const tail of partitions(left, rest)) yield [group, ...tail];
  }
}

let found = 0;
let cases = 0;
const values = ['A', 'B', 'C'];
for (let n = 4; n <= 9; n++) {
  for (const sizes of [[Math.ceil(n / 2), Math.floor(n / 2)], n >= 6 ? [Math.ceil(n / 3), Math.floor(n / 3), n - Math.ceil(n / 3) - Math.floor(n / 3)] : null].filter(Boolean)) {
    if (sizes.some((s) => s < 1)) continue;
    // Alle sammensætninger af værdier (op til 3 værdier, evt. tomme celler).
    const total = 4 ** n;
    for (let code = 0; code < total; code++) {
      let c = code;
      const cells = [];
      for (let i = 0; i < n; i++) {
        cells.push(c % 4 === 3 ? '' : values[c % 4]);
        c = Math.floor(c / 4);
      }
      // Kun sorterede sammensætninger (rækkefølgen af elever er ligegyldig).
      if (cells.some((v, i) => i > 0 && v < cells[i - 1])) continue;
      const input = {
        students: cells.map((v, i) => ({ _rowId: 'r' + i, K: v })),
        rules: [{ type: 'distribute', column: 'K' }],
        size: { mode: 'count', count: sizes.length },
      };
      const task = buildTask(input);
      const ids = cells.map((_, i) => i);
      let anyToday = false;
      let fairButNotToday = null;
      for (const groups of partitions(ids, sizes)) {
        const ctx = makeContext(task, groups, groups.map(() => 0));
        const m = measureDistribute(ctx, task.rules[0]);
        if (m.met) anyToday = true;
        if (m.fair.met && !m.met && !fairButNotToday) fairButNotToday = groups;
        if (anyToday && fairButNotToday) break;
      }
      cases++;
      if (anyToday && fairButNotToday) {
        found++;
        if (found <= 8) console.log(`FUND: celler ${JSON.stringify(cells)} størrelser ${sizes}: fair nået i ${JSON.stringify(fairButNotToday)}, men dagens test KAN bestås i en anden deling.`);
      }
    }
  }
}
console.log(`${cases} sammensætninger prøvet; ${found} hvor "uundgåeligt" (fair nået) ville være forkert.`);
