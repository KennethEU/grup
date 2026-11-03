// Målingerne: hvad dommeren tæller for hver regel (specifikation afsnit 16).
//
// Hver målefunktion får en "kontekst" (opgaven og grupperne) og giver:
//   value    – det rå tal (0 = perfekt),
//   best     – det bedst mulige (en nedre grænse), eller null, hvis den ikke kendes,
//   met      – opfyldt for hele reglen: true, false eller null ("ikke målt"),
//   groups   – pr. gruppe: { met, value } (met kan være null: tæller ikke).
// Alt måles inden for hver pulje og lægges sammen.

import { poolOfGroup } from './task.mjs';

// Antal par blandt n elever: 2 → 1, 3 → 3, 4 → 6.
export function pairs(n) {
  return n > 1 ? (n * (n - 1)) / 2 : 0;
}

// Det bedst mulige, når m elever skal spredes på k grupper: så jævnt som muligt.
// 9 elever i 4 grupper → 3/2/2/2 → 3 + 1 + 1 + 1 = 6 par.
export function evenSpreadPairs(m, k) {
  if (m <= 1) return 0;
  if (k <= 0) return pairs(m);
  const base = Math.floor(m / k);
  const extra = m % k;
  return extra * pairs(base + 1) + (k - extra) * pairs(base);
}

// Konteksten: grupperne som lister af elev-id'er, og hvilken pulje hver gruppe
// hører til.
export function makeContext(task, groups) {
  const groupPools = groups.map((members) => poolOfGroup(task, members));
  const groupsInPool = new Map();
  groupPools.forEach((key, i) => {
    if (!groupsInPool.has(key)) groupsInPool.set(key, []);
    groupsInPool.get(key).push(i);
  });
  return { task, groups, groupPools, groupsInPool };
}

function groupCountInPool(ctx, key) {
  return (ctx.groupsInPool.get(key) || []).length;
}

function maxSizeInPool(ctx, key) {
  let max = 0;
  for (const i of ctx.groupsInPool.get(key) || []) max = Math.max(max, ctx.groups[i].length);
  return max;
}

function mean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Varians "delt med antal" (ikke antal − 1), spec. 6.8 og svar3 21.
export function variance(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) * (v - m);
  return sum / values.length;
}

const EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// Adskil altid og Adskil: højst én elev med nogen af de valgte værdier pr.
// gruppe. Tælles i par.
export function measureSeparate(ctx, rule) {
  const { task, groups } = ctx;
  const marked = (id) => rule.values.has(rule.textOf.get(id));
  const perGroup = groups.map((members) => {
    const count = members.filter(marked).length;
    return { met: count <= 1, value: pairs(count) };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);

  // Bedst mulige: jævn spredning pr. pulje, men aldrig under de par, som Skal
  // sammen-blokkene tvinger frem.
  let best = 0;
  for (const pool of task.pools.values()) {
    const m = pool.ids.filter(marked).length;
    const spread = evenSpreadPairs(m, groupCountInPool(ctx, pool.key));
    let forced = 0;
    for (const block of task.together) {
      const inPool = block.filter((id) => task.poolKeyOf.get(id) === pool.key);
      forced += pairs(inPool.filter(marked).length);
    }
    best += Math.max(spread, forced);
  }
  return { value, best, met: value === 0, groups: perGroup };
}

// Undgå hinanden: alle aftaler som ét tal. Tælles i par.
export function measureAvoid(ctx) {
  const { task, groups } = ctx;
  const groupOf = new Map();
  groups.forEach((members, i) => members.forEach((id) => groupOf.set(id, i)));
  const perGroup = groups.map(() => ({ met: true, value: 0 }));
  let best = 0;
  for (const list of task.avoid) {
    const counts = new Map();
    for (const id of list) {
      if (!groupOf.has(id)) continue;
      const g = groupOf.get(id);
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    for (const [g, count] of counts) {
      perGroup[g].value += pairs(count);
      if (count > 1) perGroup[g].met = false;
    }
    for (const pool of task.pools.values()) {
      const m = list.filter((id) => task.poolKeyOf.get(id) === pool.key).length;
      best += evenSpreadPairs(m, groupCountInPool(ctx, pool.key));
    }
  }
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  return { value, best, met: value === 0, groups: perGroup };
}

// Matrix: "højst én fra hver kilde". Tælles i par.
export function measureMatrixSources(ctx) {
  const { task, groups } = ctx;
  const sourceOf = task.matrix.sourceOf;
  const perGroup = groups.map((members) => {
    const counts = new Map();
    for (const id of members) {
      const s = sourceOf.get(id);
      if (s === undefined) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    let value = 0;
    for (const count of counts.values()) value += pairs(count);
    return { met: value === 0, value };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  let best = 0;
  for (const source of task.matrix.sources.values()) {
    best += evenSpreadPairs(source.ids.length, groups.length);
  }
  return { value, best, met: value === 0, groups: perGroup };
}

// Klyng: antal elever, der står alene med deres værdi i gruppen.
export function measureCluster(ctx, rule) {
  const { task, groups } = ctx;
  const perGroup = groups.map((members) => {
    const counts = new Map();
    for (const id of members) {
      const v = rule.textOf.get(id);
      if (v === null || v === undefined) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let alone = 0;
    for (const count of counts.values()) if (count === 1) alone++;
    return { met: alone === 0, value: alone };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  // Bedst mulige: en værdi, kun én elev i puljen har, kan ikke klynges.
  let best = 0;
  for (const pool of task.pools.values()) {
    const counts = new Map();
    for (const id of pool.ids) {
      const v = rule.textOf.get(id);
      if (v !== null) counts.set(v, (counts.get(v) || 0) + 1);
    }
    for (const count of counts.values()) if (count === 1) best++;
  }
  return { value, best, met: value === 0, groups: perGroup };
}

// Fordel: afstanden uden for det "retfærdige" spænd ⌊f⌋…⌈f⌉, hvor
// f = (antal i puljen med værdien) · (gruppens størrelse) / (puljens størrelse).
export function measureDistribute(ctx, rule) {
  const { task, groups, groupPools } = ctx;
  const poolInfo = new Map();
  for (const pool of task.pools.values()) {
    const counts = new Map();
    for (const id of pool.ids) {
      const v = rule.textOf.get(id);
      if (v !== null) counts.set(v, (counts.get(v) || 0) + 1);
    }
    poolInfo.set(pool.key, { size: pool.ids.length, counts });
  }
  const perGroup = groups.map((members, i) => {
    const info = poolInfo.get(groupPools[i]);
    if (!info || info.size === 0) return { met: true, value: 0 };
    const here = new Map();
    for (const id of members) {
      const v = rule.textOf.get(id);
      if (v !== null && v !== undefined) here.set(v, (here.get(v) || 0) + 1);
    }
    const s = members.length;
    let deviation = 0;
    for (const [v, c] of info.counts) {
      const n = here.get(v) || 0;
      const product = c * s;
      const low = Math.floor(product / info.size);
      const high = product % info.size === 0 ? low : low + 1;
      deviation += Math.max(0, low - n) + Math.max(0, n - high);
    }
    // "Opfyldt" som i dag (svar.md 9): ingen værdi flere gange end
    // ⌈størrelse / antal værdier⌉, og alle værdier med (højst så mange som pladser).
    const valueCount = info.counts.size;
    let met = true;
    if (valueCount > 0) {
      const maxEach = Math.ceil(s / valueCount);
      for (const count of here.values()) if (count > maxEach) met = false;
      if (here.size < Math.min(valueCount, s)) met = false;
    }
    return { met, value: deviation };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  // met er dagens test (spec. 6.6). Ved siden af: dagens andel af opfyldte
  // grupper og det nye "retfærdige antal" (svar6 39), som ved Saml.
  return {
    value,
    best: 0,
    met: perGroup.every((g) => g.met),
    groups: perGroup,
    today: todayShare(perGroup),
    fair: { met: value === 0 },
  };
}

// Fælles for talreglerne: gruppens tal (kun elever med et tal).
function numbersOf(rule, members) {
  const values = [];
  for (const id of members) {
    const v = rule.numberOf.get(id);
    if (v !== null && v !== undefined) values.push(v);
  }
  return values;
}

// Balancér: summen af |gruppens snit − puljens snit|. En gruppe uden tal er
// ikke med; færre end to grupper med tal = "ikke målt" (svar4 33).
export function measureBalance(ctx, rule) {
  const { task, groups, groupPools } = ctx;
  const poolMean = new Map();
  for (const pool of task.pools.values()) {
    const values = numbersOf(rule, pool.ids);
    poolMean.set(pool.key, values.length ? mean(values) : null);
  }
  const tolerance = 0.05 * rule.span;
  let measured = 0;
  const perGroup = groups.map((members, i) => {
    const values = numbersOf(rule, members);
    const target = poolMean.get(groupPools[i]);
    if (!values.length || target === null || target === undefined) return { met: null, value: 0 };
    measured++;
    const distance = Math.abs(mean(values) - target);
    return { met: distance <= tolerance + EPSILON, value: distance };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  const met = measured < 2 ? null : perGroup.every((g) => g.met !== false);
  return { value, best: null, met, groups: perGroup };
}

// Grænsen for "ensartet nok" (spec. 6.8): varians ≤ max(1; 0,1 · (spænd/2)²).
export function similarityLimit(span) {
  return Math.max(1, 0.1 * (span / 2) * (span / 2));
}

// Ensartede: summen af gruppernes varians. En gruppe uden tal tæller ikke;
// ingen grupper med tal = "ikke målt" (svar3 21).
export function measureMinimizediff(ctx, rule) {
  const { groups } = ctx;
  const limit = similarityLimit(rule.span);
  let measured = 0;
  const perGroup = groups.map((members) => {
    const values = numbersOf(rule, members);
    if (!values.length) return { met: null, value: 0 };
    measured++;
    const v = variance(values);
    return { met: v <= limit + EPSILON, value: v };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  const met = measured === 0 ? null : perGroup.every((g) => g.met !== false);
  return { value, best: null, met, groups: perGroup };
}

// Værditælling til Saml: summen af antal forskellige værdier i grupperne,
// minus det mindst mulige (hver værdi i så få grupper som muligt).
function valueCount(ctx, rule, groupIndexes, includeStudent) {
  const { groups, groupPools } = ctx;
  let distinctSum = 0;
  const poolCounts = new Map(); // puljenøgle → Map(værdi → antal)
  for (const i of groupIndexes) {
    const seen = new Set();
    for (const id of groups[i]) {
      if (!includeStudent(id)) continue;
      const v = rule.textOf.get(id);
      if (v === null || v === undefined) continue;
      seen.add(v);
      const key = groupPools[i];
      if (!poolCounts.has(key)) poolCounts.set(key, new Map());
      const counts = poolCounts.get(key);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    distinctSum += seen.size;
  }
  let bound = 0;
  for (const [key, counts] of poolCounts) {
    const maxSize = Math.max(1, maxSizeInPool(ctx, key));
    for (const c of counts.values()) bound += Math.ceil(c / maxSize);
  }
  return distinctSum - bound;
}

// Saml (spec. 6.9, svar4 30 og svar5 35).
// - Tekst uden rangering: værditælling.
// - Tal eller rangering: (a) summen af gruppernes varians; (b) værditælling for
//   grupper uden tal.
// Giver både det nye "opfyldt" (mod det bedst mulige) og dagens andel af
// opfyldte grupper (today).
export function measureGroupSort(ctx, rule) {
  const { groups } = ctx;
  const all = groups.map((_, i) => i);
  if (rule.mode === 'text') {
    const value = valueCount(ctx, rule, all, () => true);
    const perGroup = groups.map((members) => {
      const seen = new Set(members.map((id) => rule.textOf.get(id)).filter((v) => v !== null && v !== undefined));
      return { met: seen.size === 0 ? null : seen.size === 1, value: Math.max(0, seen.size - 1) };
    });
    return {
      value,
      best: 0,
      met: value === 0,
      groups: perGroup,
      parts: { variance: 0, valueCount: value },
      today: todayShare(perGroup),
    };
  }
  const limit = similarityLimit(rule.span);
  let varianceSum = 0;
  const withoutNumbers = [];
  const perGroup = groups.map((members, i) => {
    const values = numbersOf(rule, members);
    if (values.length) {
      const v = variance(values);
      varianceSum += v;
      return { met: v <= limit + EPSILON, value: v };
    }
    withoutNumbers.push(i);
    const seen = new Set(members.map((id) => rule.textOf.get(id)).filter((v) => v !== null && v !== undefined));
    return { met: seen.size === 0 ? null : seen.size === 1, value: 0 };
  });
  const counted = valueCount(ctx, rule, withoutNumbers, () => true);
  const anyMeasured = perGroup.some((g) => g.met !== null);
  const numbersOk = perGroup.every((g, i) => withoutNumbers.includes(i) || g.met !== false);
  return {
    value: varianceSum,
    best: null,
    met: anyMeasured ? numbersOk && counted === 0 : null,
    groups: perGroup,
    parts: { variance: varianceSum, valueCount: counted },
    today: todayShare(perGroup),
  };
}

// Dagens "opfyldt" for Saml: andelen af grupper, der er opfyldt.
function todayShare(perGroup) {
  const measured = perGroup.filter((g) => g.met !== null);
  if (!measured.length) return { share: null, met: null };
  const metCount = measured.filter((g) => g.met).length;
  return { share: metCount / measured.length, met: metCount === measured.length };
}

// Opdel som regel: hvor mange grupper blander puljer? (Er også en fast kontrol.)
export function measureSplit(ctx, rule) {
  const perGroup = ctx.groups.map((members) => {
    const values = new Set(members.map((id) => rule.textOf.get(id) ?? ''));
    return { met: values.size <= 1, value: values.size <= 1 ? 0 : values.size - 1 };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  return { value, best: 0, met: value === 0, groups: perGroup };
}

// Vælger den rigtige målefunktion til en regel.
export function measureRule(ctx, rule) {
  switch (rule.type) {
    case 'strict_separate':
    case 'separate':
      return measureSeparate(ctx, rule);
    case 'cluster':
      return measureCluster(ctx, rule);
    case 'distribute':
      return measureDistribute(ctx, rule);
    case 'balance':
      return measureBalance(ctx, rule);
    case 'minimizediff':
      return measureMinimizediff(ctx, rule);
    case 'group_sort':
      return measureGroupSort(ctx, rule);
    case 'aggregate':
      return measureSplit(ctx, rule);
    default:
      return { value: 0, best: null, met: null, groups: [], unknownType: true };
  }
}
