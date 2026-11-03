// Grænser for Balancér: hvor godt kan det overhovedet blive? Og for Fordel:
// kan dagens test overhovedet bestås (se fordelBound nederst)?
//
// Målingen af Balancér (rules.js) kender ikke det bedst mulige. Her regnes en
// nedre grænse, som er billig og altid gyldig (den kan være for lav, aldrig for
// høj). Den bruges to steder:
//   - beskeden siger "Det kunne ikke undgås", når grænsen er nået,
//   - motoren stopper, når alle regler er ved det bedst mulige.
//
// Idéen: er alle tal hele tal (rangeringer er altid 1, 2, 3 …), er hver gruppes
// sum også et helt tal. En gruppe med 4 tal kan kun have snit 2,00, 2,25, 2,50
// … Og summerne for alle grupper i puljen skal tilsammen give puljens sum.
// Eksempel: 23 tal med summen 47 (snit 2,04) i fem grupper med 4 tal og én med
// 3. Inden for 5 % kræver sum 8 (fire tal) og 6 (tre tal), men 5 · 8 + 6 = 46,
// ikke 47. Så mindst én gruppe må ligge uden for, uanset hvordan man deler.
//
// Udregningen går gruppe for gruppe og husker, hvor meget af puljens sum (og
// hvor mange elever uden tal) der er brugt. Hvilke tal der findes, ser den
// kun på som "mindste og største mulige sum"; det gør grænsen lidt lavere,
// men stadig gyldig. Skal sammen og låste grupper ses der bort fra af samme
// grund.

import { poolMeans, poolValueCounts } from './rules.js';

const EPSILON = 1e-9;
// Højst så mange regneskridt pr. regel; ellers ingen grænse (null).
const WORK_LIMIT = 30000000;

// Map(regelnummer → grænse):
//   Balancér: { value, minBad }
//     value  – den mindst mulige sum af afstande (samme mål som reglen),
//     minBad – det mindst mulige antal grupper uden for de 5 %.
//   Fordel: { todayImpossible, pools, groups } – todayImpossible er true, når
//     dagens test ikke kan bestås i mindst én pulje; pools[p] siger det pr.
//     pulje og groups[g] for gruppe g's pulje.
export function computeBounds(task, layout) {
  const bounds = new Map();
  if (layout.wholeTask) return bounds;
  for (const rule of task.rules) {
    if (rule.type === 'distribute') {
      const pools = fordelImpossible(task, layout, rule);
      // groups[g]: kan gruppe g's pulje umuligt bestå dagens test? (Bruges af
      // stopreglen, som kun kender grupperne.)
      const groups = layout.groups.map((g) => pools[g.pool]);
      bounds.set(rule.index, { todayImpossible: pools.some(Boolean), pools, groups });
      continue;
    }
    if (rule.type !== 'balance') continue;
    const bound = balanceBound(task, layout, rule);
    if (bound) bounds.set(rule.index, bound);
  }
  return bounds;
}

// Fordel: kan dagens test umuligt bestås i alle grupper? (Ingen værdi flere
// gange end ⌈størrelse / antal værdier⌉, og alle værdier med, højst så mange
// som pladser.) To enkle tælleregler pr. pulje; siger de ja, er det sikkert
// umuligt. Siger de nej, ved vi det ikke. Svarer med én sand/falsk pr. pulje.
//   1. En værdi har flere elever, end grupperne har plads til af den.
//   2. Grupperne skal tilsammen have flere forskellige værdier, end
//      værdierne kan række til (en værdi kan højst være i én gruppe pr. elev).
function fordelImpossible(task, layout, rule) {
  const counts = poolValueCounts(task, rule);
  return layout.pools.map((pool) => {
    const values = [...counts[pool.index].values()];
    const V = values.length;
    if (V === 0) return false;
    const k = pool.sizes.length;
    let room = 0;
    let slots = 0;
    for (const size of pool.sizes) {
      room += Math.ceil(size / V);
      slots += Math.min(V, size);
    }
    if (values.some((c) => c > room)) return true;
    const reach = values.reduce((sum, c) => sum + Math.min(c, k), 0);
    return slots > reach;
  });
}

