// Regelmodulerne: mål, bedst mulige og opfyldt (specifikation afsnit 6 og 16).
//
// Her måles en færdig gruppedeling præcist, regel for regel. Grupperne er
// lister af elevnumre, og groupPool[g] er puljen, gruppe g hører til. Alt
// måles inden for hver pulje og lægges sammen.
//
// Hver måling giver { value, best, met, groups } som dommeren:
//   value – det rå tal (0 = perfekt),
//   best  – det bedst mulige (en nedre grænse) eller null, hvis den ikke kendes,
//   met   – opfyldt for hele reglen: true, false eller null ("ikke målt"),
//   groups – pr. gruppe: { met, value }.
// De små tællere, motoren bruger under søgningen, ligger i modules.js og
// skal altid give de samme tal som målingerne her (det tjekker testene).

import { makeRandom, shuffleInPlace } from './random.js';

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

// Grænsen for "ensartet nok" (spec. 6.8): varians ≤ max(1; 0,1 · (spænd/2)²).
export function similarityLimit(span) {
  return Math.max(1, 0.1 * (span / 2) * (span / 2));
}

const EPSILON = 1e-9;

// Konteksten for en måling: opgaven, grupperne og gruppernes puljer.
export function makeContext(task, groups, groupPool) {
  const groupsInPool = task.pools.map(() => []);
  groups.forEach((members, g) => {
    if (groupPool[g] >= 0) groupsInPool[groupPool[g]].push(g);
  });
  return { task, groups, groupPool, groupsInPool };
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

function numbersOf(rule, members) {
  const values = [];
  for (const s of members) if (!Number.isNaN(rule.num[s])) values.push(rule.num[s]);
  return values;
}

// ---------------------------------------------------------------------------
// Adskil altid og Adskil (6.2, 6.4): højst én med nogen af de valgte værdier
// pr. gruppe. Tælles i par. Bedst mulige: jævn spredning pr. pulje, men aldrig
// under de par, Skal sammen-blokkene tvinger frem.
export function measureSeparate(ctx, rule, blocks) {
  const { task, groups } = ctx;
  const perGroup = groups.map((members) => {
    let count = 0;
    for (const s of members) count += rule.marked[s];
    return { met: count <= 1, value: pairs(count) };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  return { value, best: separateBest(ctx, rule, blocks), met: value === 0, groups: perGroup };
}

export function separateBest(ctx, rule, blocks) {
  let best = 0;
  ctx.task.pools.forEach((pool, p) => {
    best += separatePoolBest(ctx.task, rule, blocks, p, ctx.groupsInPool[p].length);
  });
  return best;
}

// Det bedst mulige i én pulje med k grupper (bruges også af beskederne).
export function separatePoolBest(task, rule, blocks, p, k) {
  let m = 0;
  for (const s of task.pools[p].members) m += rule.marked[s];
  const spread = evenSpreadPairs(m, k);
  let forced = 0;
  for (const block of blocks) {
    if (task.poolOf[block[0]] !== p) continue;
    let inBlock = 0;
    for (const s of block) inBlock += rule.marked[s];
    forced += pairs(inBlock);
  }
  return Math.max(spread, forced);
}

// Undgå hinanden (6.3): alle aftaler som ét tal, i par.
export function measureAvoid(ctx) {
  const { task, groups } = ctx;
  const groupOf = groupIndex(task, groups);
  const perGroup = groups.map(() => ({ met: true, value: 0 }));
  let best = 0;
  for (const list of task.avoid) {
    const counts = new Map();
    for (const s of list) {
      const g = groupOf[s];
      if (g < 0) continue;
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    for (const [g, count] of counts) {
      perGroup[g].value += pairs(count);
      if (count > 1) perGroup[g].met = false;
    }
    best += avoidListBest(ctx, list);
  }
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  return { value, best, met: value === 0, groups: perGroup };
}

export function avoidListBest(ctx, list) {
  let best = 0;
  ctx.task.pools.forEach((pool, p) => {
    let m = 0;
    for (const s of list) if (ctx.task.poolOf[s] === p) m++;
    best += evenSpreadPairs(m, ctx.groupsInPool[p].length);
  });
  return best;
}

// Matrix: "højst én fra hver kilde" (9.2), i par.
export function measureMatrixSources(ctx) {
  const { task, groups } = ctx;
  const sourceOf = task.matrix.sourceOf;
  const perGroup = groups.map((members) => {
    const counts = new Map();
    for (const s of members) {
      const src = sourceOf[s];
      if (src < 0) continue;
      counts.set(src, (counts.get(src) || 0) + 1);
    }
    let value = 0;
    for (const count of counts.values()) value += pairs(count);
    return { met: value === 0, value };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  let best = 0;
  for (const source of task.matrix.sources) best += evenSpreadPairs(source.members.length, groups.length);
  return { value, best, met: value === 0, groups: perGroup };
}

// Klyng (6.5): antal elever, der står alene med deres værdi i gruppen.
// Bedst mulige: en værdi, kun én elev i puljen har, kan ikke klynges.
export function measureCluster(ctx, rule) {
  const { groups } = ctx;
  const perGroup = groups.map((members) => {
    const counts = new Map();
    for (const s of members) {
      const v = rule.textId[s];
      if (v < 0) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let alone = 0;
    for (const count of counts.values()) if (count === 1) alone++;
    return { met: alone === 0, value: alone };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  return { value, best: clusterBest(ctx.task, rule), met: value === 0, groups: perGroup };
}

export function clusterBest(task, rule) {
  let best = 0;
  task.pools.forEach((pool, p) => {
    best += clusterPoolBest(task, rule, p);
  });
  return best;
}

// Elever i puljen, der er alene om deres værdi (bruges også af beskederne).
export function clusterPoolBest(task, rule, p) {
  const counts = new Map();
  for (const s of task.pools[p].members) {
    const v = rule.textId[s];
    if (v >= 0) counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = 0;
  for (const count of counts.values()) if (count === 1) best++;
  return best;
}

// Fordel (6.6): afstanden uden for det "retfærdige" spænd ⌊f⌋…⌈f⌉, hvor
// f = (antal i puljen med værdien) · (gruppens størrelse) / (puljens størrelse).
// "Opfyldt" er dagens test (svar.md 9, svar6 39); det nye "retfærdige antal"
// står i fair.
export function fairDeviation(n, c, s, N) {
  const product = c * s;
  const low = Math.floor(product / N);
  const high = product % N === 0 ? low : low + 1;
  return (low > n ? low - n : 0) + (n > high ? n - high : 0);
}

export function poolValueCounts(task, rule) {
  return task.pools.map((pool) => {
    const counts = new Map();
    for (const s of pool.members) {
      const v = rule.textId[s];
      if (v >= 0) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return counts;
  });
}

// Fordel har to mål, der ikke altid er enige: det retfærdige antal (tallet,
// motoren søger efter) og dagens test (det, læreren ser som "opfyldt"). To
// delinger kan begge have tallet 0, mens kun den ene består dagens test. Så
// motoren foretrækker den, står antallet af grupper, der ikke består dagens
// test (misses), som et ekstra sidste trin i rangordenen (levelPlan). Det
// afgør kun mellem delinger, der er lige gode på alt andet. Reglens eget tal
// (value) er uændret, så det stadig er det samme som dommerens.
export function measureDistribute(ctx, rule) {
  const { task, groups, groupPool } = ctx;
  const info = poolValueCounts(task, rule);
  const perGroup = groups.map((members, g) => {
    const p = groupPool[g];
    const N = task.pools[p].members.length;
    if (N === 0) return { met: true, value: 0 };
    const counts = info[p];
    const here = new Map();
    for (const s of members) {
      const v = rule.textId[s];
      if (v >= 0) here.set(v, (here.get(v) || 0) + 1);
    }
    const size = members.length;
    let deviation = 0;
    for (const [v, c] of counts) deviation += fairDeviation(here.get(v) || 0, c, size, N);
    // Dagens test: ingen værdi flere gange end ⌈størrelse / antal værdier⌉,
    // og alle værdier med (højst så mange som pladser).
    const valueCount = counts.size;
    let met = true;
    if (valueCount > 0) {
      const maxEach = Math.ceil(size / valueCount);
      for (const count of here.values()) if (count > maxEach) met = false;
      if (here.size < Math.min(valueCount, size)) met = false;
    }
    return { met, value: deviation };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  return {
    value,
    best: 0,
    misses: perGroup.filter((g) => !g.met).length, // grupper, der ikke består dagens test
    met: perGroup.every((g) => g.met),
    groups: perGroup,
    today: todayShare(perGroup),
    fair: { met: value === 0 },
  };
}

// Balancér (6.7): summen af |gruppens snit − puljens snit|. En gruppe uden tal
// er ikke med; færre end to grupper med tal = "ikke målt" (svar4 33).
export function poolMeans(task, rule) {
  return task.pools.map((pool) => {
    const values = numbersOf(rule, pool.members);
    return values.length ? mean(values) : null;
  });
}

export function measureBalance(ctx, rule) {
  const { task, groups, groupPool } = ctx;
  const means = poolMeans(task, rule);
  const tolerance = 0.05 * rule.span;
  let measured = 0;
  const perGroup = groups.map((members, g) => {
    const values = numbersOf(rule, members);
    const target = means[groupPool[g]];
    if (!values.length || target === null) return { met: null, value: 0 };
    measured++;
    const distance = Math.abs(mean(values) - target);
    return { met: distance <= tolerance + EPSILON, value: distance };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  const met = measured < 2 ? null : perGroup.every((g) => g.met !== false);
  return { value, best: null, met, groups: perGroup };
}

// Ensartede (6.8): summen af gruppernes varians. En gruppe uden tal tæller
// ikke; ingen grupper med tal = "ikke målt" (svar3 21).
export function measureMinimizediff(ctx, rule) {
  const limit = similarityLimit(rule.span);
  let measured = 0;
  const perGroup = ctx.groups.map((members) => {
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
function valueCount(ctx, rule, groupIndexes) {
  const { groups, groupPool } = ctx;
  let distinctSum = 0;
  const poolCounts = new Map(); // pulje → Map(værdi → antal)
  for (const g of groupIndexes) {
    const seen = new Set();
    for (const s of groups[g]) {
      const v = rule.textId[s];
      if (v < 0) continue;
      seen.add(v);
      const p = groupPool[g];
      if (!poolCounts.has(p)) poolCounts.set(p, new Map());
      const counts = poolCounts.get(p);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    distinctSum += seen.size;
  }
  let bound = 0;
  for (const [p, counts] of poolCounts) {
    const maxSize = Math.max(1, maxSizeInPool(ctx, p));
    for (const c of counts.values()) bound += Math.ceil(c / maxSize);
  }
  return distinctSum - bound;
}

function maxSizeInPool(ctx, p) {
  let max = 0;
  for (const g of ctx.groupsInPool[p] || []) max = Math.max(max, ctx.groups[g].length);
  return max;
}

function distinctTexts(rule, members) {
  const seen = new Set();
  for (const s of members) if (rule.textId[s] >= 0) seen.add(rule.textId[s]);
  return seen.size;
}

// Saml (6.9, svar4 30 og svar5 35).
// - Tekst uden rangering: værditælling.
// - Tal eller rangering: (a) summen af gruppernes varians; (b) værditælling for
//   grupper uden tal.
// met er det nye "opfyldt" (mod det bedst mulige); today er dagens andel.
export function measureGroupSort(ctx, rule) {
  const { groups } = ctx;
  const all = groups.map((_, g) => g);
  if (rule.mode === 'text') {
    const value = valueCount(ctx, rule, all);
    const perGroup = groups.map((members) => {
      const k = distinctTexts(rule, members);
      return { met: k === 0 ? null : k === 1, value: Math.max(0, k - 1) };
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
  const perGroup = groups.map((members, g) => {
    const values = numbersOf(rule, members);
    if (values.length) {
      const v = variance(values);
      varianceSum += v;
      return { met: v <= limit + EPSILON, value: v };
    }
    withoutNumbers.push(g);
    const k = distinctTexts(rule, members);
    return { met: k === 0 ? null : k === 1, value: 0 };
  });
  const counted = valueCount(ctx, rule, withoutNumbers);
  const anyMeasured = perGroup.some((g) => g.met !== null);
  const without = new Set(withoutNumbers);
  const numbersOk = perGroup.every((g, i) => without.has(i) || g.met !== false);
  return {
    value: varianceSum,
    best: null,
    met: anyMeasured ? numbersOk && counted === 0 : null,
    groups: perGroup,
    parts: { variance: varianceSum, valueCount: counted },
    today: todayShare(perGroup),
  };
}

function todayShare(perGroup) {
  const measured = perGroup.filter((g) => g.met !== null);
  if (!measured.length) return { share: null, met: null };
  const metCount = measured.filter((g) => g.met).length;
  return { share: metCount / measured.length, met: metCount === measured.length };
}

// Opdel som regel: hvor mange grupper blander puljer? (Er altid 0 hos motoren.)
export function measureSplit(ctx, rule) {
  const perGroup = ctx.groups.map((members) => {
    const values = new Set(members.map((s) => rule.textId[s]));
    return { met: values.size <= 1, value: values.size <= 1 ? 0 : values.size - 1 };
  });
  const value = perGroup.reduce((sum, g) => sum + g.value, 0);
  return { value, best: 0, met: value === 0, groups: perGroup };
}

export function measureRule(ctx, rule, blocks = []) {
  switch (rule.type) {
    case 'strict_separate':
    case 'separate':
      return measureSeparate(ctx, rule, blocks);
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
      return { value: 0, best: null, met: null, groups: [] };
  }
}

function groupIndex(task, groups) {
  const groupOf = new Int32Array(task.n).fill(-1);
  groups.forEach((members, g) => {
    for (const s of members) groupOf[s] = g;
  });
  return groupOf;
}

// ---------------------------------------------------------------------------
// Rangordenen (spec. 7): de tunge trin som hele tal, målene og Saml som ét
// kommatal hver, trinvist vægtet og gjort om til samme skala.

export const GOAL_TYPES = new Set(['distribute', 'balance', 'minimizediff']);
export const BASELINE_SAMPLES = 200;
export const BASELINE_SEED = 20261103;

// Trinenes rækkefølge for en opgave: [{ kind, rule? }]. Bruges både af den
// præcise måling og af søgningens tællere, så de altid står ens.
export function levelPlan(task) {
  const levels = [];
  for (const rule of task.rules) if (rule.type === 'strict_separate') levels.push({ kind: 'heavy', rule: rule.index });
  levels.push({ kind: 'avoid', rule: null });
  if (task.view === 'matrix' && task.matrix) levels.push({ kind: 'sources', rule: null });
  for (const rule of task.rules) {
    if (rule.type === 'separate' || rule.type === 'cluster') levels.push({ kind: 'heavy', rule: rule.index });
  }
  levels.push({ kind: 'goals', rule: null });
  levels.push({ kind: 'collect', rule: null });
  // Fordels dagens test: kun til at vælge mellem ellers lige gode delinger.
  if (task.rules.some((rule) => rule.type === 'distribute')) levels.push({ kind: 'today', rule: null });
  return levels;
}

// Vægtene for målene og Saml: med n regler vejer den øverste n … den nederste 1.
export function goalWeights(task) {
  const weights = new Map();
  const goals = task.rules.filter((r) => GOAL_TYPES.has(r.type));
  goals.forEach((r, i) => weights.set(r.index, goals.length - i));
  const collect = task.rules.filter((r) => r.type === 'group_sort');
  collect.forEach((r, i) => weights.set(r.index, collect.length - i));
  return weights;
}

// Tilfældige gyldige gruppedelinger i opdelingens størrelser (spec. 7.3).
export function randomGroupings(task, layout, samples, seed) {
  const random = makeRandom(seed);
  const result = [];
  const poolMembers = layout.wholeTask ? [Array.from({ length: task.n }, (_, i) => i)] : task.pools.map((p) => p.members);
  for (let k = 0; k < samples; k++) {
    const groups = [];
    layout.pools.forEach((pool, p) => {
      const order = shuffleInPlace(random, poolMembers[p].slice());
      let at = 0;
      for (const size of pool.sizes) {
        groups.push(order.slice(at, at + size));
        at += size;
      }
    });
    result.push(groups);
  }
  return result;
}

// "Hvor skæv er en tilfældig gruppedeling" pr. mål og pr. Saml-del.
export function computeBaselines(task, layout, groupPool, samples = BASELINE_SAMPLES, seed = BASELINE_SEED) {
  const goalRules = task.rules.filter((r) => GOAL_TYPES.has(r.type) || r.type === 'group_sort');
  const baselines = new Map();
  if (!goalRules.length || layout.total <= 0) return baselines;
  const sums = new Map(goalRules.map((r) => [r.index, { value: 0, variance: 0, valueCount: 0 }]));
  const groupings = randomGroupings(task, layout, samples, seed);
  for (const groups of groupings) {
    const ctx = makeContext(task, groups, groupPool);
    for (const rule of goalRules) {
      const m = measureRule(ctx, rule);
      const sum = sums.get(rule.index);
      sum.value += m.value;
      if (m.parts) {
        sum.variance += m.parts.variance;
        sum.valueCount += m.parts.valueCount;
      }
    }
  }
  for (const [index, sum] of sums) {
    baselines.set(index, {
      value: sum.value / groupings.length,
      variance: sum.variance / groupings.length,
      valueCount: sum.valueCount / groupings.length,
    });
  }
  return baselines;
}

function scaled(value, baseline) {
  return baseline > 0 ? value / baseline : 0;
}

export function normalizedGoal(rule, measure, baseline) {
  if (!baseline) return 0;
  if (rule.type === 'group_sort' && measure.parts) {
    return scaled(measure.parts.variance, baseline.variance) + scaled(measure.parts.valueCount, baseline.valueCount);
  }
  return scaled(measure.value, baseline.value);
}

// Hele bedømmelsen af en gruppedeling: målingerne pr. regel, Undgå, kilderne
// og rangordens-rækken (vector), som to delinger sammenlignes på.
// options.tieBreak: false giver rækken uden Fordels sidste trin (som dommerens).
export function evaluate(task, groups, groupPool, blocks, baselines, options = {}) {
  const tieBreak = options.tieBreak !== false;
  const ctx = makeContext(task, groups, groupPool);
  const results = task.rules.map((rule) => measureRule(ctx, rule, blocks));
  const avoid = measureAvoid(ctx);
  const sources = task.view === 'matrix' && task.matrix ? measureMatrixSources(ctx) : null;
  const weights = goalWeights(task);
  const vector = [];
  for (const level of levelPlan(task)) {
    if (level.kind === 'heavy') vector.push(results[level.rule].value);
    else if (level.kind === 'avoid') vector.push(avoid.value);
    else if (level.kind === 'sources') vector.push(sources.value);
    else if (level.kind === 'today') {
      if (!tieBreak) continue;
      let misses = 0;
      for (const rule of task.rules) if (rule.type === 'distribute') misses += results[rule.index].misses;
      vector.push(misses);
    } else {
      let sum = 0;
      for (const rule of task.rules) {
        const isGoal = level.kind === 'goals' ? GOAL_TYPES.has(rule.type) : rule.type === 'group_sort';
        if (!isGoal) continue;
        sum += weights.get(rule.index) * normalizedGoal(rule, results[rule.index], baselines.get(rule.index));
      }
      vector.push(sum);
    }
  }
  return { results, avoid, sources, vector };
}

// Er en værdi nede på en grænse fra bounds.js? (Lidt luft for afrunding.)
export function atBound(value, bound) {
  return value <= bound + EPSILON * Math.max(1, Math.abs(bound));
}

// Sammenligner to rækker: negativ, hvis a er bedst; positiv, hvis b er bedst.
export function compareVectors(a, b, tolerance = 1e-9) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Math.abs(x - y) > tolerance * Math.max(1, Math.abs(x), Math.abs(y))) return x < y ? -1 : 1;
  }
  return 0;
}

// Har alle regler nået det bedst mulige? (Så kan flere forsøg ikke gøre det
// bedre, spec. 11.2.) En regel uden kendt grænse er aldrig "ved grænsen",
// medmindre den er 0. bounds er Balancérs grænser fra bounds.js (kan mangle).
// Fordel er først ved det bedst mulige, når den også består dagens test, eller
// når bounds viser, at dagens test ikke kan bestås i de puljer, hvor den fejler.
export function atBestPossible(task, evaluation, bounds = null) {
  for (const rule of task.rules) {
    const r = evaluation.results[rule.index];
    if (rule.type === 'aggregate') continue;
    const bound = bounds ? bounds.get(rule.index) : null;
    // Hver gruppe uden om dagens test skal stå i en pulje, hvor testen
    // beviseligt ikke kan bestås (spørgsmål 47; før så det kun på reglen).
    if (rule.type === 'distribute' && r.met === false) {
      if (!bound || !bound.groups) return false;
      if (r.groups.some((g, i) => g.met === false && !bound.groups[i])) return false;
    }
    if (bound && bound.value !== undefined) {
      if (!atBound(r.value, bound.value)) return false;
    } else if (r.best === null || r.best === undefined) {
      if (r.value > EPSILON) return false;
      if (rule.type === 'group_sort' && r.parts && r.parts.valueCount > 0) return false;
    } else if (r.value > r.best + EPSILON) return false;
  }
  if (evaluation.avoid.value > evaluation.avoid.best) return false;
  if (evaluation.sources && evaluation.sources.value > evaluation.sources.best) return false;
  return true;
}
