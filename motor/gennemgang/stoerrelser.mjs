#!/usr/bin/env node
// Kodegennemgang: gruppestørrelser (spec. 4) efterprøvet mod spec'ens ord,
// uafhængigt af dommeren (dommerens sizes.mjs er samme kode som motorens).

import { groupsForTarget, splitEven, allocateGroups, computeLayout } from '../engine/sizes.js';
import { buildTask } from '../engine/task.js';

let problems = 0;
const bad = (t) => {
  problems++;
  console.log('AFVIGELSE ' + t);
};

// 4.1 "+1": antal = n/t rundet ned, mindst 1; én gruppe til, hvis en gruppe
// ellers kom mere end én over t. "-1": n/t rundet op. Aldrig flere grupper end elever.
for (let n = 1; n <= 120; n++) {
  for (let t = 1; t <= 12; t++) {
    const gp = groupsForTarget(n, t, 'plus');
    const sp = splitEven(n, gp);
    if (gp > n) bad(`+1 n=${n} t=${t}: ${gp} grupper > elever`);
    if (Math.max(...sp) > t + 1) bad(`+1 n=${n} t=${t}: gruppe på ${Math.max(...sp)} > t+1`);
    if (Math.max(...sp) - Math.min(...sp) > 1) bad(`+1 n=${n} t=${t}: ujævn ${sp}`);
    // Færrest mulige grupper, der holder ≤ t+1:
    let g = Math.max(1, Math.floor(n / t));
    while (Math.ceil(n / g) > t + 1) g++;
    if (g !== gp) bad(`+1 n=${n} t=${t}: ${gp} grupper, spec'ens regel giver ${g}`);
    const gm = groupsForTarget(n, t, 'minus');
    const sm = splitEven(n, gm);
    if (gm !== Math.min(n, Math.ceil(n / t))) bad(`-1 n=${n} t=${t}: ${gm} grupper ≠ ${Math.ceil(n / t)}`);
    if (Math.max(...sm) > t) bad(`-1 n=${n} t=${t}: gruppe på ${Math.max(...sm)} > t`);
  }
}
// Eksemplerne i 4.1
const ex = [
  [26, 4, 'plus', '5,5,4,4,4,4'],
  [26, 4, 'minus', '4,4,4,4,4,3,3'],
  [5, 4, 'plus', '5'],
  [5, 4, 'minus', '3,2'],
];
for (const [n, t, a, want] of ex) {
  const got = splitEven(n, groupsForTarget(n, t, a)).join(',');
  if (got !== want) bad(`eksempel n=${n} t=${t} ${a}: ${got} ≠ ${want}`);
}
// 4.2: to puljer på 6 og 3, 3 grupper: 2 og 1.
if (allocateGroups([6, 3], 3).join(',') !== '2,1') bad('4.2-eksemplet: ' + allocateGroups([6, 3], 3));
// 4.4: 21 elever, 6 pr. gruppe "-1", 5 emner → 5 grupper på 4–5.
const mk = (n, size, topics, extra = {}) => ({
  contractVersion: 2,
  view: 'home',
  students: Array.from({ length: n }, (_, i) => ({ _rowId: 'r' + i, Hold: extra.hold ? extra.hold(i) : '' })),
  rules: extra.hold ? [{ type: 'aggregate', column: 'Hold' }] : [],
  columnOrders: {},
  agreements: { together: [], avoid: [] },
  lockedGroups: extra.locked || [],
  size,
  topics,
  matrix: null,
  budget: { maxSeconds: 1, maxAttempts: 1, minAttempts: 1 },
  seed: 1,
});
const L = (input) => computeLayout(buildTask(input));
let l = L(mk(21, { mode: 'perGroup', target: 6, adjust: 'minus' }, ['a', 'b', 'c', 'd', 'e']));
console.log('4.4 21/6/-1/5 emner →', l.groups.map((g) => g.size).join(','), JSON.stringify(l.notes));
if (l.total !== 5) bad('4.4-eksemplet gav ' + l.total + ' grupper');
// "+1" rundes ned til multiplum, kun hvis størrelsen holdes: 24 elever, 4 pr. gruppe +1 (6 grupper), 3 emner → 6 (allerede). 2 emner → 6. 4 emner → 4 grupper á 6 > 5 → ingen runding.
l = L(mk(24, { mode: 'perGroup', target: 4, adjust: 'plus' }, ['a', 'b', 'c', 'd']));
console.log('4.4 24/4/+1/4 emner →', l.groups.map((g) => g.size).join(','), JSON.stringify(l.notes));
if (l.total !== 6) bad('runding gav for store grupper');
// 25 elever, 4 +1 → 6 grupper (5,4,4,4,4,4); 5 emner → rund ned til 5 → 5,5,5,5,5 ≤ 5 → rundes.
l = L(mk(25, { mode: 'perGroup', target: 4, adjust: 'plus' }, ['a', 'b', 'c', 'd', 'e']));
console.log('4.4 25/4/+1/5 emner →', l.groups.map((g) => g.size).join(','), JSON.stringify(l.notes));
if (l.total !== 5) bad('runding ned til 5 skete ikke');
// Låste tæller med: 1 låst + 3 emner. 20 elever, 4 +1 → 5 nye + 1 låst = 6 → allerede multiplum.
l = L(mk(20, { mode: 'perGroup', target: 4, adjust: 'plus' }, ['a', 'b', 'c'], { locked: [{ id: 'L', number: 1, name: 'G1', members: ['x1', 'x2'], topic: null }] }));
console.log('4.4 låst: 20/4/+1/3 emner + 1 låst →', l.total, 'nye', JSON.stringify(l.notes));
// 4.2 færre grupper end puljer: 3 puljer, count 2.
l = L(mk(12, { mode: 'count', count: 2 }, [], { hold: (i) => ['a', 'b', 'c'][i % 3] }));
console.log('4.2 count 2 med 3 puljer →', l.total, JSON.stringify(l.notes));
if (l.total !== 3) bad('færre grupper end puljer');
// count med puljer: 10 og 5 elever, 5 grupper → 3 + 2 (jævnest: 3,3,4 og 3,2? eller 4,3,3 / 3,2) — spec: "så ens som muligt"
l = L(mk(15, { mode: 'count', count: 5 }, [], { hold: (i) => (i < 10 ? 'a' : 'b') }));
console.log('4.2 count 5, puljer 10+5 →', l.pools.map((p) => p.sizes.join('/')).join(' | '));
// perGroup med puljer: hver pulje regner for sig. 7 + 5 elever, 4 +1 → 7: [4,3]; 5: [5]
l = L(mk(12, { mode: 'perGroup', target: 4, adjust: 'plus' }, [], { hold: (i) => (i < 7 ? 'a' : 'b') }));
console.log('4.1 pr. pulje 7+5, 4/+1 →', l.pools.map((p) => p.sizes.join('/')).join(' | '));
console.log(`Størrelser: ${problems} afvigelser.`);