function balanceBound(task, layout, rule) {
  const scale = integerScale(task, rule);
  if (!scale) return null;
  const means = poolMeans(task, rule);
  const tolerance = 0.05 * rule.span;
  let value = 0;
  let minBad = 0;
  for (const pool of layout.pools) {
    const target = means[pool.index];
    if (target === null) continue;
    const numbers = [];
    let missing = 0;
    for (const s of task.pools[pool.index].members) {
      if (Number.isNaN(rule.num[s])) missing++;
      else numbers.push(Math.round(rule.num[s] * scale));
    }
    const part = poolBound(numbers, missing, pool.sizes, target * scale, tolerance * scale, scale);
    if (!part) return null;
    value += part.value;
    minBad += part.minBad;
  }
  return { value, minBad };
}

// Ganger tallene med 1, 10 eller 100, så de bliver hele tal. Ellers null.
function integerScale(task, rule) {
  for (const scale of [1, 10, 100]) {
    let ok = true;
    for (let s = 0; s < task.n && ok; s++) {
      const v = rule.num[s];
      if (Number.isNaN(v)) continue;
      if (Math.abs(v * scale - Math.round(v * scale)) > 1e-6) ok = false;
    }
    if (ok) return scale;
  }
  return null;
}

// Én pulje. numbers er de hele tal, missing antal elever uden tal, sizes
// gruppernes størrelser. Afstandene regnes tilbage i reglens egne enheder.
function poolBound(numbers, missing, sizes, target, tolerance, scale) {
  if (!numbers.length) return { value: 0, minBad: 0 };
  const sorted = numbers.slice().sort((a, b) => a - b);
  const low = sorted[0];
  const shifted = sorted.map((x) => x - low); // alle ≥ 0
  const total = shifted.reduce((a, b) => a + b, 0);
  // Mindste og største sum af m tal (forskudt).
  const prefixLow = [0];
  const prefixHigh = [0];
  for (let m = 1; m <= shifted.length; m++) {
    prefixLow.push(prefixLow[m - 1] + shifted[m - 1]);
    prefixHigh.push(prefixHigh[m - 1] + shifted[shifted.length - m]);
  }
  const maxSize = Math.max(...sizes);
  const work = sizes.length * (total + 1) * (missing + 1) * (Math.min(maxSize, missing) + 1) * (prefixHigh[Math.min(maxSize, shifted.length)] + 1);
  if (work > WORK_LIMIT) return null;

  // Omkostningen for en gruppe med m tal og forskudt sum t.
  const distance = (m, t) => Math.abs((t + m * low) / m - target) / scale;
  const run = (cost) => {
    const width = total + 1;
    let best = new Float64Array(width * (missing + 1)).fill(Infinity);
    best[0] = 0;
    for (const size of sizes) {
      const next = new Float64Array(width * (missing + 1)).fill(Infinity);
      for (let used = 0; used <= missing; used++) {
        for (let sum = 0; sum <= total; sum++) {
          const here = best[used * width + sum];
          if (here === Infinity) continue;
          for (let empty = 0; empty <= Math.min(size, missing - used); empty++) {
            const m = size - empty;
            const row = (used + empty) * width;
            if (m === 0) {
              if (here < next[row + sum]) next[row + sum] = here;
              continue;
            }
            if (m > shifted.length) continue;
            const from = prefixLow[m];
            const to = Math.min(prefixHigh[m], total - sum);
            for (let t = from; t <= to; t++) {
              const c = here + cost(m, t);
              if (c < next[row + sum + t]) next[row + sum + t] = c;
            }
          }
        }
      }
      best = next;
    }
    return best[missing * width + total];
  };
  const value = run(distance);
  const minBad = run((m, t) => (distance(m, t) > tolerance / scale + EPSILON ? 1 : 0));
  if (!Number.isFinite(value) || !Number.isFinite(minBad)) return null;
  return { value, minBad };
}
